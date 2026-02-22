/**
 * Adaptive Content Selection Service for Local Brain.
 * Selects appropriate content from learning bundles based on student performance.
 * Requirements: 3.5, 5.9
 */

import { DatabaseManager } from '../database/DatabaseManager';
import { LessonRepository } from '../database/repositories/LessonRepository';
import { QuizRepository } from '../database/repositories/QuizRepository';
import { PerformanceTrackingService } from './PerformanceTrackingService';
import { AdaptiveRulesEngine, AdaptiveContent, RuleResult } from './AdaptiveRulesEngine';
import { Lesson, Quiz, StudyTrack } from '../models';

/**
 * Content selection result.
 */
export interface ContentSelectionResult {
  content: Lesson | Quiz;
  selectionMethod: 'adaptive_rule' | 'study_track';
  ruleName?: string;
  priority?: number;
}

/**
 * Service for adaptive content selection based on student performance.
 */
export class AdaptiveContentSelectionService {
  private dbManager: DatabaseManager;
  private lessonRepo: LessonRepository;
  private quizRepo: QuizRepository;
  private performanceService: PerformanceTrackingService;
  private rulesEngine: AdaptiveRulesEngine;

  constructor(dbManager?: DatabaseManager) {
    this.dbManager = dbManager || DatabaseManager.getInstance();
    this.lessonRepo = new LessonRepository(this.dbManager);
    this.quizRepo = new QuizRepository(this.dbManager);
    this.performanceService = new PerformanceTrackingService(this.dbManager);
    this.rulesEngine = new AdaptiveRulesEngine();
  }

  /**
   * Select the next lesson for a student in a subject using adaptive rules.
   * Falls back to study track sequence if no rules match.
   * Requirement 3.5: Apply adaptive rules to adjust content difficulty
   * Requirement 5.9: Select appropriate content from bundles based on recent performance
   */
  public async selectNextLesson(
    studentId: string,
    subject: string
  ): Promise<ContentSelectionResult | null> {
    try {
      // Step 1: Retrieve recent performance logs (last 10 events)
      const recentLogs = await this.performanceService.getRecentLogs(studentId, 10);

      // Step 2: Get available lessons from the active bundle
      const activeBundleId = await this.getActiveBundleId(studentId);
      if (!activeBundleId) {
        console.log('No active bundle found for student');
        return null;
      }

      const availableLessons = await this.lessonRepo.findByBundleAndSubject(
        activeBundleId,
        subject
      );

      if (availableLessons.length === 0) {
        console.log('No lessons available for subject');
        return null;
      }

      // Step 3: Evaluate adaptive rules
      const ruleResult = this.rulesEngine.evaluateRules(
        recentLogs,
        availableLessons as AdaptiveContent[]
      );

      // Step 4: If a rule matched, return the selected content
      if (ruleResult.matched && ruleResult.selectedContent) {
        console.log(`Lesson selected by adaptive rule: ${ruleResult.ruleName}`);
        return {
          content: ruleResult.selectedContent as Lesson,
          selectionMethod: 'adaptive_rule',
          ruleName: ruleResult.ruleName,
          priority: ruleResult.priority,
        };
      }

      // Step 5: Fallback to study track sequence
      console.log('No adaptive rule matched, using study track sequence');
      const studyTrackLesson = await this.selectFromStudyTrack(
        studentId,
        subject,
        'lesson'
      );

      if (studyTrackLesson) {
        return {
          content: studyTrackLesson as Lesson,
          selectionMethod: 'study_track',
        };
      }

      // Step 6: If no study track, return first available lesson
      return {
        content: availableLessons[0],
        selectionMethod: 'study_track',
      };
    } catch (error) {
      console.error('Error selecting next lesson:', error);
      throw new Error(`Content selection failed: ${error}`);
    }
  }

  /**
   * Select the next quiz for a student in a subject using adaptive rules.
   * Falls back to study track sequence if no rules match.
   */
  public async selectNextQuiz(
    studentId: string,
    subject: string
  ): Promise<ContentSelectionResult | null> {
    try {
      // Step 1: Retrieve recent performance logs (last 10 events)
      const recentLogs = await this.performanceService.getRecentLogs(studentId, 10);

      // Step 2: Get available quizzes from the active bundle
      const activeBundleId = await this.getActiveBundleId(studentId);
      if (!activeBundleId) {
        console.log('No active bundle found for student');
        return null;
      }

      const availableQuizzes = await this.quizRepo.findByBundleAndSubject(
        activeBundleId,
        subject
      );

      if (availableQuizzes.length === 0) {
        console.log('No quizzes available for subject');
        return null;
      }

      // Step 3: Evaluate adaptive rules
      const ruleResult = this.rulesEngine.evaluateRules(
        recentLogs,
        availableQuizzes as AdaptiveContent[]
      );

      // Step 4: If a rule matched, return the selected content
      if (ruleResult.matched && ruleResult.selectedContent) {
        console.log(`Quiz selected by adaptive rule: ${ruleResult.ruleName}`);
        return {
          content: ruleResult.selectedContent as Quiz,
          selectionMethod: 'adaptive_rule',
          ruleName: ruleResult.ruleName,
          priority: ruleResult.priority,
        };
      }

      // Step 5: Fallback to study track sequence
      console.log('No adaptive rule matched, using study track sequence');
      const studyTrackQuiz = await this.selectFromStudyTrack(
        studentId,
        subject,
        'quiz'
      );

      if (studyTrackQuiz) {
        return {
          content: studyTrackQuiz as Quiz,
          selectionMethod: 'study_track',
        };
      }

      // Step 6: If no study track, return first available quiz
      return {
        content: availableQuizzes[0],
        selectionMethod: 'study_track',
      };
    } catch (error) {
      console.error('Error selecting next quiz:', error);
      throw new Error(`Content selection failed: ${error}`);
    }
  }

