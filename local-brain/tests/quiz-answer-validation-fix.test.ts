/**
 * Test for Quiz Answer Validation Fix
 * Verifies that correct_answer field mapping works correctly
 */

import { QuizRepository } from '../src/database/repositories/QuizRepository';

describe('Quiz Answer Validation Fix', () => {
  let quizRepository: QuizRepository;

  beforeEach(() => {
    quizRepository = new QuizRepository();
  });

  it('should correctly parse correct_answer from snake_case to camelCase', () => {
    const mockRow = {
      quiz_id: 'quiz-123',
      bundle_id: 'bundle-123',
      subject: 'Math',
      topic: 'Addition',
      title: 'Basic Addition',
      difficulty: 'easy' as const,
      time_limit: 10,
      questions_json: JSON.stringify([
        {
          question_id: 'q1',
          question_type: 'multiple_choice',
          question: 'What is 2 + 2?',
          options: ['3', '4', '5', '6'],
          correct_answer: '4',
          explanation: '2 + 2 equals 4',
          curriculum_standard: 'MATH.ADD.1',
          bloom_level: 1,
        },
        {
          question_id: 'q2',
          question_type: 'true_false',
          question: 'Is 5 + 5 = 10?',
          correct_answer: 'True',
          explanation: '5 + 5 equals 10',
          curriculum_standard: 'MATH.ADD.1',
          bloom_level: 1,
        },
      ]),
    };

    const quiz = quizRepository.parseQuiz(mockRow);

    expect(quiz.questions).toHaveLength(2);
    expect(quiz.questions[0].correctAnswer).toBe('4');
    expect(quiz.questions[0].type).toBe('multiple_choice');
    expect(quiz.questions[1].correctAnswer).toBe('True');
    expect(quiz.questions[1].type).toBe('true_false');
  });

  it('should handle both snake_case and camelCase formats', () => {
    const mockRow = {
      quiz_id: 'quiz-456',
      bundle_id: 'bundle-456',
      subject: 'Science',
      topic: 'Physics',
      title: 'Basic Physics',
      difficulty: 'medium' as const,
      time_limit: 15,
      questions_json: JSON.stringify([
        {
          questionId: 'q1',
          type: 'multiple_choice',
          question: 'What is force?',
          options: ['Push or pull', 'Energy', 'Matter'],
          correctAnswer: 'Push or pull',
          explanation: 'Force is a push or pull',
          curriculumStandard: 'SCI.PHY.1',
          bloomLevel: 2,
        },
      ]),
    };

    const quiz = quizRepository.parseQuiz(mockRow);

    expect(quiz.questions).toHaveLength(1);
    expect(quiz.questions[0].correctAnswer).toBe('Push or pull');
    expect(quiz.questions[0].questionId).toBe('q1');
  });

  it('should handle mixed format questions', () => {
    const mockRow = {
      quiz_id: 'quiz-789',
      bundle_id: 'bundle-789',
      subject: 'English',
      topic: 'Grammar',
      title: 'Grammar Basics',
      difficulty: 'easy' as const,
      time_limit: null,
      questions_json: JSON.stringify([
        {
          question_id: 'q1',
          question_type: 'multiple_choice',
          question: 'What is a noun?',
          options: ['Person', 'Place', 'Thing', 'All of the above'],
          correct_answer: 'All of the above',
          explanation: 'A noun can be a person, place, or thing',
          curriculum_standard: 'ENG.GRAM.1',
          bloom_level: 1,
        },
        {
          questionId: 'q2',
          type: 'short_answer',
          question: 'Give an example of a verb',
          correctAnswer: 'run',
          explanation: 'Run is an action verb',
          curriculumStandard: 'ENG.GRAM.2',
          bloomLevel: 2,
        },
      ]),
    };

    const quiz = quizRepository.parseQuiz(mockRow);

    expect(quiz.questions).toHaveLength(2);
    expect(quiz.questions[0].correctAnswer).toBe('All of the above');
    expect(quiz.questions[0].type).toBe('multiple_choice');
    expect(quiz.questions[1].correctAnswer).toBe('run');
    expect(quiz.questions[1].type).toBe('short_answer');
  });
});
