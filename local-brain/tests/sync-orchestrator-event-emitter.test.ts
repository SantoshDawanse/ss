/**
 * Integration test for SyncOrchestratorService event emitter functionality.
 * Tests that state change events are properly emitted during state transitions.
 */

import { SyncOrchestratorService } from '../src/services/SyncOrchestratorService';
import { SyncStateChangeEvent } from '../src/types/sync';

// Mock all dependencies with minimal implementations
jest.mock('../src/database/DatabaseManager', () => ({
  DatabaseManager: {
    getInstance: jest.fn(() => ({
      syncSessionRepository: {
        findInProgress: jest.fn(() => Promise.resolve([])),
        create: jest.fn(() => Promise.resolve()),
        complete: jest.fn(() => Promise.resolve()),
        fail: jest.fn(() => Promise.resolve()),
        updateStatus: jest.fn(() => Promise.resolve()),
        updateLogsUploaded: jest.fn(() => Promise.resolve()),
        updateBundleDownloaded: jest.fn(() => Promise.resolve()),
        findLastCompleted: jest.fn(() => Promise.resolve(null)),
        deleteOldSessions: jest.fn(() => Promise.resolve()),
      },
      performanceLogRepository: {
        findUnsyncedByStudent: jest.fn(() => Promise.resolve([])),
        markAsSynced: jest.fn(() => Promise.resolve()),
        deleteSyncedBefore: jest.fn(() => Promise.resolve()),
        countUnsynced: jest.fn(() => Promise.resolve(0)),
      },
      learningBundleRepository: {
        findActiveByStudent: jest.fn(() => Promise.resolve({
          bundle_id: 'existing-bundle',
          student_id: 'test-student',
          valid_from: Date.now(),
          valid_until: Date.now() + 86400000,
          total_size: 1024,
          checksum: 'test-checksum',
          status: 'active',
        })),
        archiveOldBundles: jest.fn(() => Promise.resolve()),
        create: jest.fn(() => Promise.resolve()),
      },
      lessonRepository: {
        create: jest.fn(() => Promise.resolve()),
      },
      quizRepository: {
        create: jest.fn(() => Promise.resolve()),
      },
      executeSql: jest.fn(() => Promise.resolve([{ count: 2 }])), // Has content
      runSql: jest.fn(() => Promise.resolve({ lastInsertRowId: 1 })),
    })),
  },
}));

