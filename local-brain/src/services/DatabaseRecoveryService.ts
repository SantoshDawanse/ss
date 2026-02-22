/**
 * Database recovery service for handling database errors and corruption.
 */

import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { logError } from '../utils/errorHandling';

export interface RecoveryResult {
  success: boolean;
  readOnlyMode: boolean;
  message: string;
  details?: Record<string, any>;
}

export class DatabaseRecoveryService {
  private dbName: string;
  private db: SQLite.SQLiteDatabase | null = null;
  private readOnlyMode: boolean = false;
  
  constructor(dbName: string = 'sikshya_sathi.db') {
    this.dbName = dbName;
  }
  
  /**
   * Attempt to recover from database errors.
   */
  async attemptRecovery(): Promise<RecoveryResult> {
    try {
      logError(
        'database',
        'high',
        'Attempting database recovery',
        { dbName: this.dbName }
      );
      
      // Step 1: Try to validate database integrity
      const integrityCheck = await this.checkIntegrity();
      
      if (integrityCheck.valid) {
        logError(
          'database',
          'medium',
          'Database integrity check passed',
          integrityCheck
        );
        
        return {
          success: true,
          readOnlyMode: false,
          message: 'Database is healthy',
          details: integrityCheck,
        };
      }
      
      // Step 2: Try to repair database
      logError(
        'database',
        'high',
        'Database integrity check failed. Attempting repair...',
        integrityCheck
      );
      
      const repairResult = await this.repairDatabase();
      
      if (repairResult.success) {
        return repairResult;
      }
      
      // Step 3: Fallback to read-only mode
      logError(
        'database',
        'critical',
        'Database repair failed. Falling back to read-only mode',
        repairResult
      );
      
      this.readOnlyMode = true;
      
      return {
        success: true,
        readOnlyMode: true,
        message: 'Operating in read-only mode. Some features may be limited.',
        details: {
          reason: 'Database repair failed',
          limitations: [
            'Cannot save new progress',
            'Cannot record performance logs',
            'Cannot update state',
          ],
        },
      };
      
    } catch (error) {
      logError(
        'database',
        'critical',
        'Database recovery failed',
        { error: error instanceof Error ? error.message : String(error) },
        error instanceof Error ? error.stack : undefined
      );
      
      return {
        success: false,
        readOnlyMode: false,
        message: 'Database recovery failed',
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
  
  /**
   * Check database integrity.
   */
  private async checkIntegrity(): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    try {
      const db = await SQLite.openDatabaseAsync(this.dbName);
      
      // Run PRAGMA integrity_check
      const result = await db.getAllAsync<{ integrity_check: string }>(
        'PRAGMA integrity_check'
      );
      
      const errors: string[] = [];
      let valid = true;
      
      for (const row of result) {
        if (row.integrity_check !== 'ok') {
          valid = false;
          errors.push(row.integrity_check);
        }
      }
      
      return { valid, errors };
      
    } catch (error) {
      logError(
        'database',
        'high',
        'Integrity check failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
      
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }
  
  /**
   * Attempt to repair database.
   */
  private async repairDatabase(): Promise<RecoveryResult> {
    try {
      const dbPath = `${FileSystem.documentDirectory}SQLite/${this.dbName}`;
      const backupPath = `${dbPath}.backup`;
      
      // Create backup of corrupted database
      await FileSystem.copyAsync({
        from: dbPath,
        to: backupPath,
      });
      
      logError(
        'database',
        'medium',
        'Created backup of corrupted database',
        { backupPath }
      );
      
      // Try to export data from corrupted database
      const exportedData = await this.exportCriticalData();
      
      // Delete corrupted database
      await FileSystem.deleteAsync(dbPath, { idempotent: true });
      
      logError(
        'database',
        'medium',
        'Deleted corrupted database',
        { dbPath }
      );
      
      // Recreate database with fresh schema
      await this.recreateDatabase();
      
      // Import critical data
      if (exportedData) {
        await this.importCriticalData(exportedData);
      }
      
      logError(
        'database',
        'medium',
        'Database repair completed successfully',
        { recordsRecovered: exportedData?.recordCount || 0 }
      );
      
      return {
        success: true,
        readOnlyMode: false,
        message: 'Database repaired successfully',
        details: {
          recordsRecovered: exportedData?.recordCount || 0,
          backupPath,
        },
      };
      
    } catch (error) {
      logError(
        'database',
        'critical',
        'Database repair failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
      
      return {
        success: false,
        readOnlyMode: false,
        message: 'Database repair failed',
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
  
  /**
   * Export critical data from corrupted database.
   */
  private async exportCriticalData(): Promise<{
    recordCount: number;
    data: any[];
  } | null> {
    try {
      const db = await SQLite.openDatabaseAsync(this.dbName);
      
      // Try to export performance logs (most critical data)
      const logs = await db.getAllAsync(
        'SELECT * FROM performance_logs WHERE synced = 0 ORDER BY timestamp DESC LIMIT 1000'
      );
      
      logError(
        'database',
        'medium',
        'Exported critical data',
        { recordCount: logs.length }
      );
      
      return {
        recordCount: logs.length,
        data: logs,
      };
      
    } catch (error) {
      logError(
        'database',
        'high',
        'Failed to export critical data',
        { error: error instanceof Error ? error.message : String(error) }
      );
      
      return null;
    }
  }
  
  /**
   * Recreate database with fresh schema.
   */
  private async recreateDatabase(): Promise<void> {
    const db = await SQLite.openDatabaseAsync(this.dbName);
    
    // Create tables (simplified schema for recovery)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS learning_bundles (
        bundle_id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        valid_from INTEGER NOT NULL,
        valid_until INTEGER NOT NULL,
        total_size INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        status TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS lessons (
        lesson_id TEXT PRIMARY KEY,
        bundle_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        content_json TEXT NOT NULL,
        estimated_minutes INTEGER NOT NULL,
        FOREIGN KEY (bundle_id) REFERENCES learning_bundles(bundle_id)
      );
      
      CREATE TABLE IF NOT EXISTS quizzes (
        quiz_id TEXT PRIMARY KEY,
        bundle_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        questions_json TEXT NOT NULL,
        FOREIGN KEY (bundle_id) REFERENCES learning_bundles(bundle_id)
      );
      
      CREATE TABLE IF NOT EXISTS performance_logs (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        content_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        data_json TEXT NOT NULL,
        synced INTEGER DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_logs_sync ON performance_logs(synced, timestamp);
      CREATE INDEX IF NOT EXISTS idx_logs_student ON performance_logs(student_id, subject);
      
      CREATE TABLE IF NOT EXISTS student_state (
        student_id TEXT PRIMARY KEY,
        current_subject TEXT,
        current_lesson_id TEXT,
        last_active INTEGER NOT NULL
      );
    `);
    
    logError(
      'database',
      'medium',
      'Recreated database with fresh schema'
    );
  }
  
  /**
   * Import critical data into new database.
   */
  private async importCriticalData(exportedData: {
    recordCount: number;
    data: any[];
  }): Promise<void> {
    const db = await SQLite.openDatabaseAsync(this.dbName);
    
    // Import performance logs
    for (const log of exportedData.data) {
      try {
        await db.runAsync(
          `INSERT INTO performance_logs 
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
            log.synced || 0,
          ]
        );
      } catch (error) {
        // Skip failed imports
        logError(
          'database',
          'low',
          'Failed to import log record',
          { log_id: log.log_id, error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
    
    logError(
      'database',
      'medium',
      'Imported critical data',
      { recordCount: exportedData.recordCount }
    );
  }
  
  /**
   * Check if database is in read-only mode.
   */
  isReadOnlyMode(): boolean {
    return this.readOnlyMode;
  }
  
  /**
   * Validate database on startup.
   */
  async validateOnStartup(): Promise<RecoveryResult> {
    try {
      // Check for incomplete operations
      const db = await SQLite.openDatabaseAsync(this.dbName);
      
      // Check for interrupted syncs
      const incompleteSyncs = await db.getAllAsync(
        `SELECT * FROM sync_sessions WHERE status IN ('pending', 'uploading', 'downloading')`
      );
      
      if (incompleteSyncs.length > 0) {
        logError(
          'database',
          'medium',
          'Found incomplete sync sessions',
          { count: incompleteSyncs.length }
        );
        
        // Mark as failed so they can be retried
        await db.runAsync(
          `UPDATE sync_sessions SET status = 'failed', error_message = 'Interrupted by app restart' 
           WHERE status IN ('pending', 'uploading', 'downloading')`
        );
      }
      
      // Validate database integrity
      const integrityCheck = await this.checkIntegrity();
      
      if (!integrityCheck.valid) {
        return await this.attemptRecovery();
      }
      
      return {
        success: true,
        readOnlyMode: false,
        message: 'Database validated successfully',
        details: {
          incompleteSyncs: incompleteSyncs.length,
        },
      };
      
    } catch (error) {
      logError(
        'database',
        'high',
        'Startup validation failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
      
      return await this.attemptRecovery();
    }
  }
}
