/**
 * MonitoringService for Local Brain
 * 
 * Provides crash reporting, analytics tracking, and resource monitoring
 * for the offline-first Local Brain application.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Metric types for analytics
 */
export enum MetricType {
  CRASH = 'crash',
  SYNC_SUCCESS = 'sync_success',
  SYNC_FAILURE = 'sync_failure',
  OFFLINE_DURATION = 'offline_duration',
  STORAGE_USAGE = 'storage_usage',
  BATTERY_USAGE = 'battery_usage',
  APP_START = 'app_start',
  APP_BACKGROUND = 'app_background',
  APP_FOREGROUND = 'app_foreground',
}

/**
 * Crash report data structure
 */
export interface CrashReport {
  timestamp: Date;
  error: string;
  stackTrace?: string;
  context?: Record<string, any>;
  appVersion: string;
  deviceInfo?: Record<string, any>;
}

/**
 * Analytics event data structure
 */
export interface AnalyticsEvent {
  type: MetricType;
  timestamp: Date;
  data: Record<string, any>;
}

/**
 * Sync analytics data
 */
export interface SyncAnalytics {
  totalAttempts: number;
  successfulSyncs: number;
  failedSyncs: number;
  successRate: number;
  lastSyncTime?: Date;
  averageDuration?: number;
}

/**
 * Offline operation analytics
 */
export interface OfflineAnalytics {
  totalOfflineDuration: number; // milliseconds
  currentOfflineSession: number; // milliseconds
  offlineSessionStart?: Date;
  longestOfflineSession: number; // milliseconds
}

/**
 * Resource usage data
 */
export interface ResourceUsage {
  storageUsed: number; // bytes
  storageAvailable: number; // bytes
  storagePercentage: number;
  batteryLevel: number; // 0-1
  batteryState: 'charging' | 'unplugged' | 'full' | 'unknown';
}

/**
 * Storage keys for persisting monitoring data
 */
const STORAGE_KEYS = {
  CRASH_REPORTS: '@monitoring/crash_reports',
  ANALYTICS_EVENTS: '@monitoring/analytics_events',
  SYNC_ANALYTICS: '@monitoring/sync_analytics',
  OFFLINE_ANALYTICS: '@monitoring/offline_analytics',
  LAST_BATTERY_LEVEL: '@monitoring/last_battery_level',
};

/**
 * MonitoringService class
 * 
 * Handles all monitoring, analytics, and crash reporting for Local Brain.
 */
export class MonitoringService {
  private static instance: MonitoringService | null = null;
  private isInitialized = false;
  private offlineSessionStart: Date | null = null;
  private lastBatteryLevel: number = 1.0;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * Initialize monitoring service
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Set up global error handler for crash reporting
      this.setupGlobalErrorHandler();

      // Initialize offline tracking
      await this.initializeOfflineTracking();

      // Initialize battery monitoring
      await this.initializeBatteryMonitoring();

      // Record app start
      await this.recordEvent(MetricType.APP_START, {});

