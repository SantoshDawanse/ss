/**
 * Property-Based Test for Offline Content Delivery
 * 
 * Property 6: Offline Content Delivery
 * For any lesson or quiz in a synchronized Learning Bundle, the Local Brain 
 * must be able to deliver it without requiring internet connectivity.
 * 
 * Validates: Requirements 3.1
 * Feature: sikshya-sathi-system
 */

import fc from 'fast-check';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { ContentDeliveryService } from '../src/services/ContentDeliveryService';
import { LearningBundleRepository } from '../src/database/repositories/LearningBundleRepository';
import { LessonRepository } from '../src/database/repositories/LessonRepository';
import { QuizRepository } from '../src/database/repositories/QuizRepository';
import { Lesson, Quiz, LessonSection } from '../src/models';

describe('Property 6: Offline Content Delivery', () => {
  let dbManager: DatabaseManager;
  let contentService: ContentDeliveryService;
  let bundleRepo: LearningBundleRepository;
  let lessonRepo: LessonRepository;
  let quizRepo: QuizRepository;
  let testCounter = 0;

  beforeEach(async () => {
    // Get singleton instance and initialize
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    
    // Create service and repositories (repositories use singleton internally)
    contentService = new ContentDeliveryService(dbManager);
    
    // Use repositories from DatabaseManager (already initialized)
    bundleRepo = dbManager.learningBundleRepository;
    lessonRepo = dbManager.lessonRepository;
    quizRepo = dbManager.quizRepository;
    
    // Increment counter for unique IDs
    testCounter++;
  });

  afterEach(async () => {
    // Reset database for next test
    await dbManager.reset();
  });

  /**
   * Arbitrary generator for lesson sections
   */
  const lessonSectionArbitrary = fc.record({
    type: fc.constantFrom('explanation', 'example', 'practice'),
    content: fc.string({ minLength: 10, maxLength: 200 }),
    media: fc.option(
      fc.array(
        fc.record({
          type: fc.constantFrom('image', 'audio'),
          url: fc.webUrl(),
          alt: fc.option(fc.string()),
        }),
        { maxLength: 2 }
      ),
      { nil: undefined }
    ),
  }) as fc.Arbitrary<LessonSection>;

  /**
   * Arbitrary generator for lessons
   */
  const lessonArbitrary = fc.record({
    lessonId: fc.uuid(),
    subject: fc.constantFrom('Mathematics', 'Science', 'English', 'Nepali', 'Social Studies'),
    topic: fc.string({ minLength: 5, maxLength: 50 }),
    title: fc.string({ minLength: 10, maxLength: 100 }),
    difficulty: fc.constantFrom('easy', 'medium', 'hard'),
    estimatedMinutes: fc.integer({ min: 5, max: 60 }),
    curriculumStandards: fc.array(fc.string(), { minLength: 1, maxLength: 3 }),
    sections: fc.array(lessonSectionArbitrary, { minLength: 1, maxLength: 5 }),
  }) as fc.Arbitrary<Lesson>;

  /**
   * Arbitrary generator for quiz questions
   */
  const questionArbitrary = fc.record({
    questionId: fc.uuid(),
    type: fc.constantFrom('multiple_choice', 'true_false', 'short_answer'),
    question: fc.string({ minLength: 10, maxLength: 200 }),
    options: fc.option(
      fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 4 }),
      { nil: undefined }
    ),
    correctAnswer: fc.string({ minLength: 1, maxLength: 50 }),
    explanation: fc.string({ minLength: 10, maxLength: 200 }),
    curriculumStandard: fc.string(),
    bloomLevel: fc.integer({ min: 1, max: 6 }),
  });

  /**
   * Arbitrary generator for quizzes
   */
  const quizArbitrary = fc.record({
    quizId: fc.uuid(),
    subject: fc.constantFrom('Mathematics', 'Science', 'English', 'Nepali', 'Social Studies'),
    topic: fc.string({ minLength: 5, maxLength: 50 }),
    title: fc.string({ minLength: 10, maxLength: 100 }),
    difficulty: fc.constantFrom('easy', 'medium', 'hard'),
    timeLimit: fc.option(fc.integer({ min: 5, max: 60 }), { nil: undefined }),
    questions: fc.array(questionArbitrary, { minLength: 1, maxLength: 10 }),
  }) as fc.Arbitrary<Quiz>;

  it('should deliver any lesson from a synchronized bundle without connectivity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // studentId
        fc.integer({ min: 1, max: 1000000 }), // bundleIdSeed
        fc.array(lessonArbitrary, { minLength: 1, maxLength: 5 }), // lessons
        async (studentId, bundleIdSeed, lessons) => {
          // Generate unique IDs to avoid UNIQUE constraint violations
          const uniqueId = `${testCounter}-${bundleIdSeed}-${Date.now()}-${Math.random()}`;
          const bundleId = `bundle-${uniqueId}`;
          
          // Ensure unique lesson IDs
          const uniqueLessons = lessons.map((lesson, index) => ({
            ...lesson,
            lessonId: `lesson-${uniqueId}-${index}`,
          }));

          // Setup: Create an active learning bundle
          const now = Date.now();
          await bundleRepo.create({
            bundle_id: bundleId,
            student_id: studentId,
            valid_from: now,
            valid_until: now + 14 * 24 * 60 * 60 * 1000, // 2 weeks
            total_size: 1024 * 1024, // 1MB
            checksum: 'test-checksum',
            status: 'active',
          });

          // Insert lessons into database
          for (const lesson of uniqueLessons) {
            await lessonRepo.create({
              lesson_id: lesson.lessonId,
              bundle_id: bundleId,
              subject: lesson.subject,
              topic: lesson.topic,
              title: lesson.title,
              difficulty: lesson.difficulty,
              content_json: JSON.stringify(lesson.sections), // Store only sections
              estimated_minutes: lesson.estimatedMinutes,
              curriculum_standards: JSON.stringify(lesson.curriculumStandards),
            });
          }

          // Test: Verify lessons can be retrieved by ID (core offline delivery capability)
          // This tests that content stored locally can be accessed without network
          for (const lesson of uniqueLessons) {
            const retrievedLesson = await lessonRepo.findById(lesson.lessonId);
            
            // Verify: Lesson was successfully retrieved from local storage
            expect(retrievedLesson).not.toBeNull();
            expect(retrievedLesson?.lesson_id).toBe(lesson.lessonId);
            expect(retrievedLesson?.subject).toBe(lesson.subject);
            expect(retrievedLesson?.title).toBe(lesson.title);
            
            // Verify: Content can be parsed from JSON (offline delivery ready)
            const parsedLesson = lessonRepo.parseLesson(retrievedLesson!);
            expect(parsedLesson.lessonId).toBe(lesson.lessonId);
            expect(Array.isArray(parsedLesson.sections)).toBe(true);
            expect(parsedLesson.sections.length).toBe(lesson.sections.length);
          }

          // Verify: Can query lessons by bundle (offline bundle access)
          const bundleLessons = await lessonRepo.findByBundle(bundleId);
          expect(bundleLessons).toHaveLength(uniqueLessons.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should deliver any quiz from a synchronized bundle without connectivity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // studentId
        fc.integer({ min: 1, max: 1000000 }), // bundleIdSeed
        fc.array(quizArbitrary, { minLength: 1, maxLength: 5 }), // quizzes
        async (studentId, bundleIdSeed, quizzes) => {
          // Generate unique IDs to avoid UNIQUE constraint violations
          const uniqueId = `${testCounter}-${bundleIdSeed}-${Date.now()}-${Math.random()}`;
          const bundleId = `bundle-${uniqueId}`;
          
          // Ensure unique quiz IDs
          const uniqueQuizzes = quizzes.map((quiz, index) => ({
            ...quiz,
            quizId: `quiz-${uniqueId}-${index}`,
          }));

          // Setup: Create an active learning bundle
          const now = Date.now();
          await bundleRepo.create({
            bundle_id: bundleId,
            student_id: studentId,
            valid_from: now,
            valid_until: now + 14 * 24 * 60 * 60 * 1000, // 2 weeks
            total_size: 1024 * 1024, // 1MB
            checksum: 'test-checksum',
            status: 'active',
          });

          // Insert quizzes into database
          for (const quiz of uniqueQuizzes) {
            await quizRepo.create(quiz, bundleId);
          }

          // Test: Verify quizzes can be retrieved by ID (core offline delivery capability)
          // This tests that content stored locally can be accessed without network
          for (const quiz of uniqueQuizzes) {
            const retrievedQuizRow = await quizRepo.findById(quiz.quizId);
            
            // Verify: Quiz was successfully retrieved from local storage
            expect(retrievedQuizRow).not.toBeNull();
            
            // Parse the quiz row to get the Quiz object
            const retrievedQuiz = quizRepo.parseQuiz(retrievedQuizRow!);
            expect(retrievedQuiz.quizId).toBe(quiz.quizId);
            expect(retrievedQuiz.subject).toBe(quiz.subject);
            expect(retrievedQuiz.title).toBe(quiz.title);
            expect(retrievedQuiz.questions).toHaveLength(quiz.questions.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should deliver content from local storage without network access', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // studentId
        fc.integer({ min: 1, max: 1000000 }), // bundleIdSeed
        lessonArbitrary,
        async (studentId, bundleIdSeed, lesson) => {
          // Generate unique IDs
          const uniqueId = `${testCounter}-${bundleIdSeed}-${Date.now()}-${Math.random()}`;
          const bundleId = `bundle-${uniqueId}`;
          const uniqueLesson = {
            ...lesson,
            lessonId: `lesson-${uniqueId}`,
          };

          // Setup: Create bundle and lesson
          const now = Date.now();
          await bundleRepo.create({
            bundle_id: bundleId,
            student_id: studentId,
            valid_from: now,
            valid_until: now + 14 * 24 * 60 * 60 * 1000,
            total_size: 1024 * 1024,
            checksum: 'test-checksum',
            status: 'active',
          });

          await lessonRepo.create({
            lesson_id: uniqueLesson.lessonId,
            bundle_id: bundleId,
            subject: uniqueLesson.subject,
            topic: uniqueLesson.topic,
            title: uniqueLesson.title,
            difficulty: uniqueLesson.difficulty,
            content_json: JSON.stringify(uniqueLesson.sections), // Store only sections
            estimated_minutes: uniqueLesson.estimatedMinutes,
            curriculum_standards: JSON.stringify(uniqueLesson.curriculumStandards),
          });

          // Test: Retrieve lesson multiple times (simulating offline access)
          const firstRetrieval = await lessonRepo.findById(uniqueLesson.lessonId);
          const secondRetrieval = await lessonRepo.findById(uniqueLesson.lessonId);

          // Verify: Content can be retrieved multiple times without network
          expect(firstRetrieval).not.toBeNull();
          expect(secondRetrieval).not.toBeNull();
          expect(firstRetrieval?.lesson_id).toBe(uniqueLesson.lessonId);
          expect(secondRetrieval?.lesson_id).toBe(uniqueLesson.lessonId);
          
          // Verify: Content is consistent across retrievals
          expect(JSON.stringify(firstRetrieval)).toBe(JSON.stringify(secondRetrieval));
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should store and retrieve content for multiple subjects independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // studentId
        fc.integer({ min: 1, max: 1000000 }), // bundleIdSeed
        fc.array(lessonArbitrary, { minLength: 2, maxLength: 5 }),
        async (studentId, bundleIdSeed, lessons) => {
          // Ensure we have at least 2 different subjects
          if (lessons.length < 2) return true;

          // Generate unique IDs
          const uniqueId = `${testCounter}-${bundleIdSeed}-${Date.now()}-${Math.random()}`;
          const bundleId = `bundle-${uniqueId}`;
          const uniqueLessons = lessons.map((lesson, index) => ({
            ...lesson,
            lessonId: `lesson-${uniqueId}-${index}`,
          }));

          // Setup: Create bundle
          const now = Date.now();
          await bundleRepo.create({
            bundle_id: bundleId,
            student_id: studentId,
            valid_from: now,
            valid_until: now + 14 * 24 * 60 * 60 * 1000,
            total_size: 1024 * 1024,
            checksum: 'test-checksum',
            status: 'active',
          });

          // Insert lessons with different subjects
          const subjectMap = new Map<string, string[]>();
          for (const lesson of uniqueLessons) {
            if (!subjectMap.has(lesson.subject)) {
              subjectMap.set(lesson.subject, []);
            }
            subjectMap.get(lesson.subject)!.push(lesson.lessonId);
            
            await lessonRepo.create({
              lesson_id: lesson.lessonId,
              bundle_id: bundleId,
              subject: lesson.subject,
              topic: lesson.topic,
              title: lesson.title,
              difficulty: lesson.difficulty,
              content_json: JSON.stringify(lesson.sections), // Store only sections
              estimated_minutes: lesson.estimatedMinutes,
              curriculum_standards: JSON.stringify(lesson.curriculumStandards),
            });
          }

          // Test: Verify each lesson can be retrieved independently
          for (const lesson of uniqueLessons) {
            const retrieved = await lessonRepo.findById(lesson.lessonId);
            
            // Verify: Content is accessible offline
            expect(retrieved).not.toBeNull();
            expect(retrieved?.lesson_id).toBe(lesson.lessonId);
            expect(retrieved?.subject).toBe(lesson.subject);
          }

          // Verify: Can query by subject
          for (const [subject, lessonIds] of subjectMap.entries()) {
            const subjectLessons = await lessonRepo.findBySubject(subject);
            const retrievedIds = subjectLessons.map(l => l.lesson_id);
            
            // All lessons for this subject should be retrievable
            for (const lessonId of lessonIds) {
              expect(retrievedIds).toContain(lessonId);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return null when no active bundle exists (graceful offline degradation)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // studentId
        fc.constantFrom('Mathematics', 'Science', 'English'),
        async (studentId, subject) => {
          // Test: Try to retrieve content without any bundle
          const lesson = await contentService.getNextLesson(studentId, subject);
          const quiz = await contentService.getNextQuiz(studentId, subject);

          // Verify: Returns null gracefully (no network errors)
          expect(lesson).toBeNull();
          expect(quiz).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
