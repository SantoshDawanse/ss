# Implementation Plan: Sync With Cloud

## Overview

This implementation plan breaks down the Sync With Cloud feature into discrete coding tasks. The feature implements bidirectional synchronization between Local Brain (React Native mobile app) and Cloud Brain (AWS Lambda backend), enabling offline-first learning with AI-powered personalized content delivery.

The implementation follows a layered architecture:
- Storage Layer: Database models, repositories, and transaction management
- Network Layer: Secure HTTP client and authentication
- Sync Layer: State machine orchestration and workflow coordination
- Content Layer: Offline content delivery and performance tracking
- Monitoring Layer: Metrics and error tracking

## Tasks

- [x] 1. Set up project structure and core infrastructure
  - Create directory structure for services, models, repositories, and types
  - Set up TypeScript configuration with strict mode
  - Install dependencies: pako (compression), crypto-js (checksums), fast-check (property testing)
  - Configure SQLite with SQLCipher encryption
  - Set up testing framework (Jest) with property-based testing support
  - _Requirements: All (foundational)_

- [ ] 2. Implement database schema and models
  - [x] 2.1 Create SQLite schema with all tables
    - Create learning_bundles table with status check constraint
    - Create lessons table with foreign key to bundles
    - Create quizzes table with foreign key to bundles
    - Create hints table with foreign key to quizzes and level constraint
    - Create performance_logs table with event_type check constraint
    - Create sync_sessions table with status check constraint
    - Create study_tracks table with foreign key to bundles
    - Add all indexes for query optimization
    - _Requirements: 10.1-10.8, 11.1-11.6, 16.7, 17.1_

  - [ ]* 2.2 Write property test for database schema constraints
    - **Property 42: Single Active Bundle Invariant**
    - **Validates: Requirements 11.5**

  - [x] 2.3 Create TypeScript interfaces for all data models
    - Define BundleData, SubjectData, LessonData, QuizData, HintData interfaces
    - Define PerformanceLog, SyncSession, StudyTrack interfaces
    - Define SyncStatus, SyncState, QuizFeedback types
    - Use snake_case for database fields, camelCase for TypeScript
    - _Requirements: 2.2, 8.6, 16.1-16.6_

  - [ ]* 2.4 Write property test for data model serialization
    - **Property 6: Log Serialization Format**
    - **Validates: Requirements 2.2**

- [ ] 3. Implement database manager and repository pattern
  - [x] 3.1 Create DatabaseManager class with transaction support
    - Implement beginTransaction, commit, rollback methods
    - Implement executeInTransaction helper for atomic operations
    - Add connection pooling and error handling
    - _Requirements: 10.1, 10.7, 10.8_

  - [ ]* 3.2 Write property test for transaction atomicity
    - **Property 37: Transaction Atomicity**
    - **Validates: Requirements 10.1, 10.7, 10.8**

  - [x] 3.3 Create repository classes for each entity
    - Implement BundleRepository with CRUD operations
    - Implement LessonRepository with bundle filtering
    - Implement QuizRepository with bundle filtering
    - Implement HintRepository with quiz/question filtering
    - Implement PerformanceLogRepository with sync status filtering
    - Implement SyncSessionRepository with status filtering
    - Implement StudyTrackRepository with bundle/subject filtering
    - _Requirements: 2.1, 5.1, 11.1, 16.7, 17.1, 20.1_

