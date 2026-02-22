/**
 * Graceful Degradation Service for Local Brain.
 * 
 * Handles resource constraints by:
 * - Reducing cache size on low memory
 * - Disabling background sync on low battery
 * - Simplifying UI on slow devices
 * 
 * Requirements: 8.6, 8.7
 */

import * as Device from 'expo-device';
import { logError } from '../utils/errorHandling';

// Placeholder for expo-battery (not yet installed)
const Battery = {
  getBatteryLevelAsync: async (): Promise<number> => {
    // TODO: Implement with expo-battery
    return 1.0; // 100%
  },
  getBatteryStateAsync: async (): Promise<number> => {
    // TODO: Implement with expo-battery
    return 2; // FULL
  },
  addBatteryLevelListener: (callback: (event: any) => void) => {
    // TODO: Implement with expo-battery
    return { remove: () => {} };
  },
};

// Device performance tiers
export enum PerformanceTier {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

// Degradation modes
export interface DegradationMode {
  cacheSize: number; // MB
  backgroundSyncEnabled: boolean;
  animationsEnabled: boolean;
  imageQuality: 'high' | 'medium' | 'low';
  preloadCount: number; // Number of lessons to preload
  autoSaveInterval: number; // Seconds
}

// System resource status
export interface ResourceStatus {
  batteryLevel: number; // 0-1
  isLowBattery: boolean;
  memoryPressure: 'normal' | 'moderate' | 'critical';
  performanceTier: PerformanceTier;
  degradationMode: DegradationMode;
}

export class GracefulDegradationService {
  private static instance: GracefulDegradationService;
  private currentMode: DegradationMode;
  private performanceTier: PerformanceTier;
  private batteryLevel: number = 1.0;
  private batteryListener: any = null;
  
  // Default modes for different scenarios
  private readonly NORMAL_MODE: DegradationMode = {
    cacheSize: 100, // 100 MB
    backgroundSyncEnabled: true,
    animationsEnabled: true,
    imageQuality: 'high',
    preloadCount: 3,
    autoSaveInterval: 30, // 30 seconds
  };
  
  private readonly LOW_BATTERY_MODE: DegradationMode = {
    cacheSize: 50, // 50 MB
    backgroundSyncEnabled: false, // Disable background sync
    animationsEnabled: false, // Reduce animations
    imageQuality: 'medium',
    preloadCount: 1,
    autoSaveInterval: 60, // 60 seconds
  };
  
  private readonly LOW_MEMORY_MODE: DegradationMode = {
    cacheSize: 30, // 30 MB - Reduce cache size
    backgroundSyncEnabled: true,
    animationsEnabled: false,
    imageQuality: 'low',
    preloadCount: 1,
    autoSaveInterval: 45,
  };
  
  private readonly SLOW_DEVICE_MODE: DegradationMode = {
    cacheSize: 50, // 50 MB
    backgroundSyncEnabled: true,
    animationsEnabled: false, // Simplify UI
    imageQuality: 'medium',
    preloadCount: 2,
    autoSaveInterval: 45,
  };
  
  private readonly CRITICAL_MODE: DegradationMode = {
    cacheSize: 20, // 20 MB - Minimal cache
    backgroundSyncEnabled: false,
    animationsEnabled: false,
    imageQuality: 'low',
    preloadCount: 0, // No preloading
    autoSaveInterval: 90, // Less frequent saves
  };
  
  private constructor() {
    this.performanceTier = this.detectPerformanceTier();
    this.currentMode = this.NORMAL_MODE;
  }
  
  public static getInstance(): GracefulDegradationService {
    if (!GracefulDegradationService.instance) {
      GracefulDegradationService.instance = new GracefulDegradationService();
    }
    return GracefulDegradationService.instance;
  }
  
