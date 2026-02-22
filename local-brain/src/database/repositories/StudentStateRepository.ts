/**
 * Repository for student_state table operations.
 */

import { BaseRepository } from './BaseRepository';
import { StudentState } from '../../models';

export interface StudentStateRow {
  student_id: string;
  current_subject: string | null;
  current_lesson_id: string | null;
  last_active: number;
}

export class StudentStateRepository extends BaseRepository<StudentStateRow> {
  constructor() {
    super('student_state');
  }

  protected getIdColumn(): string {
    return 'student_id';
  }

  /**
   * Create or update student state (upsert).
   * Accepts both StudentState (with Date) and StudentStateRow (with number timestamp).
   */
  public async upsert(state: StudentState | StudentStateRow): Promise<void> {
    try {
      // Handle both StudentState and StudentStateRow formats
      const studentId = 'studentId' in state ? state.studentId : state.student_id;
      const currentSubject = 'currentSubject' in state ? state.currentSubject : state.current_subject;
      const currentLessonId = 'currentLessonId' in state ? state.currentLessonId : state.current_lesson_id;
      const lastActive = 'lastActive' in state 
        ? (typeof state.lastActive === 'number' ? state.lastActive : state.lastActive.getTime())
        : state.last_active;
        
      await this.execute(
        `INSERT INTO ${this.tableName} 
        (student_id, current_subject, current_lesson_id, last_active)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(student_id) DO UPDATE SET
          current_subject = excluded.current_subject,
          current_lesson_id = excluded.current_lesson_id,
          last_active = excluded.last_active`,
        [
          studentId,
          currentSubject || null,
          currentLessonId || null,
          lastActive,
        ],
      );
    } catch (error) {
      console.error('Error upserting student state:', error);
      throw new Error(`Failed to upsert student state: ${error}`);
    }
  }

  /**
   * Update current subject.
   */
  public async updateCurrentSubject(
    studentId: string,
    subject: string,
  ): Promise<void> {
    try {
      const now = Date.now();
      await this.execute(
        `UPDATE ${this.tableName} 
        SET current_subject = ?, last_active = ? 
        WHERE student_id = ?`,
        [subject, now, studentId],
      );
    } catch (error) {
      console.error('Error updating current subject:', error);
      throw new Error(`Failed to update current subject: ${error}`);
    }
  }

  /**
   * Update current lesson.
   */
  public async updateCurrentLesson(
    studentId: string,
    lessonId: string | null,
  ): Promise<void> {
    try {
      const now = Date.now();
      await this.execute(
        `UPDATE ${this.tableName} 
        SET current_lesson_id = ?, last_active = ? 
        WHERE student_id = ?`,
        [lessonId, now, studentId],
      );
    } catch (error) {
      console.error('Error updating current lesson:', error);
      throw new Error(`Failed to update current lesson: ${error}`);
    }
  }

  /**
   * Update last active timestamp.
   */
  public async updateLastActive(studentId: string): Promise<void> {
    try {
      const now = Date.now();
      await this.execute(
        `UPDATE ${this.tableName} 
        SET last_active = ? 
        WHERE student_id = ?`,
        [now, studentId],
      );
    } catch (error) {
      console.error('Error updating last active:', error);
      throw new Error(`Failed to update last active: ${error}`);
    }
  }

  /**
   * Parse student state from row data.
   */
  public parseState(row: StudentStateRow): StudentState {
    return {
      studentId: row.student_id,
      currentSubject: row.current_subject ?? undefined,
      currentLessonId: row.current_lesson_id ?? undefined,
      lastActive: new Date(row.last_active),
    };
  }

  /**
   * Clear current lesson (when lesson is completed).
   */
  public async clearCurrentLesson(studentId: string): Promise<void> {
    try {
      await this.updateCurrentLesson(studentId, null);
    } catch (error) {
      console.error('Error clearing current lesson:', error);
      throw new Error(`Failed to clear current lesson: ${error}`);
    }
  }
}
