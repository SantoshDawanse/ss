/**
 * Type validation tests for sync data models.
 * Validates that all required interfaces are properly defined and usable.
 * 
 * Task 2.3: Create TypeScript interfaces for all data models
 */

import { describe, it, expect } from '@jest/globals';
import type {
  BundleData,
  SubjectData,
  LessonData,
  QuizData,
  HintData,
  PerformanceLog,
  SyncSession,
  StudyTrackData,
  SyncStatus,
  SyncState,
  QuizFeedback,
} from '../src/types/sync';

describe('Task 2.3: TypeScript Interface Validation', () => {
  describe('Database Models (snake_case)', () => {
    it('should define BundleData interface with snake_case fields', () => {
      const bundle: BundleData = {
        bundle_id: 'bundle_123',
        student_id: 'student_456',
        valid_from: '2024-01-01T00:00:00Z',
        valid_until: '2024-12-31T23:59:59Z',
        total_size: 5242880,
        checksum: 'abc123',
        subjects: [],
      };

      expect(bundle.bundle_id).toBe('bundle_123');
      expect(bundle.student_id).toBe('student_456');
    });

    it('should define SubjectData interface', () => {
      const subject: SubjectData = {
        subject: 'Mathematics',
        lessons: [],
        quizzes: [],
        hints: {},
      };

      expect(subject.subject).toBe('Mathematics');
    });

    it('should define LessonData interface with snake_case fields', () => {
      const lesson: LessonData = {
        lesson_id: 'lesson_123',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Introduction to Algebra',
        difficulty: 'easy',
        content: [],
        estimated_minutes: 30,
        curriculum_standards: ['CCSS.MATH.CONTENT.6.EE.A.2'],
      };

      expect(lesson.lesson_id).toBe('lesson_123');
      expect(lesson.estimated_minutes).toBe(30);
    });

    it('should define QuizData interface with snake_case fields', () => {
      const quiz: QuizData = {
        quiz_id: 'quiz_123',
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Algebra Quiz',
        difficulty: 'medium',
        questions: [],
      };

      expect(quiz.quiz_id).toBe('quiz_123');
    });

    it('should define HintData interface with snake_case fields', () => {
      const hint: HintData = {
        hint_id: 'hint_123',
        quiz_id: 'quiz_123',
        question_id: 'q1',
        level: 1,
        hint_text: 'Think about the order of operations',
      };

      expect(hint.hint_id).toBe('hint_123');
      expect(hint.level).toBe(1);
    });

    it('should define PerformanceLog interface with snake_case fields', () => {
      const log: PerformanceLog = {
        student_id: 'student_123',
        timestamp: Date.now(),
        event_type: 'lesson_start',
        content_id: 'lesson_123',
        subject: 'Mathematics',
        topic: 'Algebra',
        data_json: '{}',
        synced: 0,
      };

      expect(log.student_id).toBe('student_123');
      expect(log.synced).toBe(0);
    });

    it('should define SyncSession interface with snake_case fields', () => {
      const session: SyncSession = {
        session_id: 'session_123',
        start_time: Date.now(),
        status: 'pending',
        logs_uploaded: 0,
        bundle_downloaded: 0,
      };

      expect(session.session_id).toBe('session_123');
      expect(session.logs_uploaded).toBe(0);
    });

    it('should define StudyTrackData interface with snake_case fields', () => {
      const track: StudyTrackData = {
        track_id: 'track_123',
        subject: 'Mathematics',
        weeks: [],
      };

      expect(track.track_id).toBe('track_123');
    });
  });

  describe('TypeScript Models (camelCase)', () => {
    it('should define SyncStatus interface', () => {
      const status: SyncStatus = {
        state: 'idle',
        sessionId: null,
        progress: 0,
        error: null,
        logsUploaded: 0,
        bundleDownloaded: false,
      };

      expect(status.state).toBe('idle');
      expect(status.progress).toBe(0);
    });

    it('should define SyncState type with all valid states', () => {
      const states: SyncState[] = [
        'idle',
        'checking_connectivity',
        'uploading',
        'downloading',
        'importing',
        'complete',
        'failed',
      ];

      expect(states).toHaveLength(7);
    });

    it('should define QuizFeedback interface', () => {
      const feedback: QuizFeedback = {
        correct: true,
        explanation: 'Great job!',
        encouragement: 'Keep it up!',
      };

      expect(feedback.correct).toBe(true);
    });
  });

  describe('Field Naming Conventions', () => {
    it('should use snake_case for database fields', () => {
      const bundle: BundleData = {
        bundle_id: 'test',
        student_id: 'test',
        valid_from: '2024-01-01T00:00:00Z',
        valid_until: '2024-12-31T23:59:59Z',
        total_size: 100,
        checksum: 'test',
        subjects: [],
      };

      // Verify snake_case fields exist
      expect(bundle).toHaveProperty('bundle_id');
      expect(bundle).toHaveProperty('student_id');
      expect(bundle).toHaveProperty('valid_from');
      expect(bundle).toHaveProperty('valid_until');
      expect(bundle).toHaveProperty('total_size');
    });

    it('should use camelCase for TypeScript models', () => {
      const status: SyncStatus = {
        state: 'idle',
        sessionId: null,
        progress: 0,
        error: null,
        logsUploaded: 0,
        bundleDownloaded: false,
      };

      // Verify camelCase fields exist
      expect(status).toHaveProperty('sessionId');
      expect(status).toHaveProperty('logsUploaded');
      expect(status).toHaveProperty('bundleDownloaded');
    });
  });

  describe('Type Safety', () => {
    it('should enforce difficulty enum values', () => {
      const validDifficulties: Array<'easy' | 'medium' | 'hard'> = [
        'easy',
        'medium',
        'hard',
      ];

      validDifficulties.forEach((difficulty) => {
        const lesson: LessonData = {
          lesson_id: 'test',
          subject: 'Math',
          topic: 'Test',
          title: 'Test',
          difficulty,
          content: [],
          estimated_minutes: 30,
          curriculum_standards: [],
        };

        expect(lesson.difficulty).toBe(difficulty);
      });
    });

    it('should enforce event_type enum values', () => {
      const validEventTypes: PerformanceLog['event_type'][] = [
        'lesson_start',
        'lesson_complete',
        'quiz_start',
        'quiz_answer',
        'quiz_complete',
        'hint_requested',
      ];

      validEventTypes.forEach((event_type) => {
        const log: PerformanceLog = {
          student_id: 'test',
          timestamp: Date.now(),
          event_type,
          content_id: 'test',
          subject: 'Math',
          topic: 'Test',
          data_json: '{}',
          synced: 0,
        };

        expect(log.event_type).toBe(event_type);
      });
    });

    it('should enforce status enum values', () => {
      const validStatuses: SyncSession['status'][] = [
        'pending',
        'uploading',
        'downloading',
        'complete',
        'failed',
      ];

      validStatuses.forEach((status) => {
        const session: SyncSession = {
          session_id: 'test',
          start_time: Date.now(),
          status,
          logs_uploaded: 0,
          bundle_downloaded: 0,
        };

        expect(session.status).toBe(status);
      });
    });
  });
});
