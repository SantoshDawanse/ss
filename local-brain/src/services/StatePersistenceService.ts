/**
 * StatePersistenceService handles automatic state persistence and crash recovery
 * for the Local Brain.
 * 
 * Features:
 * - Auto-save student progress every 30 seconds
 * - Persist current lesson/quiz state
 * - Crash recovery logic
 * - Aggressive state persistence for data protection
 */

import { StudentState } from '../models';
import { StudentStateRepository, StudentStateRow } from '../database/repositories/StudentStateRepository';
import { DatabaseManager } from '../database/DatabaseManager';

export interface LessonState {
  lessonId: string;
  subject: string;
  topic: string;
  startTime: number;
  currentSection?: number;
  completed: boolean;
}

export interface QuizState {
  quizId: string;
  subject: string;
  topic: string;
  startTime: number;
  currentQuestionIndex: number;
  answers: Record<string, string>; // questionId -> answer
  hintsUsed: Record<string, number>; // questionId -> hint count
  completed: boolean;
}

export interface AppState {
  studentId: string;
  currentSubject?: string;
  currentLessonId?: string;
  lessonState?: LessonState;
  quizState?: QuizState;
  lastSaved: number;
}

/**
 * Service for managing state persistence and crash recovery.
 */
export class StatePersistenceService {
  private dbManager: DatabaseManager;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private currentState: AppState | null = null;
  private readonly AUTO_SAVE_INTERVAL_MS = 30000; // 30 seconds

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * Initialize state persistence for a student.
   * Starts auto-save timer.
   */
  public async initialize(studentId: string): Promise<void> {
    try {
      // Load existing state or create new
      const existingState = await this.loadState(studentId);
      
      if (existingState) {
        this.currentState = existingState;
        console.log('Loaded existing state for student:', studentId);
      } else {
        this.currentState = {
          studentId,
          lastSaved: Date.now(),
        };
        await this.saveState();
        console.log('Created new state for student:', studentId);
      }

      // Start auto-save timer
      this.startAutoSave();
    } catch (error) {
      console.error('Failed to initialize state persistence:', error);
      throw new Error(`State initialization failed: ${error}`);
    }
  }

