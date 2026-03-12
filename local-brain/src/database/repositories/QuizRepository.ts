/**
 * Quiz Repository for database operations.
 */

import { BaseRepository } from './BaseRepository';
import { Quiz, Question } from '../../models';

export interface QuizRow {
  quiz_id: string;
  bundle_id: string;
  subject: string;
  topic: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  time_limit: number | null;
  questions_json: string;
}

export class QuizRepository extends BaseRepository<QuizRow> {
  constructor() {
    super('quizzes');
  }

  protected getIdColumn(): string {
    return 'quiz_id';
  }

  /**
   * Insert a new quiz.
   */
  async insert(quiz: Quiz, bundleId: string): Promise<void> {
    try {
      await this.execute(
        `INSERT INTO ${this.tableName} (
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
    } catch (error) {
      console.error('Error inserting quiz:', error);
      throw new Error(`Failed to insert quiz: ${error}`);
    }
  }

  /**
   * Create a new quiz (accepts QuizRow format).
   */
  async create(quiz: QuizRow): Promise<void>;
  async create(quiz: Quiz, bundleId: string): Promise<void>;
  async create(quiz: Quiz | QuizRow, bundleId?: string): Promise<void> {
    try {
      if ('quizId' in quiz && bundleId) {
        // Quiz object with bundleId
        await this.execute(
          `INSERT INTO ${this.tableName} (
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
      } else {
        // QuizRow format
        const quizRow = quiz as QuizRow;
        await this.execute(
          `INSERT INTO ${this.tableName} (
            quiz_id, bundle_id, subject, topic, title, difficulty, 
            time_limit, questions_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            quizRow.quiz_id,
            quizRow.bundle_id,
            quizRow.subject,
            quizRow.topic,
            quizRow.title,
            quizRow.difficulty,
            quizRow.time_limit,
            quizRow.questions_json,
          ]
        );
      }
    } catch (error) {
      console.error('Error creating quiz:', error);
      throw new Error(`Failed to create quiz: ${error}`);
    }
  }

  /**
   * Find quizzes by bundle and subject.
   */
  async findByBundleAndSubject(
    bundleId: string,
    subject: string
  ): Promise<Array<{ quizId: string }>> {
    try {
      const result = await this.query(
        'SELECT quiz_id FROM quizzes WHERE bundle_id = ? AND subject = ? ORDER BY quiz_id',
        [bundleId, subject]
      );

      return result.map(row => ({ quizId: row.quiz_id }));
    } catch (error) {
      console.error('Error finding quizzes:', error);
      throw new Error(`Failed to find quizzes: ${error}`);
    }
  }

  /**
   * Find quizzes by subject and topic.
   */
  async findBySubjectAndTopic(
    subject: string,
    topic: string
  ): Promise<QuizRow[]> {
    try {
      const result = await this.query(
        'SELECT * FROM quizzes WHERE subject = ? AND topic = ? ORDER BY quiz_id',
        [subject, topic]
      );

      return this.resultSetToArray(result);
    } catch (error) {
      console.error('Error finding quizzes by subject and topic:', error);
      throw new Error(`Failed to find quizzes: ${error}`);
    }
  }

  /**
   * Delete quizzes by bundle.
   */
  async deleteByBundle(bundleId: string): Promise<void> {
    try {
      await this.execute('DELETE FROM quizzes WHERE bundle_id = ?', [bundleId]);
    } catch (error) {
      console.error('Error deleting quizzes:', error);
      throw new Error(`Failed to delete quizzes: ${error}`);
    }
  }

  /**
   * Parse quiz from row.
   */
  parseQuiz(row: QuizRow): Quiz {
    const rawQuestions = JSON.parse(row.questions_json);
    
    // Transform snake_case fields to camelCase
    const questions: Question[] = rawQuestions.map((q: any) => ({
      questionId: q.question_id || q.questionId,
      type: q.question_type || q.type,
      question: q.question,
      options: q.options,
      correctAnswer: q.correct_answer || q.correctAnswer,
      explanation: q.explanation,
      curriculumStandard: q.curriculum_standard || q.curriculumStandard,
      bloomLevel: q.bloom_level || q.bloomLevel || 1,
    }));

    return {
      quizId: row.quiz_id,
      subject: row.subject,
      topic: row.topic,
      title: row.title,
      difficulty: row.difficulty,
      timeLimit: row.time_limit || undefined,
      questions,
    };
  }
}
