/**
 * Content Delivery Service for Local Brain.
 * Handles offline content delivery with preloading and caching.
 * Requirements: 3.1, 3.7
 */

import { DatabaseManager } from '../database/DatabaseManager';
import { Lesson, Quiz, Hint, Question } from '../models';

interface ContentCache {
  lessons: Map<string, Lesson>;
  quizzes: Map<string, Quiz>;
  hints: Map<string, Hint[]>;
}

export interface QuizFeedback {
  correct: boolean;
  explanation: string;
  nextHintLevel?: number;
  encouragement: string;
}

export class ContentDeliveryService {
  private dbManager: DatabaseManager;
  private cache: ContentCache;
  private preloadQueue: string[] = [];

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
    this.cache = {
      lessons: new Map(),
      quizzes: new Map(),
      hints: new Map(),
    };
  }

  /**
   * Get the next lesson for a student in a subject with preloading.
   * Requirement 3.1: Deliver lessons from synchronized bundles without connectivity
   */
  async getNextLesson(studentId: string, subject: string): Promise<Lesson | null> {
    try {
      // Get active bundle for student
      const activeBundleId = await this.getActiveBundleId(studentId);
      if (!activeBundleId) {
        return null;
      }

      // Get all lessons for subject from active bundle
      const lessons = await this.dbManager.lessonRepository.findByBundleAndSubject(
        activeBundleId,
        subject
      );

      if (lessons.length === 0) {
        return null;
      }

      // Get the first lesson (study track ordering handled by bundle generation)
      const nextLessonRow = lessons[0];

      // Check cache first
      if (this.cache.lessons.has(nextLessonRow.lesson_id)) {
        const cachedLesson = this.cache.lessons.get(nextLessonRow.lesson_id)!;
        
        // Preload next 3 lessons in background
        this.preloadNextLessons(lessons.slice(1, 4).map(l => ({ lessonId: l.lesson_id })));
        
        return cachedLesson;
      }

      // Load lesson from database and parse
      const lessonRow = await this.dbManager.lessonRepository.findById(nextLessonRow.lesson_id);
      if (!lessonRow) {
        return null;
      }

      const lesson = this.dbManager.lessonRepository.parseLesson(lessonRow);

      // Cache the lesson
      this.cache.lessons.set(lesson.lessonId, lesson);

      // Preload next 3 lessons in background
      this.preloadNextLessons(lessons.slice(1, 4).map(l => ({ lessonId: l.lesson_id })));

      return lesson;
    } catch (error) {
      console.error('Error getting next lesson:', error);
      throw error;
    }
  }

  /**
   * Get the next quiz for a student in a subject.
   * Requirement 3.1: Administer quizzes from synchronized bundles
   */
  async getNextQuiz(studentId: string, subject: string): Promise<Quiz | null> {
    try {
      // Get active bundle for student
      const activeBundleId = await this.getActiveBundleId(studentId);
      if (!activeBundleId) {
        return null;
      }

      // Get all quizzes for subject from active bundle
      const quizzes = await this.dbManager.quizRepository.findByBundleAndSubject(
        activeBundleId,
        subject
      );

      if (quizzes.length === 0) {
        return null;
      }

      // Get the first quiz
      const nextQuiz = quizzes[0];

      // Check cache first
      if (this.cache.quizzes.has(nextQuiz.quizId)) {
        return this.cache.quizzes.get(nextQuiz.quizId)!;
      }

      // Load quiz from database and parse
      const quizRow = await this.dbManager.quizRepository.findById(nextQuiz.quizId);
      if (!quizRow) {
        return null;
      }

      const quiz = this.dbManager.quizRepository.parseQuiz(quizRow);

      // Cache the quiz
      this.cache.quizzes.set(quiz.quizId, quiz);

      return quiz;
    } catch (error) {
      console.error('Error getting next quiz:', error);
      throw error;
    }
  }

  /**
   * Get a hint for a quiz question with progressive hint levels.
   * Requirement 3.7: Provide immediate feedback using pre-synchronized hints
   */
  async getHint(
    quizId: string,
    questionId: string,
    level: number
  ): Promise<Hint | null> {
    try {
      // Validate hint level (1-3)
      if (level < 1 || level > 3) {
        throw new Error('Hint level must be between 1 and 3');
      }

      // Check cache first
      const cacheKey = `${quizId}-${questionId}`;
      if (this.cache.hints.has(cacheKey)) {
        const hints = this.cache.hints.get(cacheKey)!;
        const hint = hints.find((h) => h.level === level);
        if (hint) {
          return hint;
        }
      }

      // Load hints from database
      const hintRows = await this.dbManager.hintRepository.findByQuizAndQuestion(quizId, questionId);
      
      if (hintRows.length === 0) {
        return null;
      }

      // Convert rows to Hint objects
      const hints: Hint[] = hintRows.map(row => ({
        hintId: row.hint_id,
        level: row.level,
        text: row.hint_text,
      }));

      // Cache all hints for this question
      this.cache.hints.set(cacheKey, hints);

      // Return the requested hint level
      const hint = hints.find((h) => h.level === level);
      return hint || null;
    } catch (error) {
      console.error('Error getting hint:', error);
      throw error;
    }
  }

  /**
   * Get a specific lesson by ID with caching.
   */
  async getLessonById(lessonId: string): Promise<Lesson | null> {
    try {
      // Check cache first
      if (this.cache.lessons.has(lessonId)) {
        return this.cache.lessons.get(lessonId)!;
      }

      // Load from database
      const lessonRow = await this.dbManager.lessonRepository.findById(lessonId);
      if (lessonRow) {
        const lesson = this.dbManager.lessonRepository.parseLesson(lessonRow);
        this.cache.lessons.set(lessonId, lesson);
        return lesson;
      }

      return null;
    } catch (error) {
      console.error('Error getting lesson by ID:', error);
      throw error;
    }
  }

  /**
   * Get a specific quiz by ID with caching.
   */
  async getQuizById(quizId: string): Promise<Quiz | null> {
    try {
      // Check cache first
      if (this.cache.quizzes.has(quizId)) {
        return this.cache.quizzes.get(quizId)!;
      }

      // Load from database
      const quizRow = await this.dbManager.quizRepository.findById(quizId);
      if (quizRow) {
        const quiz = this.dbManager.quizRepository.parseQuiz(quizRow);
        this.cache.quizzes.set(quizId, quiz);
        return quiz;
      }

      return null;
    } catch (error) {
      console.error('Error getting quiz by ID:', error);
      throw error;
    }
  }

  /**
   * Validate a quiz answer and provide feedback.
   * Requirement 3.7: Provide immediate feedback
   */
  async validateAnswer(
    quizId: string,
    questionId: string,
    answer: string,
    hintsUsed: number = 0
  ): Promise<QuizFeedback> {
    try {
      // Get the quiz
      const quiz = await this.getQuizById(quizId);
      if (!quiz) {
        throw new Error('Quiz not found');
      }

      // Find the question
      const question = quiz.questions.find((q) => q.questionId === questionId);
      if (!question) {
        throw new Error('Question not found');
      }

      // Check if answer is correct
      const correct = this.isAnswerCorrect(answer, question.correctAnswer, question.type);

      // Generate encouragement message
      const encouragement = this.generateEncouragement(correct, hintsUsed);

      // Determine next hint level if incorrect
      const nextHintLevel = !correct && hintsUsed < 3 ? hintsUsed + 1 : undefined;

      return {
        correct,
        explanation: question.explanation,
        nextHintLevel,
        encouragement,
      };
    } catch (error) {
      console.error('Error validating answer:', error);
      throw error;
    }
  }

  /**
   * Clear the content cache to free memory.
   */
  clearCache(): void {
    this.cache.lessons.clear();
    this.cache.quizzes.clear();
    this.cache.hints.clear();
    this.preloadQueue = [];
  }

  /**
   * Get cache statistics for monitoring.
   */
  getCacheStats(): { lessons: number; quizzes: number; hints: number } {
    return {
      lessons: this.cache.lessons.size,
      quizzes: this.cache.quizzes.size,
      hints: this.cache.hints.size,
    };
  }

  // Private helper methods

  private async getActiveBundleId(studentId: string): Promise<string | null> {
    try {
      const result = await this.dbManager.executeSql(
        `SELECT bundle_id FROM learning_bundles 
         WHERE student_id = ? AND status = 'active' 
         ORDER BY valid_from DESC LIMIT 1`,
        [studentId]
      );

      if (result.length === 0) {
        return null;
      }

      return result[0].bundle_id;
    } catch (error) {
      console.error('Error getting active bundle ID:', error);
      return null;
    }
  }

  private async preloadNextLessons(lessons: Array<{ lessonId: string }>): Promise<void> {
    // Add to preload queue
    for (const lesson of lessons) {
      if (!this.cache.lessons.has(lesson.lessonId) && 
          !this.preloadQueue.includes(lesson.lessonId)) {
        this.preloadQueue.push(lesson.lessonId);
      }
    }

    // Process preload queue asynchronously
    this.processPreloadQueue();
  }

  private async processPreloadQueue(): Promise<void> {
    // Process one lesson at a time to avoid blocking
    if (this.preloadQueue.length === 0) {
      return;
    }

    const lessonId = this.preloadQueue.shift();
    if (!lessonId) {
      return;
    }

    try {
      const lessonRow = await this.dbManager.lessonRepository.findById(lessonId);
      if (lessonRow) {
        const lesson = this.dbManager.lessonRepository.parseLesson(lessonRow);
        this.cache.lessons.set(lessonId, lesson);
      }
    } catch (error) {
      console.error('Error preloading lesson:', error);
    }

    // Continue processing queue
    if (this.preloadQueue.length > 0) {
      setTimeout(() => this.processPreloadQueue(), 100);
    }
  }

  private isAnswerCorrect(
    userAnswer: string,
    correctAnswer: string,
    questionType: string
  ): boolean {
    // Normalize answers for comparison
    const normalizedUser = userAnswer.trim().toLowerCase();
    const normalizedCorrect = correctAnswer.trim().toLowerCase();

    switch (questionType) {
      case 'multiple_choice':
      case 'true_false':
        return normalizedUser === normalizedCorrect;
      
      case 'short_answer':
        // For short answers, allow some flexibility
        return (
          normalizedUser === normalizedCorrect ||
          normalizedUser.includes(normalizedCorrect) ||
          normalizedCorrect.includes(normalizedUser)
        );
      
      default:
        return normalizedUser === normalizedCorrect;
    }
  }

  private generateEncouragement(correct: boolean, hintsUsed: number): string {
    if (correct) {
      if (hintsUsed === 0) {
        return 'Excellent! You got it right on your own!';
      } else if (hintsUsed === 1) {
        return 'Great job! You figured it out with a little help.';
      } else {
        return 'Well done! Keep practicing to improve.';
      }
    } else {
      if (hintsUsed === 0) {
        return 'Not quite right. Would you like a hint?';
      } else if (hintsUsed < 3) {
        return 'Keep trying! Would you like another hint?';
      } else {
        return 'Let\'s review the explanation and try again later.';
      }
    }
  }
}
