/**
 * Tests for database migration system
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { runMigrations, getCurrentVersion, MIGRATIONS } from '../src/database/migrations';

describe('Database Migration System', () => {
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    // Create a fresh database manager for each test
    DatabaseManager.resetInstance();
    dbManager = DatabaseManager.getInstance({
      name: `test_migration_${Date.now()}.db`,
      location: 'default',
      encryption: false,
    });
    
    await dbManager.initialize();
  });

  afterEach(async () => {
    if (dbManager) {
      await dbManager.close();
    }
  });

  it('should create schema_version table', async () => {
    const db = dbManager.getDatabase();
    
    // Check that schema_version table exists
    const tables = await db.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    );
    
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('schema_version');
  });

  it('should run migrations and update version', async () => {
    const db = dbManager.getDatabase();
    
    // Get initial version (should be the latest after initialization)
    const initialVersion = await getCurrentVersion(db);
    expect(initialVersion).toBeGreaterThanOrEqual(0);
    
    // Check that backend_session_id column exists in sync_sessions
    const columns = await db.getAllAsync('PRAGMA table_info(sync_sessions)');
    console.log('Columns in sync_sessions:', columns);
    
    const backendSessionIdColumn = columns.find((col: any) => col.name === 'backend_session_id');
    
    expect(backendSessionIdColumn).toBeTruthy();
    expect(backendSessionIdColumn.type).toBe('TEXT');
  });

  it('should handle duplicate column gracefully', async () => {
    const db = dbManager.getDatabase();
    
    // Try to run migrations again - should not fail
    await expect(runMigrations(db)).resolves.not.toThrow();
    
    // Version should still be correct
    const version = await getCurrentVersion(db);
    expect(version).toBe(Math.max(...MIGRATIONS.map(m => m.version)));
  });

  it('should allow creating sync session with backend_session_id', async () => {
    // Test that we can now create a sync session with backend_session_id
    const sessionId = `migration-test-${Date.now()}`;
    
    await expect(
      dbManager.syncSessionRepository.create({
        session_id: sessionId,
        backend_session_id: 'test-backend-123',
        start_time: Date.now(),
        end_time: null,
        status: 'pending',
        logs_uploaded: 0,
        bundle_downloaded: 0,
        error_message: null,
      })
    ).resolves.not.toThrow();
    
    // Verify it was created correctly
    const session = await dbManager.syncSessionRepository.findById(sessionId);
    expect(session).toBeTruthy();
    expect(session!.backend_session_id).toBe('test-backend-123');
  });

  it('should handle migration from old schema without backend_session_id', async () => {
    // Create a new database manager with a fresh database
    DatabaseManager.resetInstance();
    const testDbManager = DatabaseManager.getInstance({
      name: `test_old_schema_${Date.now()}.db`,
      location: 'default',
      encryption: false,
    });
    
    try {
      const db = await testDbManager.initialize();
      
      // Simulate old schema by dropping the column (if it exists) and recreating table
      await testDbManager.getDatabase().execAsync('DROP TABLE IF EXISTS sync_sessions');
      await testDbManager.getDatabase().execAsync(`
        CREATE TABLE sync_sessions (
          session_id TEXT PRIMARY KEY,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          status TEXT NOT NULL CHECK(status IN (
            'pending', 'uploading', 'downloading', 'complete', 'failed'
          )),
          logs_uploaded INTEGER DEFAULT 0,
          bundle_downloaded INTEGER DEFAULT 0,
          error_message TEXT
        )
      `);
      
      // Now run migrations
      await runMigrations(testDbManager.getDatabase());
      
      // Check that backend_session_id column now exists
      const columns = await testDbManager.getDatabase().getAllAsync('PRAGMA table_info(sync_sessions)');
      const backendSessionIdColumn = columns.find((col: any) => col.name === 'backend_session_id');
      
      expect(backendSessionIdColumn).toBeTruthy();
      
      // Test creating a session with the new column
      await testDbManager.runSql(
        'INSERT INTO sync_sessions (session_id, backend_session_id, start_time, status) VALUES (?, ?, ?, ?)',
        ['test-session', 'backend-123', Date.now(), 'pending']
      );
      
      const result = await testDbManager.executeSql(
        'SELECT backend_session_id FROM sync_sessions WHERE session_id = ?',
        ['test-session']
      );
      
      expect(result).toHaveLength(1);
      expect(result[0].backend_session_id).toBe('backend-123');
      
    } finally {
      await testDbManager.close();
    }
  });
});