- [x] 4. Checkpoint - Database layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement secure network layer
  - [x] 5.1 Create SecureNetworkService with TLS 1.3 support
    - Implement singleton pattern with getInstance()
    - Implement get, post, put, delete methods with typed responses
    - Add timeout configuration (default 5 seconds for connectivity check)
    - Add request/response logging for debugging
    - _Requirements: 1.2, 2.10, 5.2_

  - [ ]* 5.2 Write property test for timeout bounds
    - **Property 1: Connectivity Check Timeout Bounds**
    - **Validates: Requirements 1.2**

  - [x] 5.3 Implement retry logic with exponential backoff
    - Create RetryStrategy class with configurable attempts (default 3)
    - Implement exponential backoff: 1s, 2s, 4s
    - Add random jitter (0-1000ms) to each delay
    - Cap maximum delay at 30 seconds
    - Classify errors as retryable vs non-retryable
    - _Requirements: 4.1-4.7_

  - [ ]* 5.4 Write property tests for retry behavior
    - **Property 14: Retry Attempt Limit**
    - **Property 15: Exponential Backoff Timing**
    - **Property 16: Jitter Bounds**
    - **Property 17: Maximum Backoff Cap**
    - **Property 18: Non-Retryable Authentication Errors**
    - **Validates: Requirements 4.1-4.7**

  - [x] 5.5 Create AuthenticationService for token management
    - Implement singleton pattern with getInstance()
    - Implement getAccessToken with expiry check
    - Implement refreshToken with automatic retry
    - Add setTemporaryToken for testing
    - Store tokens securely in encrypted storage
    - _Requirements: 2.4, 2.8, 21.1-21.7_

  - [ ]* 5.6 Write property test for authorization header format
    - **Property 8: Authorization Header Presence**
    - **Validates: Requirements 2.4**

- [x] 6. Checkpoint - Network layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement bundle import service
  - [x] 7.1 Create BundleImportService class
    - Implement constructor accepting publicKey parameter
    - Implement importBundle method with checksum verification
    - Implement validateBundle method for pre-import checks
    - Implement getBundleMetadata method for metadata extraction
    - _Requirements: 7.1-7.7, 8.1-8.8, 9.1-9.7_

  - [x] 7.2 Implement checksum verification
    - Calculate SHA-256 hash using crypto-js
    - Compare calculated vs expected checksum
    - Delete file on mismatch and throw error
    - Log both expected and actual values on failure
    - _Requirements: 7.1-7.6_

  - [ ]* 7.3 Write property tests for checksum operations
    - **Property 27: Checksum Calculation on Download**
    - **Property 28: Checksum Comparison**
    - **Property 29: Checksum Mismatch File Deletion**
    - **Property 30: Checksum Mismatch Logging**
    - **Validates: Requirements 7.1-7.5**

  - [x] 7.4 Implement bundle decompression and parsing
    - Read compressed file as base64
    - Decode base64 to binary Uint8Array
    - Decompress using pako.ungzip
    - Decode UTF-8 text and parse as JSON
    - Handle decompression and parse errors with descriptive messages
    - _Requirements: 8.1-8.8_

  - [ ]* 7.5 Write property test for round-trip compression
    - **Property 33: Bundle Decompression Round-Trip**
    - **Validates: Requirements 8.1-8.5, 25.3-25.4**

  - [x] 7.6 Implement bundle structure validation
    - Validate required fields: bundle_id, student_id, valid_from, valid_until, checksum, subjects
    - Validate subjects array structure: subject name, lessons array, quizzes array
    - Validate field types: strings, integers, dates, arrays, nested objects
    - Throw descriptive errors for missing or invalid fields
    - _Requirements: 9.1-9.7, 25.6-25.7_

  - [ ]* 7.7 Write property tests for bundle validation
    - **Property 34: Bundle Structure Validation Completeness**
    - **Property 35: Parser Field Type Support**
    - **Property 36: Missing Field Rejection**
    - **Validates: Requirements 9.1-9.7, 25.6-25.7**

  - [x] 7.8 Implement atomic database import
    - Execute all inserts within single transaction
    - Insert Learning_Bundle record with status='active'
    - Insert all lessons with bundle_id foreign key
    - Insert all quizzes with bundle_id foreign key
    - Insert all hints with quiz_id foreign key
    - Insert study_track if present
    - Rollback entire transaction on any error
    - _Requirements: 10.1-10.8_

  - [ ]* 7.9 Write property test for import operation ordering
    - **Property 38: Import Operation Ordering**
    - **Validates: Requirements 10.2-10.6**

  - [x] 7.10 Implement old bundle archival and cleanup
    - Update all previous bundles to status='archived' after successful import
    - Delete archived bundles older than 30 days
    - Verify cascade deletion of lessons, quizzes, hints
    - Ensure only one active bundle per student
    - _Requirements: 11.1-11.6_

  - [ ]* 7.11 Write property tests for bundle archival
    - **Property 39: Old Bundle Archival**
    - **Property 40: Archived Bundle Retention**
    - **Property 41: Cascade Deletion**
    - **Validates: Requirements 11.1-11.4**

