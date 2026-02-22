/**
 * Repository for study_tracks table operations.
 */

import { BaseRepository } from './BaseRepository';
import { StudyTrack } from '../../models';

export interface StudyTrackRow {
  track_id: string;
  bundle_id: string;
  subject: string;
  weeks_json: string;
}

export class StudyTrackRepository extends BaseRepository<StudyTrackRow> {
  constructor() {
    super('study_tracks');
  }

  protected getIdColumn(): string {
    return 'track_id';
  }

  /**
   * Create a new study track.
   */
  public async create(track: StudyTrackRow): Promise<void> {
    try {
      await this.execute(
        `INSERT INTO ${this.tableName} 
        (track_id, bundle_id, subject, weeks_json)
        VALUES (?, ?, ?, ?)`,
        [track.track_id, track.bundle_id, track.subject, track.weeks_json],
      );
    } catch (error) {
      console.error('Error creating study track:', error);
      throw new Error(`Failed to create study track: ${error}`);
    }
  }

  /**
   * Insert a new study track (accepts StudyTrack model).
   */
  public async insert(track: StudyTrack, bundleId: string): Promise<void> {
    try {
      await this.execute(
        `INSERT INTO ${this.tableName} 
        (track_id, bundle_id, subject, weeks_json)
        VALUES (?, ?, ?, ?)`,
        [track.trackId, bundleId, track.subject, JSON.stringify(track.weeks)],
      );
    } catch (error) {
      console.error('Error inserting study track:', error);
      throw new Error(`Failed to insert study track: ${error}`);
    }
  }

  /**
   * Bulk insert study tracks in a transaction.
   */
  public async bulkCreate(tracks: StudyTrackRow[]): Promise<void> {
    try {
      await this.executeTransaction(async tx => {
        for (const track of tracks) {
          await tx.executeSql(
            `INSERT INTO ${this.tableName} 
            (track_id, bundle_id, subject, weeks_json)
            VALUES (?, ?, ?, ?)`,
            [track.track_id, track.bundle_id, track.subject, track.weeks_json],
          );
        }
      });
    } catch (error) {
      console.error('Error bulk creating study tracks:', error);
      throw new Error(`Failed to bulk create study tracks: ${error}`);
    }
  }

  /**
   * Find study tracks by bundle ID.
   */
  public async findByBundle(bundleId: string): Promise<StudyTrackRow[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE bundle_id = ?`,
        [bundleId],
      );

      return this.resultSetToArray(result);
    } catch (error) {
      console.error('Error finding study tracks by bundle:', error);
      throw new Error(`Failed to find study tracks: ${error}`);
    }
  }

  /**
   * Find study track by bundle and subject.
   */
  public async findByBundleAndSubject(
    bundleId: string,
    subject: string,
  ): Promise<StudyTrackRow | null> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} 
        WHERE bundle_id = ? AND subject = ? 
        LIMIT 1`,
        [bundleId, subject],
      );

      if (result.length === 0) {
        return null;
      }

      return this.rowToObject(result[0]);
    } catch (error) {
      console.error('Error finding study track by bundle/subject:', error);
      throw new Error(`Failed to find study track: ${error}`);
    }
  }

  /**
   * Parse study track from row data.
   */
  public parseTrack(row: StudyTrackRow): StudyTrack {
    return {
      trackId: row.track_id,
      subject: row.subject,
      weeks: JSON.parse(row.weeks_json),
    };
  }

  /**
   * Delete study tracks by bundle ID.
   */
  public async deleteByBundle(bundleId: string): Promise<void> {
    try {
      await this.execute(
        `DELETE FROM ${this.tableName} WHERE bundle_id = ?`,
        [bundleId],
      );
    } catch (error) {
      console.error('Error deleting study tracks by bundle:', error);
      throw new Error(`Failed to delete study tracks: ${error}`);
    }
  }
}
