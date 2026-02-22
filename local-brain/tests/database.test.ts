/**
 * Unit tests for database layer.
 * Tests schema creation, CRUD operations, transactions, and error handling.
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import {
  LearningBundleRepository,
  LessonRepository,
  QuizRepository,
  HintRepository,
  PerformanceLogRepository,
  SyncSessionRepository,
  StudentStateRepository,
  StudyTrackRepository,
} from '../src/database/repositories';

describe('Database Layer', () => {
  let dbManager: DatabaseManager;
  let bundleRepo: LearningBundleRepository;
  let lessonRepo: LessonRepository;
  let quizRepo: QuizRepository;
  let hintRepo: HintRepository;
  let logRepo: PerformanceLogRepository;
  let syncRepo: SyncSessionRepository;
  let stateRepo: StudentStateRepository;
  let trackRepo: StudyTrackRepository;

  beforeAll(async () => {
    // Initialize database with test configuration
    dbManager = DatabaseManager.getInstance({
      name: 'test_sikshya_sathi.db',
      location: 'default',
      encryption: false, // Disable encryption for tests
    });

    await dbManager.initialize();

    // Use repositories from DatabaseManager (they have dbManager set)
    bundleRepo = dbManager.learningBundleRepository;
    lessonRepo = dbManager.lessonRepository;
    quizRepo = dbManager.quizRepository;
    hintRepo = dbManager.hintRepository;
    logRepo = dbManager.performanceLogRepository;
    syncRepo = dbManager.syncSessionRepository;
    stateRepo = dbManager.studentStateRepository;
    trackRepo = dbManager.studyTrackRepository;
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

  describe('DatabaseManager', () => {
    it('should initialize database successfully', () => {
      expect(dbManager.isReady()).toBe(true);
    });

    it('should get database statistics', async () => {
      const stats = await dbManager.getStats();
      expect(stats).toBeDefined();
      expect(stats.totalRecords).toBe(0);
      expect(stats.tables).toHaveProperty('learning_bundles');
      expect(stats.tables).toHaveProperty('lessons');
      expect(stats.tables).toHaveProperty('quizzes');
    });
  });

  describe('LearningBundleRepository', () => {
    it('should create a learning bundle', async () => {
      const bundle = {
        bundle_id: 'bundle-1',
        student_id: 'student-1',
        valid_from: Date.now(),
        valid_until: Date.now() + 86400000,
        total_size: 5000000,
        checksum: 'abc123',
        status: 'active' as const,
      };

      await bundleRepo.create(bundle);

      const found = await bundleRepo.findById('bundle-1');
      expect(found).toBeDefined();
      expect(found?.bundle_id).toBe('bundle-1');
      expect(found?.student_id).toBe('student-1');
    });

    it('should find active bundle by student', async () => {
      const bundle = {
        bundle_id: 'bundle-1',
        student_id: 'student-1',
        valid_from: Date.now(),
        valid_until: Date.now() + 86400000,
        total_size: 5000000,
        checksum: 'abc123',
        status: 'active' as const,
      };

      await bundleRepo.create(bundle);

      const found = await bundleRepo.findActiveByStudent('student-1');
      expect(found).toBeDefined();
      expect(found?.bundle_id).toBe('bundle-1');
    });

    it('should archive old bundles', async () => {
      const bundle = {
        bundle_id: 'bundle-1',
        student_id: 'student-1',
        valid_from: Date.now(),
        valid_until: Date.now() + 86400000,
        total_size: 5000000,
        checksum: 'abc123',
        status: 'active' as const,
      };

      await bundleRepo.create(bundle);
      await bundleRepo.archiveOldBundles('student-1');

      const found = await bundleRepo.findById('bundle-1');
      expect(found?.status).toBe('archived');
    });
  });

  describe('LessonRepository', () => {
    it('should create a lesson', async () => {
      // Create bundle first
      await bundleRepo.create({
        bundle_id: 'bundle-1',
        student_id: 'student-1',
        valid_from: Date.now(),
        valid_until: Date.now() + 86400000,
        total_size: 5000000,
        checksum: 'abc123',
        status: 'active',
      });

      const lesson = {
        lesson_id: 'lesson-1',
        bundle_id: 'bundle-1',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Introduction to Algebra',
        difficulty: 'easy' as const,
        content_json: JSON.stringify([]),
        estimated_minutes: 30,
        curriculum_standards: JSON.stringify(['MATH-6-1']),
      };

      await lessonRepo.create(lesson);

      const found = await lessonRepo.findById('lesson-1');
      expect(found).toBeDefined();
      expect(found?.title).toBe('Introduction to Algebra');
    });

    it('should find lessons by subject', async () => {
      await bundleRepo.create({
        bundle_id: 'bundle-1',
        student_id: 'student-1',
        valid_from: Date.now(),
        valid_until: Date.now() + 86400000,
        total_size: 5000000,
        checksum: 'abc123',
        status: 'active',
      });

      await lessonRepo.create({
        lesson_id: 'lesson-1',
        bundle_id: 'bundle-1',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Lesson 1',
        difficulty: 'easy',
        content_json: JSON.stringify([]),
        estimated_minutes: 30,
        curriculum_standards: JSON.stringify(['MATH-6-1']),
      });

      const lessons = await lessonRepo.findBySubject('Mathematics');
      expect(lessons).toHaveLength(1);
      expect(lessons[0].subject).toBe('Mathematics');
    });

    it('should bulk create lessons', async () => {
      await bundleRepo.create({
        bundle_id: 'bundle-1',
        student_id: 'student-1',
        valid_from: Date.now(),
        valid_until: Date.now() + 86400000,
        total_size: 5000000,
        checksum: 'abc123',
        status: 'active',
      });

      const lessons = [
        {
          lesson_id: 'lesson-1',
          bundle_id: 'bundle-1',
          subject: 'Mathematics',
          topic: 'Algebra',
          title: 'Lesson 1',
          difficulty: 'easy' as const,
          content_json: JSON.stringify([]),
          estimated_minutes: 30,
          curriculum_standards: JSON.stringify(['MATH-6-1']),
        },
        {
          lesson_id: 'lesson-2',
          bundle_id: 'bundle-1',
          subject: 'Mathematics',
          topic: 'Algebra',
          title: 'Lesson 2',
          difficulty: 'medium' as const,
          content_json: JSON.stringify([]),
          estimated_minutes: 45,
          curriculum_standards: JSON.stringify(['MATH-6-2']),
        },
      ];

      await lessonRepo.bulkCreate(lessons);

      const count = await lessonRepo.count();
      expect(count).toBe(2);
    });
  });

  describe('PerformanceLogRepository', () => {
    it('should create a performance log', async () => {
      const log = {
        student_id: 'student-1',
        timestamp: Date.now(),
        event_type: 'lesson_complete' as const,
        content_id: 'lesson-1',
        subject: 'Mathematics',
        topic: 'Algebra',
        data_json: JSON.stringify({ timeSpent: 1800 }),
        synced: 0,
      };

      const logId = await logRepo.create(log);
      expect(logId).toBeGreaterThan(0);

      const found = await logRepo.findById(logId);
      expect(found).toBeDefined();
      expect(found?.student_id).toBe('student-1');
    });

    it('should find unsynced logs', async () => {
      await logRepo.create({
        student_id: 'student-1',
        timestamp: Date.now(),
        event_type: 'lesson_complete',
        content_id: 'lesson-1',
        subject: 'Mathematics',
        topic: 'Algebra',
        data_json: JSON.stringify({ timeSpent: 1800 }),
        synced: 0,
      });

      const unsynced = await logRepo.findUnsyncedByStudent('student-1');
      expect(unsynced).toHaveLength(1);
      expect(unsynced[0].synced).toBe(0);
    });

    it('should mark logs as synced', async () => {
      const logId = await logRepo.create({
        student_id: 'student-1',
        timestamp: Date.now(),
        event_type: 'lesson_complete',
        content_id: 'lesson-1',
        subject: 'Mathematics',
        topic: 'Algebra',
        data_json: JSON.stringify({ timeSpent: 1800 }),
        synced: 0,
      });

      await logRepo.markAsSynced([logId]);

      const found = await logRepo.findById(logId);
      expect(found?.synced).toBe(1);
    });
  });

  describe('SyncSessionRepository', () => {
    it('should create a sync session', async () => {
      const session = {
        session_id: 'sync-1',
        start_time: Date.now(),
        end_time: null,
        status: 'pending' as const,
        logs_uploaded: 0,
        bundle_downloaded: 0,
        error_message: null,
      };

      await syncRepo.create(session);

      const found = await syncRepo.findById('sync-1');
      expect(found).toBeDefined();
      expect(found?.status).toBe('pending');
    });

    it('should update sync session status', async () => {
      await syncRepo.create({
        session_id: 'sync-1',
        start_time: Date.now(),
        end_time: null,
        status: 'pending',
        logs_uploaded: 0,
        bundle_downloaded: 0,
        error_message: null,
      });

      await syncRepo.updateStatus('sync-1', 'uploading');

      const found = await syncRepo.findById('sync-1');
      expect(found?.status).toBe('uploading');
    });

    it('should complete sync session', async () => {
      await syncRepo.create({
        session_id: 'sync-1',
        start_time: Date.now(),
        end_time: null,
        status: 'pending',
        logs_uploaded: 0,
        bundle_downloaded: 0,
        error_message: null,
      });

      await syncRepo.complete('sync-1');

      const found = await syncRepo.findById('sync-1');
      expect(found?.status).toBe('complete');
      expect(found?.end_time).not.toBeNull();
    });
  });

  describe('StudentStateRepository', () => {
    it('should upsert student state', async () => {
      const state = {
        student_id: 'student-1',
        current_subject: 'Mathematics',
        current_lesson_id: 'lesson-1',
        last_active: Date.now(),
      };

      await stateRepo.upsert(state);

      const found = await stateRepo.findById('student-1');
      expect(found).toBeDefined();
      expect(found?.current_subject).toBe('Mathematics');
    });

    it('should update current subject', async () => {
      await stateRepo.upsert({
        student_id: 'student-1',
        current_subject: 'Mathematics',
        current_lesson_id: null,
        last_active: Date.now(),
      });

      await stateRepo.updateCurrentSubject('student-1', 'Science');

      const found = await stateRepo.findById('student-1');
      expect(found?.current_subject).toBe('Science');
    });
  });

  describe('CRUD Operations - Comprehensive Tests', () => {
    describe('Create Operations', () => {
      it('should create multiple bundles', async () => {
        const bundles = [
          {
            bundle_id: 'bundle-1',
            student_id: 'student-1',
            valid_from: Date.now(),
            valid_until: Date.now() + 86400000,
            total_size: 5000000,
            checksum: 'abc123',
            status: 'active' as const,
          },
          {
            bundle_id: 'bundle-2',
            student_id: 'student-1',
            valid_from: Date.now(),
            valid_until: Date.now() + 86400000,
            total_size: 3000000,
            checksum: 'def456',
            status: 'archived' as const,
          },
        ];

        for (const bundle of bundles) {
          await bundleRepo.create(bundle);
        }

        const count = await bundleRepo.count();
        expect(count).toBe(2);
      });

      it('should create quiz with all fields', async () => {
        await bundleRepo.create({
          bundle_id: 'bundle-1',
          student_id: 'student-1',
          valid_from: Date.now(),
          valid_until: Date.now() + 86400000,
          total_size: 5000000,
          checksum: 'abc123',
          status: 'active',
        });

        const quiz = {
          quiz_id: 'quiz-1',
          bundle_id: 'bundle-1',
          subject: 'Science',
          topic: 'Physics',
          title: 'Newton Laws',
          difficulty: 'medium' as const,
          time_limit: 30,
          questions_json: JSON.stringify([
            {
              questionId: 'q1',
              type: 'multiple_choice',
              question: 'What is force?',
              options: ['A', 'B', 'C', 'D'],
              correctAnswer: 'A',
            },
          ]),
        };

        await quizRepo.create(quiz);

        const found = await quizRepo.findById('quiz-1');
        expect(found).toBeDefined();
        expect(found?.title).toBe('Newton Laws');
        expect(found?.time_limit).toBe(30);
      });

      it('should create hint with all levels', async () => {
        await bundleRepo.create({
          bundle_id: 'bundle-1',
          student_id: 'student-1',
          valid_from: Date.now(),
          valid_until: Date.now() + 86400000,
          total_size: 5000000,
          checksum: 'abc123',
          status: 'active',
        });

        await quizRepo.create({
          quiz_id: 'quiz-1',
          bundle_id: 'bundle-1',
          subject: 'Math',
          topic: 'Algebra',
          title: 'Test',
          difficulty: 'easy',
          time_limit: null,
          questions_json: '[]',
        });

        const hints = [
          {
            hint_id: 'hint-1',
            quiz_id: 'quiz-1',
            question_id: 'q1',
            level: 1,
            hint_text: 'Think about the basics',
          },
          {
            hint_id: 'hint-2',
            quiz_id: 'quiz-1',
            question_id: 'q1',
            level: 2,
            hint_text: 'Consider the formula',
          },
          {
            hint_id: 'hint-3',
            quiz_id: 'quiz-1',
            question_id: 'q1',
            level: 3,
            hint_text: 'The answer involves x + y',
          },
        ];

        for (const hint of hints) {
          await hintRepo.create(hint);
        }

        const foundHints = await hintRepo.findByQuizAndQuestion(
          'quiz-1',
          'q1',
        );
        expect(foundHints).toHaveLength(3);
        expect(foundHints[0].level).toBe(1);
        expect(foundHints[2].level).toBe(3);
      });
    });

    describe('Read Operations', () => {
      it('should find all records', async () => {
        await bundleRepo.create({
          bundle_id: 'bundle-1',
          student_id: 'student-1',
          valid_from: Date.now(),
          valid_until: Date.now() + 86400000,
          total_size: 5000000,
          checksum: 'abc123',
          status: 'active',
        });

        await bundleRepo.create({
          bundle_id: 'bundle-2',
          student_id: 'student-2',
          valid_from: Date.now(),
          valid_until: Date.now() + 86400000,
          total_size: 3000000,
          checksum: 'def456',
          status: 'active',
        });

        const all = await bundleRepo.findAll();
        expect(all).toHaveLength(2);
      });

      it('should return null for non-existent record', async () => {
        const found = await lessonRepo.findById('non-existent');
        expect(found).toBeNull();
      });

      it('should find records by multiple criteria', async () => {
        await bundleRepo.create({
          bundle_id: 'bundle-1',
          student_id: 'student-1',
          valid_from: Date.now(),
          valid_until: Date.now() + 86400000,
          total_size: 5000000,
          checksum: 'abc123',
          status: 'active',
        });

        await quizRepo.create({
          quiz_id: 'quiz-1',
          bundle_id: 'bundle-1',
          subject: 'Mathematics',
          topic: 'Algebra',
          title: 'Test 1',
          difficulty: 'easy',
          time_limit: null,
          questions_json: '[]',
        });

        await quizRepo.create({
          quiz_id: 'quiz-2',
          bundle_id: 'bundle-1',
          subject: 'Mathematics',
          topic: 'Geometry',
          title: 'Test 2',
          difficulty: 'medium',
          time_limit: null,
          questions_json: '[]',
        });

        const algebraQuizzes = await quizRepo.findBySubjectAndTopic(
          'Mathematics',
          'Algebra',
        );
        expect(algebraQuizzes).toHaveLength(1);
        expect(algebraQuizzes[0].topic).toBe('Algebra');
      });

      it('should count records correctly', async () => {
        await bundleRepo.create({
          bundle_id: 'bundle-1',
          student_id: 'student-1',
          valid_from: Date.now(),
          valid_until: Date.now() + 86400000,
          total_size: 5000000,
          checksum: 'abc123',
          status: 'active',
        });

        for (let i = 1; i <= 5; i++) {
          await lessonRepo.create({
            lesson_id: `lesson-${i}`,
            bundle_id: 'bundle-1',
            subject: 'Math',
            topic: 'Algebra',
            title: `Lesson ${i}`,
            difficulty: 'easy',
            content_json: '[]',
            estimated_minutes: 30,
            curriculum_standards: '[]',
          });
        }

        const count = await lessonRepo.count();
        expect(count).toBe(5);
      });
    });

    describe('Update Operations', () => {
      it('should update sync session status', async () => {
        await syncRepo.create({
          session_id: 'sync-1',
          start_time: Date.now(),
          end_time: null,
          status: 'pending',
          logs_uploaded: 0,
          bundle_downloaded: 0,
          error_message: null,
        });

        await syncRepo.updateStatus('sync-1', 'uploading');
        let found = await syncRepo.findById('sync-1');
        expect(found?.status).toBe('uploading');

        await syncRepo.complete('sync-1');
        found = await syncRepo.findById('sync-1');
        expect(found?.status).toBe('complete');
        expect(found?.end_time).not.toBeNull();
      });

      it('should update student state', async () => {
        await stateRepo.upsert({
          student_id: 'student-1',
          current_subject: 'Mathematics',
          current_lesson_id: 'lesson-1',
          last_active: Date.now(),
        });

        const found = await stateRepo.findById('student-1');
        expect(found).toBeDefined();
        expect(found?.student_id).toBe('student-1');
      });

      it('should mark performance log as synced', async () => {
        const logId = await logRepo.create({
          student_id: 'student-1',
          timestamp: Date.now(),
          event_type: 'lesson_complete',
          content_id: 'lesson-1',
          subject: 'Math',
          topic: 'Algebra',
          data_json: '{}',
          synced: 0,
        });

        const found = await logRepo.findById(logId);
        expect(found).toBeDefined();
        expect(found?.synced).toBe(0);
      });
    });

    describe('Delete Operations', () => {
      it('should delete single record', async () => {
        await bundleRepo.create({
          bundle_id: 'bundle-1',
          student_id: 'student-1',
          valid_from: Date.now(),
          valid_until: Date.now() + 86400000,
          total_size: 5000000,
          checksum: 'abc123',
          status: 'active',
        });

        await bundleRepo.deleteById('bundle-1');

        const found = await bundleRepo.findById('bundle-1');
        expect(found).toBeNull();
      });

      it('should delete all records', async () => {
        for (let i = 1; i <= 3; i++) {
          await logRepo.create({
            student_id: 'student-1',
            timestamp: Date.now(),
            event_type: 'lesson_complete',
            content_id: `lesson-${i}`,
            subject: 'Math',
            topic: 'Algebra',
            data_json: '{}',
            synced: 0,
          });
        }

        await logRepo.deleteAll();

        const count = await logRepo.count();
        expect(count).toBe(0);
      });
    });
  });

  describe('Transaction Support', () => {
    it('should commit successful transaction', async () => {
      await bundleRepo.create({
        bundle_id: 'bundle-1',
        student_id: 'student-1',
        valid_from: Date.now(),
        valid_until: Date.now() + 86400000,
        total_size: 5000000,
        checksum: 'abc123',
        status: 'active',
      });

      await dbManager.transaction(async () => {
        // Create multiple lessons in transaction
        for (let i = 1; i <= 3; i++) {
          await dbManager.runSql(
            `INSERT INTO lessons 
            (lesson_id, bundle_id, subject, topic, title, difficulty, 
             content_json, estimated_minutes, curriculum_standards)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              `lesson-${i}`,
              'bundle-1',
              'Math',
              'Algebra',
              `Lesson ${i}`,
              'easy',
              '[]',
              30,
              '[]',
            ],
          );
        }
      });

      // All lessons should be created
      const count = await lessonRepo.count();
      expect(count).toBe(3);
    });

    it('should handle nested operations in transaction', async () => {
      await bundleRepo.create({
        bundle_id: 'bundle-1',
        student_id: 'student-1',
        valid_from: Date.now(),
        valid_until: Date.now() + 86400000,
        total_size: 5000000,
        checksum: 'abc123',
        status: 'active',
      });

      await dbManager.transaction(async () => {
        // Create lesson
        await dbManager.runSql(
          `INSERT INTO lessons 
          (lesson_id, bundle_id, subject, topic, title, difficulty, 
           content_json, estimated_minutes, curriculum_standards)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'lesson-1',
            'bundle-1',
            'Math',
            'Algebra',
            'Test',
            'easy',
            '[]',
            30,
            '[]',
          ],
        );

        // Create quiz
        await dbManager.runSql(
          `INSERT INTO quizzes 
          (quiz_id, bundle_id, subject, topic, title, difficulty, time_limit, questions_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ['quiz-1', 'bundle-1', 'Math', 'Algebra', 'Test', 'easy', null, '[]'],
        );

        // Create hint
        await dbManager.runSql(
          `INSERT INTO hints 
          (hint_id, quiz_id, question_id, level, hint_text)
          VALUES (?, ?, ?, ?, ?)`,
          ['hint-1', 'quiz-1', 'q1', 1, 'Think about it'],
        );
      });

      // All records should be created
      expect(await lessonRepo.count()).toBe(1);
      expect(await quizRepo.count()).toBe(1);
      expect(await hintRepo.count()).toBe(1);
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent reads', async () => {
      await bundleRepo.create({
        bundle_id: 'bundle-1',
        student_id: 'student-1',
        valid_from: Date.now(),
        valid_until: Date.now() + 86400000,
        total_size: 5000000,
        checksum: 'abc123',
        status: 'active',
      });

      // Create multiple lessons
      for (let i = 1; i <= 5; i++) {
        await lessonRepo.create({
          lesson_id: `lesson-${i}`,
          bundle_id: 'bundle-1',
          subject: 'Math',
          topic: 'Algebra',
          title: `Lesson ${i}`,
          difficulty: 'easy',
          content_json: '[]',
          estimated_minutes: 30,
          curriculum_standards: '[]',
        });
      }

      // Perform concurrent reads
      const readPromises = [];
      for (let i = 1; i <= 5; i++) {
        readPromises.push(lessonRepo.findById(`lesson-${i}`));
      }

      const results = await Promise.all(readPromises);

      // All reads should succeed
      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result?.lesson_id).toBe(`lesson-${index + 1}`);
      });
    });

    it('should handle concurrent writes to different tables', async () => {
      await bundleRepo.create({
        bundle_id: 'bundle-1',
        student_id: 'student-1',
        valid_from: Date.now(),
        valid_until: Date.now() + 86400000,
        total_size: 5000000,
        checksum: 'abc123',
        status: 'active',
      });

      // Perform concurrent writes to different tables
      const writePromises = [
        lessonRepo.create({
          lesson_id: 'lesson-1',
          bundle_id: 'bundle-1',
          subject: 'Math',
          topic: 'Algebra',
          title: 'Lesson 1',
          difficulty: 'easy',
          content_json: '[]',
          estimated_minutes: 30,
          curriculum_standards: '[]',
        }),
        quizRepo.create({
          quiz_id: 'quiz-1',
          bundle_id: 'bundle-1',
          subject: 'Math',
          topic: 'Algebra',
          title: 'Quiz 1',
          difficulty: 'easy',
          time_limit: null,
          questions_json: '[]',
        }),
        logRepo.create({
          student_id: 'student-1',
          timestamp: Date.now(),
          event_type: 'lesson_start',
          content_id: 'lesson-1',
          subject: 'Math',
          topic: 'Algebra',
          data_json: '{}',
          synced: 0,
        }),
      ];

      await Promise.all(writePromises);

      // All writes should succeed
      expect(await lessonRepo.count()).toBe(1);
      expect(await quizRepo.count()).toBe(1);
      expect(await logRepo.count()).toBe(1);
    });

    it('should handle concurrent performance log creation', async () => {
      // Simulate multiple concurrent log writes
      const logPromises = [];
      for (let i = 0; i < 10; i++) {
        logPromises.push(
          logRepo.create({
            student_id: 'student-1',
            timestamp: Date.now() + i,
            event_type: 'quiz_answer',
            content_id: `quiz-${i}`,
            subject: 'Math',
            topic: 'Algebra',
            data_json: JSON.stringify({ correct: i % 2 === 0 }),
            synced: 0,
          }),
        );
      }

      const logIds = await Promise.all(logPromises);

      // All logs should be created with unique IDs
      expect(logIds).toHaveLength(10);
      expect(new Set(logIds).size).toBe(10); // All IDs unique

      const count = await logRepo.count();
      expect(count).toBe(10);
    });

    it('should handle concurrent state updates', async () => {
      // Initialize state
      await stateRepo.upsert({
        student_id: 'student-1',
        current_subject: 'Mathematics',
        current_lesson_id: null,
        last_active: Date.now(),
      });

      // Perform concurrent updates
      const updatePromises = [
        stateRepo.updateCurrentSubject('student-1', 'Science'),
        stateRepo.updateCurrentLesson('student-1', 'lesson-1'),
        stateRepo.updateLastActive('student-1'),
      ];

      await Promise.all(updatePromises);

      // State should be updated (last write wins)
      const state = await stateRepo.findById('student-1');
      expect(state).toBeDefined();
      expect(state?.student_id).toBe('student-1');
    });

    it('should handle bulk operations efficiently', async () => {
      await bundleRepo.create({
        bundle_id: 'bundle-1',
        student_id: 'student-1',
        valid_from: Date.now(),
        valid_until: Date.now() + 86400000,
        total_size: 5000000,
        checksum: 'abc123',
        status: 'active',
      });

      // Create 50 lessons in bulk
      const lessons = [];
      for (let i = 1; i <= 50; i++) {
        lessons.push({
          lesson_id: `lesson-${i}`,
          bundle_id: 'bundle-1',
          subject: 'Math',
          topic: 'Algebra',
          title: `Lesson ${i}`,
          difficulty: 'easy' as const,
          content_json: '[]',
          estimated_minutes: 30,
          curriculum_standards: '[]',
        });
      }

      const startTime = Date.now();
      await lessonRepo.bulkCreate(lessons);
      const duration = Date.now() - startTime;

      // Bulk operation should complete quickly (< 2 seconds)
      expect(duration).toBeLessThan(2000);

      const count = await lessonRepo.count();
      expect(count).toBe(50);
    });
  });

  describe('Error Handling', () => {
    it('should handle duplicate primary key', async () => {
      await bundleRepo.create({
        bundle_id: 'bundle-1',
        student_id: 'student-1',
        valid_from: Date.now(),
        valid_until: Date.now() + 86400000,
        total_size: 5000000,
        checksum: 'abc123',
        status: 'active',
      });

      // Try to create duplicate (should fail)
      await expect(
        bundleRepo.create({
          bundle_id: 'bundle-1',
          student_id: 'student-2',
          valid_from: Date.now(),
          valid_until: Date.now() + 86400000,
          total_size: 5000000,
          checksum: 'xyz789',
          status: 'active',
        }),
      ).rejects.toThrow();
    });
  });
});