- [x] 8. Checkpoint - Bundle import complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement sync orchestrator service
  - [x] 9.1 Create SyncOrchestratorService class with state machine
    - Implement constructor accepting studentId, authToken, publicKey
    - Define SyncState enum: idle, checking_connectivity, uploading, downloading, importing, complete, failed
    - Implement state transition methods with validation
    - Add state change event emitter for UI updates
    - _Requirements: 1.1-1.6, 20.1-20.7_

  - [ ]* 9.2 Write property tests for state machine
    - **Property 2: Sync Abort on Connectivity Failure**
    - **Property 4: State Machine Transition Ordering**
    - **Validates: Requirements 1.3, 1.6, 4.5, 20.7**

  - [x] 9.3 Implement connectivity check
    - Send health check request to Cloud_Brain with 5 second timeout
    - Transition to 'checking_connectivity' state before check
    - Abort sync and return to 'idle' if connectivity fails
    - Create Sync_Session record on successful connectivity
    - _Requirements: 1.1-1.6_

  - [ ]* 9.4 Write property test for session creation
    - **Property 3: Session Creation on Successful Connectivity**
    - **Validates: Requirements 1.4-1.5**

  - [x] 9.5 Implement upload workflow
    - Retrieve all unsynced performance logs (synced=0)
    - Convert logs to snake_case JSON format
    - Send upload request with student_id, logs array, last_sync_time
    - Include Authorization header with Bearer token
    - Handle 401 with token refresh and single retry
    - Handle 500 with exponential backoff retry (up to 3 attempts)
    - Mark uploaded logs as synced (synced=1)
    - Update Sync_Session with logs_uploaded count
    - _Requirements: 2.1-2.10_

  - [ ]* 9.6 Write property tests for upload workflow
    - **Property 5: Unsynced Log Retrieval Completeness**
    - **Property 7: Upload Request Structure**
    - **Property 9: Log Sync Status Update**
    - **Property 10: Session Upload Count Update**
    - **Validates: Requirements 2.1, 2.3, 2.6-2.7**

  - [x] 9.7 Implement first-time user handling
    - Identify first-time users (no active Learning_Bundle)
    - Send upload with empty logs array for first-time users
    - Proceed to download workflow after upload completes
    - _Requirements: 3.1-3.7_

  - [ ]* 9.8 Write property tests for first-time user flow
    - **Property 11: First-Time User Identification**
    - **Property 12: First-Time User Empty Upload**
    - **Property 13: First-Time User Download Workflow**
    - **Validates: Requirements 3.1-3.2, 3.7**

  - [x] 9.9 Implement download workflow
    - Request download info from Cloud_Brain with backend session_id
    - Extract bundleUrl, bundleSize, checksum, validUntil from response
    - Download bundle from presigned S3 URL
    - Track download progress and log percentage completion
    - Verify downloaded file size matches bundleSize
    - Update Sync_Session with bundle_downloaded=1
    - _Requirements: 5.1-5.8_

  - [ ]* 9.10 Write property tests for download workflow
    - **Property 19: Download Info Request After Upload**
    - **Property 20: Download Request Session ID**
    - **Property 21: Download File Size Verification**
    - **Property 22: Session Bundle Downloaded Flag**
    - **Validates: Requirements 5.1-5.2, 5.7-5.8**

  - [x] 9.11 Implement download resume capability
    - Store download progress: sessionId, bundleUrl, totalBytes, downloadedBytes, checksum, filePath
    - Check for partial file existence before resume
    - Send HTTP Range header: "bytes={downloadedBytes}-"
    - Verify partial file integrity before resume
    - Delete corrupted partial files and restart download
    - Support resume across app restarts
    - _Requirements: 6.1-6.7_

  - [ ]* 9.12 Write property tests for download resume
    - **Property 23: Download Progress Persistence**
    - **Property 24: Resume Range Header Format**
    - **Property 25: Resume Precondition Check**
    - **Property 26: Cross-Restart Resume Support**
    - **Validates: Requirements 6.1-6.3, 6.5, 6.7**

  - [x] 9.13 Implement sync session resume
    - Check for in-progress sessions on sync start
    - Resume existing session instead of creating new one
    - Determine last completed phase from status and flags
    - Restart upload if status='pending' or 'uploading' and logs_uploaded=0
    - Restart download if status='uploading' or 'downloading' and bundle_downloaded=0
    - Use stored session_id for resume operations
    - Update session status to 'complete' on successful resume
    - _Requirements: 20.1-20.7_

  - [ ]* 9.14 Write property tests for session resume
    - **Property 58: In-Progress Session Detection**
    - **Property 59: Resume Over New Session**
    - **Property 60: Phase Detection from Status**
    - **Property 61: Session ID Continuity**
    - **Validates: Requirements 20.1-20.6**

  - [x] 9.15 Implement sync status and progress tracking
    - Implement getSyncStatus method returning state, sessionId, progress, error, logsUploaded, bundleDownloaded
    - Map states to progress percentages: idle=0%, checking_connectivity=10%, uploading=30%, downloading=60%, importing=90%, complete=100%
    - Ensure progress bounds: 0-100 inclusive
    - _Requirements: 27.1-27.8_

  - [ ]* 9.16 Write property tests for progress tracking
    - **Property 62: Sync Status Progress Mapping**
    - **Property 63: Progress Bounds**
    - **Validates: Requirements 27.2-27.7**

  - [x] 9.17 Implement cleanup operations
    - Delete synced logs older than 30 days
    - Delete archived bundles older than 30 days
    - Keep only last 10 sync session records
    - Run cleanup automatically after successful sync
    - Preserve all unsynced logs regardless of age
    - _Requirements: 23.1-23.6_

  - [x] 9.18 Implement error handling and user feedback
    - Display user-friendly error messages for each error type
    - Log structured error data with category, severity, message, details
    - Emit error events for UI notification
    - _Requirements: 26.1-26.7_

