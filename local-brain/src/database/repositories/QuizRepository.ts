/**
 * Quiz Repository for database operations.
 */

import { DatabaseManager } from '../DatabaseManager';
import { Quiz, Question } from '../../models';

export class QuizRepository {
  constructor(private dbManager: DatabaseManager) {}

  async findById(quizId: string): Promise<Quiz | null> {
    const db = await this.dbManager.getDatabase();
    const result = await db.executeSql(
      'SELECT * FROM quizzes WHERE quiz_id = ?',
      [quizId]
    );

    if (result[0].rows.length === 0) {
      return null;
    }

    const row = result[0].rows.item(0);
    return this.mapRowToQuiz(row);
  }

  async findByBundleAndSubject(
    bundleId: string,
    subject: string
  ): Promise<Array<{ quizId: string }>> {
    const db = await this.dbManager.getDatabase();
    const result = await db.executeSql(
      'SELECT quiz_id FROM quizzes WHERE bundle_id = ? AND subject = ? ORDER BY quiz_id',
      [bundleId, subject]
    );

    const quizzes: Array<{ quizId: string }> = [];
    for (let i = 0; i < result[0].rows.length; i++) {
      quizzes.push({ quizId: result[0].rows.item(i).quiz_id });
    }

    return quizzes;
  }

  async create(quiz: Quiz, bundleId: string): Promise<void> {
    const db = await this.dbManager.getDatabase();
    await db.executeSql(
      `INSERT INTO quizzes (
        quiz_id, bundle_id, subject, topic, title, difficulty, 
        time_limit, questions_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quiz.quizId,
        bundleId,
        quiz.subject,
        quiz.topic,
        quiz.title,
        quiz.difficulty,
        quiz.timeLimit || null,
        JSON.stringify(quiz.questions),
      ]
    );
  }

  async delete(quizId: string): Promise<void> {
    const db = await this.dbManager.getDatabase();
    await db.executeSql('DELETE FROM quizzes WHERE quiz_id = ?', [quizId]);
  }

  async deleteByBundle(bundleId: string): Promise<void> {
    const db = await this.dbManager.getDatabase();
    await db.executeSql('DELETE FROM quizzes WHERE bundle_id = ?', [bundleId]);
  }

  private mapRowToQuiz(row: any): Quiz {
    return {
      quizId: row.quiz_id,
      subject: row.subject,
      topic: row.topic,
      title: row.title,
      difficulty: row.difficulty,
      timeLimit: row.time_limit,
      questions: JSON.parse(row.questions_json) as Question[],
    };
  }
}
