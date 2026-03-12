/**
 * DatabaseManager handles SQLite database initialization, encryption,
 * and connection management for the Local Brain.
 * 
 * Updated for Expo SQLite
 */

import * as SQLite from 'expo-sqlite';
import {
  CREATE_TABLES,
  CREATE_INDEXES,
  DROP_TABLES,
  DatabaseConfig,
  DEFAULT_DB_CONFIG,
} from './schema';
import {
  LearningBundleRepository,
  LessonRepository,
  QuizRepository,
  HintRepository,
  PerformanceLogRepository,
  SyncSessionRepository,
  StudentStateRepository,
  StudyTrackRepository,
  DownloadProgressRepository,
} from './repositories';
import { runMigrations } from './migrations';

type SQLiteDatabase = SQLite.SQLiteDatabase;

/**
 * Connection pool configuration
 */
interface ConnectionPoolConfig {
  maxConnections: number;
  minConnections: number;
  acquireTimeout: number; // milliseconds
}

const DEFAULT_POOL_CONFIG: ConnectionPoolConfig = {
  maxConnections: 5,
  minConnections: 1,
  acquireTimeout: 5000,
};

/**
 * DatabaseManager singleton class for managing SQLite database.
 */
export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: SQLiteDatabase | null = null;
  private config: DatabaseConfig;
  private poolConfig: ConnectionPoolConfig;
  private isInitialized = false;
  private connectionPool: SQLiteDatabase[] = [];
  private availableConnections: SQLiteDatabase[] = [];
  private activeConnections: Set<SQLiteDatabase> = new Set();
  private waitingQueue: Array<{
    resolve: (db: SQLiteDatabase) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];

  // Repository instances
  public learningBundleRepository!: LearningBundleRepository;
  public lessonRepository!: LessonRepository;
  public quizRepository!: QuizRepository;
  public hintRepository!: HintRepository;
  public performanceLogRepository!: PerformanceLogRepository;
  public syncSessionRepository!: SyncSessionRepository;
  public studentStateRepository!: StudentStateRepository;
  public studyTrackRepository!: StudyTrackRepository;
  public downloadProgressRepository!: DownloadProgressRepository;

  private constructor(config: DatabaseConfig = DEFAULT_DB_CONFIG, poolConfig: ConnectionPoolConfig = DEFAULT_POOL_CONFIG) {
    this.config = config;
    this.poolConfig = poolConfig;
  }

  /**
   * Get singleton instance of DatabaseManager.
   */
  public static getInstance(
    config: DatabaseConfig = DEFAULT_DB_CONFIG,
    poolConfig: ConnectionPoolConfig = DEFAULT_POOL_CONFIG,
  ): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager(config, poolConfig);
    }
    return DatabaseManager.instance;
  }

  /**
   * Reset singleton instance (for testing purposes).
   * WARNING: Only use this in tests!
   */
  public static resetInstance(): void {
    DatabaseManager.instance = null as any;
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
      // Open primary database connection with Expo SQLite
      this.db = await SQLite.openDatabaseAsync(this.config.name);

      // Enable SQLCipher encryption if configured
      if (this.config.encryption && this.config.encryptionKey) {
        await this.enableEncryption(this.config.encryptionKey);
      }

      // Enable foreign key constraints
      await this.db.execAsync('PRAGMA foreign_keys = ON;');

      // Create tables
      await this.createTables();

      // Create indexes
      await this.createIndexes();

      // Run any pending migrations
      await runMigrations(this.db);

      // Initialize connection pool
      await this.initializeConnectionPool();

      // Initialize repositories
      this.initializeRepositories();

      this.isInitialized = true;
      console.log('Database initialized successfully with connection pooling');
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
      await this.db.execAsync(`PRAGMA key = '${key}';`);
      
      // Verify encryption is working by running a test query
      await this.db.getAllAsync('SELECT count(*) FROM sqlite_master;');
      
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
      await this.db.execAsync(CREATE_TABLES.LEARNING_BUNDLES);
      await this.db.execAsync(CREATE_TABLES.LESSONS);
      await this.db.execAsync(CREATE_TABLES.QUIZZES);
      await this.db.execAsync(CREATE_TABLES.HINTS);
      await this.db.execAsync(CREATE_TABLES.PERFORMANCE_LOGS);
      await this.db.execAsync(CREATE_TABLES.SYNC_SESSIONS);
      await this.db.execAsync(CREATE_TABLES.STUDENT_STATE);
      await this.db.execAsync(CREATE_TABLES.STUDY_TRACKS);
      await this.db.execAsync(CREATE_TABLES.DOWNLOAD_PROGRESS);

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
        await this.db.execAsync(indexSql);
      }

      console.log('Database indexes created successfully');
    } catch (error) {
      console.error('Failed to create indexes:', error);
      throw new Error(`Index creation failed: ${error}`);
    }
  }

  /**
   * Initialize all repository instances.
   */
  private initializeRepositories(): void {
    this.learningBundleRepository = new LearningBundleRepository();
    this.lessonRepository = new LessonRepository();
    this.quizRepository = new QuizRepository();
    this.hintRepository = new HintRepository();
    this.performanceLogRepository = new PerformanceLogRepository();
    this.syncSessionRepository = new SyncSessionRepository();
    this.studentStateRepository = new StudentStateRepository();
    this.studyTrackRepository = new StudyTrackRepository();
    this.downloadProgressRepository = new DownloadProgressRepository();

    // Set database manager for all repositories
    this.learningBundleRepository.setDatabaseManager(this);
    this.lessonRepository.setDatabaseManager(this);
    this.quizRepository.setDatabaseManager(this);
    this.hintRepository.setDatabaseManager(this);
    this.performanceLogRepository.setDatabaseManager(this);
    this.syncSessionRepository.setDatabaseManager(this);
    this.studentStateRepository.setDatabaseManager(this);
    this.studyTrackRepository.setDatabaseManager(this);
    this.downloadProgressRepository.setDatabaseManager(this);

    console.log('Repositories initialized');
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
   * Acquire a connection from the pool.
   * Creates new connections up to maxConnections limit.
   * Waits for available connection if pool is exhausted.
   */
  private async acquireConnection(): Promise<SQLiteDatabase> {
    // If there's an available connection, return it
    if (this.availableConnections.length > 0) {
      const conn = this.availableConnections.pop()!;
      this.activeConnections.add(conn);
      return conn;
    }

    // If we can create more connections, create one
    if (this.connectionPool.length < this.poolConfig.maxConnections) {
      const newConn = await SQLite.openDatabaseAsync(this.config.name);
      
      // Apply encryption if configured
      if (this.config.encryption && this.config.encryptionKey) {
        await newConn.execAsync(`PRAGMA key = '${this.config.encryptionKey}';`);
      }
      
      // Enable foreign keys
      await newConn.execAsync('PRAGMA foreign_keys = ON;');
      
      this.connectionPool.push(newConn);
      this.activeConnections.add(newConn);
      return newConn;
    }

    // Pool is exhausted, wait for a connection to be released
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        reject(new Error(`Connection acquire timeout after ${this.poolConfig.acquireTimeout}ms`));
      }, this.poolConfig.acquireTimeout);

      this.waitingQueue.push({ resolve, reject, timeout });
    });
  }

  /**
   * Release a connection back to the pool.
   */
  private releaseConnection(conn: SQLiteDatabase): void {
    this.activeConnections.delete(conn);

    // If there are waiting requests, give the connection to the next one
    if (this.waitingQueue.length > 0) {
      const waiter = this.waitingQueue.shift()!;
      clearTimeout(waiter.timeout);
      this.activeConnections.add(conn);
      waiter.resolve(conn);
    } else {
      // Return to available pool
      this.availableConnections.push(conn);
    }
  }

  /**
   * Initialize the connection pool with minimum connections.
   */
  private async initializeConnectionPool(): Promise<void> {
    // Create minimum number of connections
    for (let i = 0; i < this.poolConfig.minConnections; i++) {
      const conn = await SQLite.openDatabaseAsync(this.config.name);
      
      // Apply encryption if configured
      if (this.config.encryption && this.config.encryptionKey) {
        await conn.execAsync(`PRAGMA key = '${this.config.encryptionKey}';`);
      }
      
      // Enable foreign keys
      await conn.execAsync('PRAGMA foreign_keys = ON;');
      
      this.connectionPool.push(conn);
      this.availableConnections.push(conn);
    }
    
    console.log(`Connection pool initialized with ${this.poolConfig.minConnections} connections`);
  }

  /**
   * Close all connections in the pool.
   */
  private async closeConnectionPool(): Promise<void> {
    // Close all connections
    for (const conn of this.connectionPool) {
      try {
        await conn.closeAsync();
      } catch (error) {
        console.error('Error closing pooled connection:', error);
      }
    }
    
    this.connectionPool = [];
    this.availableConnections = [];
    this.activeConnections.clear();
    
    // Reject all waiting requests
    for (const waiter of this.waitingQueue) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error('Connection pool closed'));
    }
    this.waitingQueue = [];
    
    console.log('Connection pool closed');
  }

  /**
   * Execute a SQL query with parameters.
   * Returns all rows from the result.
   * Includes retry logic for transient errors.
   */
  public async executeSql(
    sql: string,
    params: any[] = [],
  ): Promise<any[]> {
    const db = this.getDatabase();
    return this.retryOnTransientError(async () => {
      return db.getAllAsync(sql, params);
    });
  }

  /**
   * Execute a SQL statement (INSERT, UPDATE, DELETE).
   * Returns the result with changes info.
   * Includes retry logic for transient errors.
   */
  public async runSql(
    sql: string,
    params: any[] = [],
  ): Promise<SQLite.SQLiteRunResult> {
    const db = this.getDatabase();
    return this.retryOnTransientError(async () => {
      return db.runAsync(sql, params);
    });
  }

  /**
   * Retry a database operation on transient errors (e.g., database locked).
   * Implements exponential backoff with jitter.
   */
  private async retryOnTransientError<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Check if error is transient (database locked, busy, etc.)
        const isTransient = this.isTransientError(error);
        
        if (!isTransient || attempt === maxRetries - 1) {
          throw error;
        }
        
        // Calculate backoff delay with exponential backoff and jitter
        const baseDelay = Math.pow(2, attempt) * 100; // 100ms, 200ms, 400ms
        const jitter = Math.random() * 100; // 0-100ms jitter
        const delay = Math.min(baseDelay + jitter, 5000); // Cap at 5 seconds
        
        console.warn(`Database operation failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms:`, error.message);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError || new Error('Database operation failed after retries');
  }

  /**
   * Check if an error is transient and should be retried.
   */
  private isTransientError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    return (
      message.includes('database is locked') ||
      message.includes('database is busy') ||
      message.includes('disk i/o error') ||
      message.includes('temporary failure')
    );
  }

  /**
   * Execute multiple SQL statements in a transaction.
   * Rolls back all changes if any statement fails.
   */
  public async transaction(
    callback: () => Promise<void>,
  ): Promise<void> {
    const db = this.getDatabase();
    await db.withTransactionAsync(callback);
  }

  /**
   * Begin a new transaction manually.
   * Note: For Expo SQLite, prefer using executeInTransaction() or transaction()
   * which properly handle transaction lifecycle.
   * 
   * This method is provided for compatibility but has limitations with Expo SQLite.
   */
  public async beginTransaction(): Promise<void> {
    const db = this.getDatabase();
    try {
      await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');
    } catch (error) {
      console.error('Failed to begin transaction:', error);
      throw new Error(`Begin transaction failed: ${error}`);
    }
  }

  /**
   * Commit the current transaction.
   * Note: For Expo SQLite, prefer using executeInTransaction() or transaction()
   * which properly handle transaction lifecycle.
   */
  public async commit(): Promise<void> {
    const db = this.getDatabase();
    try {
      await db.execAsync('COMMIT;');
    } catch (error) {
      console.error('Failed to commit transaction:', error);
      throw new Error(`Commit failed: ${error}`);
    }
  }

  /**
   * Rollback the current transaction.
   * Note: For Expo SQLite, prefer using executeInTransaction() or transaction()
   * which properly handle transaction lifecycle.
   */
  public async rollback(): Promise<void> {
    const db = this.getDatabase();
    try {
      await db.execAsync('ROLLBACK;');
    } catch (error) {
      console.error('Failed to rollback transaction:', error);
      throw new Error(`Rollback failed: ${error}`);
    }
  }

  /**
   * Execute a callback within a transaction with automatic commit/rollback.
   * This is the recommended method for atomic operations with Expo SQLite.
   * 
   * @param callback - Function to execute within the transaction
   * @returns The result of the callback function
   * @throws Error if transaction fails
   * 
   * @example
   * ```typescript
   * const result = await dbManager.executeInTransaction(async () => {
   *   await dbManager.runSql('INSERT INTO lessons ...');
   *   await dbManager.runSql('INSERT INTO quizzes ...');
   *   return { success: true };
   * });
   * ```
   */
  public async executeInTransaction<T>(
    callback: () => Promise<T>,
  ): Promise<T> {
    const db = this.getDatabase();
    
    let result: T;
    
    await db.withTransactionAsync(async () => {
      result = await callback();
    });
    
    return result!;
  }

  /**
   * Close database connection and connection pool.
   */
  public async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
    }
    
    // Close connection pool
    await this.closeConnectionPool();
    
    this.isInitialized = false;
    console.log('Database connection and pool closed');
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
        await this.db.execAsync(dropSql);
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
        connectionPool: {
          total: this.connectionPool.length,
          active: this.activeConnections.size,
          available: this.availableConnections.length,
          waiting: this.waitingQueue.length,
        },
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
        'download_progress',
      ];

      for (const table of tables) {
        const result = await db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) as count FROM ${table}`,
        );
        const count = result?.count || 0;
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
  connectionPool?: {
    total: number;
    active: number;
    available: number;
    waiting: number;
  };
}

/**
 * Export singleton instance getter for convenience.
 */
export const getDatabase = (): DatabaseManager => {
  return DatabaseManager.getInstance();
};