  /**
   * Start auto-save timer (saves every 30 seconds).
   */
  private startAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    this.autoSaveInterval = setInterval(async () => {
      try {
        await this.saveState();
        console.log('Auto-save completed');
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, this.AUTO_SAVE_INTERVAL_MS);

    console.log('Auto-save started (every 30 seconds)');
  }

  /**
   * Stop auto-save timer.
   */
  public stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
      console.log('Auto-save stopped');
    }
  }

  /**
   * Save current state to database.
   */
  public async saveState(): Promise<void> {
    if (!this.currentState) {
      throw new Error('No state to save. Call initialize() first.');
    }

    try {
      const state: StudentState = {
        studentId: this.currentState.studentId,
        currentSubject: this.currentState.currentSubject,
        currentLessonId: this.currentState.currentLessonId,
        lastActive: new Date(),
      };

      await this.dbManager.studentStateRepository.upsert(state);
      
      // Update last saved timestamp
      this.currentState.lastSaved = Date.now();
      
      console.log('State saved successfully');
    } catch (error) {
      console.error('Failed to save state:', error);
      throw new Error(`State save failed: ${error}`);
    }
  }

  /**
   * Load state from database for crash recovery.
   */
  public async loadState(studentId: string): Promise<AppState | null> {
    try {
      const row = await this.dbManager.studentStateRepository.findById(studentId);
      
      if (!row) {
        return null;
      }

      const state: AppState = {
        studentId: row.student_id,
        currentSubject: row.current_subject || undefined,
        currentLessonId: row.current_lesson_id || undefined,
        lastSaved: row.last_active,
      };

      return state;
    } catch (error) {
      console.error('Failed to load state:', error);
      throw new Error(`State load failed: ${error}`);
    }
  }

  /**
   * Update current subject.
   */
  public async updateCurrentSubject(subject: string): Promise<void> {
    if (!this.currentState) {
      throw new Error('State not initialized');
    }

    try {
      this.currentState.currentSubject = subject;
      await this.dbManager.studentStateRepository.updateCurrentSubject(this.currentState.studentId, subject);
      console.log('Current subject updated:', subject);
    } catch (error) {
      console.error('Failed to update current subject:', error);
      throw new Error(`Subject update failed: ${error}`);
    }
  }

  /**
   * Update current lesson.
   */
  public async updateCurrentLesson(lessonId: string | null): Promise<void> {
    if (!this.currentState) {
      throw new Error('State not initialized');
    }

    try {
      this.currentState.currentLessonId = lessonId || undefined;
      await this.dbManager.studentStateRepository.updateCurrentLesson(this.currentState.studentId, lessonId);
      console.log('Current lesson updated:', lessonId);
    } catch (error) {
      console.error('Failed to update current lesson:', error);
      throw new Error(`Lesson update failed: ${error}`);
    }
  }

  /**
   * Set lesson state (for in-progress lessons).
   */
  public setLessonState(lessonState: LessonState): void {
    if (!this.currentState) {
      throw new Error('State not initialized');
    }

    this.currentState.lessonState = lessonState;
    this.currentState.currentLessonId = lessonState.lessonId;
    console.log('Lesson state set:', lessonState.lessonId);
  }

  /**
   * Set quiz state (for in-progress quizzes).
   */
  public setQuizState(quizState: QuizState): void {
    if (!this.currentState) {
      throw new Error('State not initialized');
    }

    this.currentState.quizState = quizState;
    console.log('Quiz state set:', quizState.quizId);
  }

  /**
   * Clear lesson state (when lesson is completed).
   */
  public async clearLessonState(): Promise<void> {
    if (!this.currentState) {
      throw new Error('State not initialized');
    }

    this.currentState.lessonState = undefined;
    this.currentState.currentLessonId = undefined;
    await this.dbManager.studentStateRepository.clearCurrentLesson(this.currentState.studentId);
    console.log('Lesson state cleared');
  }

  /**
   * Clear quiz state (when quiz is completed).
   */
  public clearQuizState(): void {
    if (!this.currentState) {
      throw new Error('State not initialized');
    }

    this.currentState.quizState = undefined;
    console.log('Quiz state cleared');
  }

  /**
   * Get current state.
   */
  public getCurrentState(): AppState | null {
    return this.currentState;
  }

  /**
   * Get lesson state.
   */
  public getLessonState(): LessonState | undefined {
    return this.currentState?.lessonState;
  }

  /**
   * Get quiz state.
   */
  public getQuizState(): QuizState | undefined {
    return this.currentState?.quizState;
  }

  /**
   * Recover from crash by loading last saved state.
   * Returns true if recovery was successful, false if no state to recover.
   */
  public async recoverFromCrash(studentId: string): Promise<boolean> {
    try {
      const savedState = await this.loadState(studentId);
      
      if (!savedState) {
        console.log('No saved state found for crash recovery');
        return false;
      }

      this.currentState = savedState;
      
      // Restart auto-save
      this.startAutoSave();
      
      console.log('Crash recovery successful. Restored state from:', new Date(savedState.lastSaved));
      return true;
    } catch (error) {
      console.error('Crash recovery failed:', error);
      throw new Error(`Crash recovery failed: ${error}`);
    }
  }

  /**
   * Force immediate save (for critical moments like app backgrounding).
   */
  public async forceSave(): Promise<void> {
    try {
      await this.saveState();
      console.log('Force save completed');
    } catch (error) {
      console.error('Force save failed:', error);
      throw new Error(`Force save failed: ${error}`);
    }
  }

  /**
   * Update last active timestamp.
   */
  public async updateLastActive(): Promise<void> {
    if (!this.currentState) {
      throw new Error('State not initialized');
    }

    try {
      await this.dbManager.studentStateRepository.updateLastActive(this.currentState.studentId);
      console.log('Last active timestamp updated');
    } catch (error) {
      console.error('Failed to update last active:', error);
      throw new Error(`Last active update failed: ${error}`);
    }
  }

  /**
   * Cleanup and shutdown.
   * Saves state one final time and stops auto-save.
   */
  public async shutdown(): Promise<void> {
    try {
      // Stop auto-save
      this.stopAutoSave();
      
      // Final save
      if (this.currentState) {
        await this.saveState();
      }
      
      console.log('State persistence service shutdown complete');
    } catch (error) {
      console.error('Shutdown failed:', error);
      throw new Error(`Shutdown failed: ${error}`);
    }
  }
}
