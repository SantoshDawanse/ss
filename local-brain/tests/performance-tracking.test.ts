/**
 * Unit tests for PerformanceTrackingService.
 * Tests event tracking, log batching, and sync preparation.
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { PerformanceTrackingService } from '../src/services/PerformanceTrackingService';
import { PerformanceLogRepository } from '../src/database/repositories/PerformanceLogRepository';

describe('PerformanceTrackingService', () => {
  let dbManager: DatabaseManager;
  let service: PerformanceTrackingService;
  let repository: PerformanceLogRepository;

  beforeAll(async () => {
    // Initialize database with test configuration
    dbManager = DatabaseManager.getInstance({
      name: 'test_performance_tracking.db',
      location: 'default',
      encryption: false,
    });

    await dbManager.initialize();
    service = new PerformanceTrackingService(dbManager);
    repository = dbManager.performanceLogRepository;
  });

  beforeEach(async () => {
    // Reset database before each test
    await dbManager.reset();
  });

  afterAll(async () => {
    // Close database connection
    await dbManager.close();
    // Reset singleton for other tests
    (DatabaseManager as any).resetInstance();
  });

  describe('Requirement Validation', () => {
    it('should create lesson_start log (Requirement 16.1)', async () => {
      await service.logLessonStart('student-1', 'lesson-1', 'Math', 'Algebra');
      
      const logs = await service.getUnsyncedLogs('student-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe('lesson_start');
    });

    it('should create lesson_complete log with timeSpent (Requirement 16.2)', async () => {
      await service.logLessonComplete('student-1', 'lesson-1', 'Math', 'Algebra', 1800);
      
      const logs = await service.getUnsyncedLogs('student-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe('lesson_complete');
      expect(logs[0].data.timeSpent).toBe(1800);
    });

    it('should create quiz_start log (Requirement 16.3)', async () => {
      await service.logQuizStart('student-1', 'quiz-1', 'Math', 'Algebra');
      
      const logs = await service.getUnsyncedLogs('student-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe('quiz_start');
    });

    it('should create quiz_answer log with answer, correct, and hintsUsed (Requirement 16.4)', async () => {
      await service.logQuizAnswer('student-1', 'quiz-1', 'q1', 'Math', 'Algebra', 'A', true, 2);
      
      const logs = await service.getUnsyncedLogs('student-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe('quiz_answer');
      expect(logs[0].data.answer).toBe('A');
      expect(logs[0].data.correct).toBe(true);
      expect(logs[0].data.hintsUsed).toBe(2);
    });

    it('should create quiz_complete log with timeSpent (Requirement 16.5)', async () => {
      await service.logQuizComplete('student-1', 'quiz-1', 'Math', 'Algebra', 900, 85);
      
      const logs = await service.getUnsyncedLogs('student-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe('quiz_complete');
      expect(logs[0].data.timeSpent).toBe(900);
      expect(logs[0].data.score).toBe(85);
    });

    it('should create hint_requested log with hintLevel (Requirement 16.6)', async () => {
      await service.logHintRequested('student-1', 'quiz-1', 'q1', 'Math', 'Algebra', 2);
      
      const logs = await service.getUnsyncedLogs('student-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe('hint_requested');
      expect(logs[0].data.hintLevel).toBe(2);
    });

    it('should write each log to SQLite immediately (Requirement 16.7)', async () => {
      // Track event
      await service.logLessonStart('student-1', 'lesson-1', 'Math', 'Algebra');
      
      // Immediately verify it's in database (not buffered)
      const logs = await service.getUnsyncedLogs('student-1');
      expect(logs).toHaveLength(1);
    });

    it('should set synced=0 for all new logs (Requirement 16.8)', async () => {
      await service.logLessonStart('student-1', 'lesson-1', 'Math', 'Algebra');
      await service.logQuizAnswer('student-1', 'quiz-1', 'q1', 'Math', 'Algebra', 'A', true, 0);
      await service.logHintRequested('student-1', 'quiz-1', 'q1', 'Math', 'Algebra', 1);
      
      const logs = await service.getUnsyncedLogs('student-1');
      expect(logs).toHaveLength(3);
      logs.forEach(log => {
        expect(log.synced).toBe(false);
      });
    });
  });

  describe('Event Tracking', () => {
    it('should track lesson start event', async () => {
      const logId = await service.trackLessonStart(
        'student-1',
        'lesson-1',
        'Mathematics',
        'Algebra',
      );

      expect(logId).toBeGreaterThan(0);

      const log = await repository.findById(logId);
      expect(log).toBeDefined();
      expect(log?.event_type).toBe('lesson_start');
      expect(log?.content_id).toBe('lesson-1');
      expect(log?.subject).toBe('Mathematics');
      expect(log?.synced).toBe(0);
    });

    it('should log lesson start event (new interface)', async () => {
      await service.logLessonStart(
        'student-1',
        'lesson-1',
        'Mathematics',
        'Algebra',
      );

      const logs = await service.getUnsyncedLogs('student-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe('lesson_start');
      expect(logs[0].contentId).toBe('lesson-1');
      expect(logs[0].subject).toBe('Mathematics');
      expect(logs[0].synced).toBe(false);
    });

    it('should track lesson complete event with time spent', async () => {
      const logId = await service.trackLessonComplete(
        'student-1',
        'lesson-1',
        'Mathematics',
        'Algebra',
        1800, // 30 minutes
      );

      expect(logId).toBeGreaterThan(0);

      const log = await repository.findById(logId);
      expect(log).toBeDefined();
      expect(log?.event_type).toBe('lesson_complete');
      
      const data = JSON.parse(log!.data_json);
      expect(data.timeSpent).toBe(1800);
    });

    it('should log lesson complete event with time spent (new interface)', async () => {
      await service.logLessonComplete(
        'student-1',
        'lesson-1',
        'Mathematics',
        'Algebra',
        1800, // 30 minutes
      );

      const logs = await service.getUnsyncedLogs('student-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe('lesson_complete');
      expect(logs[0].data.timeSpent).toBe(1800);
    });

    it('should track quiz start event', async () => {
      const logId = await service.trackQuizStart(
        'student-1',
        'quiz-1',
        'Science',
        'Physics',
      );

      expect(logId).toBeGreaterThan(0);

      const log = await repository.findById(logId);
      expect(log).toBeDefined();
      expect(log?.event_type).toBe('quiz_start');
      expect(log?.content_id).toBe('quiz-1');
    });

    it('should log quiz start event (new interface)', async () => {
      await service.logQuizStart(
        'student-1',
        'quiz-1',
        'Science',
        'Physics',
      );

      const logs = await service.getUnsyncedLogs('student-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe('quiz_start');
      expect(logs[0].contentId).toBe('quiz-1');
    });

    it('should track quiz answer event with correctness', async () => {
      const logId = await service.trackQuizAnswer(
        'student-1',
        'quiz-1',
        'Science',
        'Physics',
        'A',
        true,
        2, // used 2 hints
      );

      expect(logId).toBeGreaterThan(0);

      const log = await repository.findById(logId);
      expect(log).toBeDefined();
      expect(log?.event_type).toBe('quiz_answer');
      
      const data = JSON.parse(log!.data_json);
      expect(data.answer).toBe('A');
      expect(data.correct).toBe(true);
      expect(data.hintsUsed).toBe(2);
    });

    it('should log quiz answer event with all parameters (new interface)', async () => {
      await service.logQuizAnswer(
        'student-1',
        'quiz-1',
        'question-1',
        'Science',
        'Physics',
        'A',
        true,
        2, // used 2 hints
      );

      const logs = await service.getUnsyncedLogs('student-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe('quiz_answer');
      expect(logs[0].data.answer).toBe('A');
      expect(logs[0].data.correct).toBe(true);
      expect(logs[0].data.hintsUsed).toBe(2);
    });

    it('should track quiz complete event', async () => {
      const logId = await service.trackQuizComplete(
        'student-1',
        'quiz-1',
        'Science',
        'Physics',
        900, // 15 minutes
      );

      expect(logId).toBeGreaterThan(0);

      const log = await repository.findById(logId);
      expect(log).toBeDefined();
      expect(log?.event_type).toBe('quiz_complete');
      
      const data = JSON.parse(log!.data_json);
      expect(data.timeSpent).toBe(900);
    });

    it('should log quiz complete event with timeSpent and score (new interface)', async () => {
      await service.logQuizComplete(
        'student-1',
        'quiz-1',
        'Science',
        'Physics',
        900, // 15 minutes
        85, // score
      );

      const logs = await service.getUnsyncedLogs('student-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe('quiz_complete');
      expect(logs[0].data.timeSpent).toBe(900);
      expect(logs[0].data.score).toBe(85);
    });

    it('should track hint requested event', async () => {
      const logId = await service.trackHintRequested(
        'student-1',
        'quiz-1',
        'Science',
        'Physics',
        2, // hint level 2
      );

      expect(logId).toBeGreaterThan(0);

      const log = await repository.findById(logId);
      expect(log).toBeDefined();
      expect(log?.event_type).toBe('hint_requested');
      
      const data = JSON.parse(log!.data_json);
      expect(data.hintsUsed).toBe(2);
    });

    it('should log hint requested event with hintLevel (new interface)', async () => {
      await service.logHintRequested(
        'student-1',
        'quiz-1',
        'question-1',
        'Science',
        'Physics',
        2, // hint level 2
      );

      const logs = await service.getUnsyncedLogs('student-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe('hint_requested');
      expect(logs[0].data.hintLevel).toBe(2);
    });

    it('should track generic event with custom data', async () => {
      const logId = await service.trackEvent({
        studentId: 'student-1',
        eventType: 'lesson_complete',
        contentId: 'lesson-1',
        subject: 'Mathematics',
        topic: 'Algebra',
        data: {
          timeSpent: 2400,
          attempts: 3,
        },
      });

      expect(logId).toBeGreaterThan(0);

      const log = await repository.findById(logId);
      expect(log).toBeDefined();
      
      const data = JSON.parse(log!.data_json);
      expect(data.timeSpent).toBe(2400);
      expect(data.attempts).toBe(3);
    });

    it('should write logs immediately for crash recovery', async () => {
      // Track multiple events rapidly
      const logIds = [];
      for (let i = 0; i < 5; i++) {
        const logId = await service.trackQuizAnswer(
          'student-1',
          `quiz-${i}`,
          'Mathematics',
          'Algebra',
          'A',
          i % 2 === 0,
        );
        logIds.push(logId);
      }

      // All logs should be immediately persisted
      expect(logIds).toHaveLength(5);
      
      const count = await repository.count();
      expect(count).toBe(5);
    });
  });

  describe('Log Retrieval', () => {
    beforeEach(async () => {
      // Create test logs
      await service.trackLessonStart('student-1', 'lesson-1', 'Math', 'Algebra');
      await service.trackLessonComplete('student-1', 'lesson-1', 'Math', 'Algebra', 1800);
      await service.trackQuizStart('student-1', 'quiz-1', 'Math', 'Algebra');
      await service.trackQuizAnswer('student-1', 'quiz-1', 'Math', 'Algebra', 'A', true);
      await service.trackQuizComplete('student-1', 'quiz-1', 'Math', 'Algebra', 900);
    });

    it('should get unsynced logs for a student', async () => {
      const logs = await service.getUnsyncedLogs('student-1');

      expect(logs).toHaveLength(5);
      logs.forEach(log => {
        expect(log.studentId).toBe('student-1');
      });
    });

    it('should get recent logs with limit', async () => {
      const logs = await service.getRecentLogs('student-1', 3);

      expect(logs).toHaveLength(3);
      // Should be in reverse chronological order
      expect(logs[0].eventType).toBe('quiz_complete');
    });

    it('should get logs by subject', async () => {
      // Add logs for different subject
      await service.trackLessonStart('student-1', 'lesson-2', 'Science', 'Physics');

      const mathLogs = await service.getLogsBySubject('student-1', 'Math');
      const scienceLogs = await service.getLogsBySubject('student-1', 'Science');

      expect(mathLogs).toHaveLength(5);
      expect(scienceLogs).toHaveLength(1);
    });

    it('should count unsynced logs', async () => {
      const count = await service.countUnsyncedLogs();
      expect(count).toBe(5);
    });
  });

  describe('Log Batching for Sync', () => {
    beforeEach(async () => {
      // Create test logs
      for (let i = 0; i < 10; i++) {
        await service.trackQuizAnswer(
          'student-1',
          `quiz-${i}`,
          'Mathematics',
          'Algebra',
          'A',
          i % 2 === 0,
        );
      }
    });

    it('should get batched logs ready for sync', async () => {
      const batch = await service.getBatchedLogsForSync('student-1');

      expect(batch.logs).toHaveLength(10);
      expect(batch.count).toBe(10);
      expect(batch.totalSize).toBeGreaterThan(0);
    });

    it('should mark logs as synced', async () => {
      const logs = await service.getUnsyncedLogs('student-1');
      const logIds = logs.map((_, index) => index + 1); // Assuming sequential IDs

      await service.markLogsAsSynced(logIds);

      const unsyncedCount = await service.countUnsyncedLogs();
      expect(unsyncedCount).toBe(0);
    });

    it('should only return unsynced logs after marking some as synced', async () => {
      // Mark first 5 logs as synced
      await service.markLogsAsSynced([1, 2, 3, 4, 5]);

      const unsyncedLogs = await service.getUnsyncedLogs('student-1');
      expect(unsyncedLogs).toHaveLength(5);
    });
  });

  describe('Log Cleanup', () => {
    it('should cleanup old synced logs', async () => {
      // Create old logs (31 days ago)
      const oldTimestamp = Date.now() - (31 * 24 * 60 * 60 * 1000);
      
      for (let i = 0; i < 5; i++) {
        const logId = await repository.create({
          student_id: 'student-1',
          timestamp: oldTimestamp,
          event_type: 'lesson_complete',
          content_id: `lesson-${i}`,
          subject: 'Math',
          topic: 'Algebra',
          data_json: '{}',
          synced: 1, // Already synced
        });
      }

      // Create recent logs
      await service.trackLessonStart('student-1', 'lesson-new', 'Math', 'Algebra');

      // Cleanup logs older than 30 days
      await service.cleanupOldLogs(30);

      // Only recent log should remain
      const count = await repository.count();
      expect(count).toBe(1);
    });

    it('should not delete unsynced logs during cleanup', async () => {
      // Create old unsynced logs
      const oldTimestamp = Date.now() - (31 * 24 * 60 * 60 * 1000);
      
      await repository.create({
        student_id: 'student-1',
        timestamp: oldTimestamp,
        event_type: 'lesson_complete',
        content_id: 'lesson-1',
        subject: 'Math',
        topic: 'Algebra',
        data_json: '{}',
        synced: 0, // Not synced
      });

      await service.cleanupOldLogs(30);

      // Unsynced log should still exist
      const count = await repository.count();
      expect(count).toBe(1);
    });
  });

  describe('Concurrent Event Tracking', () => {
    it('should handle concurrent event tracking', async () => {
      // Simulate multiple concurrent events
      const trackPromises = [];
      for (let i = 0; i < 20; i++) {
        trackPromises.push(
          service.trackQuizAnswer(
            'student-1',
            `quiz-${i}`,
            'Mathematics',
            'Algebra',
            'A',
            i % 2 === 0,
          ),
        );
      }

      const logIds = await Promise.all(trackPromises);

      // All events should be tracked
      expect(logIds).toHaveLength(20);
      expect(new Set(logIds).size).toBe(20); // All unique IDs

      const count = await repository.count();
      expect(count).toBe(20);
    });

    it('should handle rapid sequential event tracking', async () => {
      // Simulate rapid user interactions
      await service.trackLessonStart('student-1', 'lesson-1', 'Math', 'Algebra');
      await service.trackHintRequested('student-1', 'lesson-1', 'Math', 'Algebra', 1);
      await service.trackHintRequested('student-1', 'lesson-1', 'Math', 'Algebra', 2);
      await service.trackLessonComplete('student-1', 'lesson-1', 'Math', 'Algebra', 1200);

      const logs = await service.getRecentLogs('student-1', 10);
      expect(logs).toHaveLength(4);
      
      // Verify order (most recent first)
      expect(logs[0].eventType).toBe('lesson_complete');
      expect(logs[3].eventType).toBe('lesson_start');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when tracking event fails', async () => {
      // Close database to simulate failure
      await dbManager.close();

      await expect(
        service.trackLessonStart('student-1', 'lesson-1', 'Math', 'Algebra'),
      ).rejects.toThrow();

      // Reinitialize for other tests
      await dbManager.initialize();
    });

    it('should handle empty log retrieval gracefully', async () => {
      const logs = await service.getUnsyncedLogs('non-existent-student');
      expect(logs).toHaveLength(0);
    });

    it('should handle marking empty log array as synced', async () => {
      await expect(service.markLogsAsSynced([])).resolves.not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should track 100 events efficiently', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        await service.trackQuizAnswer(
          'student-1',
          `quiz-${i}`,
          'Mathematics',
          'Algebra',
          'A',
          i % 2 === 0,
        );
      }

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);

      const count = await repository.count();
      expect(count).toBe(100);
    });

    it('should retrieve batched logs efficiently', async () => {
      // Create 100 logs
      for (let i = 0; i < 100; i++) {
        await service.trackQuizAnswer(
          'student-1',
          `quiz-${i}`,
          'Mathematics',
          'Algebra',
          'A',
          true,
        );
      }

      const startTime = Date.now();
      const batch = await service.getBatchedLogsForSync('student-1');
      const duration = Date.now() - startTime;

      // Should retrieve quickly (< 1 second)
      expect(duration).toBeLessThan(1000);
      expect(batch.logs).toHaveLength(100);
    });
  });
});
