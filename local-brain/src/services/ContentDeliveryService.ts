/**
 * Content Delivery Service for Local Brain.
 * Handles offline content delivery with preloading and caching.
 * Requirements: 17.1-17.7, 18.1-18.7, 19.1-19.7, 29.1-29.7
 */

import { DatabaseManager } from '../database/DatabaseManager';
import { Lesson, Quiz, Hint, Question, StudyTrack } from '../models';
import { HintRow } from '../database/repositories/HintRepository';

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
  private isProcessingQueue = false;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
    this.cache = {
      lessons: new Map(),
      quizzes: new Map(),
      hints: new Map(),
    };
  }

  /**
   * Get the next lesson for a student in a subject following Study Track order.
   * Requirements: 17.1-17.2, 17.3-17.4, 29.1-29.7
   */
  async getNextLesson(studentId: string, subject: string): Promise<Lesson | null> {
    try {
      // Get active bundle for student
      const activeBundleId = await this.getActiveBundleId(studentId);
      if (!activeBundleId) {
        return null;
      }

      // Get study track for this subject to determine lesson order
      const studyTrackRow = await this.dbManager.studyTrackRepository.findByBundleAndSubject(
        activeBundleId,
        subject
      );

      let nextLessonId: string | null = null;

      if (studyTrackRow) {
        // Follow study track order
        const studyTrack = this.dbManager.studyTrackRepository.parseTrack(studyTrackRow);
        nextLessonId = this.getNextLessonFromStudyTrack(studyTrack);
      } else {
        // Fallback: get first lesson from bundle
        const lessons = await this.dbManager.lessonRepository.findByBundleAndSubject(
          activeBundleId,
          subject
        );
        if (lessons.length > 0) {
          nextLessonId = lessons[0].lesson_id;
        }
      }

      if (!nextLessonId) {
        return null;
      }

      // Get lesson with caching
      const lesson = await this.getLessonById(nextLessonId);
      
      if (lesson) {
        // Preload next 3 lessons in background
        await this.preloadNextLessonsFromStudyTrack(activeBundleId, subject, nextLessonId);
      }

      return lesson;
    } catch (error) {
      console.error('Error getting next lesson:', error);
      throw error;
    }
  }

  /**
   * Get the next quiz for a student in a subject.
   * Requirements: 17.1, 17.5-17.6
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
      const nextQuizId = quizzes[0].quizId;

      // Get quiz with caching
      return await this.getQuizById(nextQuizId);
    } catch (error) {
      console.error('Error getting next quiz:', error);
      throw error;
    }
  }

  /**
   * Get a hint for a quiz question with progressive hint levels.
   * Requirements: 18.1-18.7
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
        return hint || null;
      }

      // Load hints from database
      const hintRows = await this.dbManager.hintRepository.findByQuizAndQuestion(quizId, questionId);
      
      if (hintRows.length === 0) {
        return null;
      }

      // Convert rows to Hint objects
      const hints: Hint[] = hintRows.map(row => this.dbManager.hintRepository.mapRowToHint(row));

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
   * Requirements: 17.3, 17.6
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
        // Cache the lesson immediately on access
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
   * Requirements: 17.6
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
        // Cache quizzes on first access
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
   * Requirements: 19.1-19.7
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

      // Determine next hint level if incorrect and hints available
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
   * Requirements: 17.3-17.4
   */
  clearCache(): void {
    this.cache.lessons.clear();
    this.cache.quizzes.clear();
    this.cache.hints.clear();
    this.preloadQueue = [];
  }

  /**
   * Get cache statistics for monitoring.
   * Requirements: 17.3-17.4
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

  /**
   * Get the next lesson ID from study track order.
   * Requirements: 29.1-29.7
   */
  private getNextLessonFromStudyTrack(studyTrack: StudyTrack): string | null {
    // For now, return the first lesson from the first day of the first week
    // In a real implementation, this would track student progress
    if (studyTrack.weeks.length === 0) {
      return null;
    }

    const firstWeek = studyTrack.weeks[0];
    if (firstWeek.days.length === 0) {
      return null;
    }

    const firstDay = firstWeek.days[0];
    if (firstDay.lessonIds.length === 0) {
      return null;
    }

    return firstDay.lessonIds[0];
  }

  /**
   * Preload next 3 lessons based on study track order.
   * Requirements: 17.4
   */
  private async preloadNextLessonsFromStudyTrack(
    bundleId: string,
    subject: string,
    currentLessonId: string
  ): Promise<void> {
    try {
      // Get study track
      const studyTrackRow = await this.dbManager.studyTrackRepository.findByBundleAndSubject(
        bundleId,
        subject
      );

      if (!studyTrackRow) {
        // Fallback to simple lesson preloading
        const lessons = await this.dbManager.lessonRepository.findByBundleAndSubject(bundleId, subject);
        const currentIndex = lessons.findIndex(l => l.lesson_id === currentLessonId);
        if (currentIndex >= 0) {
          const nextLessons = lessons.slice(currentIndex + 1, currentIndex + 4);
          await this.preloadLessons(nextLessons.map(l => l.lesson_id));
        }
        return;
      }

      const studyTrack = this.dbManager.studyTrackRepository.parseTrack(studyTrackRow);
      const nextLessonIds = this.getNextLessonIdsFromStudyTrack(studyTrack, currentLessonId, 3);
      await this.preloadLessons(nextLessonIds);
    } catch (error) {
      console.error('Error preloading lessons from study track:', error);
    }
  }

  /**
   * Get next N lesson IDs from study track after current lesson.
   */
  private getNextLessonIdsFromStudyTrack(
    studyTrack: StudyTrack,
    currentLessonId: string,
    count: number
  ): string[] {
    const allLessonIds: string[] = [];
    
    // Flatten all lesson IDs from study track
    for (const week of studyTrack.weeks) {
      for (const day of week.days) {
        allLessonIds.push(...day.lessonIds);
      }
    }

    // Find current lesson index
    const currentIndex = allLessonIds.indexOf(currentLessonId);
    if (currentIndex === -1) {
      return allLessonIds.slice(0, count); // Return first N lessons if current not found
    }

    // Return next N lessons
    return allLessonIds.slice(currentIndex + 1, currentIndex + 1 + count);
  }

  /**
   * Preload lessons by IDs.
   * Requirements: 17.4
   */
  private async preloadLessons(lessonIds: string[]): Promise<void> {
    // Add to preload queue
    for (const lessonId of lessonIds) {
      if (!this.cache.lessons.has(lessonId) && !this.preloadQueue.includes(lessonId)) {
        this.preloadQueue.push(lessonId);
      }
    }

    // Process preload queue asynchronously
    if (!this.isProcessingQueue) {
      this.processPreloadQueue();
    }
  }

  private async preloadNextLessons(lessons: Array<{ lessonId: string }>): Promise<void> {
    const lessonIds = lessons.map(l => l.lessonId);
    await this.preloadLessons(lessonIds);
  }

  private async processPreloadQueue(): Promise<void> {
    if (this.isProcessingQueue || this.preloadQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      // Process one lesson at a time to avoid blocking
      while (this.preloadQueue.length > 0) {
        const lessonId = this.preloadQueue.shift();
        if (!lessonId) {
          break;
        }

        try {
          // Skip if already cached
          if (this.cache.lessons.has(lessonId)) {
            continue;
          }

          const lessonRow = await this.dbManager.lessonRepository.findById(lessonId);
          if (lessonRow) {
            const lesson = this.dbManager.lessonRepository.parseLesson(lessonRow);
            this.cache.lessons.set(lessonId, lesson);
          }
        } catch (error) {
          console.error('Error preloading lesson:', error);
        }

        // Small delay to avoid blocking
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Check if user answer is correct based on question type.
   * Requirements: 19.2-19.3
   */
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
        // Case-insensitive exact match
        return normalizedUser === normalizedCorrect;
      
      case 'short_answer':
        // Partial/substring matching for short answers
        return (
          normalizedUser === normalizedCorrect ||
          normalizedUser.includes(normalizedCorrect) ||
          normalizedCorrect.includes(normalizedUser)
        );
      
      default:
        return normalizedUser === normalizedCorrect;
    }
  }

  /**
   * Generate contextual encouragement based on correctness and hints used.
   * Requirements: 19.6
   */
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
