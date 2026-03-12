/**
 * Repository for managing download progress data.
 * Supports storing and retrieving download progress for resume capability across app restarts.
 * 
 * Requirements: 6.1-6.7 (Download resume capability)
 */

import { BaseRepository } from './BaseRepository';
import { DownloadProgress, DownloadProgressRow } from '../../types/sync';

export class DownloadProgressRepository extends BaseRepository<DownloadProgressRow> {
  constructor() {
    super('download_progress');
  }

  protected getIdColumn(): string {
    return 'session_id';
  }

  /**
   * Store download progress for a session.
   */
  async saveProgress(progress: DownloadProgress): Promise<void> {
    const now = Date.now();
    
    try {
      await this.dbManager.runSql(
        `INSERT OR REPLACE INTO ${this.tableName} 
         (session_id, bundle_url, total_bytes, downloaded_bytes, checksum, file_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          progress.sessionId,
          progress.bundleUrl,
          progress.totalBytes,
          progress.downloadedBytes,
          progress.checksum,
          progress.filePath,
          now,
          now,
        ]
      );
    } catch (error) {
      console.error('Error saving download progress:', error);
      throw new Error(`Failed to save download progress: ${error}`);
    }
  }

  /**
   * Update download progress for a session.
   */
  async updateProgress(sessionId: string, downloadedBytes: number): Promise<void> {
    try {
      await this.dbManager.runSql(
        `UPDATE ${this.tableName} 
         SET downloaded_bytes = ?, updated_at = ?
         WHERE session_id = ?`,
        [downloadedBytes, Date.now(), sessionId]
      );
    } catch (error) {
      console.error('Error updating download progress:', error);
      throw new Error(`Failed to update download progress: ${error}`);
    }
  }

  /**
   * Get download progress for a session.
   */
  async getProgress(sessionId: string): Promise<DownloadProgress | null> {
    try {
      const result = await this.dbManager.executeSql(
        `SELECT * FROM ${this.tableName} WHERE session_id = ?`,
        [sessionId]
      );

      if (!result || result.length === 0) {
        return null;
      }

      const row = result[0] as DownloadProgressRow;
      return {
        sessionId: row.session_id,
        bundleUrl: row.bundle_url,
        totalBytes: row.total_bytes,
        downloadedBytes: row.downloaded_bytes,
        checksum: row.checksum,
        filePath: row.file_path,
      };
    } catch (error) {
      console.error('Error getting download progress:', error);
      throw new Error(`Failed to get download progress: ${error}`);
    }
  }

  /**
   * Delete download progress for a session.
   */
  async deleteProgress(sessionId: string): Promise<void> {
    try {
      await this.dbManager.runSql(
        `DELETE FROM ${this.tableName} WHERE session_id = ?`,
        [sessionId]
      );
    } catch (error) {
      console.error('Error deleting download progress:', error);
      throw new Error(`Failed to delete download progress: ${error}`);
    }
  }

  /**
   * Get all incomplete downloads (for cleanup).
   */
  async getIncompleteDownloads(): Promise<DownloadProgress[]> {
    try {
      const result = await this.dbManager.executeSql(
        `SELECT * FROM ${this.tableName} 
         WHERE downloaded_bytes < total_bytes
         ORDER BY updated_at DESC`
      );

      return result.map((row: DownloadProgressRow) => ({
        sessionId: row.session_id,
        bundleUrl: row.bundle_url,
        totalBytes: row.total_bytes,
        downloadedBytes: row.downloaded_bytes,
        checksum: row.checksum,
        filePath: row.file_path,
      }));
    } catch (error) {
      console.error('Error getting incomplete downloads:', error);
      throw new Error(`Failed to get incomplete downloads: ${error}`);
    }
  }

  /**
   * Clean up old download progress records (older than 7 days).
   */
  async cleanupOldProgress(): Promise<void> {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    try {
      await this.dbManager.runSql(
        `DELETE FROM ${this.tableName} WHERE updated_at < ?`,
        [sevenDaysAgo]
      );
    } catch (error) {
      console.error('Error cleaning up old download progress:', error);
      throw new Error(`Failed to cleanup old progress: ${error}`);
    }
  }

  /**
   * Check if a download is in progress for a session.
   */
  async hasInProgressDownload(sessionId: string): Promise<boolean> {
    try {
      const result = await this.dbManager.executeSql(
        `SELECT 1 FROM ${this.tableName} 
         WHERE session_id = ? AND downloaded_bytes < total_bytes`,
        [sessionId]
      );

      return result.length > 0;
    } catch (error) {
      console.error('Error checking in progress download:', error);
      throw new Error(`Failed to check in progress download: ${error}`);
    }
  }
}