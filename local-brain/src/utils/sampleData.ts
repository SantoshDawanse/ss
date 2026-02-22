/**
 * Sample data for testing and development
 */

import { Lesson, Quiz, Hint, LearningBundle } from '../models';

export const SAMPLE_STUDENT_ID = 'student-001';

export const sampleLessons: Lesson[] = [
  {
    lessonId: 'lesson-math-001',
    subject: 'Mathematics',
    topic: 'Basic Arithmetic',
    title: 'Addition and Subtraction',
    difficulty: 'easy',
    estimatedMinutes: 15,
    curriculumStandards: ['MATH.1.OA.A.1'],
    sections: [
      {
        type: 'explanation',
        content: 'Addition means combining two or more numbers to get a total. For example, 2 + 3 = 5. Subtraction means taking away one number from another. For example, 5 - 2 = 3.',
      },
      {
        type: 'example',
        content: 'If you have 4 apples and your friend gives you 3 more apples, how many apples do you have in total? 4 + 3 = 7 apples!',
      },
      {
        type: 'practice',
        content: 'Try these: 1) 6 + 2 = ? 2) 9 - 4 = ? 3) 5 + 5 = ?',
      },
    ],
  },
  {
    lessonId: 'lesson-math-002',
    subject: 'Mathematics',
    topic: 'Multiplication',
    title: 'Introduction to Multiplication',
    difficulty: 'medium',
    estimatedMinutes: 20,
    curriculumStandards: ['MATH.3.OA.A.1'],
    sections: [
      {
        type: 'explanation',
        content: 'Multiplication is repeated addition. For example, 3 × 4 means adding 3 four times: 3 + 3 + 3 + 3 = 12.',
      },
      {
        type: 'example',
        content: 'If you have 5 bags with 4 candies in each bag, how many candies do you have? 5 × 4 = 20 candies!',
      },
    ],
  },
];

export const sampleQuizzes: Quiz[] = [
  {
    quizId: 'quiz-math-001',
    subject: 'Mathematics',
    topic: 'Basic Arithmetic',
    title: 'Addition Quiz',
    difficulty: 'easy',
    timeLimit: 10,
    questions: [
      {
        questionId: 'q1',
        type: 'multiple_choice',
        question: 'What is 5 + 3?',
        options: ['6', '7', '8', '9'],
        correctAnswer: '8',
        explanation: '5 + 3 = 8. When you add 5 and 3 together, you get 8.',
        curriculumStandard: 'MATH.1.OA.A.1',
        bloomLevel: 1,
      },
      {
        questionId: 'q2',
        type: 'multiple_choice',
        question: 'What is 10 - 4?',
        options: ['4', '5', '6', '7'],
        correctAnswer: '6',
        explanation: '10 - 4 = 6. When you subtract 4 from 10, you get 6.',
        curriculumStandard: 'MATH.1.OA.A.1',
        bloomLevel: 1,
      },
      {
        questionId: 'q3',
        type: 'true_false',
        question: 'Is 7 + 2 equal to 9?',
        correctAnswer: 'True',
        explanation: '7 + 2 = 9, so this statement is true.',
        curriculumStandard: 'MATH.1.OA.A.1',
        bloomLevel: 2,
      },
    ],
  },
];

export const sampleHints: Record<string, Hint[]> = {
  q1: [
    { hintId: 'h1-1', level: 1, text: 'Try counting on your fingers: start at 5 and count up 3 more.' },
    { hintId: 'h1-2', level: 2, text: 'Think about it this way: 5 + 3 is the same as 5 + 2 + 1.' },
    { hintId: 'h1-3', level: 3, text: 'The answer is between 7 and 9.' },
  ],
  q2: [
    { hintId: 'h2-1', level: 1, text: 'Start at 10 and count backwards 4 times.' },
    { hintId: 'h2-2', level: 2, text: 'Think: 10 - 4 is the same as 10 - 2 - 2.' },
    { hintId: 'h2-3', level: 3, text: 'The answer is 6.' },
  ],
  q3: [
    { hintId: 'h3-1', level: 1, text: 'Calculate 7 + 2 first, then compare it to 9.' },
    { hintId: 'h3-2', level: 2, text: '7 + 2 equals 9, so check if the statement matches.' },
    { hintId: 'h3-3', level: 3, text: 'The statement is correct, so the answer is True.' },
  ],
};

export const sampleBundle: LearningBundle = {
  bundleId: 'bundle-001',
  studentId: SAMPLE_STUDENT_ID,
  validFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
  validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
  subjects: [
    {
      subject: 'Mathematics',
      lessons: sampleLessons,
      quizzes: sampleQuizzes,
      hints: sampleHints,
      studyTrack: {
        trackId: 'track-math-001',
        subject: 'Mathematics',
        weeks: [
          {
            weekNumber: 1,
            topics: ['Basic Arithmetic'],
            lessons: ['lesson-math-001'],
            quizzes: ['quiz-math-001'],
            estimatedHours: 2,
          },
          {
            weekNumber: 2,
            topics: ['Multiplication'],
            lessons: ['lesson-math-002'],
            quizzes: [],
            estimatedHours: 2,
          },
        ],
      },
    },
  ],
  totalSize: 1024,
  checksum: 'sample-checksum',
};
