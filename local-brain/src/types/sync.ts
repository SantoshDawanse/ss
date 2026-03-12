/**
 * TypeScript interfaces and types for Sync With Cloud feature.
 * 
 * This file defines all data models used in the sync workflow:
 * - Database models (snake_case for SQLite fields)
 * - TypeScript models (camelCase for application code)
 * - API request/response types
 * - Sync state and status types
 * 
 * Requirements: 2.2, 8.6, 16.1-16.6
 */

// ============================================================================
// Database Models (snake_case - matches SQLite schema)
// ============================================================================

/**
 * Bundle data structure as stored in database and received from Cloud Brain.
 * Uses snake_case to match database schema and API contracts.
 */
export interface BundleData {
  bundle_id: string;
  student_id: string;
  valid_from: string; // ISO 8601 timestamp
  valid_until: string; // ISO 8601 timestamp
  total_size: number;
  checksum: string; // SHA-256 hash (empty in compressed bundle, verified separately)
  subjects: SubjectData[];
}

/**
 * Subject data containing lessons, quizzes, hints, and study track.
 */
export interface SubjectData {
  subject: string;
  lessons: LessonData[];
  quizzes: QuizData[];
  hints: Record<string, HintData[]>; // Keyed by quiz_id
  study_track?: StudyTrackData;
}

/**
 * Lesson data structure with content sections.
 */
export interface LessonData {
  lesson_id: string;
  subject: string;
  topic: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  content: LessonSection[];
  estimated_minutes: number;
  curriculum_standards: string[];
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
 * Quiz data structure with questions.
 */
export interface QuizData {
  quiz_id: string;
  subject: string;
  topic: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  time_limit?: number; // Minutes, nullable
  questions: QuestionData[];
}

/**
 * Question data with answer and explanation.
 */
export interface QuestionData {
  question_id: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  question: string;
  options?: string[]; // For multiple_choice questions
  correct_answer: string;
  explanation: string;
  curriculum_standard: string;
  bloom_level: number;
}

/**
 * Hint data for quiz questions (levels 1-3).
 */
export interface HintData {
  hint_id: string;
  quiz_id: string;
  question_id: string;
  level: number; // 1, 2, or 3
  hint_text: string;
}

/**
 * Performance log data structure for tracking student interactions.
 */
export interface PerformanceLog {
  log_id?: number; // Auto-increment, optional for new logs
  student_id: string;
  timestamp: number; // Unix timestamp
  event_type: 'lesson_start' | 'lesson_complete' | 'quiz_start' | 'quiz_answer' | 'quiz_complete' | 'hint_requested';
  content_id: string;
  subject: string;
  topic: string;
  data_json: string; // JSON string of event-specific data
  synced: 0 | 1; // 0 = unsynced, 1 = synced
}

/**
 * Performance log data payload (parsed from data_json).
 */
export interface PerformanceLogData {
  time_spent?: number; // Seconds
  answer?: string;
  correct?: boolean;
  hints_used?: number;
  score?: number;
  hint_level?: number;
}

/**
 * Sync session data structure for tracking sync progress.
 */
export interface SyncSession {
  session_id: string;
  start_time: number; // Unix timestamp
  end_time?: number; // Unix timestamp, nullable
  status: 'pending' | 'uploading' | 'downloading' | 'complete' | 'failed';
  logs_uploaded: number;
  bundle_downloaded: 0 | 1; // 0 = false, 1 = true
  error_message?: string;
}

/**
 * Study track data structure organizing content by weeks and days.
 */
export interface StudyTrackData {
  track_id: string;
  subject: string;
  weeks: WeekData[];
}

/**
 * Week data with daily lesson and quiz assignments.
 */
export interface WeekData {
  week_number: number;
  days: DayData[];
}

/**
 * Day data with lesson and quiz IDs.
 */
export interface DayData {
  day_number: number;
  lesson_ids: string[];
  quiz_ids: string[];
}

// ============================================================================
// TypeScript Models (camelCase - for application code)
// ============================================================================

/**
 * Sync status for UI display and state management.
 */
export interface SyncStatus {
  state: SyncState;
  sessionId: string | null;
  progress: number; // 0-100
  error: string | null;
  logsUploaded: number;
  bundleDownloaded: boolean;
}

/**
 * Sync state machine states.
 */
export type SyncState = 
  | 'idle' 
  | 'checking_connectivity' 
  | 'uploading' 
  | 'downloading' 
  | 'importing' 
  | 'complete' 
  | 'failed';

/**
 * Quiz feedback for answer validation.
 */
export interface QuizFeedback {
  correct: boolean;
  explanation: string;
  nextHintLevel?: number; // Only if incorrect and hints available
  encouragement: string;
}

/**
 * Bundle metadata for tracking and validation.
 */
export interface BundleMetadata {
  bundleId: string;
  studentId: string;
  validFrom: Date;
  validUntil: Date;
  totalSize: number;
  subjectCount: number;
}

/**
 * Download progress for resume capability.
 */
export interface DownloadProgress {
  sessionId: string;
  bundleUrl: string;
  totalBytes: number;
  downloadedBytes: number;
  checksum: string;
  filePath: string;
}

/**
 * Download progress database row (snake_case for SQLite).
 */
export interface DownloadProgressRow {
  session_id: string;
  bundle_url: string;
  total_bytes: number;
  downloaded_bytes: number;
  checksum: string;
  file_path: string;
  created_at: number;
  updated_at: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Upload request payload (sent to Cloud Brain).
 */
export interface UploadRequest {
  student_id: string;
  logs: UploadLogData[];
  last_sync_time: string; // ISO 8601 timestamp
}

/**
 * Upload log data (snake_case for API).
 */
export interface UploadLogData {
  student_id: string;
  timestamp: string; // ISO 8601 timestamp
  event_type: string;
  content_id: string;
  subject: string;
  topic: string;
  data: Record<string, any>; // Event-specific data
}

/**
 * Upload response from Cloud Brain.
 */
export interface UploadResponse {
  sessionId: string; // Backend session ID
  logsReceived: number;
  bundleReady: boolean;
}

/**
 * Download info response from Cloud Brain.
 */
export interface DownloadInfoResponse {
  bundleUrl: string; // Presigned S3 URL
  bundleSize: number;
  checksum: string; // SHA-256 hash
  validUntil: string; // ISO 8601 timestamp
}

/**
 * Network response wrapper.
 */
export interface NetworkResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error log structure for monitoring and debugging.
 */
export interface ErrorLog {
  category: 'network' | 'storage' | 'database' | 'validation';
  severity: 'low' | 'medium' | 'high';
  message: string;
  details: Record<string, any>;
  timestamp: number;
  studentId: string;
  sessionId?: string;
}

/**
 * Sync error with retry information.
 */
export interface SyncError {
  message: string;
  code: string;
  retryable: boolean;
  attemptNumber?: number;
  originalError?: Error;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Request options for network calls.
 */
export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

/**
 * Retry configuration.
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

/**
 * Sync configuration.
 */
export interface SyncConfig {
  apiBaseUrl: string;
  connectivityTimeout: number;
  uploadTimeout: number;
  downloadTimeout: number;
  retryConfig: RetryConfig;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Sync state change event for UI updates.
 */
export interface SyncStateChangeEvent {
  previousState: SyncState;
  currentState: SyncState;
  sessionId: string | null;
  progress: number;
  timestamp: number;
}

/**
 * Sync event listener function type.
 */
export type SyncEventListener = (event: SyncStateChangeEvent) => void;
