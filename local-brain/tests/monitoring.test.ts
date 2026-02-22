/**
 * Unit tests for MonitoringService
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MonitoringService, MetricType } from '../src/services/MonitoringService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiRemove: jest.fn(),
}));

// Mock expo-battery
jest.mock('expo-battery', () => ({
  getBatteryLevelAsync: jest.fn(() => Promise.resolve(0.8)),
  getBatteryStateAsync: jest.fn(() => Promise.resolve(2)), // UNPLUGGED
  BatteryState: {
    CHARGING: 1,
    UNPLUGGED: 2,
    FULL: 3,
    UNKNOWN: 0,
  },
}));

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  getFreeDiskStorageAsync: jest.fn(() => Promise.resolve(10 * 1024 * 1024 * 1024)), // 10GB
}));

// Mock global ErrorUtils
global.ErrorUtils = {
  setGlobalHandler: jest.fn(),
  getGlobalHandler: jest.fn(() => null),
};

describe('MonitoringService', () => {
  let monitoringService: MonitoringService;
  let mockStorage: Map<string, string>;

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Create a mock storage that persists data
    mockStorage = new Map<string, string>();
    
    // Mock AsyncStorage with persistent storage
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      return Promise.resolve(mockStorage.get(key) || null);
    });
    
    (AsyncStorage.setItem as jest.Mock).mockImplementation((key: string, value: string) => {
      mockStorage.set(key, value);
      return Promise.resolve(undefined);
    });
    
    (AsyncStorage.multiRemove as jest.Mock).mockImplementation((keys: string[]) => {
      keys.forEach(key => mockStorage.delete(key));
      return Promise.resolve(undefined);
    });

    // Get fresh instance
    monitoringService = MonitoringService.getInstance();
  });

  describe('Crash Reporting', () => {
    it('should record crash reports', async () => {
      const error = new Error('Test crash');
      const context = { isFatal: true };

      await monitoringService.recordCrash(error, context);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@monitoring/crash_reports',
        expect.stringContaining('Test crash')
      );
    });

    it('should retrieve crash reports', async () => {
      const mockReports = [
        {
          timestamp: new Date().toISOString(),
          error: 'Test error',
          stackTrace: 'stack trace',
          context: {},
          appVersion: '1.0.0',
        },
      ];

      mockStorage.set('@monitoring/crash_reports', JSON.stringify(mockReports));

      const reports = await monitoringService.getCrashReports();

      expect(reports).toHaveLength(1);
      expect(reports[0].error).toBe('Test error');
      expect(reports[0].timestamp).toBeInstanceOf(Date);
    });

    it('should limit crash reports to 50', async () => {
      // Create 51 crash reports
      const existingReports = Array.from({ length: 51 }, (_, i) => ({
        timestamp: new Date().toISOString(),
        error: `Error ${i}`,
        appVersion: '1.0.0',
      }));

      mockStorage.set('@monitoring/crash_reports', JSON.stringify(existingReports));

      await monitoringService.recordCrash(new Error('New error'));

      const savedData = mockStorage.get('@monitoring/crash_reports');
      const savedReports = JSON.parse(savedData!);

      expect(savedReports).toHaveLength(50);
      expect(savedReports[savedReports.length - 1].error).toBe('New error');
    });
  });

  describe('Analytics Events', () => {
    it('should record analytics events', async () => {
      await monitoringService.recordEvent(MetricType.APP_START, {
        timestamp: Date.now(),
      });

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@monitoring/analytics_events',
        expect.stringContaining('app_start')
      );
    });

    it('should retrieve analytics events', async () => {
      const mockEvents = [
        {
          type: MetricType.APP_START,
          timestamp: new Date().toISOString(),
          data: {},
        },
      ];

      mockStorage.set('@monitoring/analytics_events', JSON.stringify(mockEvents));

      const events = await monitoringService.getAnalyticsEvents();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(MetricType.APP_START);
      expect(events[0].timestamp).toBeInstanceOf(Date);
    });

    it('should limit analytics events to 1000', async () => {
      // Create 1001 events
      const existingEvents = Array.from({ length: 1001 }, (_, i) => ({
        type: MetricType.APP_START,
        timestamp: new Date().toISOString(),
        data: { index: i },
      }));

      mockStorage.set('@monitoring/analytics_events', JSON.stringify(existingEvents));

      await monitoringService.recordEvent(MetricType.APP_FOREGROUND, {});

      const savedData = mockStorage.get('@monitoring/analytics_events');
      const savedEvents = JSON.parse(savedData!);

      expect(savedEvents).toHaveLength(1000);
      expect(savedEvents[savedEvents.length - 1].type).toBe(MetricType.APP_FOREGROUND);
    });
  });

  describe('Sync Analytics', () => {
    it('should record sync success', async () => {
      const duration = 5000; // 5 seconds

      await monitoringService.recordSyncSuccess(duration);

      const analytics = await monitoringService.getSyncAnalytics();

      expect(analytics.totalAttempts).toBe(1);
      expect(analytics.successfulSyncs).toBe(1);
      expect(analytics.successRate).toBe(1);
      expect(analytics.averageDuration).toBe(duration);
    });

    it('should record sync failure', async () => {
      await monitoringService.recordSyncFailure('Network timeout');

      const analytics = await monitoringService.getSyncAnalytics();

      expect(analytics.totalAttempts).toBe(1);
      expect(analytics.failedSyncs).toBe(1);
      expect(analytics.successRate).toBe(0);
    });

    it('should calculate correct success rate', async () => {
      // Record 3 successes and 1 failure
      await monitoringService.recordSyncSuccess(1000);
      await monitoringService.recordSyncSuccess(2000);
      await monitoringService.recordSyncSuccess(3000);
      await monitoringService.recordSyncFailure('Error');

      const analytics = await monitoringService.getSyncAnalytics();

      expect(analytics.totalAttempts).toBe(4);
      expect(analytics.successfulSyncs).toBe(3);
      expect(analytics.failedSyncs).toBe(1);
      expect(analytics.successRate).toBe(0.75);
    });

    it('should calculate average sync duration', async () => {
      await monitoringService.recordSyncSuccess(1000);
      await monitoringService.recordSyncSuccess(2000);
      await monitoringService.recordSyncSuccess(3000);

      const analytics = await monitoringService.getSyncAnalytics();

      expect(analytics.averageDuration).toBe(2000);
    });
  });

  describe('Offline Analytics', () => {
    it('should start offline session', async () => {
      await monitoringService.startOfflineSession();

      const analytics = await monitoringService.getOfflineAnalytics();

      expect(analytics.offlineSessionStart).toBeInstanceOf(Date);
    });

    it('should end offline session and track duration', async () => {
      await monitoringService.startOfflineSession();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      await monitoringService.endOfflineSession();

      const analytics = await monitoringService.getOfflineAnalytics();

      expect(analytics.totalOfflineDuration).toBeGreaterThan(0);
      expect(analytics.currentOfflineSession).toBe(0);
      expect(analytics.offlineSessionStart).toBeUndefined();
    });

    it('should track longest offline session', async () => {
      // First session
      await monitoringService.startOfflineSession();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await monitoringService.endOfflineSession();

      const analytics1 = await monitoringService.getOfflineAnalytics();
      const firstDuration = analytics1.longestOfflineSession;

      // Second longer session
      await monitoringService.startOfflineSession();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await monitoringService.endOfflineSession();

      const analytics2 = await monitoringService.getOfflineAnalytics();

      expect(analytics2.longestOfflineSession).toBeGreaterThan(firstDuration);
    });
  });

  describe('Resource Usage', () => {
    it('should get current resource usage', async () => {
      const usage = await monitoringService.getResourceUsage();

      expect(usage.storageUsed).toBeGreaterThanOrEqual(0);
      expect(usage.storageAvailable).toBeGreaterThan(0);
      expect(usage.storagePercentage).toBeGreaterThanOrEqual(0);
      expect(usage.batteryLevel).toBeGreaterThanOrEqual(0);
      expect(usage.batteryLevel).toBeLessThanOrEqual(1);
      expect(['charging', 'unplugged', 'full', 'unknown']).toContain(usage.batteryState);
    });

    it('should track storage usage', async () => {
      await monitoringService.trackStorageUsage();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@monitoring/analytics_events',
        expect.stringContaining('storage_usage')
      );
    });

    it('should track battery usage', async () => {
      await monitoringService.trackBatteryUsage();

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('App Lifecycle', () => {
    it('should record app background event', async () => {
      await monitoringService.recordAppBackground();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@monitoring/analytics_events',
        expect.stringContaining('app_background')
      );
    });

    it('should record app foreground event', async () => {
      await monitoringService.recordAppForeground();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@monitoring/analytics_events',
        expect.stringContaining('app_foreground')
      );
    });
  });

  describe('Data Management', () => {
    it('should clear all monitoring data', async () => {
      await monitoringService.clearAllData();

      expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
        '@monitoring/crash_reports',
        '@monitoring/analytics_events',
        '@monitoring/sync_analytics',
        '@monitoring/offline_analytics',
        '@monitoring/last_battery_level',
      ]);
    });
  });
});
