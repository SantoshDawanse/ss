/**
 * Database Schema Tests
 * Validates that all tables, constraints, and indexes are correctly created.
 * 
 * Task 2.1: Create SQLite schema with all tables
 * 
 * Note: These tests validate the schema definition and basic CRUD operations.
 * Full constraint validation (CHECK, CASCADE) requires a real SQLite database.
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { CREATE_TABLES, CREATE_INDEXES } from '../src/database/schema';

describe('Database Schema - Task 2.1', () => {
  let dbManager: DatabaseManager;

  beforeAll(async () => {
    // Initialize database with test configuration
    dbManager = DatabaseManager.getInstance({
      name: 'test_schema.db',
      location: 'default',
      encryption: false, // Disable encryption for testing
    });
    await dbManager.initialize();
  });

  afterAll(async () => {
    await dbManager.close();
    DatabaseManager.resetInstance();
  });

  describe('Schema Definition', () => {
    it('should have all required table definitions in CREATE_TABLES', () => {
      expect(CREATE_TABLES).toHaveProperty('LEARNING_BUNDLES');
      expect(CREATE_TABLES).toHaveProperty('LESSONS');
      expect(CREATE_TABLES).toHaveProperty('QUIZZES');
      expect(CREATE_TABLES).toHaveProperty('HINTS');
      expect(CREATE_TABLES).toHaveProperty('PERFORMANCE_LOGS');
      expect(CREATE_TABLES).toHaveProperty('SYNC_SESSIONS');
      expect(CREATE_TABLES).toHaveProperty('STUDY_TRACKS');
      expect(CREATE_TABLES).toHaveProperty('DOWNLOAD_PROGRESS');
    });

    it('should have all required index definitions in CREATE_INDEXES', () => {
      expect(CREATE_INDEXES).toHaveProperty('IDX_LOGS_SYNC');
      expect(CREATE_INDEXES).toHaveProperty('IDX_LOGS_STUDENT');
      expect(CREATE_INDEXES).toHaveProperty('IDX_LESSONS_BUNDLE');
      expect(CREATE_INDEXES).toHaveProperty('IDX_QUIZZES_BUNDLE');
      expect(CREATE_INDEXES).toHaveProperty('IDX_HINTS_QUIZ');
      expect(CREATE_INDEXES).toHaveProperty('IDX_BUNDLES_STUDENT');
      expect(CREATE_INDEXES).toHaveProperty('IDX_SYNC_STATUS');
      expect(CREATE_INDEXES).toHaveProperty('IDX_TRACKS_BUNDLE');
      expect(CREATE_INDEXES).toHaveProperty('IDX_DOWNLOAD_PROGRESS_SESSION');
      expect(CREATE_INDEXES).toHaveProperty('IDX_DOWNLOAD_PROGRESS_UPDATED');
    });

    it('should define learning_bundles with status CHECK constraint', () => {
      expect(CREATE_TABLES.LEARNING_BUNDLES).toContain("CHECK(status IN ('active', 'archived'))");
    });

    it('should define lessons with difficulty CHECK constraint', () => {
      expect(CREATE_TABLES.LESSONS).toContain("CHECK(difficulty IN ('easy', 'medium', 'hard'))");
    });

    it('should define hints with level CHECK constraint (1-3)', () => {
      expect(CREATE_TABLES.HINTS).toContain('CHECK(level >= 1 AND level <= 3)');
    });

    it('should define performance_logs with event_type CHECK constraint', () => {
      expect(CREATE_TABLES.PERFORMANCE_LOGS).toContain("CHECK(event_type IN (");
      expect(CREATE_TABLES.PERFORMANCE_LOGS).toContain("'lesson_start'");
      expect(CREATE_TABLES.PERFORMANCE_LOGS).toContain("'quiz_answer'");
    });

    it('should define sync_sessions with status CHECK constraint', () => {
      expect(CREATE_TABLES.SYNC_SESSIONS).toContain("CHECK(status IN (");
      expect(CREATE_TABLES.SYNC_SESSIONS).toContain("'pending'");
      expect(CREATE_TABLES.SYNC_SESSIONS).toContain("'complete'");
    });

    it('should define foreign key constraints with CASCADE delete', () => {
      expect(CREATE_TABLES.LESSONS).toContain('FOREIGN KEY (bundle_id) REFERENCES learning_bundles(bundle_id) ON DELETE CASCADE');
      expect(CREATE_TABLES.QUIZZES).toContain('FOREIGN KEY (bundle_id) REFERENCES learning_bundles(bundle_id) ON DELETE CASCADE');
      expect(CREATE_TABLES.HINTS).toContain('FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE');
      expect(CREATE_TABLES.STUDY_TRACKS).toContain('FOREIGN KEY (bundle_id) REFERENCES learning_bundles(bundle_id) ON DELETE CASCADE');
    });
  });

  describe('CRUD Operations', () => {
    it('should insert and query learning_bundles with valid status', async () => {
      const db = dbManager.getDatabase();
      
      // Insert valid bundle
      const result = await db.runAsync(
        `INSERT INTO learning_bundles (bundle_id, student_id, valid_from, valid_until, total_size, checksum, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['test-bundle-1', 'student-1', Date.now(), Date.now() + 86400000, 1000, 'abc123', 'active']
      );
      
      expect(result.changes).toBe(1);
      
      // Query the bundle
      const bundle = await db.getFirstAsync(
        'SELECT * FROM learning_bundles WHERE bundle_id = ?',
        ['test-bundle-1']
      );
      
      expect(bundle).toBeDefined();
      expect(bundle).toMatchObject({
        bundle_id: 'test-bundle-1',
        student_id: 'student-1',
        status: 'active',
      });
    });

    it('should insert lessons with foreign key to bundles', async () => {
      const db = dbManager.getDatabase();
      
      // Insert bundle first
      await db.runAsync(
        `INSERT INTO learning_bundles (bundle_id, student_id, valid_from, valid_until, total_size, checksum, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['bundle-for-lesson', 'student-1', Date.now(), Date.now() + 86400000, 1000, 'abc123', 'active']
      );
      
      // Insert lesson
      const result = await db.runAsync(
        `INSERT INTO lessons (lesson_id, bundle_id, subject, topic, title, difficulty, content_json, estimated_minutes, curriculum_standards)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['lesson-1', 'bundle-for-lesson', 'Math', 'Algebra', 'Test Lesson', 'easy', '[]', 30, '[]']
      );
      
      expect(result.changes).toBe(1);
      
      // Query the lesson
      const lesson = await db.getFirstAsync(
        'SELECT * FROM lessons WHERE lesson_id = ?',
        ['lesson-1']
      );
      
      expect(lesson).toBeDefined();
      expect(lesson).toMatchObject({
        lesson_id: 'lesson-1',
        bundle_id: 'bundle-for-lesson',
        subject: 'Math',
        difficulty: 'easy',
      });
    });

    it('should insert quizzes with foreign key to bundles', async () => {
      const db = dbManager.getDatabase();
      
      // Insert bundle first
      await db.runAsync(
        `INSERT INTO learning_bundles (bundle_id, student_id, valid_from, valid_until, total_size, checksum, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['bundle-for-quiz', 'student-1', Date.now(), Date.now() + 86400000, 1000, 'abc123', 'active']
      );
      
      // Insert quiz
      const result = await db.runAsync(
        `INSERT INTO quizzes (quiz_id, bundle_id, subject, topic, title, difficulty, questions_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['quiz-1', 'bundle-for-quiz', 'Math', 'Algebra', 'Test Quiz', 'medium', '[]']
      );
      
      expect(result.changes).toBe(1);
    });

    it('should insert hints with valid level (1-3)', async () => {
      const db = dbManager.getDatabase();
      
      // Insert bundle and quiz first
      await db.runAsync(
        `INSERT INTO learning_bundles (bundle_id, student_id, valid_from, valid_until, total_size, checksum, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['bundle-for-hints', 'student-1', Date.now(), Date.now() + 86400000, 1000, 'abc123', 'active']
      );
      
      await db.runAsync(
        `INSERT INTO quizzes (quiz_id, bundle_id, subject, topic, title, difficulty, questions_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['quiz-for-hints', 'bundle-for-hints', 'Math', 'Algebra', 'Test Quiz', 'easy', '[]']
      );
      
      // Insert hints at levels 1, 2, 3
      for (let level = 1; level <= 3; level++) {
        const result = await db.runAsync(
          `INSERT INTO hints (hint_id, quiz_id, question_id, level, hint_text)
           VALUES (?, ?, ?, ?, ?)`,
          [`hint-${level}`, 'quiz-for-hints', 'q1', level, `Hint level ${level}`]
        );
        expect(result.changes).toBe(1);
      }
      
      // Query hints
      const hints = await db.getAllAsync(
        'SELECT * FROM hints WHERE quiz_id = ? ORDER BY level',
        ['quiz-for-hints']
      );
      
      expect(hints).toHaveLength(3);
      expect(hints[0]).toMatchObject({ level: 1 });
      expect(hints[1]).toMatchObject({ level: 2 });
      expect(hints[2]).toMatchObject({ level: 3 });
    });

    it('should insert performance_logs with valid event_type', async () => {
      const db = dbManager.getDatabase();
      
      const validEventTypes = [
        'lesson_start',
        'lesson_complete',
        'quiz_start',
        'quiz_answer',
        'quiz_complete',
        'hint_requested',
      ];
      
      for (const eventType of validEventTypes) {
        const result = await db.runAsync(
          `INSERT INTO performance_logs (student_id, timestamp, event_type, content_id, subject, topic, data_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['student-1', Date.now(), eventType, 'content-1', 'Math', 'Algebra', '{}']
        );
        expect(result.changes).toBe(1);
      }
    });

    it('should insert sync_sessions with valid status', async () => {
      const db = dbManager.getDatabase();
      
      const validStatuses = ['pending', 'uploading', 'downloading', 'complete', 'failed'];
      
      for (const status of validStatuses) {
        const result = await db.runAsync(
          `INSERT INTO sync_sessions (session_id, start_time, status)
           VALUES (?, ?, ?)`,
          [`session-${status}`, Date.now(), status]
        );
        expect(result.changes).toBe(1);
      }
    });

    it('should insert study_tracks with foreign key to bundles', async () => {
      const db = dbManager.getDatabase();
      
      // Insert bundle first
      await db.runAsync(
        `INSERT INTO learning_bundles (bundle_id, student_id, valid_from, valid_until, total_size, checksum, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['bundle-for-track', 'student-1', Date.now(), Date.now() + 86400000, 1000, 'abc123', 'active']
      );
      
      // Insert study track
      const result = await db.runAsync(
        `INSERT INTO study_tracks (track_id, bundle_id, subject, weeks_json)
         VALUES (?, ?, ?, ?)`,
        ['track-1', 'bundle-for-track', 'Math', '[]']
      );
      
      expect(result.changes).toBe(1);
    });

    it('should insert download_progress with valid data', async () => {
      const db = dbManager.getDatabase();
      
      const now = Date.now();
      const result = await db.runAsync(
        `INSERT INTO download_progress (session_id, bundle_url, total_bytes, downloaded_bytes, checksum, file_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['test-session', 'https://example.com/bundle.zip', 1000000, 500000, 'abc123', '/path/to/bundle.zip', now, now]
      );
      
      expect(result.changes).toBe(1);
      
      // Query the record
      const progress = await db.getFirstAsync(
        'SELECT * FROM download_progress WHERE session_id = ?',
        ['test-session']
      );
      
      expect(progress).toBeDefined();
      expect(progress).toMatchObject({
        session_id: 'test-session',
        bundle_url: 'https://example.com/bundle.zip',
        total_bytes: 1000000,
        downloaded_bytes: 500000,
      });
    });
  });

  describe('Database Statistics', () => {
    it('should return database statistics', async () => {
      const stats = await dbManager.getStats();
      
      expect(stats).toHaveProperty('tables');
      expect(stats).toHaveProperty('totalRecords');
      expect(stats.tables).toHaveProperty('learning_bundles');
      expect(stats.tables).toHaveProperty('lessons');
      expect(stats.tables).toHaveProperty('quizzes');
      expect(stats.tables).toHaveProperty('hints');
      expect(stats.tables).toHaveProperty('performance_logs');
      expect(stats.tables).toHaveProperty('sync_sessions');
      expect(stats.tables).toHaveProperty('study_tracks');
      expect(stats.tables).toHaveProperty('download_progress');
    });
  });
});
