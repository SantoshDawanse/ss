/**
 * Repository for learning_bundles table operations.
 */

import { BaseRepository } from './BaseRepository';

export interface LearningBundleRow {
  bundle_id: string;
  student_id: string;
  valid_from: number;
  valid_until: number;
  total_size: number;
  checksum: string;
  status: 'active' | 'archived';
}

export class LearningBundleRepository extends BaseRepository<LearningBundleRow> {
  constructor() {
    super('learning_bundles');
  }

  protected getIdColumn(): string {
    return 'bundle_id';
  }

  /**
   * Create a new learning bundle.
   */
  public async create(bundle: LearningBundleRow): Promise<void> {
    try {
      await this.execute(
        `INSERT INTO ${this.tableName} 
        (bundle_id, student_id, valid_from, valid_until, total_size, checksum, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          bundle.bundle_id,
          bundle.student_id,
          bundle.valid_from,
          bundle.valid_until,
          bundle.total_size,
          bundle.checksum,
          bundle.status,
        ],
      );
    } catch (error) {
      console.error('Error creating learning bundle:', error);
      throw new Error(`Failed to create learning bundle: ${error}`);
    }
  }

  /**
   * Update learning bundle status.
   */
  public async updateStatus(
    bundleId: string,
    status: 'active' | 'archived',
  ): Promise<void> {
    try {
      await this.execute(
        `UPDATE ${this.tableName} SET status = ? WHERE bundle_id = ?`,
        [status, bundleId],
      );
    } catch (error) {
      console.error('Error updating bundle status:', error);
      throw new Error(`Failed to update bundle status: ${error}`);
    }
  }

  /**
   * Find bundle by bundle_id.
   */
  public async findById(bundleId: string): Promise<LearningBundleRow | null> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE bundle_id = ?`,
        [bundleId],
      );

      if (result.length === 0) {
        return null;
      }

      return this.rowToObject(result[0]);
    } catch (error) {
      console.error('Error finding bundle by ID:', error);
      throw new Error(`Failed to find bundle by ID: ${error}`);
    }
  }

  /**
   * Find active bundle for a student.
   */
  public async findActiveByStudent(
    studentId: string,
  ): Promise<LearningBundleRow | null> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} 
        WHERE student_id = ? AND status = 'active' 
        ORDER BY valid_from DESC LIMIT 1`,
        [studentId],
      );

      if (result.length === 0) {
        return null;
      }

      return this.rowToObject(result[0]);
    } catch (error) {
      console.error('Error finding active bundle:', error);
      throw new Error(`Failed to find active bundle: ${error}`);
    }
  }

  /**
   * Alias for findActiveByStudent for compatibility.
   */
  public async getActiveBundle(studentId: string): Promise<LearningBundleRow | null> {
    return this.findActiveByStudent(studentId);
  }

  /**
   * Insert a new learning bundle.
   */
  public async insert(bundle: any): Promise<void> {
    try {
      await this.execute(
        `INSERT INTO ${this.tableName} 
        (bundle_id, student_id, valid_from, valid_until, total_size, checksum, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          bundle.bundleId,
          bundle.studentId,
          bundle.validFrom.getTime(),
          bundle.validUntil.getTime(),
          bundle.totalSize,
          bundle.checksum,
          'active',
        ],
      );
    } catch (error) {
      console.error('Error inserting learning bundle:', error);
      throw new Error(`Failed to insert learning bundle: ${error}`);
    }
  }

  /**
   * Find all bundles for a student.
   */
  public async findByStudent(studentId: string): Promise<LearningBundleRow[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} 
        WHERE student_id = ? 
        ORDER BY valid_from DESC`,
        [studentId],
      );

      return this.resultSetToArray(result);
    } catch (error) {
      console.error('Error finding bundles by student:', error);
      throw new Error(`Failed to find bundles: ${error}`);
    }
  }

  /**
   * Archive old bundles for a student (keep only active).
   */
  public async archiveOldBundles(studentId: string): Promise<void> {
    try {
      await this.execute(
        `UPDATE ${this.tableName} 
        SET status = ? 
        WHERE student_id = ? AND status = ?`,
        ['archived', studentId, 'active'],
      );
    } catch (error) {
      console.error('Error archiving old bundles:', error);
      throw new Error(`Failed to archive bundles: ${error}`);
    }
  }

  /**
   * Delete archived bundles older than specified timestamp.
   */
  public async deleteArchivedBefore(timestamp: number): Promise<void> {
    try {
      await this.execute(
        `DELETE FROM ${this.tableName} 
        WHERE status = 'archived' AND valid_until < ?`,
        [timestamp],
      );
    } catch (error) {
      console.error('Error deleting archived bundles:', error);
      throw new Error(`Failed to delete archived bundles: ${error}`);
    }
  }
}
