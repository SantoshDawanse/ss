/**
 * Database migration system for handling schema changes.
 * Each migration has a version number and up/down SQL statements.
 */

export interface Migration {
  version: number;
  description: string;
  up: string[];
  down: string[];
}

/**
 * All database migrations in order.
 * Add new migrations to the end of this array.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Ensure backend_session_id column exists in sync_sessions table',
    up: [
      // This migration ensures the backend_session_id column exists
      // It's safe to run on both new and existing databases
      `ALTER TABLE sync_sessions ADD COLUMN backend_session_id TEXT;`,
    ],
    down: [
      // SQLite doesn't support DROP COLUMN easily, so we'd need to recreate the table
      // For now, we'll leave this empty as downgrading is rarely needed in production
    ],
  },
];

/**
 * Get the current database schema version.
 */
export async function getCurrentVersion(db: any): Promise<number> {
  try {
    // Try to get version from schema_version table
    const result = await db.getFirstAsync<{ version: number }>(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
    );
    return result?.version || 0;
  } catch (error) {
    // Table doesn't exist, this is version 0
    return 0;
  }
}

/**
 * Create schema_version table if it doesn't exist.
 */
export async function createVersionTable(db: any): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL,
      description TEXT NOT NULL
    );
  `);
}

/**
 * Record that a migration has been applied.
 */
export async function recordMigration(
  db: any,
  version: number,
  description: string
): Promise<void> {
  await db.runAsync(
    'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)',
    [version, Date.now(), description]
  );
}

/**
 * Check if a column exists in a table.
 */
async function columnExists(db: any, tableName: string, columnName: string): Promise<boolean> {
  try {
    const result = await db.getAllAsync(`PRAGMA table_info(${tableName})`);
    return result.some((col: any) => col.name === columnName);
  } catch (error) {
    console.error(`Error checking column existence:`, error);
    return false;
  }
}

/**
 * Check if a table exists.
 */
async function tableExists(db: any, tableName: string): Promise<boolean> {
  try {
    const result = await db.getFirstAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [tableName]
    );
    return !!result;
  } catch (error) {
    console.error(`Error checking table existence:`, error);
    return false;
  }
}

/**
 * Run all pending migrations.
 */
export async function runMigrations(db: any): Promise<void> {
  try {
    console.log('[Migration] Starting migration process...');
    
    // Create version table if needed
    await createVersionTable(db);

    // Get current version
    const currentVersion = await getCurrentVersion(db);
    console.log(`[Migration] Current schema version: ${currentVersion}`);
    
    // Find migrations that need to be applied
    const pendingMigrations = MIGRATIONS.filter(m => m.version > currentVersion);
    
    if (pendingMigrations.length === 0) {
      console.log('[Migration] Database schema is up to date');
      return;
    }

    console.log(`[Migration] Running ${pendingMigrations.length} pending migration(s)...`);

    // Run each migration in a transaction
    for (const migration of pendingMigrations) {
      console.log(`[Migration] Applying migration ${migration.version}: ${migration.description}`);
      
      await db.withTransactionAsync(async () => {
        // Execute all up statements
        for (const sql of migration.up) {
          try {
            // Special handling for ALTER TABLE ADD COLUMN
            if (sql.includes('ALTER TABLE') && sql.includes('ADD COLUMN')) {
              const match = sql.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/);
              if (match) {
                const [, tableName, columnName] = match;
                
                // Check if table exists first
                const tableExistsResult = await tableExists(db, tableName);
                if (!tableExistsResult) {
                  console.log(`[Migration] Table ${tableName} doesn't exist, skipping column addition`);
                  continue;
                }
                
                // Check if column already exists
                const exists = await columnExists(db, tableName, columnName);
                if (exists) {
                  console.log(`[Migration] Column ${columnName} already exists in ${tableName}, skipping`);
                  continue;
                }
              }
            }
            
            console.log(`[Migration] Executing: ${sql}`);
            await db.execAsync(sql);
            console.log(`[Migration] Successfully executed: ${sql}`);
          } catch (error: any) {
            // If column already exists, that's okay - skip it
            if (error.message?.includes('duplicate column name')) {
              console.log(`[Migration] Column already exists, skipping: ${sql}`);
              continue;
            }
            
            console.error(`[Migration] Error executing SQL: ${sql}`, error);
            throw error;
          }
        }
        
        // Record the migration
        await recordMigration(db, migration.version, migration.description);
      });
      
      console.log(`[Migration] Migration ${migration.version} applied successfully`);
    }

    console.log('[Migration] All migrations completed successfully');
  } catch (error) {
    console.error('[Migration] Migration failed:', error);
    throw new Error(`Migration failed: ${error}`);
  }
}
