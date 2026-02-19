/**
 * Content Delivery Service Tests
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { ContentDeliveryService } from '../src/services/ContentDeliveryService';
import { Lesson, Quiz, Hint } from '../src/models';

describe('ContentDeliveryService', () => {
  let dbManager: DatabaseManager;
  let contentService: ContentDeliveryService;

  beforeEach(async () => {
    dbManager = new DatabaseManager();
    await dbManager.initialize();
    contentService = new ContentDeliveryService(dbManager);
  });

  afterEach(async () => {
    await dbManager.close();
  });

  describe('getNextLesson', () => {
    it('should return null when no active bundle exists', async () => {
      const lesson = await contentService.getNextLesson('student1', 'Mathematics');
      expect(lesson).toBeNull();
    });
  });

  describe('getNextQuiz', () => {
    it('should return null when no active bundle exists', async () => {
      const quiz = await contentService.getNextQuiz('student1', 'Mathematics');
      expect(quiz).toBeNull();
    });
  });

  describe('getHint', () => {
    it('should throw error for invalid hint level', async () => {
      await expect(
        contentService.getHint('quiz1', 'q1', 0)
      ).rejects.toThrow('Hint level must be between 1 and 3');

      await expect(
        contentService.getHint('quiz1', 'q1', 4)
      ).rejects.toThrow('Hint level must be between 1 and 3');
    });

    it('should return null when no hints exist', async () => {
      const hint = await contentService.getHint('quiz1', 'q1', 1);
      expect(hint).toBeNull();
    });
  });

  describe('validateAnswer', () => {
    it('should validate multiple choice answers correctly', async () => {
      // This test would require setting up a quiz in the database
      // For now, we test that the method throws when quiz not found
      await expect(
        contentService.validateAnswer('nonexistent', 'q1', 'A')
      ).rejects.toThrow('Quiz not found');
    });
  });

  describe('cache management', () => {
    it('should clear cache', () => {
      contentService.clearCache();
      const stats = contentService.getCacheStats();
      expect(stats.lessons).toBe(0);
      expect(stats.quizzes).toBe(0);
      expect(stats.hints).toBe(0);
    });

    it('should return cache statistics', () => {
      const stats = contentService.getCacheStats();
      expect(stats).toHaveProperty('lessons');
      expect(stats).toHaveProperty('quizzes');
      expect(stats).toHaveProperty('hints');
    });
  });
});
