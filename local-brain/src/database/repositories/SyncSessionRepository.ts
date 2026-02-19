/**
 * Repository for sync_sessions table operations.
 */

import { BaseRepository } from './BaseRepository';

export interface SyncSessionRow {
  session_id: string;
  start_time: number;
  end_time: number | null;
  status: 'pending' | 'uploading' | 'downloading' | 'complete' | 'failed';
  logs_uploaded: number;
  bundle_downloaded: number;
  error_message: string | null;
}

export class SyncSessionRepository extends BaseRepository<SyncSessionRow> {
  constructor() {
    super('sync_sessions');
  }

  protected getIdColumn(): string {
    return 'session_id';
  }

  /**
   * Create a new sync session.
   */
  public async create(session: SyncSessionRow): Promise<void> {
    try {
      await this.execute(
        `INSERT INTO ${this.tableName} 
        (session_id, start_time, end_time, status, logs_uploaded, bundle_downloaded, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          session.session_id,
          session.start_time,
          session.end_time,
          session.status,
          session.logs_uploaded,
          session.bundle_downloaded,
          session.error_message,
        ],
      );
    } catch (error) {
      console.error('Error creating sync session:', error);
      throw new Error(`Failed to create sync session: ${error}`);
    }
  }

  /**
   * Update sync session status.
   */
  public async updateStatus(
    sessionId: string,
    status: SyncSessionRow['status'],
    errorMessage?: string,
  ): Promise<void> {
    try {
      await this.execute(
        `UPDATE ${this.tableName} 
        SET status = ?, error_message = ? 
        WHERE session_id = ?`,
        [status, errorMessage ?? null, sessionId],
      );
    } catch (error) {
      console.error('Error updating sync session status:', error);
      throw new Error(`Failed to update sync session: ${error}`);
    }
  }

  /**
   * Update logs uploaded count.
   */
  public async updateLogsUploaded(
    sessionId: string,
    count: number,
  ): Promise<void> {
    try {
      await this.execute(
        `UPDATE ${this.tableName} 
        SET logs_uploaded = ? 
        WHERE session_id = ?`,
        [count, sessionId],
      );
    } catch (error) {
      console.error('Error updating logs uploaded:', error);
      throw new Error(`Failed to update logs uploaded: ${error}`);
    }
  }

  /**
   * Update bundle downloaded flag.
   */
  public async updateBundleDownloaded(
    sessionId: string,
    downloaded: boolean,
  ): Promise<void> {
    try {
      await this.execute(
        `UPDATE ${this.tableName} 
        SET bundle_downloaded = ? 
        WHERE session_id = ?`,
        [downloaded ? 1 : 0, sessionId],
      );
    } catch (error) {
      console.error('Error updating bundle downloaded:', error);
      throw new Error(`Failed to update bundle downloaded: ${error}`);
    }
  }

  /**
   * Complete sync session.
   */
  public async complete(sessionId: string): Promise<void> {
    try {
      const endTime = Date.now();
      await this.execute(
        `UPDATE ${this.tableName} 
        SET status = 'complete', end_time = ? 
        WHERE session_id = ?`,
        [endTime, sessionId],
      );
    } catch (error) {
      console.error('Error completing sync session:', error);
      throw new Error(`Failed to complete sync session: ${error}`);
    }
  }

  /**
   * Fail sync session with error message.
   */
  public async fail(sessionId: string, errorMessage: string): Promise<void> {
    try {
      const endTime = Date.now();
      await this.execute(
        `UPDATE ${this.tableName} 
        SET status = 'failed', end_time = ?, error_message = ? 
        WHERE session_id = ?`,
        [endTime, errorMessage, sessionId],
      );
    } catch (error) {
      console.error('Error failing sync session:', error);
      throw new Error(`Failed to fail sync session: ${error}`);
    }
  }

  /**
   * Find last completed sync session.
   */
  public async findLastCompleted(): Promise<SyncSessionRow | null> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} 
        WHERE status = 'complete' 
        ORDER BY end_time DESC 
        LIMIT 1`,
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.rowToObject(result.rows.item(0));
    } catch (error) {
      console.error('Error finding last completed sync:', error);
      throw new Error(`Failed to find last sync: ${error}`);
    }
  }

  /**
   * Find pending or in-progress sync sessions.
   */
  public async findInProgress(): Promise<SyncSessionRow[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} 
        WHERE status IN ('pending', 'uploading', 'downloading') 
        ORDER BY start_time DESC`,
      );

      return this.resultSetToArray(result);
    } catch (error) {
      console.error('Error finding in-progress syncs:', error);
      throw new Error(`Failed to find in-progress syncs: ${error}`);
    }
  }

  /**
   * Delete old sync sessions (keep last N).
   */
  public async deleteOldSessions(keepCount: number = 10): Promise<void> {
    try {
      await this.execute(
        `DELETE FROM ${this.tableName} 
        WHERE session_id NOT IN (
          SELECT session_id FROM ${this.tableName} 
          ORDER BY start_time DESC 
          LIMIT ?
        )`,
        [keepCount],
      );
    } catch (error) {
      console.error('Error deleting old sync sessions:', error);
      throw new Error(`Failed to delete old sessions: ${error}`);
    }
  }
}
