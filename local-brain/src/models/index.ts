/**
 * TypeScript interfaces and types for Local Brain.
 * 
 * This file contains application-level models using camelCase naming.
 * For sync-specific types and database models (snake_case), see types/sync.ts
 */

// Re-export sync types for convenience
export * from '../types/sync';

/**
 * Lesson model for application use (camelCase).
 */
export interface Lesson {
  lessonId: string;
  subject: string;
  topic: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedMinutes: number;
  curriculumStandards: string[];
  sections: LessonSection[];
}

/**
 * Lesson section with type and content.
 */
export interface LessonSection {
  type: 'explanation' | 'example' | 'practice';
  content: string;
  media?: Media[];
}

/**
 * Media attachment for lessons.
 */
export interface Media {
  type: 'image' | 'audio';
  url: string;
  alt?: string;
}

/**
 * Quiz model for application use (camelCase).
 */
export interface Quiz {
  quizId: string;
  subject: string;
  topic: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  timeLimit?: number;
  questions: Question[];
}

/**
 * Question model with answer and explanation.
 */
export interface Question {
  questionId: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  curriculumStandard: string;
  bloomLevel: number;
}

/**
 * Hint model for quiz questions.
 */
export interface Hint {
  hintId: string;
  level: number;
  text: string;
}

/**
 * Learning bundle model for application use (camelCase).
 */
export interface LearningBundle {
  bundleId: string;
  studentId: string;
  validFrom: Date;
  validUntil: Date;
  subjects: SubjectContent[];
  totalSize: number;
  checksum: string;
  status: 'active' | 'archived';
}

/**
 * Subject content with lessons, quizzes, hints, and study track.
 */
export interface SubjectContent {
  subject: string;
  lessons: Lesson[];
  quizzes: Quiz[];
  hints: Record<string, Hint[]>;
  studyTrack?: StudyTrack;
}

/**
 * Study track organizing content by weeks.
 */
export interface StudyTrack {
  trackId: string;
  subject: string;
  weeks: WeekPlan[];
}

/**
 * Week plan with daily assignments.
 */
export interface WeekPlan {
  weekNumber: number;
  days: DayPlan[];
}

/**
 * Day plan with lesson and quiz IDs.
 */
export interface DayPlan {
  dayNumber: number;
  lessonIds: string[];
  quizIds: string[];
}

/**
 * Student state for tracking current progress.
 */
export interface StudentState {
  studentId: string;
  currentSubject?: string;
  currentLessonId?: string;
  lastActive: Date;
}

/**
 * Performance log model for application use (camelCase).
 * This is the parsed format returned by PerformanceLogRepository.parseLog()
 */
export interface PerformanceLog {
  logId?: number;
  studentId: string;
  timestamp: Date;
  eventType: 'lesson_start' | 'lesson_complete' | 'quiz_start' | 'quiz_answer' | 'quiz_complete' | 'hint_requested';
  contentId: string;
  subject: string;
  topic: string;
  data: PerformanceLogData;
  synced?: boolean;
}

/**
 * Performance log data payload (parsed from data_json).
 */
export interface PerformanceLogData {
  timeSpent?: number; // Seconds
  answer?: string;
  correct?: boolean;
  hintsUsed?: number;
  score?: number;
  hintLevel?: number;
  attempts?: number;
}
