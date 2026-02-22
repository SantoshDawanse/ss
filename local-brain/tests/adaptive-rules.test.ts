/**
 * Unit tests for Adaptive Rules Engine.
 * Tests adaptive rule evaluation logic for struggling, excelling, and high hint usage patterns.
 */

import { AdaptiveRulesEngine } from '../src/services/AdaptiveRulesEngine';
import type { AdaptiveContent } from '../src/services/AdaptiveRulesEngine';
import type { PerformanceLog, Lesson, Quiz } from '../src/models';

describe('AdaptiveRulesEngine', () => {
  let engine: AdaptiveRulesEngine;
  let mockLessons: Lesson[];
  let mockQuizzes: Quiz[];

  beforeEach(() => {
    engine = new AdaptiveRulesEngine();

    // Create mock lessons with different difficulties
    mockLessons = [
      {
        lessonId: 'lesson-easy-1',
        subject: 'Mathematics',
        topic: 'Addition',
        title: 'Easy Addition',
        difficulty: 'easy',
        estimatedMinutes: 15,
        curriculumStandards: ['MATH-6-1'],
        sections: [
          { type: 'explanation', content: 'Easy content' },
          { type: 'practice', content: 'Practice problems' },
        ],
      },
      {
        lessonId: 'lesson-medium-1',
        subject: 'Mathematics',
        topic: 'Multiplication',
        title: 'Medium Multiplication',
        difficulty: 'medium',
        estimatedMinutes: 20,
        curriculumStandards: ['MATH-6-2'],
        sections: [
          { type: 'explanation', content: 'Medium content' },
        ],
      },
      {
        lessonId: 'lesson-hard-1',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Hard Algebra',
        difficulty: 'hard',
        estimatedMinutes: 30,
        curriculumStandards: ['MATH-6-3'],
        sections: [
          { type: 'explanation', content: 'Hard content' },
        ],
      },
    ];

    // Create mock quizzes with different difficulties
    mockQuizzes = [
      {
        quizId: 'quiz-easy-1',
        subject: 'Mathematics',
        topic: 'Addition',
        title: 'Easy Quiz',
        difficulty: 'easy',
        questions: [],
      },
      {
        quizId: 'quiz-medium-1',
        subject: 'Mathematics',
        topic: 'Multiplication',
        title: 'Medium Quiz',
        difficulty: 'medium',
        questions: [],
      },
      {
        quizId: 'quiz-hard-1',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Hard Quiz',
        difficulty: 'hard',
        questions: [],
      },
    ];
  });

  describe('calculateMetrics', () => {
    it('should calculate correct accuracy from quiz answers', () => {
      const logs: PerformanceLog[] = [
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-1',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 0 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-1',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 0 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-1',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: false, hintsUsed: 1 },
        },
      ];

      const metrics = engine.calculateMetrics(logs);

      expect(metrics.accuracy).toBeCloseTo(0.667, 2);
      expect(metrics.recentQuizCount).toBe(1);
      expect(metrics.totalAttempts).toBe(3);
    });

    it('should calculate average hints used', () => {
      const logs: PerformanceLog[] = [
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-1',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 2 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-1',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: false, hintsUsed: 3 },
        },
      ];

      const metrics = engine.calculateMetrics(logs);

      expect(metrics.averageHintsUsed).toBe(2.5);
    });

    it('should return zero metrics for empty logs', () => {
      const metrics = engine.calculateMetrics([]);

      expect(metrics.accuracy).toBe(0);
      expect(metrics.averageHintsUsed).toBe(0);
      expect(metrics.totalAttempts).toBe(0);
      expect(metrics.recentQuizCount).toBe(0);
    });
  });

  describe('struggling student rule (< 60% accuracy)', () => {
    it('should select easy content for struggling students', () => {
      // Create logs showing < 60% accuracy
      const logs: PerformanceLog[] = [
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-1',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: false, hintsUsed: 1 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-2',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 2 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-3',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: false, hintsUsed: 1 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-4',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: false, hintsUsed: 2 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-5',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: false, hintsUsed: 1 },
        },
      ];

      const result = engine.evaluateRules(logs, mockLessons as AdaptiveContent[]);

      expect(result.matched).toBe(true);
      expect(result.ruleName).toBe('struggling_student');
      expect(result.selectedContent).toBeDefined();
      expect(result.selectedContent?.difficulty).toBe('easy');
    });

    it('should not trigger for students with >= 60% accuracy', () => {
      // Create logs showing 60% accuracy
      const logs: PerformanceLog[] = [
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-1',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 0 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-2',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 0 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-3',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 0 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-4',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: false, hintsUsed: 1 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-5',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: false, hintsUsed: 1 },
        },
      ];

      const result = engine.evaluateRules(logs, mockLessons as AdaptiveContent[]);

      expect(result.ruleName).not.toBe('struggling_student');
    });
  });

  describe('excelling student rule (> 90% accuracy)', () => {
    it('should select hard content for excelling students', () => {
      // Create logs showing > 90% accuracy
      const logs: PerformanceLog[] = [
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-1',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 0 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-2',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 0 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-3',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 0 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-4',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 0 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-5',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 0 },
        },
      ];

      const result = engine.evaluateRules(logs, mockLessons as AdaptiveContent[]);

      expect(result.matched).toBe(true);
      expect(result.ruleName).toBe('excelling_student');
      expect(result.selectedContent).toBeDefined();
      expect(result.selectedContent?.difficulty).toBe('hard');
    });

    it('should not trigger for students with <= 90% accuracy', () => {
      // Create logs showing 80% accuracy
      const logs: PerformanceLog[] = [
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-1',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 0 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-2',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 0 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-3',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 0 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-4',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 0 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-5',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: false, hintsUsed: 1 },
        },
      ];

      const result = engine.evaluateRules(logs, mockLessons as AdaptiveContent[]);

      expect(result.ruleName).not.toBe('excelling_student');
    });
  });

  describe('high hint usage rule (> 2 hints per quiz)', () => {
    it('should select practice content for high hint usage', () => {
      // Create logs showing > 2 hints per quiz
      const logs: PerformanceLog[] = [
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-1',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 3 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-2',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 3 },
        },
      ];

      const result = engine.evaluateRules(logs, mockLessons as AdaptiveContent[]);

      expect(result.matched).toBe(true);
      expect(result.ruleName).toBe('high_hint_usage');
      expect(result.selectedContent).toBeDefined();
      
      // Should select lesson with practice sections
      if ('sections' in result.selectedContent!) {
        const hasPractice = result.selectedContent.sections.some(
          (s) => s.type === 'practice'
        );
        expect(hasPractice).toBe(true);
      }
    });

    it('should not trigger for low hint usage', () => {
      // Create logs showing <= 2 hints per quiz
      const logs: PerformanceLog[] = [
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-1',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 1 },
        },
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-2',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 2 },
        },
      ];

      const result = engine.evaluateRules(logs, mockLessons as AdaptiveContent[]);

      expect(result.ruleName).not.toBe('high_hint_usage');
    });
  });

  describe('rule priority', () => {
    it('should evaluate rules in priority order', () => {
      const rules = engine.getRules();
      
      // Check that rules are ordered by priority
      const priorities = rules.map((r) => r.priority);
      const sortedPriorities = [...priorities].sort((a, b) => b - a);
      
      // Struggling student should have highest priority (3)
      expect(rules.find((r) => r.name === 'struggling_student')?.priority).toBe(3);
      
      // Excelling student should have priority 2
      expect(rules.find((r) => r.name === 'excelling_student')?.priority).toBe(2);
      
      // High hint usage should have priority 1
      expect(rules.find((r) => r.name === 'high_hint_usage')?.priority).toBe(1);
    });
  });

  describe('no rules match', () => {
    it('should return no match when no rules apply', () => {
      // Create logs that don't trigger any rules
      const logs: PerformanceLog[] = [
        {
          studentId: 'student-1',
          timestamp: new Date(),
          eventType: 'quiz_answer',
          contentId: 'quiz-1',
          subject: 'Mathematics',
          topic: 'Addition',
          data: { correct: true, hintsUsed: 1 },
        },
      ];

      const result = engine.evaluateRules(logs, mockLessons as AdaptiveContent[]);

      expect(result.matched).toBe(false);
      expect(result.ruleName).toBe('none');
    });
  });

  describe('custom rules', () => {
    it('should allow adding custom rules', () => {
      const customRule = {
        name: 'custom_rule',
        priority: 5,
        condition: () => true,
        action: (content: AdaptiveContent[]) => content[0],
      };

      engine.addRule(customRule);
      const rules = engine.getRules();

      expect(rules.find((r) => r.name === 'custom_rule')).toBeDefined();
    });

    it('should allow removing rules', () => {
      const removed = engine.removeRule('struggling_student');
      const rules = engine.getRules();

      expect(removed).toBe(true);
      expect(rules.find((r) => r.name === 'struggling_student')).toBeUndefined();
    });
  });
});
