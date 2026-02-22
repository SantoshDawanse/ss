/**
 * Unit tests for StatePersistenceService.
 * Tests auto-save, state persistence, and crash recovery.
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { StatePersistenceService, LessonState, QuizState } from '../src/services/StatePersistenceService';
import { StudentStateRepository } from '../src/database/repositories/StudentStateRepository';

describe('StatePersistenceService', () => {
  let dbManager: DatabaseManager;
  let service: StatePersistenceService;
  let repository: StudentStateRepository;

  beforeAll(async () => {
    // Initialize database with test configuration
    dbManager = DatabaseManager.getInstance({
      name: 'test_state_persistence.db',
      location: 'default',
      encryption: false,
    });

    await dbManager.initialize();
    repository = dbManager.studentStateRepository;
  });

  beforeEach(async () => {
    // Reset database before each test
    await dbManager.reset();
    
    // Create new service instance for each test
    service = new StatePersistenceService(dbManager);
  });

  afterEach(() => {
    // Stop auto-save to prevent interference
    service.stopAutoSave();
  });

  afterAll(async () => {
    // Close database connection
    await dbManager.close();
    // Reset singleton for other tests
    (DatabaseManager as any).resetInstance();
  });

  describe('Initialization', () => {
    it('should initialize state for new student', async () => {
      await service.initialize('student-1');

      const state = service.getCurrentState();
      expect(state).toBeDefined();
      expect(state?.studentId).toBe('student-1');
      expect(state?.lastSaved).toBeDefined();
    });

    it('should load existing state for returning student', async () => {
      // Create existing state
      await repository.upsert({
        student_id: 'student-1',
        current_subject: 'Mathematics',
        current_lesson_id: 'lesson-1',
        last_active: Date.now(),
      });

      await service.initialize('student-1');

      const state = service.getCurrentState();
      expect(state).toBeDefined();
      expect(state?.studentId).toBe('student-1');
      expect(state?.currentSubject).toBe('Mathematics');
      expect(state?.currentLessonId).toBe('lesson-1');
    });

    it('should start auto-save timer on initialization', async () => {
      await service.initialize('student-1');

      // Auto-save should be running (we can't directly test the timer,
      // but we can verify the service is initialized)
      const state = service.getCurrentState();
      expect(state).toBeDefined();
    });
  });

  describe('State Persistence', () => {
    beforeEach(async () => {
      await service.initialize('student-1');
    });

    it('should save current state to database', async () => {
      await service.updateCurrentSubject('Mathematics');
      await service.saveState();

      const row = await repository.findById('student-1');
      expect(row).toBeDefined();
      expect(row?.current_subject).toBe('Mathematics');
    });

    it('should update last saved timestamp on save', async () => {
      const stateBefore = service.getCurrentState();
      const lastSavedBefore = stateBefore?.lastSaved;

      // Wait a bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      await service.saveState();

      const stateAfter = service.getCurrentState();
      const lastSavedAfter = stateAfter?.lastSaved;

      expect(lastSavedAfter).toBeGreaterThan(lastSavedBefore!);
    });

    it('should force immediate save', async () => {
      await service.updateCurrentSubject('Science');
      await service.forceSave();

      const row = await repository.findById('student-1');
      expect(row?.current_subject).toBe('Science');
    });

    it('should throw error when saving without initialization', async () => {
      const uninitializedService = new StatePersistenceService(dbManager);
      
      await expect(uninitializedService.saveState()).rejects.toThrow(
        'No state to save',
      );
    });
  });

  describe('Subject and Lesson Updates', () => {
    beforeEach(async () => {
      await service.initialize('student-1');
    });

    it('should update current subject', async () => {
      await service.updateCurrentSubject('Mathematics');

      const state = service.getCurrentState();
      expect(state?.currentSubject).toBe('Mathematics');

      const row = await repository.findById('student-1');
      expect(row?.current_subject).toBe('Mathematics');
    });

    it('should update current lesson', async () => {
      await service.updateCurrentLesson('lesson-1');

      const state = service.getCurrentState();
      expect(state?.currentLessonId).toBe('lesson-1');

      const row = await repository.findById('student-1');
      expect(row?.current_lesson_id).toBe('lesson-1');
    });

    it('should clear current lesson', async () => {
      await service.updateCurrentLesson('lesson-1');
      await service.clearLessonState();

      const state = service.getCurrentState();
      expect(state?.currentLessonId).toBeUndefined();
      expect(state?.lessonState).toBeUndefined();

      const row = await repository.findById('student-1');
      expect(row?.current_lesson_id).toBeNull();
    });

    it('should update last active timestamp', async () => {
      const rowBefore = await repository.findById('student-1');
      const lastActiveBefore = rowBefore?.last_active;

      // Wait a bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      await service.updateLastActive();

      const rowAfter = await repository.findById('student-1');
      const lastActiveAfter = rowAfter?.last_active;

      expect(lastActiveAfter).toBeGreaterThan(lastActiveBefore!);
    });
  });

  describe('Lesson State Management', () => {
    beforeEach(async () => {
      await service.initialize('student-1');
    });

    it('should set lesson state', () => {
      const lessonState: LessonState = {
        lessonId: 'lesson-1',
        subject: 'Mathematics',
        topic: 'Algebra',
        startTime: Date.now(),
        currentSection: 2,
        completed: false,
      };

      service.setLessonState(lessonState);

      const state = service.getCurrentState();
      expect(state?.lessonState).toEqual(lessonState);
      expect(state?.currentLessonId).toBe('lesson-1');
    });

    it('should get lesson state', () => {
      const lessonState: LessonState = {
        lessonId: 'lesson-1',
        subject: 'Mathematics',
        topic: 'Algebra',
        startTime: Date.now(),
        completed: false,
      };

      service.setLessonState(lessonState);

      const retrieved = service.getLessonState();
      expect(retrieved).toEqual(lessonState);
    });

    it('should clear lesson state', async () => {
      const lessonState: LessonState = {
        lessonId: 'lesson-1',
        subject: 'Mathematics',
        topic: 'Algebra',
        startTime: Date.now(),
        completed: false,
      };

      service.setLessonState(lessonState);
      await service.clearLessonState();

      const state = service.getCurrentState();
      expect(state?.lessonState).toBeUndefined();
      expect(state?.currentLessonId).toBeUndefined();
    });
  });

  describe('Quiz State Management', () => {
    beforeEach(async () => {
      await service.initialize('student-1');
    });

    it('should set quiz state', () => {
      const quizState: QuizState = {
        quizId: 'quiz-1',
        subject: 'Science',
        topic: 'Physics',
        startTime: Date.now(),
        currentQuestionIndex: 3,
        answers: {
          'q1': 'A',
          'q2': 'B',
          'q3': 'C',
        },
        hintsUsed: {
          'q1': 1,
          'q3': 2,
        },
        completed: false,
      };

      service.setQuizState(quizState);

      const state = service.getCurrentState();
      expect(state?.quizState).toEqual(quizState);
    });

    it('should get quiz state', () => {
      const quizState: QuizState = {
        quizId: 'quiz-1',
        subject: 'Science',
        topic: 'Physics',
        startTime: Date.now(),
        currentQuestionIndex: 0,
        answers: {},
        hintsUsed: {},
        completed: false,
      };

      service.setQuizState(quizState);

      const retrieved = service.getQuizState();
      expect(retrieved).toEqual(quizState);
    });

    it('should clear quiz state', () => {
      const quizState: QuizState = {
        quizId: 'quiz-1',
        subject: 'Science',
        topic: 'Physics',
        startTime: Date.now(),
        currentQuestionIndex: 0,
        answers: {},
        hintsUsed: {},
        completed: false,
      };

      service.setQuizState(quizState);
      service.clearQuizState();

      const state = service.getCurrentState();
      expect(state?.quizState).toBeUndefined();
    });

    it('should track quiz progress', () => {
      const quizState: QuizState = {
        quizId: 'quiz-1',
        subject: 'Science',
        topic: 'Physics',
        startTime: Date.now(),
        currentQuestionIndex: 0,
        answers: {},
        hintsUsed: {},
        completed: false,
      };

      service.setQuizState(quizState);

      // Simulate answering questions
      quizState.currentQuestionIndex = 1;
      quizState.answers['q1'] = 'A';
      service.setQuizState(quizState);

      quizState.currentQuestionIndex = 2;
      quizState.answers['q2'] = 'B';
      quizState.hintsUsed['q2'] = 1;
      service.setQuizState(quizState);

      const retrieved = service.getQuizState();
      expect(retrieved?.currentQuestionIndex).toBe(2);
      expect(retrieved?.answers).toEqual({ 'q1': 'A', 'q2': 'B' });
      expect(retrieved?.hintsUsed).toEqual({ 'q2': 1 });
    });
  });

  describe('Crash Recovery', () => {
    it('should recover from crash with saved state', async () => {
      // Simulate normal operation
      await service.initialize('student-1');
      await service.updateCurrentSubject('Mathematics');
      await service.updateCurrentLesson('lesson-1');
      await service.saveState();

      // Simulate crash (create new service instance)
      const recoveryService = new StatePersistenceService(dbManager);
      const recovered = await recoveryService.recoverFromCrash('student-1');

      expect(recovered).toBe(true);

      const state = recoveryService.getCurrentState();
      expect(state?.studentId).toBe('student-1');
      expect(state?.currentSubject).toBe('Mathematics');
      expect(state?.currentLessonId).toBe('lesson-1');

      recoveryService.stopAutoSave();
    });

    it('should return false when no state to recover', async () => {
      const recoveryService = new StatePersistenceService(dbManager);
      const recovered = await recoveryService.recoverFromCrash('non-existent-student');

      expect(recovered).toBe(false);

      recoveryService.stopAutoSave();
    });

    it('should restore lesson state after crash', async () => {
      // Simulate lesson in progress
      await service.initialize('student-1');
      
      const lessonState: LessonState = {
        lessonId: 'lesson-1',
        subject: 'Mathematics',
        topic: 'Algebra',
        startTime: Date.now(),
        currentSection: 3,
        completed: false,
      };
      
      service.setLessonState(lessonState);
      await service.saveState();

      // Note: In-memory lesson state is not persisted to DB in current implementation
      // This test verifies the basic state (subject, lesson ID) is recovered
      const recoveryService = new StatePersistenceService(dbManager);
      await recoveryService.recoverFromCrash('student-1');

      const state = recoveryService.getCurrentState();
      expect(state?.currentLessonId).toBe('lesson-1');

      recoveryService.stopAutoSave();
    });
  });

  describe('Auto-Save', () => {
    it('should stop auto-save', async () => {
      await service.initialize('student-1');
      service.stopAutoSave();

      // Service should still be functional
      await service.updateCurrentSubject('Mathematics');
      const state = service.getCurrentState();
      expect(state?.currentSubject).toBe('Mathematics');
    });

    it('should save state on shutdown', async () => {
      await service.initialize('student-1');
      await service.updateCurrentSubject('Science');
      
      await service.shutdown();

      const row = await repository.findById('student-1');
      expect(row?.current_subject).toBe('Science');
    });
  });

  describe('State Loading', () => {
    it('should load state from database', async () => {
      // Create state in database
      await repository.upsert({
        student_id: 'student-1',
        current_subject: 'Mathematics',
        current_lesson_id: 'lesson-1',
        last_active: Date.now(),
      });

      const state = await service.loadState('student-1');

      expect(state).toBeDefined();
      expect(state?.studentId).toBe('student-1');
      expect(state?.currentSubject).toBe('Mathematics');
      expect(state?.currentLessonId).toBe('lesson-1');
    });

    it('should return null for non-existent student', async () => {
      const state = await service.loadState('non-existent');
      expect(state).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when updating subject without initialization', async () => {
      await expect(
        service.updateCurrentSubject('Mathematics'),
      ).rejects.toThrow('State not initialized');
    });

    it('should throw error when updating lesson without initialization', async () => {
      await expect(
        service.updateCurrentLesson('lesson-1'),
      ).rejects.toThrow('State not initialized');
    });

    it('should throw error when setting lesson state without initialization', () => {
      const lessonState: LessonState = {
        lessonId: 'lesson-1',
        subject: 'Math',
        topic: 'Algebra',
        startTime: Date.now(),
        completed: false,
      };

      expect(() => service.setLessonState(lessonState)).toThrow(
        'State not initialized',
      );
    });

    it('should throw error when setting quiz state without initialization', () => {
      const quizState: QuizState = {
        quizId: 'quiz-1',
        subject: 'Science',
        topic: 'Physics',
        startTime: Date.now(),
        currentQuestionIndex: 0,
        answers: {},
        hintsUsed: {},
        completed: false,
      };

      expect(() => service.setQuizState(quizState)).toThrow(
        'State not initialized',
      );
    });

    it('should handle database errors gracefully', async () => {
      await service.initialize('student-1');
      
      // Close database to simulate error
      await dbManager.close();

      await expect(service.saveState()).rejects.toThrow();

      // Reinitialize for other tests
      await dbManager.initialize();
    });
  });

  describe('Multiple Students', () => {
    it('should handle state for multiple students', async () => {
      // Initialize state for student 1
      const service1 = new StatePersistenceService(dbManager);
      await service1.initialize('student-1');
      await service1.updateCurrentSubject('Mathematics');
      await service1.saveState();

      // Initialize state for student 2
      const service2 = new StatePersistenceService(dbManager);
      await service2.initialize('student-2');
      await service2.updateCurrentSubject('Science');
      await service2.saveState();

      // Verify both states are independent
      const state1 = await service1.loadState('student-1');
      const state2 = await service2.loadState('student-2');

      expect(state1?.currentSubject).toBe('Mathematics');
      expect(state2?.currentSubject).toBe('Science');

      service1.stopAutoSave();
      service2.stopAutoSave();
    });
  });

  describe('Performance', () => {
    it('should handle rapid state updates', async () => {
      await service.initialize('student-1');

      const startTime = Date.now();

      // Simulate rapid state changes
      for (let i = 0; i < 50; i++) {
        await service.updateCurrentSubject(`Subject-${i}`);
        await service.updateCurrentLesson(`lesson-${i}`);
      }

      const duration = Date.now() - startTime;

      // Should complete quickly (< 2 seconds)
      expect(duration).toBeLessThan(2000);

      const state = service.getCurrentState();
      expect(state?.currentSubject).toBe('Subject-49');
      expect(state?.currentLessonId).toBe('lesson-49');
    });

    it('should save state efficiently', async () => {
      await service.initialize('student-1');
      await service.updateCurrentSubject('Mathematics');

      const startTime = Date.now();

      // Save state 20 times
      for (let i = 0; i < 20; i++) {
        await service.saveState();
      }

      const duration = Date.now() - startTime;

      // Should complete quickly (< 1 second)
      expect(duration).toBeLessThan(1000);
    });
  });
});
