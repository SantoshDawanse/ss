/**
 * Hint Repository for database operations.
 */

import { BaseRepository } from './BaseRepository';
import { Hint } from '../../models';

export interface HintRow {
  hint_id: string;
  quiz_id: string;
  question_id: string;
  level: number;
  hint_text: string;
}

export class HintRepository extends BaseRepository<HintRow> {
  constructor() {
    super('hints');
  }

  protected getIdColumn(): string {
    return 'hint_id';
  }

  /**
   * Insert a new hint.
   */
  async insert(hint: Hint, quizId: string, questionId: string): Promise<void> {
    try {
      await this.execute(
        `INSERT INTO ${this.tableName} (hint_id, quiz_id, question_id, level, hint_text) 
         VALUES (?, ?, ?, ?, ?)`,
        [hint.hintId, quizId, questionId, hint.level, hint.text]
      );
    } catch (error) {
      console.error('Error inserting hint:', error);
      throw new Error(`Failed to insert hint: ${error}`);
    }
  }

  /**
   * Create a new hint (accepts HintRow format).
   */
  async create(hint: HintRow): Promise<void> {
    try {
      await this.execute(
        `INSERT INTO ${this.tableName} (hint_id, quiz_id, question_id, level, hint_text) 
         VALUES (?, ?, ?, ?, ?)`,
        [hint.hint_id, hint.quiz_id, hint.question_id, hint.level, hint.hint_text]
      );
    } catch (error) {
      console.error('Error creating hint:', error);
      throw new Error(`Failed to create hint: ${error}`);
    }
  }

  /**
   * Find hints by quiz and question.
   */
  async findByQuizAndQuestion(
    quizId: string,
    questionId: string
  ): Promise<HintRow[]> {
    try {
      const result = await this.query(
        'SELECT * FROM hints WHERE quiz_id = ? AND question_id = ? ORDER BY level',
        [quizId, questionId]
      );

      return this.resultSetToArray(result);
    } catch (error) {
      console.error('Error finding hints:', error);
      throw new Error(`Failed to find hints: ${error}`);
    }
  }

  /**
   * Delete hints by quiz.
   */
  async deleteByQuiz(quizId: string): Promise<void> {
    try {
      await this.execute('DELETE FROM hints WHERE quiz_id = ?', [quizId]);
    } catch (error) {
      console.error('Error deleting hints:', error);
      throw new Error(`Failed to delete hints: ${error}`);
    }
  }

  /**
   * Map row to Hint.
   */
  mapRowToHint(row: HintRow): Hint {
    return {
      hintId: row.hint_id,
      level: row.level,
      text: row.hint_text,
    };
  }
}
