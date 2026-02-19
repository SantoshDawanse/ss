/**
 * Repository for performance_logs table operations.
 */

import { BaseRepository } from './BaseRepository';
import { PerformanceLog } from '../../models';

export interface PerformanceLogRow {
  log_id?: number;
  student_id: string;
  timestamp: number;
  event_type:
    | 'lesson_start'
    | 'lesson_complete'
    | 'quiz_start'
    | 'quiz_answer'
    | 'quiz_complete'
    | 'hint_requested';
  content_id: string;
  subject: string;
  topic: string;
  data_json: string;
  synced: number; // 0 or 1
}

export class PerformanceLogRepository extends BaseRepository<PerformanceLogRow> {
  constructor() {
    super('performance_logs');
  }

  protected getIdColumn(): string {
    return 'log_id';
  }

  /**
   * Create a new performance log.
   */
  public async create(log: Omit<PerformanceLogRow, 'log_id'>): Promise<number> {
    try {
      const result = await this.query(
        `INSERT INTO ${this.tableName} 
        (student_id, timestamp, event_type, content_id, subject, topic, data_json, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          log.student_id,
          log.timestamp,
          log.event_type,
          log.content_id,
          log.subject,
          log.topic,
          log.data_json,
          log.synced,
        ],
      );

      return result.insertId;
    } catch (error) {
      console.error('Error creating performance log:', error);
      throw new Error(`Failed to create performance log: ${error}`);
    }
  }

  /**
   * Find unsynced logs for a student.
   */
  public async findUnsyncedByStudent(
    studentId: string,
  ): Promise<PerformanceLogRow[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} 
        WHERE student_id = ? AND synced = 0 
        ORDER BY timestamp ASC`,
        [studentId],
      );

      return this.resultSetToArray(result);
    } catch (error) {
      console.error('Error finding unsynced logs:', error);
      throw new Error(`Failed to find unsynced logs: ${error}`);
    }
  }

  /**
   * Find recent logs for a student (for adaptive rules).
   */
  public async findRecentByStudent(
    studentId: string,
    limit: number = 10,
  ): Promise<PerformanceLogRow[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} 
        WHERE student_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ?`,
        [studentId, limit],
      );

      return this.resultSetToArray(result);
    } catch (error) {
      console.error('Error finding recent logs:', error);
      throw new Error(`Failed to find recent logs: ${error}`);
    }
  }

  /**
   * Find logs by student and subject.
   */
  public async findByStudentAndSubject(
    studentId: string,
    subject: string,
  ): Promise<PerformanceLogRow[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} 
        WHERE student_id = ? AND subject = ? 
        ORDER BY timestamp DESC`,
        [studentId, subject],
      );

      return this.resultSetToArray(result);
    } catch (error) {
      console.error('Error finding logs by subject:', error);
      throw new Error(`Failed to find logs: ${error}`);
    }
  }

  /**
   * Mark logs as synced.
   */
  public async markAsSynced(logIds: number[]): Promise<void> {
    try {
      if (logIds.length === 0) return;

      const placeholders = logIds.map(() => '?').join(',');
      await this.execute(
        `UPDATE ${this.tableName} 
        SET synced = 1 
        WHERE log_id IN (${placeholders})`,
        logIds,
      );
    } catch (error) {
      console.error('Error marking logs as synced:', error);
      throw new Error(`Failed to mark logs as synced: ${error}`);
    }
  }

  /**
   * Parse performance log from row data.
   */
  public parseLog(row: PerformanceLogRow): PerformanceLog {
    return {
      studentId: row.student_id,
      timestamp: new Date(row.timestamp),
      eventType: row.event_type,
      contentId: row.content_id,
      subject: row.subject,
      topic: row.topic,
      data: JSON.parse(row.data_json),
    };
  }

  /**
   * Delete synced logs older than specified timestamp.
   */
  public async deleteSyncedBefore(timestamp: number): Promise<void> {
    try {
      await this.execute(
        `DELETE FROM ${this.tableName} 
        WHERE synced = 1 AND timestamp < ?`,
        [timestamp],
      );
    } catch (error) {
      console.error('Error deleting old synced logs:', error);
      throw new Error(`Failed to delete old logs: ${error}`);
    }
  }

  /**
   * Count unsynced logs.
   */
  public async countUnsynced(): Promise<number> {
    try {
      const result = await this.query(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE synced = 0`,
      );
      return result.rows.item(0).count;
    } catch (error) {
      console.error('Error counting unsynced logs:', error);
      throw new Error(`Failed to count unsynced logs: ${error}`);
    }
  }
}
