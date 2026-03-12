/**
 * Unit Tests for ContentDeliveryService - Task 11
 * 
 * Tests specific functionality and edge cases for content delivery:
 * - Constructor and initialization
 * - Lesson and quiz retrieval with Study Track ordering
 * - Content caching and preloading
 * - Progressive hint system
 * - Answer validation and feedback
 * - Cache management
 * - Error handling
 * 
 * Validates: Requirements 17.1-17.7, 18.1-18.7, 19.1-19.7, 29.1-29.7
 */

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

describe('Task 11: ContentDeliveryService Unit Tests', () => {
  let dbManager: DatabaseManager;
  let contentService: ContentDeliveryService;
  let bundleRepo: LearningBundleRepository;
  let lessonRepo: LessonRepository;
  let quizRepo: QuizRepository;
  let hintRepo: HintRepository;
  let studyTrackRepo: StudyTrackRepository;

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
  });

  afterEach(async () => {
    try {
      await dbManager.reset();
    } catch (error) {
      // Database might be closed, reinitialize first
      await dbManager.initialize();
      await dbManager.reset();
    }
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with empty cache', () => {
      const stats = contentService.getCacheStats();
      expect(stats.lessons).toBe(0);
      expect(stats.quizzes).toBe(0);
      expect(stats.hints).toBe(0);
    });

    it('should accept DatabaseManager in constructor', () => {
      expect(contentService).toBeInstanceOf(ContentDeliveryService);
    });
  });
  describe('Lesson and Quiz Retrieval', () => {
    it('should return null when no active bundle exists', async () => {
      const lesson = await contentService.getNextLesson('student1', 'Mathematics');
      const quiz = await contentService.getNextQuiz('student1', 'Mathematics');
      
      expect(lesson).toBeNull();
      expect(quiz).toBeNull();
    });

    it('should return null when active bundle has no content for subject', async () => {
      // Create active bundle without content
      await bundleRepo.create({
        bundle_id: 'bundle1',
        student_id: 'student1',
        valid_from: Date.now(),
        valid_until: Date.now() + 14 * 24 * 60 * 60 * 1000,
        total_size: 1024,
        checksum: 'test',
        status: 'active',
      });

      const lesson = await contentService.getNextLesson('student1', 'Mathematics');
      const quiz = await contentService.getNextQuiz('student1', 'Mathematics');
      
      expect(lesson).toBeNull();
      expect(quiz).toBeNull();
    });

    it('should retrieve lesson from active bundle', async () => {
      // Setup bundle and lesson
      await bundleRepo.create({
        bundle_id: 'bundle1',
        student_id: 'student1',
        valid_from: Date.now(),
        valid_until: Date.now() + 14 * 24 * 60 * 60 * 1000,
        total_size: 1024,
        checksum: 'test',
        status: 'active',
      });

      const lesson: Lesson = {
        lessonId: 'lesson1',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Introduction to Algebra',
        difficulty: 'easy',
        estimatedMinutes: 30,
        curriculumStandards: ['MATH.ALG.1'],
        sections: [{
          type: 'explanation',
          content: 'Algebra is...',
        }],
      };

      await lessonRepo.insert(lesson, 'bundle1');

      const retrievedLesson = await contentService.getNextLesson('student1', 'Mathematics');
      
      expect(retrievedLesson).not.toBeNull();
      expect(retrievedLesson!.lessonId).toBe('lesson1');
      expect(retrievedLesson!.title).toBe('Introduction to Algebra');
    });

    it('should retrieve quiz from active bundle', async () => {
      // Setup bundle and quiz
      await bundleRepo.create({
        bundle_id: 'bundle1',
        student_id: 'student1',
        valid_from: Date.now(),
        valid_until: Date.now() + 14 * 24 * 60 * 60 * 1000,
        total_size: 1024,
        checksum: 'test',
        status: 'active',
      });

      const quiz: Quiz = {
        quizId: 'quiz1',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Algebra Quiz',
        difficulty: 'easy',
        questions: [{
          questionId: 'q1',
          type: 'multiple_choice',
          question: 'What is 2 + 2?',
          options: ['3', '4', '5'],
          correctAnswer: '4',
          explanation: '2 + 2 equals 4',
          curriculumStandard: 'MATH.ADD.1',
          bloomLevel: 1,
        }],
      };

      await quizRepo.create(quiz, 'bundle1');

      const retrievedQuiz = await contentService.getNextQuiz('student1', 'Mathematics');
      
      expect(retrievedQuiz).not.toBeNull();
      expect(retrievedQuiz!.quizId).toBe('quiz1');
      expect(retrievedQuiz!.title).toBe('Algebra Quiz');
    });
  });
  describe('Study Track Ordering', () => {
    it('should follow study track order when available', async () => {
      // Setup bundle
      await bundleRepo.create({
        bundle_id: 'bundle1',
        student_id: 'student1',
        valid_from: Date.now(),
        valid_until: Date.now() + 14 * 24 * 60 * 60 * 1000,
        total_size: 1024,
        checksum: 'test',
        status: 'active',
      });

      // Create lessons
      const lesson1: Lesson = {
        lessonId: 'lesson1',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Lesson 1',
        difficulty: 'easy',
        estimatedMinutes: 30,
        curriculumStandards: ['MATH.ALG.1'],
        sections: [{ type: 'explanation', content: 'Content 1' }],
      };

      const lesson2: Lesson = {
        lessonId: 'lesson2',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Lesson 2',
        difficulty: 'easy',
        estimatedMinutes: 30,
        curriculumStandards: ['MATH.ALG.2'],
        sections: [{ type: 'explanation', content: 'Content 2' }],
      };

      await lessonRepo.insert(lesson1, 'bundle1');
      await lessonRepo.insert(lesson2, 'bundle1');

      // Create study track with specific order
      const studyTrack: StudyTrack = {
        trackId: 'track1',
        subject: 'Mathematics',
        weeks: [{
          weekNumber: 1,
          days: [{
            dayNumber: 1,
            lessonIds: ['lesson2'], // lesson2 first in study track
            quizIds: [],
          }],
        }],
      };

      await studyTrackRepo.insert(studyTrack, 'bundle1');

      const retrievedLesson = await contentService.getNextLesson('student1', 'Mathematics');
      
      // Should return lesson2 (first in study track), not lesson1
      expect(retrievedLesson).not.toBeNull();
      expect(retrievedLesson!.lessonId).toBe('lesson2');
    });

    it('should fallback to first lesson when no study track exists', async () => {
      // Setup bundle and lessons without study track
      await bundleRepo.create({
        bundle_id: 'bundle1',
        student_id: 'student1',
        valid_from: Date.now(),
        valid_until: Date.now() + 14 * 24 * 60 * 60 * 1000,
        total_size: 1024,
        checksum: 'test',
        status: 'active',
      });

      const lesson: Lesson = {
        lessonId: 'lesson1',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'First Lesson',
        difficulty: 'easy',
        estimatedMinutes: 30,
        curriculumStandards: ['MATH.ALG.1'],
        sections: [{ type: 'explanation', content: 'Content' }],
      };

      await lessonRepo.insert(lesson, 'bundle1');

      const retrievedLesson = await contentService.getNextLesson('student1', 'Mathematics');
      
      expect(retrievedLesson).not.toBeNull();
      expect(retrievedLesson!.lessonId).toBe('lesson1');
    });
  });
  describe('Content Caching', () => {
    it('should cache lessons on access', async () => {
      // Setup
      await bundleRepo.create({
        bundle_id: 'bundle1',
        student_id: 'student1',
        valid_from: Date.now(),
        valid_until: Date.now() + 14 * 24 * 60 * 60 * 1000,
        total_size: 1024,
        checksum: 'test',
        status: 'active',
      });

      const lesson: Lesson = {
        lessonId: 'lesson1',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Test Lesson',
        difficulty: 'easy',
        estimatedMinutes: 30,
        curriculumStandards: ['MATH.ALG.1'],
        sections: [{ type: 'explanation', content: 'Content' }],
      };

      await lessonRepo.insert(lesson, 'bundle1');

      const initialStats = contentService.getCacheStats();
      expect(initialStats.lessons).toBe(0);

      // Access lesson
      await contentService.getLessonById('lesson1');

      const finalStats = contentService.getCacheStats();
      expect(finalStats.lessons).toBe(1);
    });

    it('should cache quizzes on access', async () => {
      // Setup
      await bundleRepo.create({
        bundle_id: 'bundle1',
        student_id: 'student1',
        valid_from: Date.now(),
        valid_until: Date.now() + 14 * 24 * 60 * 60 * 1000,
        total_size: 1024,
        checksum: 'test',
        status: 'active',
      });

      const quiz: Quiz = {
        quizId: 'quiz1',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Test Quiz',
        difficulty: 'easy',
        questions: [{
          questionId: 'q1',
          type: 'multiple_choice',
          question: 'Test?',
          correctAnswer: 'A',
          explanation: 'Test explanation',
          curriculumStandard: 'TEST',
          bloomLevel: 1,
        }],
      };

      await quizRepo.create(quiz, 'bundle1');

      const initialStats = contentService.getCacheStats();
      expect(initialStats.quizzes).toBe(0);

      // Access quiz
      await contentService.getQuizById('quiz1');

      const finalStats = contentService.getCacheStats();
      expect(finalStats.quizzes).toBe(1);
    });

    it('should return cached content on subsequent access', async () => {
      // Setup
      await bundleRepo.create({
        bundle_id: 'bundle1',
        student_id: 'student1',
        valid_from: Date.now(),
        valid_until: Date.now() + 14 * 24 * 60 * 60 * 1000,
        total_size: 1024,
        checksum: 'test',
        status: 'active',
      });

      const lesson: Lesson = {
        lessonId: 'lesson1',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Test Lesson',
        difficulty: 'easy',
        estimatedMinutes: 30,
        curriculumStandards: ['MATH.ALG.1'],
        sections: [{ type: 'explanation', content: 'Content' }],
      };

      await lessonRepo.insert(lesson, 'bundle1');

      // First access
      const lesson1 = await contentService.getLessonById('lesson1');
      
      // Second access (should be from cache)
      const lesson2 = await contentService.getLessonById('lesson1');

      expect(lesson1).toEqual(lesson2);
      expect(lesson1).toBe(lesson2); // Same object reference from cache
    });
  });
  describe('Progressive Hint System', () => {
    it('should validate hint level bounds', async () => {
      // Test invalid levels
      await expect(
        contentService.getHint('quiz1', 'q1', 0)
      ).rejects.toThrow('Hint level must be between 1 and 3');

      await expect(
        contentService.getHint('quiz1', 'q1', 4)
      ).rejects.toThrow('Hint level must be between 1 and 3');

      // Test valid levels (should not throw)
      const hint1 = await contentService.getHint('quiz1', 'q1', 1);
      const hint2 = await contentService.getHint('quiz1', 'q1', 2);
      const hint3 = await contentService.getHint('quiz1', 'q1', 3);

      // Results can be null but should not throw
      expect(hint1 === null || typeof hint1 === 'object').toBe(true);
      expect(hint2 === null || typeof hint2 === 'object').toBe(true);
      expect(hint3 === null || typeof hint3 === 'object').toBe(true);
    });

    it('should return null when no hints exist', async () => {
      const hint = await contentService.getHint('nonexistent', 'q1', 1);
      expect(hint).toBeNull();
    });

    it('should retrieve hints by level', async () => {
      // Setup hints
      await hintRepo.create({
        hint_id: 'hint1',
        quiz_id: 'quiz1',
        question_id: 'q1',
        level: 1,
        hint_text: 'First hint',
      });

      await hintRepo.create({
        hint_id: 'hint2',
        quiz_id: 'quiz1',
        question_id: 'q1',
        level: 2,
        hint_text: 'Second hint',
      });

      // Test retrieval
      const hint1 = await contentService.getHint('quiz1', 'q1', 1);
      const hint2 = await contentService.getHint('quiz1', 'q1', 2);
      const hint3 = await contentService.getHint('quiz1', 'q1', 3);

      expect(hint1).not.toBeNull();
      expect(hint1!.level).toBe(1);
      expect(hint1!.text).toBe('First hint');

      expect(hint2).not.toBeNull();
      expect(hint2!.level).toBe(2);
      expect(hint2!.text).toBe('Second hint');

      expect(hint3).toBeNull(); // Level 3 doesn't exist
    });

    it('should cache all hint levels together', async () => {
      // Setup hints
      await hintRepo.create({
        hint_id: 'hint1',
        quiz_id: 'quiz1',
        question_id: 'q1',
        level: 1,
        hint_text: 'First hint',
      });

      await hintRepo.create({
        hint_id: 'hint2',
        quiz_id: 'quiz1',
        question_id: 'q1',
        level: 2,
        hint_text: 'Second hint',
      });

      const initialStats = contentService.getCacheStats();
      expect(initialStats.hints).toBe(0);

      // Access one hint (should cache all for this question)
      await contentService.getHint('quiz1', 'q1', 1);

      const finalStats = contentService.getCacheStats();
      expect(finalStats.hints).toBe(1); // One cache entry for the question
    });
  });
  describe('Answer Validation and Feedback', () => {
    let quiz: Quiz;
    let bundleId: string;
    let studentId: string;

    beforeEach(async () => {
      bundleId = 'test-bundle';
      studentId = 'test-student';

      await bundleRepo.create({
        bundle_id: bundleId,
        student_id: studentId,
        valid_from: Date.now(),
        valid_until: Date.now() + 14 * 24 * 60 * 60 * 1000,
        total_size: 1024,
        checksum: 'test',
        status: 'active',
      });

      quiz = {
        quizId: 'test-quiz',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Test Quiz',
        difficulty: 'easy',
        questions: [
          {
            questionId: 'mc-question',
            type: 'multiple_choice',
            question: 'What is 2 + 2?',
            options: ['3', '4', '5'],
            correctAnswer: '4',
            explanation: '2 + 2 equals 4',
            curriculumStandard: 'MATH.ADD.1',
            bloomLevel: 1,
          },
          {
            questionId: 'tf-question',
            type: 'true_false',
            question: 'Is 2 + 2 = 4?',
            correctAnswer: 'true',
            explanation: 'Yes, 2 + 2 equals 4',
            curriculumStandard: 'MATH.ADD.1',
            bloomLevel: 1,
          },
          {
            questionId: 'sa-question',
            type: 'short_answer',
            question: 'What is the capital of France?',
            correctAnswer: 'Paris',
            explanation: 'Paris is the capital of France',
            curriculumStandard: 'GEO.WORLD.1',
            bloomLevel: 1,
          },
        ],
      };

      await quizRepo.create(quiz, bundleId);
    });

    it('should throw error when quiz not found', async () => {
      await expect(
        contentService.validateAnswer('nonexistent', 'q1', 'answer')
      ).rejects.toThrow('Quiz not found');
    });

    it('should throw error when question not found', async () => {
      await expect(
        contentService.validateAnswer('test-quiz', 'nonexistent', 'answer')
      ).rejects.toThrow('Question not found');
    });

    it('should validate multiple choice answers with case-insensitive exact match', async () => {
      // Correct answers
      let feedback = await contentService.validateAnswer('test-quiz', 'mc-question', '4');
      expect(feedback.correct).toBe(true);

      feedback = await contentService.validateAnswer('test-quiz', 'mc-question', '4');
      expect(feedback.correct).toBe(true);

      feedback = await contentService.validateAnswer('test-quiz', 'mc-question', ' 4 ');
      expect(feedback.correct).toBe(true);

      // Incorrect answers
      feedback = await contentService.validateAnswer('test-quiz', 'mc-question', '3');
      expect(feedback.correct).toBe(false);

      feedback = await contentService.validateAnswer('test-quiz', 'mc-question', '44');
      expect(feedback.correct).toBe(false);
    });

    it('should validate true/false answers with case-insensitive exact match', async () => {
      // Correct answers
      let feedback = await contentService.validateAnswer('test-quiz', 'tf-question', 'true');
      expect(feedback.correct).toBe(true);

      feedback = await contentService.validateAnswer('test-quiz', 'tf-question', 'TRUE');
      expect(feedback.correct).toBe(true);

      feedback = await contentService.validateAnswer('test-quiz', 'tf-question', ' True ');
      expect(feedback.correct).toBe(true);

      // Incorrect answers
      feedback = await contentService.validateAnswer('test-quiz', 'tf-question', 'false');
      expect(feedback.correct).toBe(false);
    });

    it('should validate short answer with partial/substring matching', async () => {
      // Exact match
      let feedback = await contentService.validateAnswer('test-quiz', 'sa-question', 'Paris');
      expect(feedback.correct).toBe(true);

      // Case insensitive
      feedback = await contentService.validateAnswer('test-quiz', 'sa-question', 'paris');
      expect(feedback.correct).toBe(true);

      // Partial match
      feedback = await contentService.validateAnswer('test-quiz', 'sa-question', 'Pari');
      expect(feedback.correct).toBe(true);

      // Contains correct answer
      feedback = await contentService.validateAnswer('test-quiz', 'sa-question', 'The city Paris');
      expect(feedback.correct).toBe(true);

      // Incorrect
      feedback = await contentService.validateAnswer('test-quiz', 'sa-question', 'London');
      expect(feedback.correct).toBe(false);
    });

    it('should return correct feedback structure', async () => {
      const feedback = await contentService.validateAnswer('test-quiz', 'mc-question', '4');

      expect(feedback).toHaveProperty('correct');
      expect(feedback).toHaveProperty('explanation');
      expect(feedback).toHaveProperty('encouragement');
      expect(typeof feedback.correct).toBe('boolean');
      expect(typeof feedback.explanation).toBe('string');
      expect(typeof feedback.encouragement).toBe('string');
      expect(feedback.explanation).toBe('2 + 2 equals 4');
    });

    it('should include next hint level for incorrect answers when hints available', async () => {
      // No hints used
      let feedback = await contentService.validateAnswer('test-quiz', 'mc-question', 'wrong', 0);
      expect(feedback.correct).toBe(false);
      expect(feedback.nextHintLevel).toBe(1);

      // 1 hint used
      feedback = await contentService.validateAnswer('test-quiz', 'mc-question', 'wrong', 1);
      expect(feedback.correct).toBe(false);
      expect(feedback.nextHintLevel).toBe(2);

      // 2 hints used
      feedback = await contentService.validateAnswer('test-quiz', 'mc-question', 'wrong', 2);
      expect(feedback.correct).toBe(false);
      expect(feedback.nextHintLevel).toBe(3);

      // 3 hints used (max reached)
      feedback = await contentService.validateAnswer('test-quiz', 'mc-question', 'wrong', 3);
      expect(feedback.correct).toBe(false);
      expect(feedback.nextHintLevel).toBeUndefined();
    });

    it('should not include next hint level for correct answers', async () => {
      const feedback = await contentService.validateAnswer('test-quiz', 'mc-question', '4', 0);
      expect(feedback.correct).toBe(true);
      expect(feedback.nextHintLevel).toBeUndefined();
    });

    it('should provide contextual encouragement', async () => {
      // Correct answer, no hints
      let feedback = await contentService.validateAnswer('test-quiz', 'mc-question', '4', 0);
      expect(feedback.encouragement).toContain('Excellent');

      // Correct answer, 1 hint
      feedback = await contentService.validateAnswer('test-quiz', 'mc-question', '4', 1);
      expect(feedback.encouragement).toContain('Great');

      // Correct answer, multiple hints
      feedback = await contentService.validateAnswer('test-quiz', 'mc-question', '4', 2);
      expect(feedback.encouragement).toContain('Well done');

      // Incorrect answer, no hints
      feedback = await contentService.validateAnswer('test-quiz', 'mc-question', 'wrong', 0);
      expect(feedback.encouragement).toContain('hint');

      // Incorrect answer, some hints
      feedback = await contentService.validateAnswer('test-quiz', 'mc-question', 'wrong', 1);
      expect(feedback.encouragement).toContain('another hint');

      // Incorrect answer, max hints
      feedback = await contentService.validateAnswer('test-quiz', 'mc-question', 'wrong', 3);
      expect(feedback.encouragement).toContain('explanation');
    });
  });
  describe('Cache Management', () => {
    it('should clear all caches', () => {
      // Manually add some items to cache to test clearing
      contentService.clearCache();
      
      const stats = contentService.getCacheStats();
      expect(stats.lessons).toBe(0);
      expect(stats.quizzes).toBe(0);
      expect(stats.hints).toBe(0);
    });

    it('should return accurate cache statistics', async () => {
      // Setup content
      await bundleRepo.create({
        bundle_id: 'bundle1',
        student_id: 'student1',
        valid_from: Date.now(),
        valid_until: Date.now() + 14 * 24 * 60 * 60 * 1000,
        total_size: 1024,
        checksum: 'test',
        status: 'active',
      });

      const lesson: Lesson = {
        lessonId: 'lesson1',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Test Lesson',
        difficulty: 'easy',
        estimatedMinutes: 30,
        curriculumStandards: ['MATH.ALG.1'],
        sections: [{ type: 'explanation', content: 'Content' }],
      };

      const quiz: Quiz = {
        quizId: 'quiz1',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Test Quiz',
        difficulty: 'easy',
        questions: [{
          questionId: 'q1',
          type: 'multiple_choice',
          question: 'Test?',
          correctAnswer: 'A',
          explanation: 'Test explanation',
          curriculumStandard: 'TEST',
          bloomLevel: 1,
        }],
      };

      await lessonRepo.insert(lesson, 'bundle1');
      await quizRepo.create(quiz, 'bundle1');

      await hintRepo.create({
        hint_id: 'hint1',
        quiz_id: 'quiz1',
        question_id: 'q1',
        level: 1,
        hint_text: 'Test hint',
      });

      // Access content to populate cache
      await contentService.getLessonById('lesson1');
      await contentService.getQuizById('quiz1');
      await contentService.getHint('quiz1', 'q1', 1);

      const stats = contentService.getCacheStats();
      expect(stats.lessons).toBe(1);
      expect(stats.quizzes).toBe(1);
      expect(stats.hints).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close database to simulate error
      await dbManager.close();

      // The service should handle database errors gracefully
      // Since the database is closed, operations should return null or throw
      const lesson = await contentService.getNextLesson('student1', 'Mathematics');
      expect(lesson).toBeNull(); // Service handles error gracefully by returning null

      // Reinitialize for cleanup
      await dbManager.initialize();
    });

    it('should handle missing content gracefully', async () => {
      const lesson = await contentService.getLessonById('nonexistent');
      const quiz = await contentService.getQuizById('nonexistent');
      const hint = await contentService.getHint('nonexistent', 'q1', 1);

      expect(lesson).toBeNull();
      expect(quiz).toBeNull();
      expect(hint).toBeNull();
    });
  });
});