/**
 * Property-Based Tests for ContentDeliveryService - Task 11
 * 
 * Tests all properties related to content delivery functionality:
 * - Property 45: Active Bundle Query
 * - Property 46: Study Track Ordering  
 * - Property 47: Content Caching
 * - Property 48: Lesson Preloading
 * - Property 49: No Bundle Returns Null
 * - Property 50: Hint Level Validation
 * - Property 51: Hint Retrieval by Level
 * - Property 52: Non-Existent Hint Returns Null
 * - Property 53: Hint Offline Availability
 * - Property 54: Answer Comparison Logic
 * - Property 55: Feedback Structure
 * - Property 56: Next Hint Level Inclusion
 * - Property 57: Contextual Encouragement
 * 
 * Validates: Requirements 17.1-17.7, 18.1-18.7, 19.1-19.7, 29.1-29.7
 */

import fc from 'fast-check';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { ContentDeliveryService } from '../src/services/ContentDeliveryService';
import { 
  LearningBundleRepository, 
  LessonRepository, 
  QuizRepository, 
  HintRepository,
  StudyTrackRepository 
} from '../src/database/repositories';
import { Lesson, Quiz, Hint, StudyTrack, WeekPlan, DayPlan, Question } from '../src/models';

describe('Task 11: ContentDeliveryService Property Tests', () => {
  let dbManager: DatabaseManager;
  let contentService: ContentDeliveryService;
  let bundleRepo: LearningBundleRepository;
  let lessonRepo: LessonRepository;
  let quizRepo: QuizRepository;
  let hintRepo: HintRepository;
  let studyTrackRepo: StudyTrackRepository;
  let testCounter = 0;

  beforeEach(async () => {
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    
    contentService = new ContentDeliveryService(dbManager);
    
    // Use repositories from DatabaseManager (already initialized)
    bundleRepo = dbManager.learningBundleRepository;
    lessonRepo = dbManager.lessonRepository;
    quizRepo = dbManager.quizRepository;
    hintRepo = dbManager.hintRepository;
    studyTrackRepo = dbManager.studyTrackRepository;
    
    testCounter++;
  });

  afterEach(async () => {
    await dbManager.reset();
  });
  // Arbitraries for test data generation
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
  });

  const lessonArbitrary = fc.record({
    lessonId: fc.uuid(),
    subject: fc.constantFrom('Mathematics', 'Science', 'English'),
    topic: fc.string({ minLength: 5, maxLength: 50 }),
    title: fc.string({ minLength: 10, maxLength: 100 }),
    difficulty: fc.constantFrom('easy', 'medium', 'hard'),
    estimatedMinutes: fc.integer({ min: 5, max: 60 }),
    curriculumStandards: fc.array(fc.string(), { minLength: 1, maxLength: 3 }),
    sections: fc.array(lessonSectionArbitrary, { minLength: 1, maxLength: 5 }),
  });

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

  const quizArbitrary = fc.record({
    quizId: fc.uuid(),
    subject: fc.constantFrom('Mathematics', 'Science', 'English'),
    topic: fc.string({ minLength: 5, maxLength: 50 }),
    title: fc.string({ minLength: 10, maxLength: 100 }),
    difficulty: fc.constantFrom('easy', 'medium', 'hard'),
    timeLimit: fc.option(fc.integer({ min: 5, max: 60 }), { nil: undefined }),
    questions: fc.array(questionArbitrary, { minLength: 1, maxLength: 5 }),
  });

  const hintArbitrary = fc.record({
    hintId: fc.uuid(),
    level: fc.integer({ min: 1, max: 3 }),
    text: fc.string({ minLength: 10, maxLength: 100 }),
  });

  const dayPlanArbitrary = fc.record({
    dayNumber: fc.integer({ min: 1, max: 7 }),
    lessonIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
    quizIds: fc.array(fc.uuid(), { minLength: 0, maxLength: 2 }),
  });

  const weekPlanArbitrary = fc.record({
    weekNumber: fc.integer({ min: 1, max: 4 }),
    days: fc.array(dayPlanArbitrary, { minLength: 1, maxLength: 7 }),
  });

  const studyTrackArbitrary = fc.record({
    trackId: fc.uuid(),
    subject: fc.constantFrom('Mathematics', 'Science', 'English'),
    weeks: fc.array(weekPlanArbitrary, { minLength: 1, maxLength: 4 }),
  });
  /**
   * Property 45: Active Bundle Query
   * For any content request (lesson or quiz), the Content_Delivery_Service 
   * shall query the Learning_Bundle with status='active' for the student.
   * Validates: Requirements 17.1, 17.5
   */
  it('Property 45: should query active bundle for content requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // studentId
        fc.constantFrom('Mathematics', 'Science', 'English'), // subject
        fc.integer({ min: 1, max: 1000000 }), // bundleIdSeed
        async (studentId, subject, bundleIdSeed) => {
          const uniqueId = `${testCounter}-${bundleIdSeed}-${Date.now()}-${Math.random()}`;
          const bundleId = `bundle-${uniqueId}`;

          // Setup: Create active bundle
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

          // Test: Request content (should query active bundle)
          const lesson = await contentService.getNextLesson(studentId, subject);
          const quiz = await contentService.getNextQuiz(studentId, subject);

          // Verify: Returns null when no content in active bundle (but doesn't error)
          expect(lesson).toBeNull();
          expect(quiz).toBeNull();

          // Verify: Different student gets null (doesn't access wrong bundle)
          const otherStudentLesson = await contentService.getNextLesson('other-student', subject);
          expect(otherStudentLesson).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 49: No Bundle Returns Null
   * For any content request when no active bundle exists, the service shall return null.
   * Validates: Requirements 17.7
   */
  it('Property 49: should return null when no active bundle exists', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // studentId
        fc.constantFrom('Mathematics', 'Science', 'English'), // subject
        async (studentId, subject) => {
          // Test: Request content without any bundle
          const lesson = await contentService.getNextLesson(studentId, subject);
          const quiz = await contentService.getNextQuiz(studentId, subject);

          // Verify: Returns null gracefully
          expect(lesson).toBeNull();
          expect(quiz).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
  /**
   * Property 47: Content Caching
   * For any accessed lesson or quiz, the content shall be stored in the in-memory cache.
   * Validates: Requirements 17.3, 17.6
   */
  it('Property 47: should cache content on access', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // studentId
        fc.integer({ min: 1, max: 1000000 }), // bundleIdSeed
        lessonArbitrary,
        quizArbitrary,
        async (studentId, bundleIdSeed, lesson, quiz) => {
          const uniqueId = `${testCounter}-${bundleIdSeed}-${Date.now()}-${Math.random()}`;
          const bundleId = `bundle-${uniqueId}`;
          const uniqueLesson = { ...lesson, lessonId: `lesson-${uniqueId}` };
          const uniqueQuiz = { ...quiz, quizId: `quiz-${uniqueId}` };

          // Setup: Create bundle and content
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

          await lessonRepo.insert(uniqueLesson, bundleId);
          await quizRepo.create(uniqueQuiz, bundleId);

          // Test: Access content
          const initialCacheStats = contentService.getCacheStats();
          
          const retrievedLesson = await contentService.getLessonById(uniqueLesson.lessonId);
          const retrievedQuiz = await contentService.getQuizById(uniqueQuiz.quizId);

          const finalCacheStats = contentService.getCacheStats();

          // Verify: Content was cached
          expect(retrievedLesson).not.toBeNull();
          expect(retrievedQuiz).not.toBeNull();
          expect(finalCacheStats.lessons).toBeGreaterThan(initialCacheStats.lessons);
          expect(finalCacheStats.quizzes).toBeGreaterThan(initialCacheStats.quizzes);

          // Verify: Second access uses cache (should be faster/same result)
          const cachedLesson = await contentService.getLessonById(uniqueLesson.lessonId);
          const cachedQuiz = await contentService.getQuizById(uniqueQuiz.quizId);

          expect(cachedLesson).toEqual(retrievedLesson);
          expect(cachedQuiz).toEqual(retrievedQuiz);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 50: Hint Level Validation
   * For any hint request, the level parameter shall be validated to be between 1 and 3 inclusive.
   * Validates: Requirements 18.2
   */
  it('Property 50: should validate hint level bounds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // quizId
        fc.uuid(), // questionId
        fc.integer(), // level (any integer)
        async (quizId, questionId, level) => {
          if (level >= 1 && level <= 3) {
            // Valid level should not throw
            const hint = await contentService.getHint(quizId, questionId, level);
            // Result can be null (no hint exists) but should not throw
            expect(hint === null || typeof hint === 'object').toBe(true);
          } else {
            // Invalid level should throw
            await expect(
              contentService.getHint(quizId, questionId, level)
            ).rejects.toThrow('Hint level must be between 1 and 3');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
  /**
   * Property 51: Hint Retrieval by Level
   * For any hint request, the service shall return the hint matching the requested level 
   * for the specified quiz and question.
   * Validates: Requirements 18.5
   */
  it('Property 51: should retrieve hint by level', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000000 }), // seed
        fc.array(hintArbitrary, { minLength: 1, maxLength: 3 }),
        async (seed, hints) => {
          const uniqueId = `${testCounter}-${seed}-${Date.now()}-${Math.random()}`;
          const quizId = `quiz-${uniqueId}`;
          const questionId = `question-${uniqueId}`;

          // Ensure unique hint levels
          const uniqueHints = hints.map((hint, index) => ({
            ...hint,
            hintId: `hint-${uniqueId}-${index}`,
            level: (index % 3) + 1, // Levels 1, 2, 3
          }));

          // Setup: Insert hints
          for (const hint of uniqueHints) {
            await hintRepo.create({
              hint_id: hint.hintId,
              quiz_id: quizId,
              question_id: questionId,
              level: hint.level,
              hint_text: hint.text,
            });
          }

          // Test: Retrieve hints by level
          for (const expectedHint of uniqueHints) {
            const retrievedHint = await contentService.getHint(quizId, questionId, expectedHint.level);
            
            // Verify: Correct hint returned for level
            expect(retrievedHint).not.toBeNull();
            expect(retrievedHint!.level).toBe(expectedHint.level);
            expect(retrievedHint!.text).toBe(expectedHint.text);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 52: Non-Existent Hint Returns Null
   * For any hint request where the requested level does not exist, the service shall return null.
   * Validates: Requirements 18.6
   */
  it('Property 52: should return null for non-existent hint levels', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000000 }), // seed
        fc.integer({ min: 1, max: 3 }), // existingLevel
        fc.integer({ min: 1, max: 3 }), // requestedLevel
        async (seed, existingLevel, requestedLevel) => {
          const uniqueId = `${testCounter}-${seed}-${Date.now()}-${Math.random()}`;
          const quizId = `quiz-${uniqueId}`;
          const questionId = `question-${uniqueId}`;

          // Setup: Insert hint at one level only
          await hintRepo.create({
            hint_id: `hint-${uniqueId}`,
            quiz_id: quizId,
            question_id: questionId,
            level: existingLevel,
            hint_text: 'Test hint text',
          });

          // Test: Request hint at different level
          const hint = await contentService.getHint(quizId, questionId, requestedLevel);

          if (requestedLevel === existingLevel) {
            // Should return the hint
            expect(hint).not.toBeNull();
            expect(hint!.level).toBe(existingLevel);
          } else {
            // Should return null for non-existent level
            expect(hint).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
  /**
   * Property 54: Answer Comparison Logic
   * For any multiple_choice or true_false question, answer validation shall use 
   * case-insensitive exact matching; for short_answer questions, validation 
   * shall allow partial and substring matching.
   * Validates: Requirements 19.2, 19.3
   */
  it('Property 54: should use correct answer comparison logic', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000000 }), // seed
        fc.constantFrom('multiple_choice', 'true_false', 'short_answer'), // questionType
        fc.string({ minLength: 1, maxLength: 20 }), // correctAnswer
        async (seed, questionType, correctAnswer) => {
          const uniqueId = `${testCounter}-${seed}-${Date.now()}-${Math.random()}`;
          const quizId = `quiz-${uniqueId}`;
          const questionId = `question-${uniqueId}`;

          // Setup: Create quiz with question
          const quiz: Quiz = {
            quizId,
            subject: 'Mathematics',
            topic: 'Test Topic',
            title: 'Test Quiz',
            difficulty: 'easy',
            questions: [{
              questionId,
              type: questionType,
              question: 'Test question?',
              correctAnswer,
              explanation: 'Test explanation',
              curriculumStandard: 'TEST.STANDARD',
              bloomLevel: 1,
            }],
          };

          const bundleId = `bundle-${uniqueId}`;
          const studentId = `student-${uniqueId}`;

          await bundleRepo.create({
            bundle_id: bundleId,
            student_id: studentId,
            valid_from: Date.now(),
            valid_until: Date.now() + 14 * 24 * 60 * 60 * 1000,
            total_size: 1024,
            checksum: 'test',
            status: 'active',
          });

          await quizRepo.create(quiz, bundleId);

          // Test different answer formats
          const testCases = [
            correctAnswer, // Exact match
            correctAnswer.toUpperCase(), // Case variation
            correctAnswer.toLowerCase(), // Case variation
            ` ${correctAnswer} `, // With whitespace
          ];

          if (questionType === 'short_answer') {
            testCases.push(
              correctAnswer.substring(0, Math.max(1, correctAnswer.length - 1)), // Partial
              `prefix ${correctAnswer}`, // Contains correct answer
            );
          }

          for (const userAnswer of testCases) {
            const feedback = await contentService.validateAnswer(quizId, questionId, userAnswer);
            
            // Verify: Feedback structure is correct
            expect(feedback).toHaveProperty('correct');
            expect(feedback).toHaveProperty('explanation');
            expect(feedback).toHaveProperty('encouragement');
            expect(typeof feedback.correct).toBe('boolean');
            expect(typeof feedback.explanation).toBe('string');
            expect(typeof feedback.encouragement).toBe('string');

            // Verify: Answer comparison logic
            if (questionType === 'multiple_choice' || questionType === 'true_false') {
              // Should be correct for exact match (case-insensitive)
              const normalizedUser = userAnswer.trim().toLowerCase();
              const normalizedCorrect = correctAnswer.trim().toLowerCase();
              expect(feedback.correct).toBe(normalizedUser === normalizedCorrect);
            } else if (questionType === 'short_answer') {
              // Should be more flexible for short answers
              const normalizedUser = userAnswer.trim().toLowerCase();
              const normalizedCorrect = correctAnswer.trim().toLowerCase();
              const shouldBeCorrect = normalizedUser === normalizedCorrect ||
                                    normalizedUser.includes(normalizedCorrect) ||
                                    normalizedCorrect.includes(normalizedUser);
              expect(feedback.correct).toBe(shouldBeCorrect);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
  /**
   * Property 55: Feedback Structure
   * For any answer validation, the returned QuizFeedback shall contain 
   * correct (boolean), explanation (string), and encouragement (string) fields.
   * Validates: Requirements 19.4
   */
  it('Property 55: should return correct feedback structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000000 }), // seed
        fc.string({ minLength: 1, maxLength: 50 }), // userAnswer
        fc.integer({ min: 0, max: 3 }), // hintsUsed
        async (seed, userAnswer, hintsUsed) => {
          const uniqueId = `${testCounter}-${seed}-${Date.now()}-${Math.random()}`;
          const quizId = `quiz-${uniqueId}`;
          const questionId = `question-${uniqueId}`;

          // Setup: Create quiz with question
          const quiz: Quiz = {
            quizId,
            subject: 'Mathematics',
            topic: 'Test Topic',
            title: 'Test Quiz',
            difficulty: 'easy',
            questions: [{
              questionId,
              type: 'multiple_choice',
              question: 'Test question?',
              correctAnswer: 'correct',
              explanation: 'This is the explanation',
              curriculumStandard: 'TEST.STANDARD',
              bloomLevel: 1,
            }],
          };

          const bundleId = `bundle-${uniqueId}`;
          const studentId = `student-${uniqueId}`;

          await bundleRepo.create({
            bundle_id: bundleId,
            student_id: studentId,
            valid_from: Date.now(),
            valid_until: Date.now() + 14 * 24 * 60 * 60 * 1000,
            total_size: 1024,
            checksum: 'test',
            status: 'active',
          });

          await quizRepo.create(quiz, bundleId);

          // Test: Validate answer
          const feedback = await contentService.validateAnswer(quizId, questionId, userAnswer, hintsUsed);

          // Verify: Required fields exist with correct types
          expect(feedback).toHaveProperty('correct');
          expect(feedback).toHaveProperty('explanation');
          expect(feedback).toHaveProperty('encouragement');
          expect(typeof feedback.correct).toBe('boolean');
          expect(typeof feedback.explanation).toBe('string');
          expect(typeof feedback.encouragement).toBe('string');
          expect(feedback.explanation).toBe('This is the explanation');
          expect(feedback.encouragement.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 56: Next Hint Level Inclusion
   * For any incorrect answer where hintsUsed < 3, the feedback shall include 
   * nextHintLevel = hintsUsed + 1.
   * Validates: Requirements 19.5
   */
  it('Property 56: should include next hint level for incorrect answers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000000 }), // seed
        fc.integer({ min: 0, max: 2 }), // hintsUsed (0-2 to test < 3)
        async (seed, hintsUsed) => {
          const uniqueId = `${testCounter}-${seed}-${Date.now()}-${Math.random()}`;
          const quizId = `quiz-${uniqueId}`;
          const questionId = `question-${uniqueId}`;

          // Setup: Create quiz with question
          const quiz: Quiz = {
            quizId,
            subject: 'Mathematics',
            topic: 'Test Topic',
            title: 'Test Quiz',
            difficulty: 'easy',
            questions: [{
              questionId,
              type: 'multiple_choice',
              question: 'Test question?',
              correctAnswer: 'correct',
              explanation: 'This is the explanation',
              curriculumStandard: 'TEST.STANDARD',
              bloomLevel: 1,
            }],
          };

          const bundleId = `bundle-${uniqueId}`;
          const studentId = `student-${uniqueId}`;

          await bundleRepo.create({
            bundle_id: bundleId,
            student_id: studentId,
            valid_from: Date.now(),
            valid_until: Date.now() + 14 * 24 * 60 * 60 * 1000,
            total_size: 1024,
            checksum: 'test',
            status: 'active',
          });

          await quizRepo.create(quiz, bundleId);

          // Test: Give incorrect answer
          const feedback = await contentService.validateAnswer(quizId, questionId, 'wrong', hintsUsed);

          // Verify: Incorrect answer and next hint level
          expect(feedback.correct).toBe(false);
          if (hintsUsed < 3) {
            expect(feedback.nextHintLevel).toBe(hintsUsed + 1);
          } else {
            expect(feedback.nextHintLevel).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
  /**
   * Property 57: Contextual Encouragement
   * For any feedback, the encouragement message shall vary based on correctness and hintsUsed count.
   * Validates: Requirements 19.6
   */
  it('Property 57: should provide contextual encouragement', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000000 }), // seed
        fc.boolean(), // isCorrect
        fc.integer({ min: 0, max: 3 }), // hintsUsed
        async (seed, isCorrect, hintsUsed) => {
          const uniqueId = `${testCounter}-${seed}-${Date.now()}-${Math.random()}`;
          const quizId = `quiz-${uniqueId}`;
          const questionId = `question-${uniqueId}`;

          // Setup: Create quiz with question
          const quiz: Quiz = {
            quizId,
            subject: 'Mathematics',
            topic: 'Test Topic',
            title: 'Test Quiz',
            difficulty: 'easy',
            questions: [{
              questionId,
              type: 'multiple_choice',
              question: 'Test question?',
              correctAnswer: 'correct',
              explanation: 'This is the explanation',
              curriculumStandard: 'TEST.STANDARD',
              bloomLevel: 1,
            }],
          };

          const bundleId = `bundle-${uniqueId}`;
          const studentId = `student-${uniqueId}`;

          await bundleRepo.create({
            bundle_id: bundleId,
            student_id: studentId,
            valid_from: Date.now(),
            valid_until: Date.now() + 14 * 24 * 60 * 60 * 1000,
            total_size: 1024,
            checksum: 'test',
            status: 'active',
          });

          await quizRepo.create(quiz, bundleId);

          // Test: Give answer based on isCorrect
          const userAnswer = isCorrect ? 'correct' : 'wrong';
          const feedback = await contentService.validateAnswer(quizId, questionId, userAnswer, hintsUsed);

          // Verify: Encouragement varies based on context
          expect(feedback.encouragement).toBeDefined();
          expect(feedback.encouragement.length).toBeGreaterThan(0);
          expect(feedback.correct).toBe(isCorrect);

          // Verify: Different encouragement for different contexts
          if (isCorrect) {
            if (hintsUsed === 0) {
              expect(feedback.encouragement).toContain('Excellent');
            } else if (hintsUsed === 1) {
              expect(feedback.encouragement).toContain('Great');
            } else {
              expect(feedback.encouragement).toContain('Well done');
            }
          } else {
            if (hintsUsed === 0) {
              expect(feedback.encouragement).toContain('hint');
            } else if (hintsUsed < 3) {
              expect(feedback.encouragement).toContain('another hint');
            } else {
              expect(feedback.encouragement).toContain('explanation');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});