  /**
   * Initialize the service and start monitoring resources.
   */
  public async initialize(): Promise<void> {
    // Detect initial battery level
    this.batteryLevel = await Battery.getBatteryLevelAsync();
    
    // Set up battery monitoring
    this.batteryListener = Battery.addBatteryLevelListener((event: any) => {
      this.batteryLevel = event.batteryLevel;
      this.updateDegradationMode();
    });
    
    // Initial mode update
    this.updateDegradationMode();
    
    logError(
      'system',
      'low',
      'Graceful degradation service initialized',
      {
        performanceTier: this.performanceTier,
        batteryLevel: this.batteryLevel,
        mode: this.currentMode,
      }
    );
  }
  
  /**
   * Clean up resources.
   */
  public cleanup(): void {
    if (this.batteryListener) {
      this.batteryListener.remove();
      this.batteryListener = null;
    }
  }
  
  /**
   * Get current resource status.
   */
  public async getResourceStatus(): Promise<ResourceStatus> {
    const batteryLevel = await Battery.getBatteryLevelAsync();
    const isLowBattery = batteryLevel < 0.15; // Below 15%
    
    // Estimate memory pressure (simplified)
    const memoryPressure = this.estimateMemoryPressure();
    
    return {
      batteryLevel,
      isLowBattery,
      memoryPressure,
      performanceTier: this.performanceTier,
      degradationMode: this.currentMode,
    };
  }
  
  /**
   * Get current degradation mode.
   */
  public getCurrentMode(): DegradationMode {
    return { ...this.currentMode };
  }
  
  /**
   * Check if feature should be enabled based on current mode.
   */
  public isFeatureEnabled(feature: keyof DegradationMode): boolean {
    const value = this.currentMode[feature];
    return typeof value === 'boolean' ? value : true;
  }
  
  /**
   * Get configuration value for a feature.
   */
  public getFeatureConfig<K extends keyof DegradationMode>(
    feature: K
  ): DegradationMode[K] {
    return this.currentMode[feature];
  }
  
  /**
   * Detect device performance tier.
   * Requirement 8.6, 8.7: Graceful degradation on slow devices
   */
  private detectPerformanceTier(): PerformanceTier {
    try {
      // Get device information
      const deviceYear = Device.deviceYearClass || 2020;
      const totalMemory = Device.totalMemory || 2 * 1024 * 1024 * 1024; // Default 2GB
      
      // Classify based on device year and memory
      if (deviceYear >= 2020 && totalMemory >= 4 * 1024 * 1024 * 1024) {
        return PerformanceTier.HIGH;
      } else if (deviceYear >= 2017 && totalMemory >= 2 * 1024 * 1024 * 1024) {
        return PerformanceTier.MEDIUM;
      } else {
        return PerformanceTier.LOW;
      }
    } catch (error) {
      logError(
        'system',
        'low',
        'Failed to detect performance tier, defaulting to MEDIUM',
        { error: error instanceof Error ? error.message : String(error) }
      );
      return PerformanceTier.MEDIUM;
    }
  }
  
  /**
   * Estimate memory pressure.
   */
  private estimateMemoryPressure(): 'normal' | 'moderate' | 'critical' {
    try {
      // This is a simplified estimation
      // In production, you'd use actual memory metrics
      const totalMemory = Device.totalMemory || 2 * 1024 * 1024 * 1024;
      
      if (totalMemory < 1.5 * 1024 * 1024 * 1024) {
        return 'critical'; // Less than 1.5GB
      } else if (totalMemory < 2.5 * 1024 * 1024 * 1024) {
        return 'moderate'; // Less than 2.5GB
      } else {
        return 'normal';
      }
    } catch (error) {
      return 'normal';
    }
  }
  
