/**
 * TypeScript interfaces and types for Local Brain.
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

export interface LessonSection {
  type: 'explanation' | 'example' | 'practice';
  content: string;
  media?: Media[];
}

export interface Media {
  type: 'image' | 'audio';
  url: string;
  alt?: string;
}

export interface Quiz {
  quizId: string;
  subject: string;
  topic: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  timeLimit?: number;
  questions: Question[];
}

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

export interface Hint {
  hintId: string;
  level: number;
  text: string;
}

export interface PerformanceLog {
  studentId: string;
  timestamp: Date;
  eventType:
    | 'lesson_start'
    | 'lesson_complete'
    | 'quiz_start'
    | 'quiz_answer'
    | 'quiz_complete'
    | 'hint_requested';
  contentId: string;
  subject: string;
  topic: string;
  data: {
    timeSpent?: number;
    answer?: string;
    correct?: boolean;
    hintsUsed?: number;
    attempts?: number;
  };
}

export interface LearningBundle {
  bundleId: string;
  studentId: string;
  validFrom: Date;
  validUntil: Date;
  subjects: SubjectContent[];
  totalSize: number;
  checksum: string;
}

export interface SubjectContent {
  subject: string;
  lessons: Lesson[];
  quizzes: Quiz[];
  hints: Record<string, Hint[]>;
  studyTrack: StudyTrack;
}

export interface StudyTrack {
  trackId: string;
  subject: string;
  weeks: WeekPlan[];
}

export interface WeekPlan {
  weekNumber: number;
  topics: string[];
  lessons: string[];
  quizzes: string[];
  estimatedHours: number;
}

export interface SyncSession {
  sessionId: string;
  startTime: Date;
  status: 'pending' | 'uploading' | 'downloading' | 'complete' | 'failed';
  upload: {
    performanceLogs: PerformanceLog[];
    compressedSize: number;
    checksum: string;
  };
  download: {
    bundleUrl: string;
    bundleSize: number;
    checksum: string;
  };
}

export interface StudentState {
  studentId: string;
  currentSubject?: string;
  currentLessonId?: string;
  lastActive: Date;
}
