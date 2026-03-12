/**
 * Task 9.15: Sync Status and Progress Tracking Tests
 * 
 * Tests for getSyncStatus method and progress tracking functionality.
 * 
 * Requirements validated:
 * - 27.1: getSyncStatus method returns state, sessionId, progress, error, logsUploaded, bundleDownloaded
 * - 27.2: Progress is a percentage from 0 to 100
 * - 27.3: Progress is 10% during connectivity check
 * - 27.4: Progress is 30% during upload
 * - 27.5: Progress is 60% during download
 * - 27.6: Progress is 90% during import
 * - 27.7: Progress is 100% when complete
 * - 27.8: UI displays progress percentage and current phase name
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { SyncOrchestratorService } from '../src/services/SyncOrchestratorService';
import { SyncState, SyncStatus } from '../src/types/sync';
import * as FileSystem from 'expo-file-system/legacy';
import path from 'path';

describe('Task 9.15: Sync Status and Progress Tracking', () => {
  let dbManager: DatabaseManager;
  let syncService: SyncOrchestratorService;
  const testDbPath = path.join(__dirname, 'test-sync-status.db');
  const studentId = 'student-status-test-001';
  const authToken = 'test-auth-token';
  const publicKey = 'test-public-key';

  beforeEach(async () => {
    // Clean up any existing test database
    if (await FileSystem.getInfoAsync(testDbPath).then(info => info.exists)) {
      await FileSystem.deleteAsync(testDbPath);
    }

    // Initialize database using singleton pattern
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize(testDbPath);
    
    // Initialize service (it will use the same singleton dbManager)
    syncService = new SyncOrchestratorService(studentId, authToken, publicKey);
  });

  afterEach(async () => {
    // Clean up
    await dbManager.close();
    if (await FileSystem.getInfoAsync(testDbPath).then(info => info.exists)) {
      await FileSystem.deleteAsync(testDbPath);
    }
  });

  describe('Requirement 27.1: getSyncStatus returns complete status object', () => {
    it('should return status with all required fields', async () => {
      const status = await syncService.getSyncStatus();

      // Verify all required fields are present
      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('sessionId');
      expect(status).toHaveProperty('progress');
      expect(status).toHaveProperty('error');
      expect(status).toHaveProperty('logsUploaded');
      expect(status).toHaveProperty('bundleDownloaded');
    });

    it('should return correct types for all fields', async () => {
      const status = await syncService.getSyncStatus();

      expect(typeof status.state).toBe('string');
      expect(status.sessionId === null || typeof status.sessionId === 'string').toBe(true);
      expect(typeof status.progress).toBe('number');
      expect(status.error === null || typeof status.error === 'string').toBe(true);
      expect(typeof status.logsUploaded).toBe('number');
      expect(typeof status.bundleDownloaded).toBe('boolean');
    });

    it('should return idle state with null sessionId initially', async () => {
      const status = await syncService.getSyncStatus();

      expect(status.state).toBe('idle');
      expect(status.sessionId).toBeNull();
      expect(status.progress).toBe(0);
      expect(status.error).toBeNull();
      expect(status.logsUploaded).toBe(0);
      expect(status.bundleDownloaded).toBe(false);
    });
  });

  describe('Requirement 27.2: Progress bounds (0-100 inclusive)', () => {
    it('should return progress between 0 and 100 for all states', async () => {
      const states: SyncState[] = [
        'idle',
        'checking_connectivity',
        'uploading',
        'downloading',
        'importing',
        'complete',
        'failed'
      ];

      for (const state of states) {
        // Use reflection to set internal state for testing
        (syncService as any).currentState = state;
        const status = await syncService.getSyncStatus();

        expect(status.progress).toBeGreaterThanOrEqual(0);
        expect(status.progress).toBeLessThanOrEqual(100);
      }
    });

    it('should return integer progress values', async () => {
      const states: SyncState[] = [
        'idle',
        'checking_connectivity',
        'uploading',
        'downloading',
        'importing',
        'complete',
        'failed'
      ];

      for (const state of states) {
        (syncService as any).currentState = state;
        const status = await syncService.getSyncStatus();

        expect(Number.isInteger(status.progress)).toBe(true);
      }
    });
  });

  describe('Requirement 27.3: Progress is 10% during connectivity check', () => {
    it('should return 10% progress when in checking_connectivity state', async () => {
      (syncService as any).currentState = 'checking_connectivity';
      const status = await syncService.getSyncStatus();

      expect(status.state).toBe('checking_connectivity');
      expect(status.progress).toBe(10);
    });
  });

  describe('Requirement 27.4: Progress is 30% during upload', () => {
    it('should return 30% progress when in uploading state', async () => {
      (syncService as any).currentState = 'uploading';
      const status = await syncService.getSyncStatus();

      expect(status.state).toBe('uploading');
      expect(status.progress).toBe(30);
    });
  });

  describe('Requirement 27.5: Progress is 60% during download', () => {
    it('should return 60% progress when in downloading state', async () => {
      (syncService as any).currentState = 'downloading';
      const status = await syncService.getSyncStatus();

      expect(status.state).toBe('downloading');
      expect(status.progress).toBe(60);
    });
  });

  describe('Requirement 27.6: Progress is 90% during import', () => {
    it('should return 90% progress when in importing state', async () => {
      (syncService as any).currentState = 'importing';
      const status = await syncService.getSyncStatus();

      expect(status.state).toBe('importing');
      expect(status.progress).toBe(90);
    });
  });

  describe('Requirement 27.7: Progress is 100% when complete', () => {
    it('should return 100% progress when in complete state', async () => {
      (syncService as any).currentState = 'complete';
      const status = await syncService.getSyncStatus();

      expect(status.state).toBe('complete');
      expect(status.progress).toBe(100);
    });
  });

  describe('Progress mapping for idle and failed states', () => {
    it('should return 0% progress when in idle state', async () => {
      (syncService as any).currentState = 'idle';
      const status = await syncService.getSyncStatus();

      expect(status.state).toBe('idle');
      expect(status.progress).toBe(0);
    });

    it('should return 0% progress when in failed state', async () => {
      (syncService as any).currentState = 'failed';
      const status = await syncService.getSyncStatus();

      expect(status.state).toBe('failed');
      expect(status.progress).toBe(0);
    });
  });

  describe('Session data integration', () => {
    it('should return session data when session exists', async () => {
      // Create a sync session
      const sessionId = 'test-session-001';
      await dbManager.syncSessionRepository.create({
        session_id: sessionId,
        start_time: Date.now(),
        status: 'uploading',
        logs_uploaded: 25,
        bundle_downloaded: 0,
        error_message: null,
      });

      // Set the current session
      (syncService as any).currentSessionId = sessionId;
      (syncService as any).currentState = 'uploading';

      const status = await syncService.getSyncStatus();

      expect(status.sessionId).toBe(sessionId);
      expect(status.logsUploaded).toBe(25);
      expect(status.bundleDownloaded).toBe(false);
      expect(status.error).toBeNull();
    });

    it('should return bundle downloaded flag when set', async () => {
      const sessionId = 'test-session-002';
      await dbManager.syncSessionRepository.create({
        session_id: sessionId,
        start_time: Date.now(),
        status: 'downloading',
        logs_uploaded: 30,
        bundle_downloaded: 1,
        error_message: null,
      });

      (syncService as any).currentSessionId = sessionId;
      (syncService as any).currentState = 'downloading';

      const status = await syncService.getSyncStatus();

      expect(status.bundleDownloaded).toBe(true);
    });

    it('should return error message when session has error', async () => {
      const sessionId = 'test-session-003';
      const errorMessage = 'Network timeout during upload';
      await dbManager.syncSessionRepository.create({
        session_id: sessionId,
        start_time: Date.now(),
        status: 'failed',
        logs_uploaded: 10,
        bundle_downloaded: 0,
        error_message: errorMessage,
      });

      (syncService as any).currentSessionId = sessionId;
      (syncService as any).currentState = 'failed';

      const status = await syncService.getSyncStatus();

      expect(status.error).toBe(errorMessage);
    });
  });

  describe('Progress consistency across state transitions', () => {
    it('should have monotonically increasing progress through successful workflow', async () => {
      const successfulStates: SyncState[] = [
        'idle',
        'checking_connectivity',
        'uploading',
        'downloading',
        'importing',
        'complete'
      ];

      let previousProgress = -1;

      for (const state of successfulStates) {
        (syncService as any).currentState = state;
        const status = await syncService.getSyncStatus();

        expect(status.progress).toBeGreaterThanOrEqual(previousProgress);
        previousProgress = status.progress;
      }
    });

    it('should reset progress to 0 when transitioning to failed state', async () => {
      // Start with some progress
      (syncService as any).currentState = 'uploading';
      let status = await syncService.getSyncStatus();
      expect(status.progress).toBe(30);

      // Transition to failed
      (syncService as any).currentState = 'failed';
      status = await syncService.getSyncStatus();
      expect(status.progress).toBe(0);
    });

    it('should reset progress to 0 when transitioning back to idle', async () => {
      // Complete a sync
      (syncService as any).currentState = 'complete';
      let status = await syncService.getSyncStatus();
      expect(status.progress).toBe(100);

      // Return to idle
      (syncService as any).currentState = 'idle';
      status = await syncService.getSyncStatus();
      expect(status.progress).toBe(0);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle missing session gracefully', async () => {
      // Set a session ID that doesn't exist
      (syncService as any).currentSessionId = 'non-existent-session';
      (syncService as any).currentState = 'uploading';

      const status = await syncService.getSyncStatus();

      // Should still return valid status with defaults
      expect(status.state).toBe('uploading');
      expect(status.progress).toBe(30);
      expect(status.logsUploaded).toBe(0);
      expect(status.bundleDownloaded).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      // Close the database to simulate error
      await dbManager.close();

      (syncService as any).currentSessionId = 'test-session';
      (syncService as any).currentState = 'uploading';

      // Should not throw, but return status with defaults
      const status = await syncService.getSyncStatus();

      expect(status.state).toBe('uploading');
      expect(status.progress).toBe(30);
    });
  });

  describe('Requirement 27.8: UI display support', () => {
    it('should provide state name for UI display', async () => {
      const states: SyncState[] = [
        'idle',
        'checking_connectivity',
        'uploading',
        'downloading',
        'importing',
        'complete',
        'failed'
      ];

      for (const state of states) {
        (syncService as any).currentState = state;
        const status = await syncService.getSyncStatus();

        // State should be a valid string that UI can display
        expect(typeof status.state).toBe('string');
        expect(status.state.length).toBeGreaterThan(0);
        expect(states).toContain(status.state);
      }
    });

    it('should provide progress as percentage for UI progress bar', async () => {
      (syncService as any).currentState = 'downloading';
      const status = await syncService.getSyncStatus();

      // Progress should be suitable for a progress bar (0-100)
      expect(status.progress).toBeGreaterThanOrEqual(0);
      expect(status.progress).toBeLessThanOrEqual(100);
      expect(Number.isInteger(status.progress)).toBe(true);
    });

    it('should provide human-readable error messages', async () => {
      const sessionId = 'test-session-error';
      const errorMessage = 'No internet connection. Sync will retry when online.';
      
      await dbManager.syncSessionRepository.create({
        session_id: sessionId,
        start_time: Date.now(),
        status: 'failed',
        logs_uploaded: 0,
        bundle_downloaded: 0,
        error_message: errorMessage,
      });

      (syncService as any).currentSessionId = sessionId;
      (syncService as any).currentState = 'failed';

      const status = await syncService.getSyncStatus();

      expect(status.error).toBe(errorMessage);
      // Error message should be user-friendly (no technical jargon)
      expect(status.error).not.toContain('Exception');
      expect(status.error).not.toContain('Stack trace');
    });
  });
});
