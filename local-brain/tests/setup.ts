/**
 * Jest test setup configuration.
 */

import 'react-native-gesture-handler/jestSetup';

// Mock react-native modules
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock SQLite with in-memory database simulation
// Note: Mock factory must be self-contained (no external imports)
jest.mock('react-native-sqlite-storage', () => {
  let mockDatabaseInstance: any = null;

  const createMockDatabase = () => {
    const tables = new Map();
    const tableNames = [
      'learning_bundles',
      'lessons',
      'quizzes',
      'hints',
      'performance_logs',
      'sync_sessions',
      'student_state',
      'study_tracks',
    ];

    tableNames.forEach(name => {
      tables.set(name, {
        rows: new Map(),
        autoIncrement: 1,
      });
    });

    return {
      tables,
      foreignKeysEnabled: false,

      async executeSql(sql: string, params: any[] = []) {
        const normalizedSql = sql.trim().toUpperCase();

        // Handle PRAGMA, CREATE, DROP statements
        if (
          normalizedSql.startsWith('PRAGMA') ||
          normalizedSql.startsWith('CREATE') ||
          normalizedSql.startsWith('DROP')
        ) {
          if (normalizedSql.includes('FOREIGN_KEYS')) {
            this.foreignKeysEnabled = true;
          }
          if (normalizedSql.startsWith('DROP TABLE')) {
            const match = sql.match(/DROP TABLE IF EXISTS (\w+)/i);
            if (match) {
              const table = this.tables.get(match[1]);
              if (table) {
                table.rows.clear();
                table.autoIncrement = 1;
              }
            }
          }
          return [{ rows: { length: 0, item: () => null }, rowsAffected: 0 }];
        }

        // Handle INSERT
        if (normalizedSql.startsWith('INSERT INTO')) {
          const tableMatch = sql.match(/INSERT INTO (\w+)/i);
          const table = this.tables.get(tableMatch[1]);
          const columnsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
          const columns = columnsMatch[1].split(',').map((c: string) => c.trim());
          const row: any = {};

          columns.forEach((col: string, index: number) => {
            row[col] = params[index];
          });

          let primaryKey: any;
          if (tableMatch[1] === 'performance_logs') {
            primaryKey = table.autoIncrement++;
            row['log_id'] = primaryKey;
          } else {
            primaryKey = row[columns[0]];
          }

          if (table.rows.has(primaryKey)) {
            throw new Error(`UNIQUE constraint failed`);
          }

          table.rows.set(primaryKey, row);
          return [
            {
              rows: { length: 0, item: () => null },
              rowsAffected: 1,
              insertId: typeof primaryKey === 'number' ? primaryKey : 0,
            },
          ];
        }

        // Handle SELECT
        if (normalizedSql.startsWith('SELECT')) {
          const tableMatch = sql.match(/FROM (\w+)/i);
          const table = this.tables.get(tableMatch[1]);
          let results = Array.from(table.rows.values());

          // Simple WHERE filtering
          if (sql.toUpperCase().includes('WHERE')) {
            const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
            if (whereMatch && params.length > 0) {
              const column = whereMatch[1];
              results = results.filter((row: any) => row[column] === params[0]);
            }
          }

          // Handle LIMIT
          if (sql.toUpperCase().includes('LIMIT')) {
            const limitMatch = sql.match(/LIMIT (\d+)/i);
            if (limitMatch) {
              results = results.slice(0, parseInt(limitMatch[1]));
            }
          }

          // Handle COUNT(*)
          if (sql.toUpperCase().includes('COUNT(*)')) {
            return [
              {
                rows: {
                  length: 1,
                  item: () => ({ count: results.length }),
                },
                rowsAffected: 0,
              },
            ];
          }

          return [
            {
              rows: {
                length: results.length,
                item: (index: number) => results[index],
              },
              rowsAffected: 0,
            },
          ];
        }

        // Handle UPDATE
        if (normalizedSql.startsWith('UPDATE')) {
          const tableMatch = sql.match(/UPDATE (\w+)/i);
          const table = this.tables.get(tableMatch[1]);
          let results = Array.from(table.rows.entries());

          if (sql.toUpperCase().includes('WHERE')) {
            const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
            if (whereMatch) {
              const column = whereMatch[1];
              const value = params[params.length - 1];
              results = results.filter(([_, row]: any) => row[column] === value);
            }
          }

          const setMatch = sql.match(/SET (.+?) WHERE/i) || sql.match(/SET (.+)$/i);
          if (setMatch) {
            const updates = setMatch[1].split(',');
            let paramIndex = 0;

            results.forEach(([key, row]: any) => {
              updates.forEach((update: string) => {
                const [column] = update.split('=').map((s: string) => s.trim());
                row[column] = params[paramIndex++];
              });
            });
          }

          return [
            {
              rows: { length: 0, item: () => null },
              rowsAffected: results.length,
            },
          ];
        }

        // Handle DELETE
        if (normalizedSql.startsWith('DELETE')) {
          const tableMatch = sql.match(/FROM (\w+)/i);
          const table = this.tables.get(tableMatch[1]);
          let deleted = 0;

          if (sql.toUpperCase().includes('WHERE')) {
            const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
            if (whereMatch && params.length > 0) {
              const column = whereMatch[1];
              const value = params[0];
              Array.from(table.rows.entries()).forEach(([key, row]: any) => {
                if (row[column] === value) {
                  table.rows.delete(key);
                  deleted++;
                }
              });
            }
          } else {
            deleted = table.rows.size;
            table.rows.clear();
          }

          return [
            {
              rows: { length: 0, item: () => null },
              rowsAffected: deleted,
            },
          ];
        }

        return [{ rows: { length: 0, item: () => null }, rowsAffected: 0 }];
      },

      async transaction(callback: any) {
        const tx = {
          executeSql: this.executeSql.bind(this),
        };
        try {
          await callback(tx);
        } catch (error) {
          throw error;
        }
      },

      async close() {
        // No-op
      },
    };
  };

  return {
    enablePromise: jest.fn(),
    openDatabase: jest.fn(() => {
      if (!mockDatabaseInstance) {
        mockDatabaseInstance = createMockDatabase();
      }
      return Promise.resolve(mockDatabaseInstance);
    }),
    default: {
      enablePromise: jest.fn(),
      openDatabase: jest.fn(() => {
        if (!mockDatabaseInstance) {
          mockDatabaseInstance = createMockDatabase();
        }
        return Promise.resolve(mockDatabaseInstance);
      }),
    },
  };
});

// Silence console warnings in tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};

