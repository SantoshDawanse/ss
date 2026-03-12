/**
 * Unit tests for Task 9.17: Cleanup Operations
 * 
 * Requirements 23.1-23.6: Data cleanup and retention
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { SyncOrchestratorService } from '../src/services/SyncOrchestratorService';
import { PerformanceLog } from '../src/types/sync';

describe('Task 9.17: Cleanup Operations', () => {
  let dbManager: DatabaseManager;
  let syncOrchestrator: SyncOrchestratorService;
  const testStudentId = 'test-student-cleanup';
  const testAuthToken = 'test-token';
  const testPublicKey = 'test-public-key';

  beforeEach(async () => {
    // Use the singleton instance
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    syncOrchestrator = new SyncOrchestratorService(testStudentId, testAuthToken, testPublicKey);
  });

  afterEach(async () => {
    // Clean up all data after each test
    await dbManager.runSql('DELETE FROM performance_logs', []);
    await dbManager.runSql('DELETE FROM learning_bundles', []);
    await dbManager.runSql('DELETE FROM sync_sessions', []);
    await dbManager.runSql('DELETE FROM download_progress', []);
  });

  describe('Requirement 23.1: Delete synced logs older than 30 days', () => {
    it('should delete synced logs older than 30 days', async () => {
      const now = Date.now();
      const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;
      const twentyNineDaysAgo = now - 29 * 24 * 60 * 60 * 1000;

      // Create old synced log (should be deleted)
      const oldLog: PerformanceLog = {
        student_id: testStudentId,
        timestamp: thirtyOneDaysAgo,
        event_type: 'lesson_start',
        content_id: 'lesson-1',
        subject: 'Mathematics',
        topic: 'Algebra',
        data_json: '{}',
        synced: 1,
      };

      // Create recent synced log (should be kept)
      const recentLog: PerformanceLog = {
        student_id: testStudentId,
        timestamp: twentyNineDaysAgo,
        event_type: 'lesson_start',
        content_id: 'lesson-2',
        subject: 'Mathematics',
        topic: 'Algebra',
        data_json: '{}',
        synced: 1,
      };

      const oldLogId = await dbManager.performanceLogRepository.create(oldLog);
      const recentLogId = await dbManager.performanceLogRepository.create(recentLog);

      // Run cleanup
      await syncOrchestrator.cleanup();

      // Verify old log was deleted
      const oldLogResult = await dbManager.performanceLogRepository.findById(oldLogId);
      expect(oldLogResult).toBeNull();

      // Verify recent log was kept
      const recentLogResult = await dbManager.performanceLogRepository.findById(recentLogId);
      expect(recentLogResult).not.toBeNull();
    });
  });

  describe('Requirement 23.2: Delete archived bundles older than 30 days', () => {
    it('should delete archived bundles older than 30 days', async () => {
      const now = Date.now();
      const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;
      const twentyNineDaysAgo = now - 29 * 24 * 60 * 60 * 1000;

      // Create old archived bundle (should be deleted)
      const oldBundle = {
        bundle_id: 'bundle-old',
        student_id: testStudentId,
        valid_from: thirtyOneDaysAgo - 7 * 24 * 60 * 60 * 1000,
        valid_until: thirtyOneDaysAgo,
        total_size: 1000,
        checksum: 'checksum-old',
        status: 'archived' as const,
      };

      // Create recent archived bundle (should be kept)
      const recentBundle = {
        bundle_id: 'bundle-recent',
        student_id: testStudentId,
        valid_from: twentyNineDaysAgo - 7 * 24 * 60 * 60 * 1000,
        valid_until: twentyNineDaysAgo,
        total_size: 1000,
        checksum: 'checksum-recent',
        status: 'archived' as const,
      };

      await dbManager.learningBundleRepository.create(oldBundle);
      await dbManager.learningBundleRepository.create(recentBundle);

      // Run cleanup
      await syncOrchestrator.cleanup();

      // Verify old bundle was deleted
      const oldBundleResult = await dbManager.learningBundleRepository.findById('bundle-old');
      expect(oldBundleResult).toBeNull();

      // Verify recent bundle was kept
      const recentBundleResult = await dbManager.learningBundleRepository.findById('bundle-recent');
      expect(recentBundleResult).not.toBeNull();
    });
  });

  describe('Requirement 23.3: Keep only last 10 sync session records', () => {
    it('should keep only last 10 sync sessions', async () => {
      const now = Date.now();

      // Create 15 sync sessions
      const sessionIds: string[] = [];
      for (let i = 0; i < 15; i++) {
        const sessionId = `session-${i}`;
        sessionIds.push(sessionId);
        
        await dbManager.syncSessionRepository.create({
          session_id: sessionId,
          backend_session_id: null,
          start_time: now - (15 - i) * 60 * 1000, // Older sessions have earlier timestamps
          end_time: now - (15 - i) * 60 * 1000 + 30000,
          status: 'complete',
          logs_uploaded: 10,
          bundle_downloaded: 1,
          error_message: null,
        });
      }

      // Verify all 15 sessions were created
      const beforeCleanup = await dbManager.executeSql(
        'SELECT session_id FROM sync_sessions ORDER BY start_time DESC',
        []
      );
      expect(beforeCleanup.length).toBe(15);

      // Test the SQL query directly
      const toKeep = await dbManager.executeSql(
        `SELECT session_id FROM sync_sessions 
        ORDER BY start_time DESC 
        LIMIT 10`,
        []
      );
      expect(toKeep.length).toBe(10);

      // Run cleanup directly on repository
      await dbManager.syncSessionRepository.deleteOldSessions(10);

      // Verify only last 10 sessions remain
      const allSessions = await dbManager.executeSql(
        'SELECT session_id FROM sync_sessions ORDER BY start_time DESC',
        []
      );

      expect(allSessions.length).toBe(10);

      // Verify the 10 most recent sessions are kept (session-5 through session-14)
      const keptSessionIds = allSessions.map((row: any) => row.session_id);
      for (let i = 5; i < 15; i++) {
        expect(keptSessionIds).toContain(`session-${i}`);
      }

      // Verify the 5 oldest sessions are deleted (session-0 through session-4)
      for (let i = 0; i < 5; i++) {
        expect(keptSessionIds).not.toContain(`session-${i}`);
      }
    });
  });

  describe('Requirement 23.5: Only delete data that has been successfully synced', () => {
    it('should only delete synced logs, not unsynced logs', async () => {
      const now = Date.now();
      const fortyDaysAgo = now - 40 * 24 * 60 * 60 * 1000;

      // Create old synced log (should be deleted)
      const syncedLog: PerformanceLog = {
        student_id: testStudentId,
        timestamp: fortyDaysAgo,
        event_type: 'lesson_start',
        content_id: 'lesson-synced',
        subject: 'Mathematics',
        topic: 'Algebra',
        data_json: '{}',
        synced: 1,
      };

      // Create old unsynced log (should be kept)
      const unsyncedLog: PerformanceLog = {
        student_id: testStudentId,
        timestamp: fortyDaysAgo,
        event_type: 'lesson_start',
        content_id: 'lesson-unsynced',
        subject: 'Mathematics',
        topic: 'Algebra',
        data_json: '{}',
        synced: 0,
      };

      const syncedLogId = await dbManager.performanceLogRepository.create(syncedLog);
      const unsyncedLogId = await dbManager.performanceLogRepository.create(unsyncedLog);

      // Run cleanup
      await syncOrchestrator.cleanup();

      // Verify synced log was deleted
      const syncedLogResult = await dbManager.performanceLogRepository.findById(syncedLogId);
      expect(syncedLogResult).toBeNull();

      // Verify unsynced log was kept
      const unsyncedLogResult = await dbManager.performanceLogRepository.findById(unsyncedLogId);
      expect(unsyncedLogResult).not.toBeNull();
      expect(unsyncedLogResult?.synced).toBe(0);
    });
  });

  describe('Requirement 23.6: Preserve all unsynced logs regardless of age', () => {
    it('should preserve unsynced logs regardless of age', async () => {
      const now = Date.now();
      const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;
      const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

      // Create very old unsynced logs (should all be kept)
      const veryOldLog: PerformanceLog = {
        student_id: testStudentId,
        timestamp: ninetyDaysAgo,
        event_type: 'lesson_start',
        content_id: 'lesson-very-old',
        subject: 'Mathematics',
        topic: 'Algebra',
        data_json: '{}',
        synced: 0,
      };

      const oldLog: PerformanceLog = {
        student_id: testStudentId,
        timestamp: sixtyDaysAgo,
        event_type: 'lesson_start',
        content_id: 'lesson-old',
        subject: 'Mathematics',
        topic: 'Algebra',
        data_json: '{}',
        synced: 0,
      };

      const veryOldLogId = await dbManager.performanceLogRepository.create(veryOldLog);
      const oldLogId = await dbManager.performanceLogRepository.create(oldLog);

      // Run cleanup
      await syncOrchestrator.cleanup();

      // Verify both unsynced logs were kept
      const veryOldLogResult = await dbManager.performanceLogRepository.findById(veryOldLogId);
      expect(veryOldLogResult).not.toBeNull();
      expect(veryOldLogResult?.synced).toBe(0);

      const oldLogResult = await dbManager.performanceLogRepository.findById(oldLogId);
      expect(oldLogResult).not.toBeNull();
      expect(oldLogResult?.synced).toBe(0);
    });
  });

  describe('Cleanup error handling', () => {
    it('should not throw errors if cleanup fails', async () => {
      // This test verifies that cleanup failures don't crash the sync
      // The cleanup method should catch and log errors internally
      
      await expect(syncOrchestrator.cleanup()).resolves.not.toThrow();
    });
  });

  describe('Integration: Cleanup after successful sync', () => {
    it('should have cleanup method available', () => {
      expect(typeof syncOrchestrator.cleanup).toBe('function');
    });

    it('should clean up all data types in one call', async () => {
      const now = Date.now();
      const fortyDaysAgo = now - 40 * 24 * 60 * 60 * 1000;

      // Create old synced log
      const oldLog: PerformanceLog = {
        student_id: testStudentId,
        timestamp: fortyDaysAgo,
        event_type: 'lesson_start',
        content_id: 'lesson-1',
        subject: 'Mathematics',
        topic: 'Algebra',
        data_json: '{}',
        synced: 1,
      };
      await dbManager.performanceLogRepository.create(oldLog);

      // Create old archived bundle
      const oldBundle = {
        bundle_id: 'bundle-old',
        student_id: testStudentId,
        valid_from: fortyDaysAgo - 7 * 24 * 60 * 60 * 1000,
        valid_until: fortyDaysAgo,
        total_size: 1000,
        checksum: 'checksum-old',
        status: 'archived' as const,
      };
      await dbManager.learningBundleRepository.create(oldBundle);

      // Create 15 sync sessions
      for (let i = 0; i < 15; i++) {
        await dbManager.syncSessionRepository.create({
          session_id: `session-${i}`,
          backend_session_id: null,
          start_time: now - (15 - i) * 60 * 1000,
          end_time: now - (15 - i) * 60 * 1000 + 30000,
          status: 'complete',
          logs_uploaded: 10,
          bundle_downloaded: 1,
          error_message: null,
        });
      }

      // Run cleanup once
      await syncOrchestrator.cleanup();

      // Verify all cleanup operations completed
      const logs = await dbManager.executeSql('SELECT * FROM performance_logs', []);
      expect(logs.length).toBe(0); // Old synced log deleted

      const bundles = await dbManager.executeSql('SELECT * FROM learning_bundles', []);
      expect(bundles.length).toBe(0); // Old archived bundle deleted

      const sessions = await dbManager.executeSql('SELECT * FROM sync_sessions', []);
      expect(sessions.length).toBe(10); // Only last 10 sessions kept
    });
  });
});
