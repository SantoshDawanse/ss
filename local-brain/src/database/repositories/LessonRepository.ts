/**
 * Repository for lessons table operations.
 */

import { BaseRepository } from './BaseRepository';
import { Lesson } from '../../models';

export interface LessonRow {
  lesson_id: string;
  bundle_id: string;
  subject: string;
  topic: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  content_json: string;
  estimated_minutes: number;
  curriculum_standards: string;
}

export class LessonRepository extends BaseRepository<LessonRow> {
  constructor() {
    super('lessons');
  }

  protected getIdColumn(): string {
    return 'lesson_id';
  }

  /**
   * Create a new lesson.
   */
  public async create(lesson: LessonRow): Promise<void> {
    try {
      await this.execute(
        `INSERT INTO ${this.tableName} 
        (lesson_id, bundle_id, subject, topic, title, difficulty, 
         content_json, estimated_minutes, curriculum_standards)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lesson.lesson_id,
          lesson.bundle_id,
          lesson.subject,
          lesson.topic,
          lesson.title,
          lesson.difficulty,
          lesson.content_json,
          lesson.estimated_minutes,
          lesson.curriculum_standards,
        ],
      );
    } catch (error) {
      console.error('Error creating lesson:', error);
      throw new Error(`Failed to create lesson: ${error}`);
    }
  }

  /**
   * Bulk insert lessons in a transaction.
   */
  public async bulkCreate(lessons: LessonRow[]): Promise<void> {
    try {
      await this.executeTransaction(async tx => {
        for (const lesson of lessons) {
          await tx.executeSql(
            `INSERT INTO ${this.tableName} 
            (lesson_id, bundle_id, subject, topic, title, difficulty, 
             content_json, estimated_minutes, curriculum_standards)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              lesson.lesson_id,
              lesson.bundle_id,
              lesson.subject,
              lesson.topic,
              lesson.title,
              lesson.difficulty,
              lesson.content_json,
              lesson.estimated_minutes,
              lesson.curriculum_standards,
            ],
          );
        }
      });
    } catch (error) {
      console.error('Error bulk creating lessons:', error);
      throw new Error(`Failed to bulk create lessons: ${error}`);
    }
  }

  /**
   * Find lessons by bundle ID.
   */
  public async findByBundle(bundleId: string): Promise<LessonRow[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE bundle_id = ?`,
        [bundleId],
      );

      return this.resultSetToArray(result);
    } catch (error) {
      console.error('Error finding lessons by bundle:', error);
      throw new Error(`Failed to find lessons: ${error}`);
    }
  }

  /**
   * Find lessons by subject and topic.
   */
  public async findBySubjectAndTopic(
    subject: string,
    topic: string,
  ): Promise<LessonRow[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} 
        WHERE subject = ? AND topic = ?`,
        [subject, topic],
      );

      return this.resultSetToArray(result);
    } catch (error) {
      console.error('Error finding lessons by subject/topic:', error);
      throw new Error(`Failed to find lessons: ${error}`);
    }
  }

  /**
   * Find lessons by subject.
   */
  public async findBySubject(subject: string): Promise<LessonRow[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE subject = ?`,
        [subject],
      );

      return this.resultSetToArray(result);
    } catch (error) {
      console.error('Error finding lessons by subject:', error);
      throw new Error(`Failed to find lessons: ${error}`);
    }
  }

  /**
   * Find lessons by bundle ID and subject.
   */
  public async findByBundleAndSubject(
    bundleId: string,
    subject: string,
  ): Promise<LessonRow[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} 
        WHERE bundle_id = ? AND subject = ?`,
        [bundleId, subject],
      );

      return this.resultSetToArray(result);
    } catch (error) {
      console.error('Error finding lessons by bundle and subject:', error);
      throw new Error(`Failed to find lessons: ${error}`);
    }
  }

  /**
   * Parse lesson content from JSON.
   */
  public parseLesson(row: LessonRow): Lesson {
    return {
      lessonId: row.lesson_id,
      subject: row.subject,
      topic: row.topic,
      title: row.title,
      difficulty: row.difficulty,
      estimatedMinutes: row.estimated_minutes,
      curriculumStandards: JSON.parse(row.curriculum_standards),
      sections: JSON.parse(row.content_json),
    };
  }

  /**
   * Delete lessons by bundle ID.
   */
  public async deleteByBundle(bundleId: string): Promise<void> {
    try {
      await this.execute(
        `DELETE FROM ${this.tableName} WHERE bundle_id = ?`,
        [bundleId],
      );
    } catch (error) {
      console.error('Error deleting lessons by bundle:', error);
      throw new Error(`Failed to delete lessons: ${error}`);
    }
  }
}
