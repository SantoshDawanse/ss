/**
 * Unit tests for MonitoringService
 * Tests requirements 22.1-22.7 for sync monitoring and metrics
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MonitoringService,
  MetricType,
  BundleGenerationMetrics,
} from '../src/services/MonitoringService';

// Get the mocked functions
const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;
const mockMultiRemove = AsyncStorage.multiRemove as jest.Mock;

describe('MonitoringService - Task 14.1', () => {
  let monitoringService: MonitoringService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockMultiRemove.mockResolvedValue(undefined);
    monitoringService = MonitoringService.getInstance();
  });

  describe('Requirement 22.1: Record sync_success metric with duration', () => {
    it('should record sync success with duration', async () => {
      const duration = 5000;

      await monitoringService.recordSyncSuccess(duration);

      expect(mockSetItem).toHaveBeenCalled();
      const calls = mockSetItem.mock.calls;
      const eventCall = calls.find((call: any) => call[0].includes('analytics_events'));
      expect(eventCall).toBeDefined();
      
      const eventData = JSON.parse(eventCall[1]);
      expect(eventData[0].type).toBe(MetricType.SYNC_SUCCESS);
      expect(eventData[0].data.duration).toBe(duration);
    });

    it('should update sync analytics with success metrics', async () => {
      await monitoringService.recordSyncSuccess(3000);

      const calls = mockSetItem.mock.calls;
      const analyticsCall = calls.find((call: any) => call[0].includes('sync_analytics'));
      expect(analyticsCall).toBeDefined();
      
      const analytics = JSON.parse(analyticsCall[1]);
      expect(analytics.successfulSyncs).toBe(1);
      expect(analytics.totalAttempts).toBe(1);
      expect(analytics.successRate).toBe(1);
    });
  });

  describe('Requirement 22.2: Record sync_failure metric with error message', () => {
    it('should record sync failure with error message', async () => {
      const errorMessage = 'Network timeout';

      await monitoringService.recordSyncFailure(errorMessage);

      const calls = mockSetItem.mock.calls;
      const eventCall = calls.find((call: any) => call[0].includes('analytics_events'));
      expect(eventCall).toBeDefined();
      
      const eventData = JSON.parse(eventCall[1]);
      expect(eventData[0].type).toBe(MetricType.SYNC_FAILURE);
      expect(eventData[0].data.error).toBe(errorMessage);
    });

    it('should update sync analytics with failure metrics', async () => {
      await monitoringService.recordSyncFailure('Upload failed');

      const calls = mockSetItem.mock.calls;
      const analyticsCall = calls.find((call: any) => call[0].includes('sync_analytics'));
      expect(analyticsCall).toBeDefined();
      
      const analytics = JSON.parse(analyticsCall[1]);
      expect(analytics.failedSyncs).toBe(1);
      expect(analytics.totalAttempts).toBe(1);
      expect(analytics.successRate).toBe(0);
    });
  });

  describe('Requirement 22.3: Emit bundle_generation metrics', () => {
    it('should record successful bundle generation with all metrics', async () => {
      const metrics: BundleGenerationMetrics = {
        latency_ms: 1500,
        success: true,
        size_bytes: 5242880,
        content_count: 25,
      };

      await monitoringService.recordBundleGeneration(metrics);

      const calls = mockSetItem.mock.calls;
      const eventCall = calls.find((call: any) => call[0].includes('analytics_events'));
      expect(eventCall).toBeDefined();
      
      const eventData = JSON.parse(eventCall[1]);
      const bundleEvent = eventData.find((e: any) => e.type === MetricType.BUNDLE_GENERATION);
      
      expect(bundleEvent).toBeDefined();
      expect(bundleEvent.data.latency_ms).toBe(1500);
      expect(bundleEvent.data.success).toBe(true);
      expect(bundleEvent.data.size_bytes).toBe(5242880);
      expect(bundleEvent.data.content_count).toBe(25);
    });

    it('should record failed bundle generation with error', async () => {
      const metrics: BundleGenerationMetrics = {
        latency_ms: 500,
        success: false,
        error: 'Bundle size exceeded',
      };

      await monitoringService.recordBundleGeneration(metrics);

      const calls = mockSetItem.mock.calls;
      const eventCall = calls.find((call: any) => call[0].includes('analytics_events'));
      const eventData = JSON.parse(eventCall[1]);
      const bundleEvent = eventData.find((e: any) => e.type === MetricType.BUNDLE_GENERATION);
      
      expect(bundleEvent.data.success).toBe(false);
      expect(bundleEvent.data.error).toBe('Bundle size exceeded');
    });
  });

  describe('Requirement 22.4: Log bundle generation events to audit log', () => {
    it('should log successful bundle generation to audit log', async () => {
      const metrics: BundleGenerationMetrics = {
        latency_ms: 1200,
        success: true,
        size_bytes: 4000000,
        content_count: 20,
      };

      await monitoringService.recordBundleGeneration(metrics);

      const calls = mockSetItem.mock.calls;
      const auditCall = calls.find((call: any) => call[0].includes('audit_log'));
      expect(auditCall).toBeDefined();
      
      const auditLog = JSON.parse(auditCall[1]);
      expect(auditLog[0].event).toBe('bundle_generation');
      expect(auditLog[0].severity).toBe('low');
      expect(auditLog[0].details.latency_ms).toBe(1200);
      expect(auditLog[0].details.success).toBe(true);
    });

    it('should log failed bundle generation with medium severity', async () => {
      const metrics: BundleGenerationMetrics = {
        latency_ms: 800,
        success: false,
        error: 'Generation timeout',
      };

      await monitoringService.recordBundleGeneration(metrics);

      const calls = mockSetItem.mock.calls;
      const auditCall = calls.find((call: any) => call[0].includes('audit_log'));
      const auditLog = JSON.parse(auditCall[1]);
      
      expect(auditLog[0].severity).toBe('medium');
      expect(auditLog[0].details.error).toBe('Generation timeout');
    });
  });

  describe('Requirement 22.5: Log state transitions with timestamps', () => {
    it('should log state transition with timestamp', async () => {
      const fromState = 'idle';
      const toState = 'checking_connectivity';
      const context = { sessionId: 'test-session-123' };

      await monitoringService.logStateTransition(fromState, toState, context);

      const calls = mockSetItem.mock.calls;
      const transitionCall = calls.find((call: any) => call[0].includes('state_transitions'));
      expect(transitionCall).toBeDefined();
      
      const transitions = JSON.parse(transitionCall[1]);
      expect(transitions[0].fromState).toBe('idle');
      expect(transitions[0].toState).toBe('checking_connectivity');
      expect(transitions[0].context.sessionId).toBe('test-session-123');
      expect(transitions[0].timestamp).toBeDefined();
    });

    it('should record state transition as analytics event', async () => {
      await monitoringService.logStateTransition('uploading', 'downloading');

      const calls = mockSetItem.mock.calls;
      const eventCall = calls.find((call: any) => call[0].includes('analytics_events'));
      const eventData = JSON.parse(eventCall[1]);
      const stateEvent = eventData.find((e: any) => e.type === MetricType.STATE_TRANSITION);
      
      expect(stateEvent).toBeDefined();
      expect(stateEvent.data.fromState).toBe('uploading');
      expect(stateEvent.data.toState).toBe('downloading');
    });
  });

  describe('Requirement 22.6: Include severity levels in error logs', () => {
    it('should log low severity for transient errors', async () => {
      await monitoringService.recordSyncFailure('Network timeout');

      const calls = mockSetItem.mock.calls;
      const auditCall = calls.find((call: any) => call[0].includes('audit_log'));
      const auditLog = JSON.parse(auditCall[1]);
      
      expect(auditLog[0].severity).toBe('low');
    });

    it('should log medium severity for errors requiring user action', async () => {
      await monitoringService.recordSyncFailure('Disk space low');

      const calls = mockSetItem.mock.calls;
      const auditCall = calls.find((call: any) => call[0].includes('audit_log'));
      const auditLog = JSON.parse(auditCall[1]);
      
      expect(auditLog[0].severity).toBe('medium');
    });

    it('should log high severity for critical errors', async () => {
      await monitoringService.recordSyncFailure('Database corruption detected');

      const calls = mockSetItem.mock.calls;
      const auditCall = calls.find((call: any) => call[0].includes('audit_log'));
      const auditLog = JSON.parse(auditCall[1]);
      
      expect(auditLog[0].severity).toBe('high');
    });

    it('should support all three severity levels in audit log', async () => {
      await monitoringService.logToAudit('test_low', 'low', { detail: 'info' });
      await monitoringService.logToAudit('test_medium', 'medium', { detail: 'warning' });
      await monitoringService.logToAudit('test_high', 'high', { detail: 'critical' });

      const calls = mockSetItem.mock.calls;
      const auditCalls = calls.filter((call: any) => call[0].includes('audit_log'));
      
      expect(auditCalls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Requirement 22.7: Audit log retrieval', () => {
    it('should retrieve audit log entries', async () => {
      const mockAuditLog = [
        {
          timestamp: new Date('2024-01-01T10:00:00Z').toISOString(),
          event: 'sync_success',
          severity: 'low',
          details: { duration: 5000 },
        },
      ];

      mockGetItem.mockImplementation((key: string) => {
        if (key.includes('audit_log')) {
          return Promise.resolve(JSON.stringify(mockAuditLog));
        }
        return Promise.resolve(null);
      });

      const auditLog = await monitoringService.getAuditLog();

      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].event).toBe('sync_success');
      expect(auditLog[0].severity).toBe('low');
    });

    it('should retrieve state transition history', async () => {
      const mockTransitions = [
        {
          timestamp: new Date('2024-01-01T10:00:00Z').toISOString(),
          fromState: 'idle',
          toState: 'checking_connectivity',
        },
      ];

      mockGetItem.mockImplementation((key: string) => {
        if (key.includes('state_transitions')) {
          return Promise.resolve(JSON.stringify(mockTransitions));
        }
        return Promise.resolve(null);
      });

      const transitions = await monitoringService.getStateTransitions();

      expect(transitions).toHaveLength(1);
      expect(transitions[0].fromState).toBe('idle');
      expect(transitions[0].toState).toBe('checking_connectivity');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty audit log gracefully', async () => {
      mockGetItem.mockResolvedValue(null);

      const auditLog = await monitoringService.getAuditLog();

      expect(auditLog).toEqual([]);
    });

    it('should handle empty state transitions gracefully', async () => {
      mockGetItem.mockResolvedValue(null);

      const transitions = await monitoringService.getStateTransitions();

      expect(transitions).toEqual([]);
    });

    it('should handle AsyncStorage errors gracefully', async () => {
      mockSetItem.mockRejectedValue(new Error('Storage full'));

      await expect(
        monitoringService.recordSyncSuccess(5000)
      ).resolves.not.toThrow();
    });
  });

  describe('Integration with existing functionality', () => {
    it('should clear audit log and state transitions on clearAllData', async () => {
      await monitoringService.clearAllData();

      expect(mockMultiRemove).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('audit_log'),
          expect.stringContaining('state_transitions'),
        ])
      );
    });
  });
});