  /**
   * Update degradation mode based on current conditions.
   * Requirement 8.6: Low battery handling
   * Requirement 8.7: Low memory handling
   */
  private updateDegradationMode(): void {
    const isLowBattery = this.batteryLevel < 0.15; // Below 15%
    const memoryPressure = this.estimateMemoryPressure();
    const isSlowDevice = this.performanceTier === PerformanceTier.LOW;
    
    let newMode: DegradationMode;
    let reason: string;
    
    // Determine appropriate mode based on conditions
    if (isLowBattery && memoryPressure === 'critical') {
      newMode = this.CRITICAL_MODE;
      reason = 'Low battery and critical memory pressure';
    } else if (isLowBattery) {
      newMode = this.LOW_BATTERY_MODE;
      reason = 'Low battery (below 15%)';
    } else if (memoryPressure === 'critical') {
      newMode = this.LOW_MEMORY_MODE;
      reason = 'Critical memory pressure';
    } else if (isSlowDevice) {
      newMode = this.SLOW_DEVICE_MODE;
      reason = 'Slow device detected';
    } else if (memoryPressure === 'moderate') {
      newMode = this.LOW_MEMORY_MODE;
      reason = 'Moderate memory pressure';
    } else {
      newMode = this.NORMAL_MODE;
      reason = 'Normal operation';
    }
    
    // Check if mode changed
    if (JSON.stringify(newMode) !== JSON.stringify(this.currentMode)) {
      const oldMode = this.currentMode;
      this.currentMode = newMode;
      
      logError(
        'system',
        'medium',
        'Degradation mode changed',
        {
          reason,
          oldMode,
          newMode,
          batteryLevel: this.batteryLevel,
          memoryPressure,
          performanceTier: this.performanceTier,
        }
      );
      
      // Notify about specific changes
      if (!newMode.backgroundSyncEnabled && oldMode.backgroundSyncEnabled) {
        logError(
          'system',
          'medium',
          'Background sync disabled due to low battery',
          { batteryLevel: this.batteryLevel }
        );
      }
      
      if (newMode.cacheSize < oldMode.cacheSize) {
        logError(
          'system',
          'medium',
          'Cache size reduced due to memory pressure',
          { oldSize: oldMode.cacheSize, newSize: newMode.cacheSize }
        );
      }
      
      if (!newMode.animationsEnabled && oldMode.animationsEnabled) {
        logError(
          'system',
          'medium',
          'Animations disabled for better performance',
          { reason }
        );
      }
    }
  }
  
  /**
   * Manually trigger mode update (for testing or forced updates).
   */
  public async updateMode(): Promise<void> {
    this.batteryLevel = await Battery.getBatteryLevelAsync();
    this.updateDegradationMode();
  }
  
  /**
   * Get recommended cache size in bytes.
   */
  public getRecommendedCacheSize(): number {
    return this.currentMode.cacheSize * 1024 * 1024; // Convert MB to bytes
  }
  
  /**
   * Check if background sync should be enabled.
   * Requirement 8.6: Disable background sync on low battery
   */
  public shouldEnableBackgroundSync(): boolean {
    return this.currentMode.backgroundSyncEnabled;
  }
  
  /**
   * Check if animations should be enabled.
   * Requirement 8.7: Simplify UI on slow devices
   */
  public shouldEnableAnimations(): boolean {
    return this.currentMode.animationsEnabled;
  }
  
  /**
   * Get image quality setting.
   */
  public getImageQuality(): 'high' | 'medium' | 'low' {
    return this.currentMode.imageQuality;
  }
  
  /**
   * Get number of lessons to preload.
   */
  public getPreloadCount(): number {
    return this.currentMode.preloadCount;
  }
  
  /**
   * Get auto-save interval in milliseconds.
   */
  public getAutoSaveInterval(): number {
    return this.currentMode.autoSaveInterval * 1000; // Convert to ms
  }
  
  /**
   * Check if device is in power-saving mode.
   * Requirement 8.6: Enter power-saving mode when battery below 15%
   */
  public isInPowerSavingMode(): boolean {
    return this.batteryLevel < 0.15;
  }
  
  /**
   * Get performance recommendations for the current state.
   */
  public getPerformanceRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (this.isInPowerSavingMode()) {
      recommendations.push('Device in power-saving mode. Background sync disabled.');
    }
    
    if (this.estimateMemoryPressure() === 'critical') {
      recommendations.push('Low memory detected. Cache size reduced.');
    }
    
    if (this.performanceTier === PerformanceTier.LOW) {
      recommendations.push('Slow device detected. UI simplified for better performance.');
    }
    
    if (!this.currentMode.animationsEnabled) {
      recommendations.push('Animations disabled to improve performance.');
    }
    
    return recommendations;
  }
}
