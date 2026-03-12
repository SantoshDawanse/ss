/**
 * SQLite database schema for Local Brain.
 * Includes tables for learning bundles, lessons, quizzes, hints,
 * performance logs, sync sessions, and student state.
 */

export const DATABASE_NAME = 'sikshya_sathi.db';
export const DATABASE_VERSION = 1;
export const SCHEMA_VERSION = 1; // Current schema version for migrations

/**
 * SQL statements to create all database tables.
 */
export const CREATE_TABLES = {
  // Learning bundles table
  LEARNING_BUNDLES: `
    CREATE TABLE IF NOT EXISTS learning_bundles (
      bundle_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      valid_from INTEGER NOT NULL,
      valid_until INTEGER NOT NULL,
      total_size INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'archived'))
    );
  `,

  // Lessons table
  LESSONS: `
    CREATE TABLE IF NOT EXISTS lessons (
      lesson_id TEXT PRIMARY KEY,
      bundle_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      title TEXT NOT NULL,
      difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),
      content_json TEXT NOT NULL,
      estimated_minutes INTEGER NOT NULL,
      curriculum_standards TEXT NOT NULL,
      FOREIGN KEY (bundle_id) REFERENCES learning_bundles(bundle_id) ON DELETE CASCADE
    );
  `,

  // Quizzes table
  QUIZZES: `
    CREATE TABLE IF NOT EXISTS quizzes (
      quiz_id TEXT PRIMARY KEY,
      bundle_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      title TEXT NOT NULL,
      difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),
      time_limit INTEGER,
      questions_json TEXT NOT NULL,
      FOREIGN KEY (bundle_id) REFERENCES learning_bundles(bundle_id) ON DELETE CASCADE
    );
  `,

  // Hints table
  HINTS: `
    CREATE TABLE IF NOT EXISTS hints (
      hint_id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      level INTEGER NOT NULL CHECK(level >= 1 AND level <= 3),
      hint_text TEXT NOT NULL,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE
    );
  `,

  // Performance logs table
  PERFORMANCE_LOGS: `
    CREATE TABLE IF NOT EXISTS performance_logs (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN (
        'lesson_start', 'lesson_complete', 'quiz_start', 
        'quiz_answer', 'quiz_complete', 'hint_requested'
      )),
      content_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      data_json TEXT NOT NULL,
      synced INTEGER DEFAULT 0 CHECK(synced IN (0, 1))
    );
  `,

  // Sync sessions table
  SYNC_SESSIONS: `
    CREATE TABLE IF NOT EXISTS sync_sessions (
      session_id TEXT PRIMARY KEY,
      backend_session_id TEXT,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      status TEXT NOT NULL CHECK(status IN (
        'pending', 'uploading', 'downloading', 'complete', 'failed'
      )),
      logs_uploaded INTEGER DEFAULT 0,
      bundle_downloaded INTEGER DEFAULT 0,
      error_message TEXT
    );
  `,

  // Student state table
  STUDENT_STATE: `
    CREATE TABLE IF NOT EXISTS student_state (
      student_id TEXT PRIMARY KEY,
      current_subject TEXT,
      current_lesson_id TEXT,
      last_active INTEGER NOT NULL
    );
  `,

  // Study tracks table (for storing study track data)
  STUDY_TRACKS: `
    CREATE TABLE IF NOT EXISTS study_tracks (
      track_id TEXT PRIMARY KEY,
      bundle_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      weeks_json TEXT NOT NULL,
      FOREIGN KEY (bundle_id) REFERENCES learning_bundles(bundle_id) ON DELETE CASCADE
    );
  `,

  // Download progress table (for resume capability across app restarts)
  DOWNLOAD_PROGRESS: `
    CREATE TABLE IF NOT EXISTS download_progress (
      session_id TEXT PRIMARY KEY,
      bundle_url TEXT NOT NULL,
      total_bytes INTEGER NOT NULL,
      downloaded_bytes INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `,
};

/**
 * SQL statements to create indexes for performance optimization.
 */