- [x] 10. Checkpoint - Sync orchestrator complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement content delivery service
  - [x] 11.1 Create ContentDeliveryService class
    - Implement constructor accepting DatabaseManager
    - Initialize in-memory caches for lessons, quizzes, hints
    - Create preload queue for background lesson loading
    - _Requirements: 17.1-17.7_

  - [x] 11.2 Implement lesson and quiz retrieval
    - Implement getNextLesson querying active bundle by subject
    - Implement getNextQuiz querying active bundle by subject
    - Implement getLessonById with caching
    - Implement getQuizById with caching
    - Follow Study_Track order for lesson sequence
    - Return null when no active bundle exists
    - _Requirements: 17.1-17.7, 29.1-29.7_

  - [ ]* 11.3 Write property tests for content retrieval
    - **Property 45: Active Bundle Query**
    - **Property 46: Study Track Ordering**
    - **Property 47: Content Caching**
    - **Property 49: No Bundle Returns Null**
    - **Validates: Requirements 17.1-17.7**

  - [x] 11.4 Implement content caching and preloading
    - Cache current lesson immediately on access
    - Preload next 3 lessons in background queue
    - Cache quizzes on first access
    - Cache all hint levels together on first retrieval
    - Implement clearCache and getCacheStats methods
    - _Requirements: 17.3-17.4, 17.6_

  - [ ]* 11.5 Write property test for lesson preloading
    - **Property 48: Lesson Preloading**
    - **Validates: Requirements 17.4**

  - [x] 11.6 Implement progressive hint system
    - Implement getHint accepting quizId, questionId, level (1-3)
    - Validate hint level bounds (1-3 inclusive)
    - Retrieve hints from local database by quiz and question
    - Cache all hint levels together
    - Return null for non-existent hint levels
    - Ensure hints available offline
    - _Requirements: 18.1-18.7_

  - [ ]* 11.7 Write property tests for hint system
    - **Property 50: Hint Level Validation**
    - **Property 51: Hint Retrieval by Level**
    - **Property 52: Non-Existent Hint Returns Null**
    - **Property 53: Hint Offline Availability**
    - **Validates: Requirements 18.2, 18.5-18.7**

  - [x] 11.8 Implement answer validation and feedback
    - Implement validateAnswer accepting quizId, questionId, answer, hintsUsed
    - Use case-insensitive exact match for multiple_choice and true_false
    - Use partial/substring matching for short_answer
    - Return QuizFeedback with correct, explanation, encouragement
    - Include nextHintLevel if incorrect and hintsUsed < 3
    - Vary encouragement based on correctness and hints used
    - _Requirements: 19.1-19.7_

  - [ ]* 11.9 Write property tests for answer validation
    - **Property 54: Answer Comparison Logic**
    - **Property 55: Feedback Structure**
    - **Property 56: Next Hint Level Inclusion**
    - **Property 57: Contextual Encouragement**
    - **Validates: Requirements 19.2-19.6**