      this.isInitialized = true;
      console.log('[MonitoringService] Initialized successfully');
    } catch (error) {
      console.error('[MonitoringService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Set up global error handler for crash reporting
   */
  private setupGlobalErrorHandler(): void {
    const originalHandler = ErrorUtils.getGlobalHandler();

    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      // Record crash report
      this.recordCrash(error, { isFatal }).catch((err) => {
        console.error('[MonitoringService] Failed to record crash:', err);
      });

      // Call original handler
      if (originalHandler) {
        originalHandler(error, isFatal);
      }
    });
  }

  /**
   * Initialize offline tracking
   */
  private async initializeOfflineTracking(): Promise<void> {
    try {
      const analyticsJson = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_ANALYTICS);
      if (analyticsJson) {
        const analytics: OfflineAnalytics = JSON.parse(analyticsJson);
        if (analytics.offlineSessionStart) {
          this.offlineSessionStart = new Date(analytics.offlineSessionStart);
        }
      }
    } catch (error) {
      console.error('[MonitoringService] Failed to initialize offline tracking:', error);
    }
  }

  /**
   * Initialize battery monitoring
   */
  private async initializeBatteryMonitoring(): Promise<void> {
    try {
      const batteryLevel = await Battery.getBatteryLevelAsync();
      this.lastBatteryLevel = batteryLevel;
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_BATTERY_LEVEL, batteryLevel.toString());
    } catch (error) {
      console.error('[MonitoringService] Failed to initialize battery monitoring:', error);
    }
  }

  /**
   * Record a crash report
   */
  public async recordCrash(
    error: Error,
    context?: Record<string, any>
  ): Promise<void> {
    try {
      const crashReport: CrashReport = {
        timestamp: new Date(),
        error: error.message,
        stackTrace: error.stack,
        context,
        appVersion: '1.0.0', // TODO: Get from app config
      };

      // Get existing crash reports
      const reportsJson = await AsyncStorage.getItem(STORAGE_KEYS.CRASH_REPORTS);
      const reports: CrashReport[] = reportsJson ? JSON.parse(reportsJson) : [];

      // Add new report
      reports.push(crashReport);

      // Keep only last 50 crash reports
      const trimmedReports = reports.slice(-50);

      // Save back to storage
      await AsyncStorage.setItem(
        STORAGE_KEYS.CRASH_REPORTS,
        JSON.stringify(trimmedReports)
      );

      console.error('[MonitoringService] Crash recorded:', crashReport);
    } catch (err) {
      console.error('[MonitoringService] Failed to record crash:', err);
    }
  }

  /**
   * Record an analytics event
   */
  public async recordEvent(
    type: MetricType,
    data: Record<string, any>
  ): Promise<void> {
    try {
      const event: AnalyticsEvent = {
        type,
        timestamp: new Date(),
        data,
      };

      // Get existing events
      const eventsJson = await AsyncStorage.getItem(STORAGE_KEYS.ANALYTICS_EVENTS);
      const events: AnalyticsEvent[] = eventsJson ? JSON.parse(eventsJson) : [];

      // Add new event
      events.push(event);

      // Keep only last 1000 events
      const trimmedEvents = events.slice(-1000);

      // Save back to storage
      await AsyncStorage.setItem(
        STORAGE_KEYS.ANALYTICS_EVENTS,
        JSON.stringify(trimmedEvents)
      );

      console.log('[MonitoringService] Event recorded:', type, data);
    } catch (error) {
      console.error('[MonitoringService] Failed to record event:', error);
    }
  }

  /**
   * Record sync success
   */
  public async recordSyncSuccess(duration: number): Promise<void> {
    try {
      await this.recordEvent(MetricType.SYNC_SUCCESS, { duration });

      // Update sync analytics
      const analytics = await this.getSyncAnalytics();
      analytics.totalAttempts += 1;
      analytics.successfulSyncs += 1;
      analytics.successRate = analytics.successfulSyncs / analytics.totalAttempts;
      analytics.lastSyncTime = new Date();

      // Update average duration
      if (analytics.averageDuration) {
        analytics.averageDuration =
          (analytics.averageDuration * (analytics.successfulSyncs - 1) + duration) /
          analytics.successfulSyncs;
      } else {
        analytics.averageDuration = duration;
      }

      await AsyncStorage.setItem(
        STORAGE_KEYS.SYNC_ANALYTICS,
        JSON.stringify(analytics)
      );
    } catch (error) {
      console.error('[MonitoringService] Failed to record sync success:', error);
    }
  }

  /**
   * Record sync failure
   */
  public async recordSyncFailure(error: string): Promise<void> {
    try {
      await this.recordEvent(MetricType.SYNC_FAILURE, { error });

      // Update sync analytics
      const analytics = await this.getSyncAnalytics();
      analytics.totalAttempts += 1;
      analytics.failedSyncs += 1;
      analytics.successRate = analytics.successfulSyncs / analytics.totalAttempts;

      await AsyncStorage.setItem(
        STORAGE_KEYS.SYNC_ANALYTICS,
        JSON.stringify(analytics)
      );
    } catch (error) {
      console.error('[MonitoringService] Failed to record sync failure:', error);
    }
  }

  /**
   * Get sync analytics
   */
  public async getSyncAnalytics(): Promise<SyncAnalytics> {
    try {
      const analyticsJson = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_ANALYTICS);
      if (analyticsJson) {
        const analytics = JSON.parse(analyticsJson);
        if (analytics.lastSyncTime) {
          analytics.lastSyncTime = new Date(analytics.lastSyncTime);
        }
        return analytics;
      }
    } catch (error) {
      console.error('[MonitoringService] Failed to get sync analytics:', error);
    }

    return {
      totalAttempts: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      successRate: 0,
    };
  }

  /**
   * Start offline session tracking
   */
  public async startOfflineSession(): Promise<void> {
    try {
      this.offlineSessionStart = new Date();

      const analytics = await this.getOfflineAnalytics();
      analytics.offlineSessionStart = this.offlineSessionStart;

      await AsyncStorage.setItem(
        STORAGE_KEYS.OFFLINE_ANALYTICS,
        JSON.stringify(analytics)
      );
    } catch (error) {
      console.error('[MonitoringService] Failed to start offline session:', error);
    }
  }

  /**
   * End offline session tracking
   */
  public async endOfflineSession(): Promise<void> {
    try {
      if (!this.offlineSessionStart) {
        return;
      }

      const sessionDuration = Date.now() - this.offlineSessionStart.getTime();
      const analytics = await this.getOfflineAnalytics();

      analytics.totalOfflineDuration += sessionDuration;
      analytics.currentOfflineSession = 0;
      analytics.offlineSessionStart = undefined;

      if (sessionDuration > analytics.longestOfflineSession) {
        analytics.longestOfflineSession = sessionDuration;
      }

      await AsyncStorage.setItem(
        STORAGE_KEYS.OFFLINE_ANALYTICS,
        JSON.stringify(analytics)
      );

      await this.recordEvent(MetricType.OFFLINE_DURATION, {
        duration: sessionDuration,
      });

      this.offlineSessionStart = null;
    } catch (error) {
      console.error('[MonitoringService] Failed to end offline session:', error);
    }
  }

  /**
   * Get offline analytics
   */
  public async getOfflineAnalytics(): Promise<OfflineAnalytics> {
    try {
      const analyticsJson = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_ANALYTICS);
      if (analyticsJson) {
        const analytics = JSON.parse(analyticsJson);
        if (analytics.offlineSessionStart) {
          analytics.offlineSessionStart = new Date(analytics.offlineSessionStart);
          analytics.currentOfflineSession =
            Date.now() - analytics.offlineSessionStart.getTime();
        }
        return analytics;
      }
    } catch (error) {
      console.error('[MonitoringService] Failed to get offline analytics:', error);
    }

    return {
      totalOfflineDuration: 0,
      currentOfflineSession: 0,
      longestOfflineSession: 0,
    };
  }

  /**
   * Get current resource usage
   */
  public async getResourceUsage(): Promise<ResourceUsage> {
    try {
      // Get storage info
      const storageInfo = await FileSystem.getFreeDiskStorageAsync();
      const totalStorage = await this.getTotalStorage();
      const storageUsed = totalStorage - storageInfo;
      const storagePercentage = (storageUsed / totalStorage) * 100;

      // Get battery info
      const batteryLevel = await Battery.getBatteryLevelAsync();
      const batteryStateNum = await Battery.getBatteryStateAsync();
      
      let batteryState: 'charging' | 'unplugged' | 'full' | 'unknown' = 'unknown';
      switch (batteryStateNum) {
        case Battery.BatteryState.CHARGING:
          batteryState = 'charging';
          break;
        case Battery.BatteryState.UNPLUGGED:
          batteryState = 'unplugged';
          break;
        case Battery.BatteryState.FULL:
          batteryState = 'full';
          break;
        default:
          batteryState = 'unknown';
      }

      return {
        storageUsed,
        storageAvailable: storageInfo,
        storagePercentage,
        batteryLevel,
        batteryState,
      };
    } catch (error) {
      console.error('[MonitoringService] Failed to get resource usage:', error);
      throw error;
    }
  }

  /**
   * Track storage usage
   */
  public async trackStorageUsage(): Promise<void> {
    try {
      const usage = await this.getResourceUsage();
      await this.recordEvent(MetricType.STORAGE_USAGE, {
        storageUsed: usage.storageUsed,
        storageAvailable: usage.storageAvailable,
        storagePercentage: usage.storagePercentage,
      });
    } catch (error) {
      console.error('[MonitoringService] Failed to track storage usage:', error);
    }
  }

  /**
   * Track battery usage
   */
  public async trackBatteryUsage(): Promise<void> {
    try {
      const currentLevel = await Battery.getBatteryLevelAsync();
      const batteryDelta = this.lastBatteryLevel - currentLevel;

      if (batteryDelta > 0) {
        await this.recordEvent(MetricType.BATTERY_USAGE, {
          batteryDelta,
          currentLevel,
          previousLevel: this.lastBatteryLevel,
        });
      }

      this.lastBatteryLevel = currentLevel;
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_BATTERY_LEVEL, currentLevel.toString());
    } catch (error) {
      console.error('[MonitoringService] Failed to track battery usage:', error);
    }
  }

  /**
   * Get all crash reports
   */
  public async getCrashReports(): Promise<CrashReport[]> {
    try {
      const reportsJson = await AsyncStorage.getItem(STORAGE_KEYS.CRASH_REPORTS);
      if (reportsJson) {
        const reports = JSON.parse(reportsJson);
        return reports.map((r: any) => ({
          ...r,
          timestamp: new Date(r.timestamp),
        }));
      }
    } catch (error) {
      console.error('[MonitoringService] Failed to get crash reports:', error);
    }
    return [];
  }

  /**
   * Get all analytics events
   */
  public async getAnalyticsEvents(): Promise<AnalyticsEvent[]> {
    try {
      const eventsJson = await AsyncStorage.getItem(STORAGE_KEYS.ANALYTICS_EVENTS);
      if (eventsJson) {
        const events = JSON.parse(eventsJson);
        return events.map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        }));
      }
    } catch (error) {
      console.error('[MonitoringService] Failed to get analytics events:', error);
    }
    return [];
  }

  /**
   * Clear all monitoring data
   */
  public async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.CRASH_REPORTS,
        STORAGE_KEYS.ANALYTICS_EVENTS,
        STORAGE_KEYS.SYNC_ANALYTICS,
        STORAGE_KEYS.OFFLINE_ANALYTICS,
        STORAGE_KEYS.LAST_BATTERY_LEVEL,
      ]);
      console.log('[MonitoringService] All monitoring data cleared');
    } catch (error) {
      console.error('[MonitoringService] Failed to clear monitoring data:', error);
    }
  }

  /**
   * Get total storage (platform-specific estimation)
   */
  private async getTotalStorage(): Promise<number> {
    // This is an estimation - actual implementation would need platform-specific code
    // For now, assume 32GB total storage as a reasonable default for target devices
    return 32 * 1024 * 1024 * 1024; // 32GB in bytes
  }

  /**
   * Record app going to background
   */
  public async recordAppBackground(): Promise<void> {
    await this.recordEvent(MetricType.APP_BACKGROUND, {});
    await this.trackBatteryUsage();
    await this.trackStorageUsage();
  }

  /**
   * Record app coming to foreground
   */
  public async recordAppForeground(): Promise<void> {
    await this.recordEvent(MetricType.APP_FOREGROUND, {});
  }
}

// Export singleton instance
export default MonitoringService.getInstance();
