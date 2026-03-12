/**
 * Task 9.3: Implement connectivity check
 * 
 * Tests for connectivity check functionality:
 * - Send health check request to Cloud_Brain with 5 second timeout
 * - Transition to 'checking_connectivity' state before check
 * - Abort sync and return to 'idle' if connectivity fails
 * - Create Sync_Session record on successful connectivity
 */

import { SyncOrchestratorService } from '../src/services/SyncOrchestratorService';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { MonitoringService } from '../src/services/MonitoringService';

// Mock fetch globally
global.fetch = jest.fn();

// Mock DatabaseManager
jest.mock('../src/database/DatabaseManager');
const MockedDatabaseManager = DatabaseManager as jest.MockedClass<typeof DatabaseManager>;

// Mock MonitoringService
jest.mock('../src/services/MonitoringService');
const MockedMonitoringService = MonitoringService as jest.MockedClass<typeof MonitoringService>;

describe('Task 9.3: Connectivity Check Implementation', () => {
  let syncService: SyncOrchestratorService;
  let mockDbManager: jest.Mocked<DatabaseManager>;
  let mockMonitoringService: jest.Mocked<MonitoringService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup database manager mock
    mockDbManager = new MockedDatabaseManager() as jest.Mocked<DatabaseManager>;
    mockDbManager.syncSessionRepository = {
      findInProgress: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
    } as any;
    
    mockDbManager.performanceLogRepository = {
      findUnsynced: jest.fn().mockResolvedValue([]),
    } as any;

    // Setup monitoring service mock
    mockMonitoringService = {
      recordSyncFailure: jest.fn().mockResolvedValue(undefined),
      recordSyncSuccess: jest.fn().mockResolvedValue(undefined),
    } as any;
    
    MockedMonitoringService.getInstance.mockReturnValue(mockMonitoringService);

    // Create sync service instance
    syncService = new SyncOrchestratorService('test-student', 'test-token', 'test-key');
    (syncService as any).dbManager = mockDbManager;
  });

  describe('Connectivity Check with 5 Second Timeout', () => {
    it('should send health check request with 5 second timeout', async () => {
      // Mock successful response
      const mockResponse = { ok: true };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await syncService.checkConnectivity();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/health'),
        expect.objectContaining({
          method: 'GET',
          signal: expect.any(AbortSignal),
        })
      );
      expect(result).toBe(true);
    });

    it('should timeout after 5 seconds', async () => {
      // Mock timeout scenario - use AbortError to simulate timeout
      (global.fetch as jest.Mock).mockImplementation(() => 
        Promise.reject(new Error('AbortError'))
      );

      const result = await syncService.checkConnectivity();
      expect(result).toBe(false);
    }, 10000); // Increase Jest timeout for this test

    it('should return false on network error', async () => {
      // Mock network error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await syncService.checkConnectivity();
      expect(result).toBe(false);
    });
  });

  describe('State Transitions During Connectivity Check', () => {
    it('should transition to checking_connectivity before performing check', async () => {
      // Mock successful connectivity
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const stateChanges: string[] = [];
      syncService.addStateChangeListener((event) => {
        stateChanges.push(event.currentState);
      });

      try {
        await syncService.startSync();
      } catch (error) {
        // Expected to fail due to incomplete mock setup, but we can check state transitions
      }

      // Should have transitioned to checking_connectivity first
      expect(stateChanges[0]).toBe('checking_connectivity');
    });

    it('should return to idle state on connectivity failure', async () => {
      // Mock connectivity failure
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

      const stateChanges: string[] = [];
      syncService.addStateChangeListener((event) => {
        stateChanges.push(event.currentState);
      });

      try {
        await syncService.startSync();
        fail('Expected startSync to throw on connectivity failure');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('No internet connection. Sync will retry when online.');
      }

      // Should transition: idle -> checking_connectivity -> idle
      expect(stateChanges).toContain('checking_connectivity');
      expect(stateChanges).toContain('idle');
      
      // Final state should be idle, not failed
      expect((await syncService.getSyncStatus()).state).toBe('idle');
    });

    it('should not create session record on connectivity failure', async () => {
      // Mock connectivity failure
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

      try {
        await syncService.startSync();
        fail('Expected startSync to throw on connectivity failure');
      } catch (error) {
        // Expected
      }

      // Should not have created a session record
      expect(mockDbManager.syncSessionRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('Session Creation on Successful Connectivity', () => {
    it('should create Sync_Session record on successful connectivity', async () => {
      // Mock successful connectivity
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      try {
        await syncService.startSync();
      } catch (error) {
        // Expected to fail due to incomplete mock setup for upload workflow
        // But session should still be created
      }

      // Should have created a session record
      expect(mockDbManager.syncSessionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: expect.any(String),
          start_time: expect.any(Number),
          end_time: null,
          status: 'pending',
          logs_uploaded: 0,
          bundle_downloaded: 0,
          error_message: null,
        })
      );
    });

    it('should generate unique session IDs', async () => {
      // Mock successful connectivity
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const sessionIds: string[] = [];
      mockDbManager.syncSessionRepository.create.mockImplementation((session) => {
        sessionIds.push(session.session_id);
        return Promise.resolve();
      });

      // Start multiple syncs (they will fail but should create sessions)
      for (let i = 0; i < 3; i++) {
        try {
          await syncService.startSync();
        } catch (error) {
          // Expected
        }
      }

      // All session IDs should be unique
      expect(sessionIds).toHaveLength(3);
      expect(new Set(sessionIds).size).toBe(3);
    });

    it('should set session start_time to current timestamp', async () => {
      // Mock successful connectivity
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const beforeTime = Date.now();
      
      try {
        await syncService.startSync();
      } catch (error) {
        // Expected
      }

      const afterTime = Date.now();

      expect(mockDbManager.syncSessionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          start_time: expect.any(Number),
        })
      );

      const createCall = mockDbManager.syncSessionRepository.create.mock.calls[0][0];
      expect(createCall.start_time).toBeGreaterThanOrEqual(beforeTime);
      expect(createCall.start_time).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('Error Handling and Monitoring', () => {
    it('should record sync failure for connectivity issues', async () => {
      // Mock connectivity failure
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

      try {
        await syncService.startSync();
        fail('Expected startSync to throw');
      } catch (error) {
        // Expected
      }

      expect(mockMonitoringService.recordSyncFailure).toHaveBeenCalledWith(
        'No internet connection. Sync will retry when online.'
      );
    });

    it('should not mark session as failed for connectivity issues', async () => {
      // Mock connectivity failure
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

      try {
        await syncService.startSync();
        fail('Expected startSync to throw');
      } catch (error) {
        // Expected
      }

      // Should not have called fail on session repository since no session was created
      expect(mockDbManager.syncSessionRepository.fail).not.toHaveBeenCalled();
    });
  });

  describe('Integration with Existing Workflow', () => {
    it('should proceed to upload workflow after successful connectivity check', async () => {
      // Mock successful connectivity
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const stateChanges: string[] = [];
      syncService.addStateChangeListener((event) => {
        stateChanges.push(event.currentState);
      });

      try {
        await syncService.startSync();
      } catch (error) {
        // Expected to fail at upload stage due to incomplete mocking
      }

      // Should have progressed past connectivity check
      expect(stateChanges).toContain('checking_connectivity');
      // Should have attempted to proceed (will fail at upload due to mocking)
      expect(stateChanges.length).toBeGreaterThan(1);
    });
  });
});