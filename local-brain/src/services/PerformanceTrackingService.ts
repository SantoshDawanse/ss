/**
 * PerformanceTrackingService handles event tracking, logging, and batching
 * for student performance data in the Local Brain.
 * 
 * Features:
 * - Immediate SQLite writes for crash recovery
 * - Log batching for efficient sync
 * - Event tracking for all student interactions
 */

import { PerformanceLog } from '../models';
import { PerformanceLogRepository, PerformanceLogRow } from '../database/repositories/PerformanceLogRepository';
import { DatabaseManager } from '../database/DatabaseManager';

export interface TrackEventParams {
  studentId: string;
  eventType: PerformanceLog['eventType'];
  contentId: string;
  subject: string;
  topic: string;
  data?: PerformanceLog['data'];
}

export interface BatchedLogs {
  logs: PerformanceLog[];
  totalSize: number;
  count: number;
}

/**
 * Service for tracking student performance and managing logs.
 */
export class PerformanceTrackingService {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * Track a student event and write to SQLite immediately.
   * This ensures crash recovery by persisting data instantly.
   */
  public async trackEvent(params: TrackEventParams): Promise<number> {
    try {
      const timestamp = Date.now();
      
      const logRow: Omit<PerformanceLogRow, 'log_id'> = {
        student_id: params.studentId,
        timestamp,
        event_type: params.eventType,
        content_id: params.contentId,
        subject: params.subject,
        topic: params.topic,
        data_json: JSON.stringify(params.data || {}),
        synced: 0, // Not synced yet
      };

      // Write immediately to SQLite for crash recovery
      const logId = await this.dbManager.performanceLogRepository.create(logRow);
      
      console.log(`Performance event tracked: ${params.eventType} for ${params.contentId}`);
      
      return logId;
    } catch (error) {
      console.error('Failed to track event:', error);
      throw new Error(`Event tracking failed: ${error}`);
    }
  }

  /**
   * Track lesson start event.
   */
  public async trackLessonStart(
    studentId: string,
    lessonId: string,
    subject: string,
    topic: string,
  ): Promise<number> {
    return this.trackEvent({
      studentId,
      eventType: 'lesson_start',
      contentId: lessonId,
      subject,
      topic,
      data: {},
    });
  }

  /**
   * Track lesson completion event.
   */
  public async trackLessonComplete(
    studentId: string,
    lessonId: string,
    subject: string,
    topic: string,
    timeSpent: number,
  ): Promise<number> {
    return this.trackEvent({
      studentId,
      eventType: 'lesson_complete',
      contentId: lessonId,
      subject,
      topic,
      data: { timeSpent },
    });
  }

  /**
   * Track quiz start event.
   */
  public async trackQuizStart(
    studentId: string,
    quizId: string,
    subject: string,
    topic: string,
  ): Promise<number> {
    return this.trackEvent({
      studentId,
      eventType: 'quiz_start',
      contentId: quizId,
      subject,
      topic,
      data: {},
    });
  }

  /**
   * Track quiz answer event.
   */
  public async trackQuizAnswer(
    studentId: string,
    quizId: string,
    subject: string,
    topic: string,
    answer: string,
    correct: boolean,
    hintsUsed: number = 0,
  ): Promise<number> {
    return this.trackEvent({
      studentId,
      eventType: 'quiz_answer',
      contentId: quizId,
      subject,
      topic,
      data: {
        answer,
        correct,
        hintsUsed,
      },
    });
  }

  /**
   * Track quiz completion event.
   */
  public async trackQuizComplete(
    studentId: string,
    quizId: string,
    subject: string,
    topic: string,
    timeSpent: number,
  ): Promise<number> {
    return this.trackEvent({
      studentId,
      eventType: 'quiz_complete',
      contentId: quizId,
      subject,
      topic,
      data: { timeSpent },
    });
  }

  /**
   * Track hint request event.
   */
  public async trackHintRequested(
    studentId: string,
    quizId: string,
    subject: string,
    topic: string,
    hintLevel: number,
  ): Promise<number> {
    return this.trackEvent({
      studentId,
      eventType: 'hint_requested',
      contentId: quizId,
      subject,
      topic,
      data: { hintsUsed: hintLevel },
    });
  }

