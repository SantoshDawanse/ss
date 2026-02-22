/**
 * Adaptive Rules Engine for Local Brain.
 * Evaluates student performance and applies adaptive rules for content selection.
 * Requirements: 3.5, 3.9
 */

import { PerformanceLog, Lesson, Quiz } from '../models';

/**
 * Content that can be selected by adaptive rules.
 */
export type AdaptiveContent = Lesson | Quiz;

/**
 * Rule evaluation result.
 */
export interface RuleResult {
  matched: boolean;
  ruleName: string;
  priority: number;
  selectedContent?: AdaptiveContent;
}

/**
 * Adaptive rule definition.
 */
export interface AdaptiveRule {
  name: string;
  priority: number; // Higher priority rules are evaluated first
  condition: (recentPerformance: PerformanceLog[]) => boolean;
  action: (availableContent: AdaptiveContent[]) => AdaptiveContent | null;
}

/**
 * Performance metrics calculated from logs.
 */
export interface PerformanceMetrics {
  accuracy: number; // 0-1
  averageHintsUsed: number;
  totalAttempts: number;
  recentQuizCount: number;
}

/**
 * Adaptive Rules Engine for content selection based on student performance.
 */
export class AdaptiveRulesEngine {
  private rules: AdaptiveRule[];

  constructor() {
    this.rules = this.initializeRules();
  }

  /**
   * Initialize the default adaptive rules.
   * Rules are ordered by priority (highest first).
   */
  private initializeRules(): AdaptiveRule[] {
    return [
      // Rule 1: Struggling students (< 60% accuracy) get easier content
      {
        name: 'struggling_student',
        priority: 3,
        condition: (logs: PerformanceLog[]) => {
          const metrics = this.calculateMetrics(logs);
          return metrics.recentQuizCount >= 3 && metrics.accuracy < 0.6;
        },
        action: (content: AdaptiveContent[]) => {
          // Filter for easy difficulty content
          const easyContent = content.filter(
            (c) => c.difficulty === 'easy'
          );
          return easyContent.length > 0 ? easyContent[0] : null;
        },
      },

      // Rule 2: Excelling students (> 90% accuracy) get harder content
      {
        name: 'excelling_student',
        priority: 2,
        condition: (logs: PerformanceLog[]) => {
          const metrics = this.calculateMetrics(logs);
          return metrics.recentQuizCount >= 3 && metrics.accuracy > 0.9;
        },
        action: (content: AdaptiveContent[]) => {
          // Filter for hard difficulty content
          const hardContent = content.filter(
            (c) => c.difficulty === 'hard'
          );
          return hardContent.length > 0 ? hardContent[0] : null;
        },
      },

      // Rule 3: High hint usage (> 2 hints per quiz) gets more practice
      {
        name: 'high_hint_usage',
        priority: 1,
        condition: (logs: PerformanceLog[]) => {
          const metrics = this.calculateMetrics(logs);
          return metrics.recentQuizCount >= 2 && metrics.averageHintsUsed > 2;
        },
        action: (content: AdaptiveContent[]) => {
          // Prefer lessons with practice sections or medium difficulty quizzes
          const practiceContent = content.filter((c) => {
            if ('sections' in c) {
              // It's a lesson - check for practice sections
              return c.sections.some((s) => s.type === 'practice');
            } else {
              // It's a quiz - prefer medium difficulty
              return c.difficulty === 'medium';
            }
          });
          return practiceContent.length > 0 ? practiceContent[0] : null;
        },
      },
    ];
  }

  /**
   * Evaluate all rules against recent performance and select content.
   * Returns the result from the highest priority matching rule.
   */
  public evaluateRules(
    recentPerformance: PerformanceLog[],
    availableContent: AdaptiveContent[]
  ): RuleResult {
    // Sort rules by priority (highest first)
    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);

    // Evaluate each rule in priority order
    for (const rule of sortedRules) {
      try {
        const conditionMet = rule.condition(recentPerformance);
        
        if (conditionMet) {
          const selectedContent = rule.action(availableContent);
          
          if (selectedContent) {
            console.log(`Adaptive rule matched: ${rule.name}`);
            return {
              matched: true,
              ruleName: rule.name,
              priority: rule.priority,
              selectedContent,
            };
          }
        }
      } catch (error) {
        console.error(`Error evaluating rule ${rule.name}:`, error);
        // Continue to next rule on error
      }
    }

    // No rules matched
    return {
      matched: false,
      ruleName: 'none',
      priority: 0,
    };
  }

  /**
   * Calculate performance metrics from recent logs.
   */
  public calculateMetrics(logs: PerformanceLog[]): PerformanceMetrics {
    // Filter for quiz-related events
    const quizAnswers = logs.filter((log) => log.eventType === 'quiz_answer');
    
    if (quizAnswers.length === 0) {
      return {
        accuracy: 0,
        averageHintsUsed: 0,
        totalAttempts: 0,
        recentQuizCount: 0,
      };
    }

    // Calculate accuracy
    const correctAnswers = quizAnswers.filter(
      (log) => log.data.correct === true
    ).length;
    const accuracy = correctAnswers / quizAnswers.length;

    // Calculate average hints used
    const totalHints = quizAnswers.reduce(
      (sum, log) => sum + (log.data.hintsUsed || 0),
      0
    );
    const averageHintsUsed = totalHints / quizAnswers.length;

    // Count total attempts
    const totalAttempts = quizAnswers.reduce(
      (sum, log) => sum + (log.data.attempts || 1),
      0
    );

    // Count unique quizzes
    const uniqueQuizzes = new Set(quizAnswers.map((log) => log.contentId));
    const recentQuizCount = uniqueQuizzes.size;

    return {
      accuracy,
      averageHintsUsed,
      totalAttempts,
      recentQuizCount,
    };
  }

  /**
   * Add a custom rule to the engine.
   */
  public addRule(rule: AdaptiveRule): void {
    this.rules.push(rule);
    console.log(`Added custom rule: ${rule.name} with priority ${rule.priority}`);
  }

  /**
   * Remove a rule by name.
   */
  public removeRule(ruleName: string): boolean {
    const initialLength = this.rules.length;
    this.rules = this.rules.filter((rule) => rule.name !== ruleName);
    return this.rules.length < initialLength;
  }

  /**
   * Get all registered rules.
   */
  public getRules(): AdaptiveRule[] {
    return [...this.rules];
  }

  /**
   * Get performance metrics for debugging/monitoring.
   */
  public getMetricsFromLogs(logs: PerformanceLog[]): PerformanceMetrics {
    return this.calculateMetrics(logs);
  }
}
