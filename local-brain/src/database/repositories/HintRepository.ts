/**
 * Hint Repository for database operations.
 */

import { DatabaseManager } from '../DatabaseManager';
import { Hint } from '../../models';

export class HintRepository {
  constructor(private dbManager: DatabaseManager) {}

  async findByQuizAndQuestion(
    quizId: string,
    questionId: string
  ): Promise<Hint[]> {
    const db = await this.dbManager.getDatabase();
    const result = await db.executeSql(
      'SELECT * FROM hints WHERE quiz_id = ? AND question_id = ? ORDER BY level',
      [quizId, questionId]
    );

    const hints: Hint[] = [];
    for (let i = 0; i < result[0].rows.length; i++) {
      hints.push(this.mapRowToHint(result[0].rows.item(i)));
    }

    return hints;
  }

  async findById(hintId: string): Promise<Hint | null> {
    const db = await this.dbManager.getDatabase();
    const result = await db.executeSql(
      'SELECT * FROM hints WHERE hint_id = ?',
      [hintId]
    );

    if (result[0].rows.length === 0) {
      return null;
    }

    return this.mapRowToHint(result[0].rows.item(0));
  }

  async create(hint: Hint, quizId: string, questionId: string): Promise<void> {
    const db = await this.dbManager.getDatabase();
    await db.executeSql(
      `INSERT INTO hints (hint_id, quiz_id, question_id, level, hint_text) 
       VALUES (?, ?, ?, ?, ?)`,
      [hint.hintId, quizId, questionId, hint.level, hint.text]
    );
  }

  async delete(hintId: string): Promise<void> {
    const db = await this.dbManager.getDatabase();
    await db.executeSql('DELETE FROM hints WHERE hint_id = ?', [hintId]);
  }

  async deleteByQuiz(quizId: string): Promise<void> {
    const db = await this.dbManager.getDatabase();
    await db.executeSql('DELETE FROM hints WHERE quiz_id = ?', [quizId]);
  }

  private mapRowToHint(row: any): Hint {
    return {
      hintId: row.hint_id,
      level: row.level,
      text: row.hint_text,
    };
  }
}