  /**
   * Get unsynced logs for a student (for sync batching).
   */
  public async getUnsyncedLogs(studentId: string): Promise<PerformanceLog[]> {
    try {
      const rows = await this.dbManager.performanceLogRepository.findUnsyncedByStudent(studentId);
      return rows.map(row => this.dbManager.performanceLogRepository.parseLog(row));
    } catch (error) {
      console.error('Failed to get unsynced logs:', error);
      throw new Error(`Failed to retrieve unsynced logs: ${error}`);
    }
  }

  /**
   * Get batched logs ready for sync.
   * Returns logs with metadata for efficient transmission.
   */
  public async getBatchedLogsForSync(studentId: string): Promise<BatchedLogs> {
    try {
      const logs = await this.getUnsyncedLogs(studentId);
      
      // Calculate total size (approximate JSON size)
      const totalSize = JSON.stringify(logs).length;
      
      return {
        logs,
        totalSize,
        count: logs.length,
      };
    } catch (error) {
      console.error('Failed to get batched logs:', error);
      throw new Error(`Failed to batch logs: ${error}`);
    }
  }

  /**
   * Mark logs as synced after successful upload.
   */
  public async markLogsAsSynced(logIds: number[]): Promise<void> {
    try {
      await this.dbManager.performanceLogRepository.markAsSynced(logIds);
      console.log(`Marked ${logIds.length} logs as synced`);
    } catch (error) {
      console.error('Failed to mark logs as synced:', error);
      throw new Error(`Failed to update sync status: ${error}`);
    }
  }

  /**
   * Get recent logs for adaptive content selection.
   */
  public async getRecentLogs(
    studentId: string,
    limit: number = 10,
  ): Promise<PerformanceLog[]> {
    try {
      const rows = await this.dbManager.performanceLogRepository.findRecentByStudent(studentId, limit);
      return rows.map(row => this.dbManager.performanceLogRepository.parseLog(row));
    } catch (error) {
      console.error('Failed to get recent logs:', error);
      throw new Error(`Failed to retrieve recent logs: ${error}`);
    }
  }

  /**
   * Get logs by subject for subject-specific analysis.
   */
  public async getLogsBySubject(
    studentId: string,
    subject: string,
  ): Promise<PerformanceLog[]> {
    try {
      const rows = await this.dbManager.performanceLogRepository.findByStudentAndSubject(studentId, subject);
      return rows.map(row => this.dbManager.performanceLogRepository.parseLog(row));
    } catch (error) {
      console.error('Failed to get logs by subject:', error);
      throw new Error(`Failed to retrieve subject logs: ${error}`);
    }
  }

  /**
   * Get all logs for a student.
   */
  public async getAllLogs(studentId: string): Promise<PerformanceLog[]> {
    try {
      const rows = await this.dbManager.performanceLogRepository.findByStudent(studentId);
      return rows.map(row => this.dbManager.performanceLogRepository.parseLog(row));
    } catch (error) {
      console.error('Failed to get all logs:', error);
      throw new Error(`Failed to retrieve logs: ${error}`);
    }
  }

  /**
   * Count unsynced logs.
   */
  public async countUnsyncedLogs(): Promise<number> {
    try {
      return await this.dbManager.performanceLogRepository.countUnsynced();
    } catch (error) {
      console.error('Failed to count unsynced logs:', error);
      throw new Error(`Failed to count logs: ${error}`);
    }
  }

  /**
   * Clean up old synced logs (retention policy: 30 days).
   */
  public async cleanupOldLogs(retentionDays: number = 30): Promise<void> {
    try {
      const cutoffTimestamp = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
      await this.dbManager.performanceLogRepository.deleteSyncedBefore(cutoffTimestamp);
      console.log(`Cleaned up synced logs older than ${retentionDays} days`);
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
      throw new Error(`Log cleanup failed: ${error}`);
    }
  }
}