- [x] 12. Checkpoint - Content delivery complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement performance tracking service
  - [x] 13.1 Create PerformanceTrackingService class
    - Implement constructor accepting DatabaseManager
    - Implement logLessonStart creating 'lesson_start' log
    - Implement logLessonComplete creating 'lesson_complete' log with timeSpent
    - Implement logQuizStart creating 'quiz_start' log
    - Implement logQuizAnswer creating 'quiz_answer' log with answer, correct, hintsUsed
    - Implement logQuizComplete creating 'quiz_complete' log with timeSpent, score
    - Implement logHintRequested creating 'hint_requested' log with hintLevel
    - Write each log to SQLite immediately (not buffered)
    - Set synced=0 for all new logs
    - _Requirements: 16.1-16.8_

  - [ ]* 13.2 Write property tests for performance tracking
    - **Property 43: Performance Event Log Structure**
    - **Property 44: Immediate Log Persistence**
    - **Validates: Requirements 16.1-16.8**

- [x] 14. Implement monitoring service
  - [x] 14.1 Create MonitoringService class
    - Record sync_success metric with duration on successful sync
    - Record sync_failure metric with error message on failed sync
    - Emit bundle_generation metrics with latency_ms, success, size_bytes, content_count
    - Log bundle generation events to audit log
    - Log state transitions with timestamps
    - Include severity levels in error logs: low, medium, high
    - _Requirements: 22.1-22.7_