export const CREATE_INDEXES = {
  // Performance logs indexes
  IDX_LOGS_SYNC: `
    CREATE INDEX IF NOT EXISTS idx_logs_sync 
    ON performance_logs(synced, timestamp);
  `,

  IDX_LOGS_STUDENT: `
    CREATE INDEX IF NOT EXISTS idx_logs_student 
    ON performance_logs(student_id, subject);
  `,

  IDX_LOGS_TIMESTAMP: `
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp 
    ON performance_logs(timestamp DESC);
  `,

  // Lessons indexes
  IDX_LESSONS_BUNDLE: `
    CREATE INDEX IF NOT EXISTS idx_lessons_bundle 
    ON lessons(bundle_id);
  `,

  IDX_LESSONS_SUBJECT: `
    CREATE INDEX IF NOT EXISTS idx_lessons_subject 
    ON lessons(subject, topic);
  `,

  // Quizzes indexes
  IDX_QUIZZES_BUNDLE: `
    CREATE INDEX IF NOT EXISTS idx_quizzes_bundle 
    ON quizzes(bundle_id);
  `,

  IDX_QUIZZES_SUBJECT: `
    CREATE INDEX IF NOT EXISTS idx_quizzes_subject 
    ON quizzes(subject, topic);
  `,

  // Hints indexes
  IDX_HINTS_QUIZ: `
    CREATE INDEX IF NOT EXISTS idx_hints_quiz 
    ON hints(quiz_id, question_id);
  `,

  // Learning bundles indexes
  IDX_BUNDLES_STUDENT: `
    CREATE INDEX IF NOT EXISTS idx_bundles_student 
    ON learning_bundles(student_id, status);
  `,

  IDX_BUNDLES_VALIDITY: `
    CREATE INDEX IF NOT EXISTS idx_bundles_validity 
    ON learning_bundles(valid_from, valid_until);
  `,

  // Sync sessions indexes
  IDX_SYNC_STATUS: `
    CREATE INDEX IF NOT EXISTS idx_sync_status 
    ON sync_sessions(status, start_time DESC);
  `,

  // Study tracks indexes
  IDX_TRACKS_BUNDLE: `
    CREATE INDEX IF NOT EXISTS idx_tracks_bundle 
    ON study_tracks(bundle_id, subject);
  `,

  // Download progress indexes
  IDX_DOWNLOAD_PROGRESS_SESSION: `
    CREATE INDEX IF NOT EXISTS idx_download_progress_session 
    ON download_progress(session_id);
  `,

  IDX_DOWNLOAD_PROGRESS_UPDATED: `
    CREATE INDEX IF NOT EXISTS idx_download_progress_updated 
    ON download_progress(updated_at DESC);
  `,
};

/**
 * SQL statements to drop all tables (for testing/reset).
 */
export const DROP_TABLES = {
  DOWNLOAD_PROGRESS: 'DROP TABLE IF EXISTS download_progress;',
  STUDY_TRACKS: 'DROP TABLE IF EXISTS study_tracks;',
  HINTS: 'DROP TABLE IF EXISTS hints;',
  QUIZZES: 'DROP TABLE IF EXISTS quizzes;',
  LESSONS: 'DROP TABLE IF EXISTS lessons;',
  LEARNING_BUNDLES: 'DROP TABLE IF EXISTS learning_bundles;',
  PERFORMANCE_LOGS: 'DROP TABLE IF EXISTS performance_logs;',
  SYNC_SESSIONS: 'DROP TABLE IF EXISTS sync_sessions;',
  STUDENT_STATE: 'DROP TABLE IF EXISTS student_state;',
};

/**
 * Database configuration options.
 */
export interface DatabaseConfig {
  name: string;
  location: string;
  encryption?: boolean;
  encryptionKey?: string;
}

/**
 * Default database configuration.
 */
export const DEFAULT_DB_CONFIG: DatabaseConfig = {
  name: DATABASE_NAME,
  location: 'default',
  encryption: true, // Enable SQLCipher encryption
};
