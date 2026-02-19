/**
 * Base repository class providing common database operations.
 * All specific repositories extend this class.
 */

import { DatabaseManager } from '../DatabaseManager';
import SQLite from 'react-native-sqlite-storage';

export abstract class BaseRepository<T> {
  protected dbManager: DatabaseManager;
  protected tableName: string;

  constructor(tableName: string) {
    this.dbManager = DatabaseManager.getInstance();
    this.tableName = tableName;
  }

  /**
   * Execute a SQL query and return results.
   */
  protected async query(
    sql: string,
    params: any[] = [],
  ): Promise<SQLite.ResultSet> {
    const [result] = await this.dbManager.executeSql(sql, params);
    return result;
  }

  /**
   * Execute a SQL statement (INSERT, UPDATE, DELETE).
   */
  protected async execute(sql: string, params: any[] = []): Promise<void> {
    await this.dbManager.executeSql(sql, params);
  }

  /**
   * Execute multiple operations in a transaction.
   */
  protected async executeTransaction(
    operations: (tx: SQLite.Transaction) => Promise<void>,
  ): Promise<void> {
    await this.dbManager.transaction(operations);
  }

  /**
   * Convert ResultSet row to typed object.
   */
  protected rowToObject(row: any): T {
    return row as T;
  }

  /**
   * Convert ResultSet to array of typed objects.
   */
  protected resultSetToArray(resultSet: SQLite.ResultSet): T[] {
    const items: T[] = [];
    for (let i = 0; i < resultSet.rows.length; i++) {
      items.push(this.rowToObject(resultSet.rows.item(i)));
    }
    return items;
  }

  /**
   * Find record by ID.
   */
  public async findById(id: string | number): Promise<T | null> {
    try {
      const idColumn = this.getIdColumn();
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE ${idColumn} = ? LIMIT 1`,
        [id],
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.rowToObject(result.rows.item(0));
    } catch (error) {
      console.error(`Error finding ${this.tableName} by ID:`, error);
      throw new Error(`Failed to find ${this.tableName}: ${error}`);
    }
  }

  /**
   * Find all records.
   */
  public async findAll(): Promise<T[]> {
    try {
      const result = await this.query(`SELECT * FROM ${this.tableName}`);
      return this.resultSetToArray(result);
    } catch (error) {
      console.error(`Error finding all ${this.tableName}:`, error);
      throw new Error(`Failed to find all ${this.tableName}: ${error}`);
    }
  }

  /**
   * Delete record by ID.
   */
  public async deleteById(id: string | number): Promise<void> {
    try {
      const idColumn = this.getIdColumn();
      await this.execute(
        `DELETE FROM ${this.tableName} WHERE ${idColumn} = ?`,
        [id],
      );
    } catch (error) {
      console.error(`Error deleting ${this.tableName}:`, error);
      throw new Error(`Failed to delete ${this.tableName}: ${error}`);
    }
  }

  /**
   * Count total records.
   */
  public async count(): Promise<number> {
    try {
      const result = await this.query(
        `SELECT COUNT(*) as count FROM ${this.tableName}`,
      );
      return result.rows.item(0).count;
    } catch (error) {
      console.error(`Error counting ${this.tableName}:`, error);
      throw new Error(`Failed to count ${this.tableName}: ${error}`);
    }
  }

  /**
   * Delete all records from table.
   */
  public async deleteAll(): Promise<void> {
    try {
      await this.execute(`DELETE FROM ${this.tableName}`);
    } catch (error) {
      console.error(`Error deleting all ${this.tableName}:`, error);
      throw new Error(`Failed to delete all ${this.tableName}: ${error}`);
    }
  }

  /**
   * Get the primary key column name for this table.
   * Override in subclasses if different from default.
   */
  protected abstract getIdColumn(): string;
}
