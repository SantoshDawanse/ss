/**
 * Mock implementation of expo-sqlite for testing.
 * Provides an in-memory database simulation.
 */

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

    execSync(sql: string, params: any[] = []) {
      const normalizedSql = sql.trim().toUpperCase();

      // Handle PRAGMA table_info
      if (normalizedSql.startsWith('PRAGMA TABLE_INFO')) {
        const match = sql.match(/PRAGMA TABLE_INFO\((\w+)\)/i);
        if (match) {
          const tableName = match[1];
          // Return mock column info for sync_sessions table
          if (tableName === 'sync_sessions') {
            const columns = [
              { cid: 0, name: 'session_id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 },
              { cid: 1, name: 'backend_session_id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
              { cid: 2, name: 'start_time', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
              { cid: 3, name: 'end_time', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
              { cid: 4, name: 'status', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
              { cid: 5, name: 'logs_uploaded', type: 'INTEGER', notnull: 0, dflt_value: '0', pk: 0 },
              { cid: 6, name: 'bundle_downloaded', type: 'INTEGER', notnull: 0, dflt_value: '0', pk: 0 },
              { cid: 7, name: 'error_message', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
            ];
            return [{
              rows: {
                length: columns.length,
                item: (index: number) => columns[index]
              },
              rowsAffected: 0,
              insertId: 0
            }];
          }
          if (tableName === 'schema_version') {
            const columns = [
              { cid: 0, name: 'version', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
              { cid: 1, name: 'applied_at', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
              { cid: 2, name: 'description', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
            ];
            return [{
              rows: {
                length: columns.length,
                item: (index: number) => columns[index]
              },
              rowsAffected: 0,
              insertId: 0
            }];
          }
          return [{
            rows: { length: 0, item: () => null },
            rowsAffected: 0,
            insertId: 0
          }];
        }
      }

      // Handle PRAGMA, CREATE, DROP statements
      if (
        normalizedSql.startsWith('PRAGMA') ||
        normalizedSql.startsWith('CREATE') ||
        normalizedSql.startsWith('DROP')
      ) {
        if (normalizedSql.includes('FOREIGN_KEYS')) {
          this.foreignKeysEnabled = true;
        }
        if (normalizedSql.startsWith('CREATE TABLE')) {
          const match = sql.match(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)/i);
          if (match && !this.tables.has(match[1])) {
            this.tables.set(match[1], {
              rows: new Map(),
              autoIncrement: 1,
            });
          }
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
        return [{ rows: { length: 0, item: () => null }, rowsAffected: 0, insertId: 0 }];
      }

      // Handle INSERT
      if (normalizedSql.startsWith('INSERT INTO')) {
        const tableMatch = sql.match(/INSERT INTO (\w+)/i);
        if (!tableMatch) {
          throw new Error('Invalid INSERT statement');
        }
        const table = this.tables.get(tableMatch[1]);
        const columnsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
        if (!columnsMatch) {
          throw new Error('Invalid INSERT statement - no columns');
        }
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

        // Handle ON CONFLICT (upsert)
        if (sql.toUpperCase().includes('ON CONFLICT')) {
          if (table.rows.has(primaryKey)) {
            // Update existing row
            const existingRow = table.rows.get(primaryKey);
            const updateMatch = sql.match(/DO UPDATE SET (.+)$/i);
            if (updateMatch) {
              const updates = updateMatch[1].split(',');
              updates.forEach((update: string) => {
                const [column, value] = update.split('=').map((s: string) => s.trim());
                // Handle excluded.column_name references
                if (value.startsWith('excluded.')) {
                  const excludedColumn = value.replace('excluded.', '');
                  existingRow[excludedColumn] = row[excludedColumn];
                } else {
                  existingRow[column] = row[column];
                }
              });
            }
            return [
              {
                rows: { length: 0, item: () => null },
                rowsAffected: 1,
                insertId: typeof primaryKey === 'number' ? primaryKey : 0,
              },
            ];
          }
        } else {
          // Regular INSERT - check for duplicate
          if (table.rows.has(primaryKey)) {
            throw new Error(`UNIQUE constraint failed`);
          }
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
        if (!tableMatch) {
          throw new Error('Invalid SELECT statement');
        }
        const tableName = tableMatch[1];
        const table = this.tables.get(tableName);
        
        // Handle sqlite_master queries
        if (tableName === 'sqlite_master') {
          const tableNames = Array.from(this.tables.keys());
          let results = tableNames.map(name => ({ name, type: 'table' }));
          
          // Filter by WHERE clause if present
          if (sql.toUpperCase().includes('WHERE')) {
            const nameMatch = sql.match(/name\s*=\s*'([^']+)'/i);
            if (nameMatch) {
              const targetName = nameMatch[1];
              results = results.filter(r => r.name === targetName);
            }
          }
          
          return [{
            rows: {
              length: results.length,
              item: (index: number) => results[index]
            },
            rowsAffected: 0,
            insertId: 0
          }];
        }
        
        // If table doesn't exist, return empty results
        if (!table) {
          return [{
            rows: { length: 0, item: () => null },
            rowsAffected: 0,
            insertId: 0
          }];
        }
        
        let results = Array.from(table.rows.values());

        // Count WHERE parameters to properly handle LIMIT parameter position
        let whereParamCount = 0;

        // Simple WHERE filtering
        if (sql.toUpperCase().includes('WHERE')) {
          // Handle WHERE with literal value (e.g., WHERE synced = 0)
          const whereLiteralMatch = sql.match(/WHERE\s+(\w+)\s*=\s*(\d+|'[^']*'|NULL)/i);
          if (whereLiteralMatch && !sql.match(/WHERE\s+\w+\s*=\s*\?/)) {
            const column = whereLiteralMatch[1];
            let value: any = whereLiteralMatch[2];
            // Parse the literal value
            if (value === 'NULL') {
              value = null;
            } else if (value.startsWith("'") && value.endsWith("'")) {
              value = value.slice(1, -1);
            } else if (!isNaN(Number(value))) {
              value = Number(value);
            }
            results = results.filter((row: any) => row[column] === value);
          }
          
          // Handle WHERE with parameter
          const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
          if (whereMatch && params.length > 0) {
            const column = whereMatch[1];
            const value = params[whereParamCount];
            results = results.filter((row: any) => row[column] === value);
            whereParamCount++;
          }
          
          // Handle WHERE with AND (param AND literal)
          const whereAndLiteralMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?\s+AND\s+(\w+)\s*=\s*(\d+|'[^']*'|NULL)/i);
          if (whereAndLiteralMatch) {
            const column1 = whereAndLiteralMatch[1];
            const column2 = whereAndLiteralMatch[2];
            let value2: any = whereAndLiteralMatch[3];
            // Parse the literal value
            if (value2 === 'NULL') {
              value2 = null;
            } else if (value2.startsWith("'") && value2.endsWith("'")) {
              value2 = value2.slice(1, -1);
            } else if (!isNaN(Number(value2))) {
              value2 = Number(value2);
            }
            results = results.filter((row: any) => 
              row[column1] === params[0] && row[column2] === value2
            );
            whereParamCount = 1;
          } else {
            // Handle WHERE with AND (both params)
            const whereAndMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?\s+AND\s+(\w+)\s*=\s*\?/i);
            if (whereAndMatch && params.length >= 2) {
              const column1 = whereAndMatch[1];
              const column2 = whereAndMatch[2];
              results = results.filter((row: any) => 
                row[column1] === params[0] && row[column2] === params[1]
              );
              whereParamCount = 2;
            }
          }
          
          // Handle WHERE IN clause
          const whereInMatch = sql.match(/WHERE\s+(\w+)\s+IN\s*\(([^)]+)\)/i);
          if (whereInMatch) {
            const column = whereInMatch[1];
            const placeholderCount = (whereInMatch[2].match(/\?/g) || []).length;
            const inParams = params.slice(0, placeholderCount);
            results = results.filter((row: any) => inParams.includes(row[column]));
            whereParamCount = placeholderCount;
          }
        }

        // Handle ORDER BY
        if (sql.toUpperCase().includes('ORDER BY')) {
          const orderMatch = sql.match(/ORDER BY\s+(\w+)(\s+(ASC|DESC))?/i);
          if (orderMatch) {
            const column = orderMatch[1];
            const direction = orderMatch[3]?.toUpperCase() || 'ASC';
            results.sort((a: any, b: any) => {
              if (a[column] < b[column]) return direction === 'ASC' ? -1 : 1;
              if (a[column] > b[column]) return direction === 'ASC' ? 1 : -1;
              // If equal, use log_id as tiebreaker for performance_logs
              if (a.log_id !== undefined && b.log_id !== undefined) {
                return direction === 'ASC' ? a.log_id - b.log_id : b.log_id - a.log_id;
              }
              return 0;
            });
          }
        }

        // Handle LIMIT (must be after WHERE and ORDER BY)
        if (sql.toUpperCase().includes('LIMIT')) {
          const limitMatch = sql.match(/LIMIT\s+\?/i);
          if (limitMatch) {
            // LIMIT parameter is at position whereParamCount
            const limitValue = params[whereParamCount];
            if (limitValue !== undefined && limitValue !== null) {
              results = results.slice(0, limitValue);
            }
          } else {
            const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
            if (limitMatch) {
              results = results.slice(0, parseInt(limitMatch[1]));
            }
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
              insertId: 0,
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
            insertId: 0,
          },
        ];
      }

      // Handle UPDATE
      if (normalizedSql.startsWith('UPDATE')) {
        const tableMatch = sql.match(/UPDATE (\w+)/i);
        if (!tableMatch) {
          throw new Error('Invalid UPDATE statement');
        }
        const table = this.tables.get(tableMatch[1]);

        // Parse SET clause to handle both parameterized and literal assignments
        const setMatch = sql.match(/SET\s+([\s\S]+?)(?:WHERE|$)/i);
        let setParams: any[] = [];
        let setAssignments: Array<{column: string, value: any, isParam: boolean}> = [];
        
        if (setMatch) {
          const setClause = setMatch[1].trim();
          // Count ? in SET clause to know how many params are for SET
          const setParamCount = (setClause.match(/\?/g) || []).length;
          setParams = params.slice(0, setParamCount);
          
          // Parse each assignment
          const assignments = setClause.split(',');
          let paramIndex = 0;
          
          assignments.forEach((assignment: string) => {
            const trimmed = assignment.trim();
            const [column, value] = trimmed.split('=').map((s: string) => s.trim());
            
            if (value === '?') {
              // Parameterized assignment
              setAssignments.push({
                column,
                value: setParams[paramIndex++],
                isParam: true
              });
            } else {
              // Literal assignment - parse the value
              let literalValue: any;
              if (value.startsWith("'") && value.endsWith("'")) {
                // String literal
                literalValue = value.slice(1, -1);
              } else if (value === 'NULL' || value === 'null') {
                literalValue = null;
              } else if (!isNaN(Number(value))) {
                // Number literal
                literalValue = Number(value);
              } else {
                // Keep as string
                literalValue = value;
              }
              setAssignments.push({
                column,
                value: literalValue,
                isParam: false
              });
            }
          });
        }

        // Parse WHERE clause to filter rows
        const whereParams = params.slice(setParams.length);
        let updatedCount = 0;
        
        if (sql.toUpperCase().includes('WHERE')) {
          // Handle WHERE IN clause
          const whereInMatch = sql.match(/WHERE\s+(\w+)\s+IN\s*\(([^)]+)\)/i);
          if (whereInMatch) {
            const whereColumn = whereInMatch[1];
            // For WHERE IN, all remaining params are for the IN clause
            table.rows.forEach((row: any) => {
              if (whereParams.includes(row[whereColumn])) {
                setAssignments.forEach(({column, value}) => {
                  row[column] = value;
                });
                updatedCount++;
              }
            });
          } else {
            // Handle WHERE with AND (including != operator for bundle archival)
            const whereAndNotEqualMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?\s+AND\s+(\w+)\s*!=\s*\?\s+AND\s+(\w+)\s*=\s*\?/i);
            if (whereAndNotEqualMatch) {
              const column1 = whereAndNotEqualMatch[1];
              const column2 = whereAndNotEqualMatch[2];
              const column3 = whereAndNotEqualMatch[3];
              table.rows.forEach((row: any) => {
                let condition1 = row[column1] === whereParams[0];
                let condition2 = row[column2] !== whereParams[1]; // != operator
                let condition3 = row[column3] === whereParams[2];
                
                if (condition1 && condition2 && condition3) {
                  setAssignments.forEach(({column, value}) => {
                    row[column] = value;
                  });
                  updatedCount++;
                }
              });
            } else {
              // Handle WHERE with AND (original simple case)
              const whereAndMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?\s+AND\s+(\w+)\s*=\s*\?/i);
              if (whereAndMatch) {
                const column1 = whereAndMatch[1];
                const column2 = whereAndMatch[2];
                table.rows.forEach((row: any) => {
                  if (row[column1] === whereParams[0] && row[column2] === whereParams[1]) {
                    setAssignments.forEach(({column, value}) => {
                      row[column] = value;
                    });
                    updatedCount++;
                  }
                });
              } else {
                // Handle simple WHERE clause
                const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
                if (whereMatch) {
                  const whereColumn = whereMatch[1];
                  table.rows.forEach((row: any) => {
                    if (row[whereColumn] === whereParams[0]) {
                      setAssignments.forEach(({column, value}) => {
                        row[column] = value;
                      });
                      updatedCount++;
                    }
                  });
                }
              }
            }
          }
        } else {
          // No WHERE clause - update all rows
          table.rows.forEach((row: any) => {
            setAssignments.forEach(({column, value}) => {
              row[column] = value;
            });
            updatedCount++;
          });
        }

        return [
          {
            rows: { length: 0, item: () => null },
            rowsAffected: updatedCount,
            insertId: 0,
          },
        ];
      }

      // Handle DELETE
      if (normalizedSql.startsWith('DELETE')) {
        const tableMatch = sql.match(/FROM (\w+)/i);
        if (!tableMatch) {
          throw new Error('Invalid DELETE statement');
        }
        const table = this.tables.get(tableMatch[1]);
        let deleted = 0;

        if (sql.toUpperCase().includes('WHERE')) {
          // Handle WHERE with literal value and < comparison (e.g., WHERE synced = 1 AND timestamp < ?)
          const whereLiteralLtMatch = sql.match(/WHERE\s+(\w+)\s*=\s*(\d+|'[^']*'|NULL)\s+AND\s+(\w+)\s*<\s*\?/i);
          if (whereLiteralLtMatch) {
            const column1 = whereLiteralLtMatch[1];
            let value1: any = whereLiteralLtMatch[2];
            // Parse the literal value
            if (value1 === 'NULL') {
              value1 = null;
            } else if (value1.startsWith("'") && value1.endsWith("'")) {
              value1 = value1.slice(1, -1);
            } else if (!isNaN(Number(value1))) {
              value1 = Number(value1);
            }
            const column2 = whereLiteralLtMatch[3];
            Array.from(table.rows.entries()).forEach(([key, row]: any) => {
              if (row[column1] === value1 && row[column2] < params[0]) {
                table.rows.delete(key);
                deleted++;
              }
            });
          } else {
            // Handle WHERE with < comparison (for timestamp) with parameters
            const whereLtMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?\s+AND\s+(\w+)\s*<\s*\?/i);
            if (whereLtMatch && params.length >= 2) {
              const column1 = whereLtMatch[1];
              const column2 = whereLtMatch[2];
              Array.from(table.rows.entries()).forEach(([key, row]: any) => {
                if (row[column1] === params[0] && row[column2] < params[1]) {
                  table.rows.delete(key);
                  deleted++;
                }
              });
            } else {
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
            }
          }
        } else {
          deleted = table.rows.size;
          table.rows.clear();
        }

        return [
          {
            rows: { length: 0, item: () => null },
            rowsAffected: deleted,
            insertId: 0,
          },
        ];
      }

      return [{ rows: { length: 0, item: () => null }, rowsAffected: 0, insertId: 0 }];
    },

    async transaction(callback: any) {
      const tx = {
        executeSql: this.execSync.bind(this),
      };
      try {
        await callback(tx);
      } catch (error) {
        throw error;
      }
    },

    async withTransactionAsync(callback: any) {
      // Simulate transaction behavior with rollback on error
      // Save current state of all tables
      const beforeState = new Map();
      this.tables.forEach((table, tableName) => {
        beforeState.set(tableName, {
          rows: new Map(table.rows),
          autoIncrement: table.autoIncrement,
        });
      });
      
      try {
        await callback();
        // Transaction succeeded, keep changes
      } catch (error) {
        // Transaction failed, rollback changes
        this.tables = beforeState;
        throw error;
      }
    },

    runSync(sql: string, params: any[] = []) {
      return this.execSync(sql, params);
    },

    execAsync(sql: string, params: any[] = []) {
      return Promise.resolve(this.execSync(sql, params));
    },

    runAsync(sql: string, params: any[] = []) {
      const result = this.execSync(sql, params);
      // Return SQLiteRunResult format
      return Promise.resolve({
        lastInsertRowId: result[0].insertId !== undefined ? result[0].insertId : 0,
        changes: result[0].rowsAffected || 0,
      });
    },

    getAllAsync(sql: string, params: any[] = []) {
      const result = this.execSync(sql, params);
      const rows = result[0].rows;
      const items = [];
      for (let i = 0; i < rows.length; i++) {
        items.push(rows.item(i));
      }
      return Promise.resolve(items);
    },

    getFirstAsync(sql: string, params: any[] = []) {
      const result = this.execSync(sql, params);
      const rows = result[0].rows;
      return Promise.resolve(rows.length > 0 ? rows.item(0) : null);
    },

    getAllSync(sql: string, params: any[] = []) {
      const result = this.execSync(sql, params);
      const rows = result[0].rows;
      const items = [];
      for (let i = 0; i < rows.length; i++) {
        items.push(rows.item(i));
      }
      return items;
    },

    getFirstSync(sql: string, params: any[] = []) {
      const result = this.execSync(sql, params);
      const rows = result[0].rows;
      return rows.length > 0 ? rows.item(0) : null;
    },

    async close() {
      // No-op
    },

    async closeAsync() {
      // No-op
    },

    runSql(sql: string, params: any[] = []) {
      return this.execSync(sql, params);
    },
  };
};

export const openDatabaseSync = (_name: string) => {
  // Create a new instance for each database name to avoid cross-test contamination
  mockDatabaseInstance = createMockDatabase();
  return mockDatabaseInstance;
};

export const openDatabaseAsync = async (_name: string) => {
  // Create a new instance for each database name to avoid cross-test contamination
  mockDatabaseInstance = createMockDatabase();
  return mockDatabaseInstance;
};

export class NativeDatabase {
  constructor(_name: string) {
    if (!mockDatabaseInstance) {
      mockDatabaseInstance = createMockDatabase();
    }
    return mockDatabaseInstance;
  }
}

export default {
  openDatabaseSync,
  openDatabaseAsync,
  NativeDatabase,
};
