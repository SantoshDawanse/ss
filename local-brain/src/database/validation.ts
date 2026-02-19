/**
 * Simple validation script to verify database layer implementation.
 * This file checks that all components are properly structured.
 */

import { DatabaseManager } from './DatabaseManager';
import {
  LearningBundleRepository,
  LessonRepository,
  QuizRepository,
  HintRepository,
  PerformanceLogRepository,
  SyncSessionRepository,
  StudentStateRepository,
  StudyTrackRepository,
} from './repositories';

/**
 * Validate that all database components are properly exported and structured.
 */
export function validateDatabaseLayer(): boolean {
  try {
    // Check DatabaseManager
    const dbManager = DatabaseManager.getInstance();
    console.log('✓ DatabaseManager instantiated');

    // Check all repositories can be instantiated
    const bundleRepo = new LearningBundleRepository();
    const lessonRepo = new LessonRepository();
    const quizRepo = new QuizRepository();
    const hintRepo = new HintRepository();
    const logRepo = new PerformanceLogRepository();
    const syncRepo = new SyncSessionRepository();
    const stateRepo = new StudentStateRepository();
    const trackRepo = new StudyTrackRepository();

    console.log('✓ All repositories instantiated');

    // Check that repositories have required methods
    const requiredMethods = ['findById', 'findAll', 'deleteById', 'count'];
    const repos = [
      bundleRepo,
      lessonRepo,
      quizRepo,
      hintRepo,
      logRepo,
      syncRepo,
      stateRepo,
      trackRepo,
    ];

    for (const repo of repos) {
      for (const method of requiredMethods) {
        if (typeof (repo as any)[method] !== 'function') {
          throw new Error(`Repository missing method: ${method}`);
        }
      }
    }

    console.log('✓ All repositories have required methods');

    return true;
  } catch (error) {
    console.error('✗ Validation failed:', error);
    return false;
  }
}

// Export for testing
export default validateDatabaseLayer;