  /**
   * Get performance metrics for a student.
   * Useful for debugging and monitoring adaptive behavior.
   */
  public async getStudentMetrics(studentId: string) {
    try {
      const recentLogs = await this.performanceService.getRecentLogs(studentId, 10);
      return this.rulesEngine.getMetricsFromLogs(recentLogs);
    } catch (error) {
      console.error('Error getting student metrics:', error);
      throw error;
    }
  }

  /**
   * Test which rule would match for a student without selecting content.
   * Useful for debugging and monitoring.
   */
  public async testRuleMatching(
    studentId: string,
    subject: string
  ): Promise<RuleResult> {
    try {
      const recentLogs = await this.performanceService.getRecentLogs(studentId, 10);
      const activeBundleId = await this.getActiveBundleId(studentId);
      
      if (!activeBundleId) {
        return {
          matched: false,
          ruleName: 'no_bundle',
          priority: 0,
        };
      }

      const availableLessons = await this.lessonRepo.findByBundleAndSubject(
        activeBundleId,
        subject
      );

      return this.rulesEngine.evaluateRules(
        recentLogs,
        availableLessons as AdaptiveContent[]
      );
    } catch (error) {
      console.error('Error testing rule matching:', error);
      throw error;
    }
  }

  // Private helper methods

  /**
   * Get the active bundle ID for a student.
   */
  private async getActiveBundleId(studentId: string): Promise<string | null> {
    const db = await this.dbManager.getDatabase();
    const result = await db.executeSql(
      `SELECT bundle_id FROM learning_bundles 
       WHERE student_id = ? AND status = 'active' 
       ORDER BY valid_from DESC LIMIT 1`,
      [studentId]
    );

    if (result[0].rows.length === 0) {
      return null;
    }

    return result[0].rows.item(0).bundle_id;
  }

  /**
   * Select content from the study track sequence.
   * This is the fallback when no adaptive rules match.
   */
  private async selectFromStudyTrack(
    studentId: string,
    subject: string,
    contentType: 'lesson' | 'quiz'
  ): Promise<Lesson | Quiz | null> {
    try {
      // Get the study track for the subject
      const studyTrack = await this.getStudyTrack(studentId, subject);
      
      if (!studyTrack) {
        return null;
      }

      // Get the current week from the study track
      const currentWeek = this.getCurrentWeek(studyTrack);
      
      if (!currentWeek) {
        return null;
      }

      // Get content IDs from the current week
      const contentIds = contentType === 'lesson' 
        ? currentWeek.lessons 
        : currentWeek.quizzes;

      if (contentIds.length === 0) {
        return null;
      }

      // Get the first content item from the week
      const contentId = contentIds[0];

      // Fetch the content from the database
      if (contentType === 'lesson') {
        return await this.lessonRepo.findById(contentId);
      } else {
        return await this.quizRepo.findById(contentId);
      }
    } catch (error) {
      console.error('Error selecting from study track:', error);
      return null;
    }
  }

  /**
   * Get the study track for a student and subject.
   */
  private async getStudyTrack(
    studentId: string,
    subject: string
  ): Promise<StudyTrack | null> {
    try {
      const activeBundleId = await this.getActiveBundleId(studentId);
      
      if (!activeBundleId) {
        return null;
      }

      // Query the study track from the database
      // Note: This assumes study tracks are stored in a separate table
      // For now, we'll return null and rely on the default content ordering
      // In a full implementation, this would query the study_tracks table
      
      return null;
    } catch (error) {
      console.error('Error getting study track:', error);
      return null;
    }
  }

  /**
   * Determine the current week in the study track based on student progress.
   */
  private getCurrentWeek(studyTrack: StudyTrack): typeof studyTrack.weeks[0] | null {
    if (studyTrack.weeks.length === 0) {
      return null;
    }

    // For now, return the first week
    // In a full implementation, this would track student progress
    // and return the appropriate week based on completion status
    return studyTrack.weeks[0];
  }
}
