/**
 * DatabaseManager handles SQLite database initialization, encryption,
 * and connection management for the Local Brain.
 */

import SQLite, {
  SQLiteDatabase,
  enablePromise,
  openDatabase,
} from 'react-native-sqlite-storage';
import {
  CREATE_TABLES,
  CREATE_INDEXES,
  DROP_TABLES,
  DatabaseConfig,
  DEFAULT_DB_CONFIG,
} from './schema';

// Enable promise-based API
enablePromise(true);

/**
 * DatabaseManager singleton class for managing SQLite database.
 */
export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: SQLiteDatabase | null = null;
  private config: DatabaseConfig;
  private isInitialized = false;

  private constructor(config: DatabaseConfig = DEFAULT_DB_CONFIG) {
    this.config = config;
  }

  /**
   * Get singleton instance of DatabaseManager.
   */
  public static getInstance(
    config: DatabaseConfig = DEFAULT_DB_CONFIG,
  ): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager(config);
    }
    return DatabaseManager.instance;
  }

  /**
   * Initialize database connection and create schema.
   * Implements SQLCipher encryption if enabled in config.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized && this.db) {
      return;
    }

    try {
      // Open database connection
      this.db = await openDatabase({
        name: this.config.name,
        location: this.config.location,
      });

      // Enable SQLCipher encryption if configured
      if (this.config.encryption && this.config.encryptionKey) {
        await this.enableEncryption(this.config.encryptionKey);
      }

      // Enable foreign key constraints
      await this.db.executeSql('PRAGMA foreign_keys = ON;');

      // Create tables
      await this.createTables();

      // Create indexes
      await this.createIndexes();

      this.isInitialized = true;
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw new Error(`Database initialization failed: ${error}`);
    }
  }

  /**
   * Enable SQLCipher encryption on the database.
   * Uses AES-256 encryption for data at rest.
   */
  private async enableEncryption(key: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not opened');
    }

    try {
      // Set encryption key using SQLCipher PRAGMA
      await this.db.executeSql(`PRAGMA key = '${key}';`);
      
      // Verify encryption is working by running a test query
      await this.db.executeSql('SELECT count(*) FROM sqlite_master;');
      
      console.log('Database encryption enabled');
    } catch (error) {
      console.error('Failed to enable encryption:', error);
      throw new Error(`Encryption setup failed: ${error}`);
    }
  }

  /**
   * Create all database tables.
   */
  private async createTables(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Create tables in order (respecting foreign key dependencies)
      await this.db.executeSql(CREATE_TABLES.LEARNING_BUNDLES);
      await this.db.executeSql(CREATE_TABLES.LESSONS);
      await this.db.executeSql(CREATE_TABLES.QUIZZES);
      await this.db.executeSql(CREATE_TABLES.HINTS);
      await this.db.executeSql(CREATE_TABLES.PERFORMANCE_LOGS);
      await this.db.executeSql(CREATE_TABLES.SYNC_SESSIONS);
      await this.db.executeSql(CREATE_TABLES.STUDENT_STATE);
      await this.db.executeSql(CREATE_TABLES.STUDY_TRACKS);

      console.log('Database tables created successfully');
    } catch (error) {
      console.error('Failed to create tables:', error);
      throw new Error(`Table creation failed: ${error}`);
    }
  }

  /**
   * Create all database indexes for performance optimization.
   */
  private async createIndexes(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Create all indexes
      for (const indexSql of Object.values(CREATE_INDEXES)) {
        await this.db.executeSql(indexSql);
      }

      console.log('Database indexes created successfully');
    } catch (error) {
      console.error('Failed to create indexes:', error);
      throw new Error(`Index creation failed: ${error}`);
    }
  }

  /**
   * Get database connection.
   * Throws error if database is not initialized.
   */
  public getDatabase(): SQLiteDatabase {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Execute a SQL query with parameters.
   */
  public async executeSql(
    sql: string,
    params: any[] = [],
  ): Promise<[SQLite.ResultSet]> {
    const db = this.getDatabase();
    return db.executeSql(sql, params);
  }

  /**
   * Execute multiple SQL statements in a transaction.
   * Rolls back all changes if any statement fails.
   */
  public async transaction(
    callback: (tx: SQLite.Transaction) => Promise<void>,
  ): Promise<void> {
    const db = this.getDatabase();
    return db.transaction(callback);
  }

  /**
   * Close database connection.
   */
  public async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.isInitialized = false;
      console.log('Database connection closed');
    }
  }

  /**
   * Drop all tables (for testing/reset purposes).
   * WARNING: This will delete all data!
   */
  public async dropAllTables(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Drop tables in reverse order (respecting foreign key dependencies)
      for (const dropSql of Object.values(DROP_TABLES)) {
        await this.db.executeSql(dropSql);
      }

      console.log('All tables dropped successfully');
    } catch (error) {
      console.error('Failed to drop tables:', error);
      throw new Error(`Table drop failed: ${error}`);
    }
  }

  /**
   * Reset database by dropping and recreating all tables.
   * WARNING: This will delete all data!
   */
  public async reset(): Promise<void> {
    await this.dropAllTables();
    await this.createTables();
    await this.createIndexes();
    console.log('Database reset successfully');
  }

  /**
   * Get database statistics (table counts, size, etc.).
   */
  public async getStats(): Promise<DatabaseStats> {
    const db = this.getDatabase();

    try {
      const stats: DatabaseStats = {
        tables: {},
        totalRecords: 0,
      };

      // Count records in each table
      const tables = [
        'learning_bundles',
        'lessons',
        'quizzes',
        'hints',
        'performance_logs',
        'sync_sessions',
        'student_state',
        'study_tracks',
      ];

      for (const table of tables) {
        const [result] = await db.executeSql(
          `SELECT COUNT(*) as count FROM ${table}`,
        );
        const count = result.rows.item(0).count;
        stats.tables[table] = count;
        stats.totalRecords += count;
      }

      return stats;
    } catch (error) {
      console.error('Failed to get database stats:', error);
      throw new Error(`Stats retrieval failed: ${error}`);
    }
  }

  /**
   * Check if database is initialized and ready.
   */
  public isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }
}

/**
 * Database statistics interface.
 */
export interface DatabaseStats {
  tables: Record<string, number>;
  totalRecords: number;
}

/**
 * Export singleton instance getter for convenience.
 */
export const getDatabase = (): DatabaseManager => {
  return DatabaseManager.getInstance();
};