jest.mock('../src/services/BundleImportService', () => ({
  BundleImportService: jest.fn().mockImplementation(() => ({
    importBundle: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('../src/services/EncryptionService', () => ({
  EncryptionService: {
    getInstance: jest.fn(() => ({})),
  },
}));

jest.mock('../src/services/SecureNetworkService', () => ({
  SecureNetworkService: {
    getInstance: jest.fn(() => ({
      post: jest.fn(() => Promise.resolve({ ok: true, data: { sessionId: 'backend-123', logsReceived: 0, bundleReady: false } })),
    })),
  },
}));

jest.mock('../src/services/AuthenticationService', () => ({
  AuthenticationService: {
    getInstance: jest.fn(() => ({
      initialize: jest.fn(() => Promise.resolve()),
      getAccessToken: jest.fn(() => Promise.resolve('mock-token')),
      getAuthState: jest.fn(() => ({
        accessToken: 'mock-token',
        isAuthenticated: true,
      })),
      setTemporaryToken: jest.fn(),
    })),
  },
}));

jest.mock('../src/services/MonitoringService', () => ({
  MonitoringService: {
    getInstance: jest.fn(() => ({
      recordSyncSuccess: jest.fn(() => Promise.resolve()),
      recordSyncFailure: jest.fn(() => Promise.resolve()),
    })),
  },
}));

jest.mock('../src/utils/errorHandling', () => ({
  logError: jest.fn(),
}));

// Mock fetch for connectivity check
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
  } as Response)
);

describe('SyncOrchestratorService Event Emitter Integration', () => {
  let syncService: SyncOrchestratorService;
  const mockStudentId = 'test-student-123';
  const mockAuthToken = 'test-auth-token';
  const mockPublicKey = 'test-public-key';

  beforeEach(() => {
    jest.clearAllMocks();
    syncService = new SyncOrchestratorService(mockStudentId, mockAuthToken, mockPublicKey);
  });

  it('should emit state change events during sync workflow', async () => {
    const stateChangeEvents: SyncStateChangeEvent[] = [];
    
    // Add event listener
    const removeListener = syncService.addStateChangeListener((event) => {
      stateChangeEvents.push(event);
    });

    try {
      // Start sync (this will trigger state transitions)
      await syncService.startSync();
    } catch (error) {
      // Sync might fail due to mocked dependencies, but we're testing event emission
      console.log('Sync failed as expected in test environment:', error);
    }

    // Verify that state change events were emitted
    expect(stateChangeEvents.length).toBeGreaterThan(0);

    // Check that events have the correct structure
    stateChangeEvents.forEach(event => {
      expect(event).toHaveProperty('previousState');
      expect(event).toHaveProperty('currentState');
      expect(event).toHaveProperty('sessionId');
      expect(event).toHaveProperty('progress');
      expect(event).toHaveProperty('timestamp');
      
      // Verify types
      expect(typeof event.previousState).toBe('string');
      expect(typeof event.currentState).toBe('string');
      expect(event.sessionId === null || typeof event.sessionId === 'string').toBe(true);
      expect(typeof event.progress).toBe('number');
      expect(typeof event.timestamp).toBe('number');
      
      // Verify progress bounds
      expect(event.progress).toBeGreaterThanOrEqual(0);
      expect(event.progress).toBeLessThanOrEqual(100);
    });

    // Verify first event starts from idle
    if (stateChangeEvents.length > 0) {
      expect(stateChangeEvents[0].previousState).toBe('idle');
      expect(stateChangeEvents[0].currentState).toBe('checking_connectivity');
    }

    // Clean up
    removeListener();
  });

  it('should handle multiple listeners correctly', async () => {
    const listener1Events: SyncStateChangeEvent[] = [];
    const listener2Events: SyncStateChangeEvent[] = [];
    
    // Add multiple listeners
    const removeListener1 = syncService.addStateChangeListener((event) => {
      listener1Events.push(event);
    });
    
    const removeListener2 = syncService.addStateChangeListener((event) => {
      listener2Events.push(event);
    });

    try {
      // Start sync
      await syncService.startSync();
    } catch (error) {
      // Expected in test environment
    }

    // Both listeners should receive the same events
    expect(listener1Events.length).toBe(listener2Events.length);
    expect(listener1Events.length).toBeGreaterThan(0);

    // Events should be identical
    for (let i = 0; i < listener1Events.length; i++) {
      expect(listener1Events[i].previousState).toBe(listener2Events[i].previousState);
      expect(listener1Events[i].currentState).toBe(listener2Events[i].currentState);
      expect(listener1Events[i].progress).toBe(listener2Events[i].progress);
    }

    // Clean up
    removeListener1();
    removeListener2();
  });

  it('should not emit events to removed listeners', async () => {
    const listener1Events: SyncStateChangeEvent[] = [];
    const listener2Events: SyncStateChangeEvent[] = [];
    
    // Add listeners
    const removeListener1 = syncService.addStateChangeListener((event) => {
      listener1Events.push(event);
    });
    
    const removeListener2 = syncService.addStateChangeListener((event) => {
      listener2Events.push(event);
    });

    // Remove first listener
    removeListener1();

    try {
      // Start sync
      await syncService.startSync();
    } catch (error) {
      // Expected in test environment
    }

    // Only second listener should receive events
    expect(listener1Events.length).toBe(0);
    expect(listener2Events.length).toBeGreaterThan(0);

    // Clean up
    removeListener2();
  });

  it('should handle listener errors gracefully', async () => {
    const goodListener = jest.fn();
    const badListener = jest.fn(() => {
      throw new Error('Listener error');
    });
    
    // Add listeners (one that throws)
    const removeGoodListener = syncService.addStateChangeListener(goodListener);
    const removeBadListener = syncService.addStateChangeListener(badListener);

    try {
      // Start sync
      await syncService.startSync();
    } catch (error) {
      // Expected in test environment
    }

    // Good listener should still be called despite bad listener throwing
    expect(goodListener).toHaveBeenCalled();
    expect(badListener).toHaveBeenCalled();

    // Clean up
    removeGoodListener();
    removeBadListener();
  });

  it('should clear all listeners when removeAllListeners is called', async () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    
    // Add listeners
    syncService.addStateChangeListener(listener1);
    syncService.addStateChangeListener(listener2);

    // Remove all listeners
    syncService.removeAllListeners();

    try {
      // Start sync
      await syncService.startSync();
    } catch (error) {
      // Expected in test environment
    }

    // No listeners should be called
    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });
});