- [x] 15. Implement Cloud Brain backend services
  - [x] 15.1 Create upload Lambda handler
    - Accept POST /sync/upload with student_id, logs, last_sync_time
    - Validate request structure and authentication
    - Store logs in DynamoDB or processing queue
    - Return sessionId, logsReceived, bundleReady
    - _Requirements: 2.1-2.10_

  - [x] 15.2 Create Personalization Engine
    - Analyze quiz answers to identify weak topics
    - Analyze lesson completion times for difficulty assessment
    - Update student Knowledge_Model based on performance
    - Calculate accuracy rate per topic
    - Adjust difficulty level based on accuracy (>80% increase, <50% decrease)
    - Consider time spent when selecting content
    - _Requirements: 12.1-12.10, 28.1-28.7_

  - [x] 15.3 Create Bundle Generator service
    - Invoke Bedrock Agent with student_id, Knowledge_Model, performance_logs, subjects
    - Generate lessons with sections, examples, practice problems
    - Generate quizzes with multiple_choice, true_false, short_answer questions
    - Generate hints at levels 1, 2, 3 for each question
    - Align content with curriculum standards
    - Validate generated content against safety filters
    - Create fallback mock content if Bedrock Agent fails
    - _Requirements: 12.1-12.10, 30.1-30.7_

  - [x] 15.4 Implement bundle compression and optimization
    - Serialize bundle to JSON
    - Compress JSON using gzip with level 9
    - Target 5MB per week of content
    - Remove optional media if size exceeds target
    - Reduce practice problems if still over target
    - Calculate SHA-256 checksum of compressed data
    - Throw BundleSizeExceededError if cannot optimize below target
    - _Requirements: 13.1-13.8_

  - [x] 15.5 Implement S3 upload and presigned URL generation
    - Upload compressed bundle to S3 with key format: bundles/{student_id}/{bundle_id}.gz
    - Retry upload up to 3 times with exponential backoff
    - Generate presigned URL valid for 14 days (1,209,600 seconds)
    - Enable HTTP Range request support for resume capability
    - Store S3 key and presigned URL in bundle metadata
    - _Requirements: 14.1-14.7_

  - [x] 15.6 Implement bundle metadata storage in DynamoDB
    - Save metadata with bundle_id, student_id, s3_key, total_size, checksum
    - Include valid_from, valid_until timestamps
    - Include subjects array and content_count (lessons, quizzes)
    - Include generation_timestamp (UTC)
    - Configure table name via BUNDLES_TABLE environment variable
    - Support querying by student_id for bundle history
    - _Requirements: 15.1-15.7_

  - [x] 15.7 Create download Lambda handler
    - Accept GET /sync/download/{sessionId}
    - Retrieve bundle metadata from DynamoDB
    - Return bundleUrl, bundleSize, checksum, validUntil
    - _Requirements: 5.1-5.8_

  - [x] 15.8 Implement study track generation
    - Create Study_Track for each subject
    - Organize content into weeks and days
    - Include track_id, subject, weeks array
    - Balance lesson and quiz distribution across week
    - _Requirements: 29.1-29.7_

  - [x] 15.9 Implement curriculum standards alignment
    - Include curriculum_standards array in lessons
    - Reference specific standards (e.g., CCSS.MATH.CONTENT.6.EE.A.2)
    - Tag lessons with grade level and subject
    - Validate generated content includes curriculum standards
    - Support multiple curriculum frameworks (CCSS, NGSS, etc.)
    - _Requirements: 30.1-30.7_

- [x] 16. Checkpoint - Backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Integration and end-to-end testing
  - [ ]* 17.1 Write integration test for complete sync flow
    - Test full sync from connectivity check through import
    - Test first-time user flow with empty logs
    - Test sync with various log counts (0, 1, 100)
    - Test resume after interruption at each phase

  - [ ]* 17.2 Write integration test for download resume
    - Test resume with partial download
    - Test resume across app restart
    - Test corrupted partial file handling

  - [ ]* 17.3 Write integration test for bundle import
    - Test successful import with valid bundle
    - Test checksum mismatch handling
    - Test decompression error handling
    - Test structure validation errors
    - Test transaction rollback on error

  - [ ]* 17.4 Write integration test for content delivery
    - Test lesson retrieval with study track ordering
    - Test quiz retrieval and caching
    - Test hint retrieval at all levels
    - Test answer validation for all question types

  - [ ]* 17.5 Write integration test for error handling
    - Test network timeout handling
    - Test authentication failure and token refresh
    - Test retry logic with exponential backoff
    - Test non-retryable error handling

- [x] 18. Final checkpoint and deployment preparation
  - Ensure all tests pass (unit, property, integration)
  - Verify test coverage meets 80% target
  - Run performance benchmarks and verify targets met
  - Review error messages for user-friendliness
  - Verify all 63 correctness properties are tested
  - Ask the user if questions arise before considering feature complete.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- The implementation uses TypeScript for Local Brain (React Native) and Python for Cloud Brain (AWS Lambda)
- All network communications use TLS 1.3 encryption
- All local data is stored in SQLite with SQLCipher encryption
- The sync workflow is state machine-driven for reliability and resumability
