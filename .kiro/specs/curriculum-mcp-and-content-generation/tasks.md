# Implementation Plan: Curriculum MCP Server Integration and Content Generation

## Overview

This implementation plan builds the curriculum MCP server integration and content generation system for Sikshya-Sathi. The system enables the Cloud Brain to generate curriculum-aligned lessons and quizzes using Amazon Bedrock Agent, validate them against Nepal K-12 standards via an MCP Server, and synchronize the content to students' Local Brain for offline learning.

The implementation follows this sequence:
1. MCP Server foundation with curriculum data loading and tool exposure
2. Bedrock Agent integration for content generation
3. Content validation pipeline with curriculum alignment checking
4. Learning bundle generation and compression
5. Sync API and Local Brain integration
6. Personalization engine for adaptive content selection
7. Error handling and monitoring

## Tasks

- [x] 1. Set up MCP Server infrastructure and curriculum data loading
  - [x] 1.1 Create MCP Server project structure in cloud-brain/src/mcp/
    - Create directory structure: server.py, tools.py, models.py, data/
    - Set up Python package with __init__.py
    - Add MCP SDK dependencies to requirements.txt
    - _Requirements: 1.1_

  - [x] 1.2 Implement curriculum data models and schema validation
    - Create CurriculumStandard, TopicDetails, LearningProgression Pydantic models
    - Implement schema validation for grade range (6-8), required fields
    - Add BloomLevel and Subject enums
    - _Requirements: 1.2, 13.3, 13.5, 13.6_

  - [x] 1.3 Implement curriculum data loading from JSON files
    - Load curriculum_standards.json on MCP Server initialization
    - Index standards by ID, grade, and subject for efficient retrieval
    - Log loading statistics (count, validation errors)
    - Handle missing/corrupted files gracefully with error logging
    - _Requirements: 1.1, 1.3, 1.5_

  - [x]* 1.4 Write property test for curriculum data loading
    - **Property 1: MCP Server Curriculum Data Loading**
    - **Validates: Requirements 1.1, 1.3**

  - [x]* 1.5 Write property test for curriculum data validation
    - **Property 2: MCP Server Data Validation**
    - **Validates: Requirements 1.2**

- [x] 2. Implement MCP Server tools for curriculum access
  - [x] 2.1 Implement get_curriculum_standards tool
    - Accept grade (6-8) and subject parameters
    - Return standards with learning objectives, prerequisites, Bloom level, estimated hours
    - Handle invalid parameters with error responses
    - _Requirements: 2.1, 2.2_

  - [x] 2.2 Implement get_topic_details tool
    - Accept topic ID parameter
    - Return TopicDetails with assessment criteria, subtopics, resources
    - Return None for invalid topic IDs
    - _Requirements: 2.3, 2.4_

  - [x] 2.3 Implement validate_content_alignment tool
    - Accept content text and target standard IDs
    - Implement keyword matching algorithm for alignment scoring
    - Calculate alignment score (matched_standards / total_target_standards)
    - Return ContentAlignment with score, matched standards, gaps, recommendations
    - Apply 0.7 (70%) threshold for approval
    - _Requirements: 2.5, 2.6, 4.2_

  - [x] 2.4 Implement get_learning_progression tool
    - Accept subject and grade range parameters
    - Return LearningProgression with topic sequence, dependencies, difficulty progression
    - _Requirements: 2.7, 2.8_

  - [ ]* 2.5 Write property tests for MCP tool response completeness
    - **Property 3: MCP Tool Response Completeness**
    - **Property 4: Topic Details Completeness**
    - **Property 5: Content Alignment Validation Structure**
    - **Property 6: Learning Progression Structure**
    - **Validates: Requirements 2.2, 2.4, 2.6, 2.8**

  - [ ]* 2.6 Write unit tests for MCP tools
    - Test get_curriculum_standards with valid/invalid parameters
    - Test get_topic_details with existing/non-existing IDs
    - Test validate_content_alignment with high/low alignment content
    - Test get_learning_progression for each subject

- [x] 3. Checkpoint - Verify MCP Server functionality
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Bedrock Agent content generation
  - [x] 4.1 Create content generation models and request/response types
    - Create Lesson, LessonSection, Quiz, Question Pydantic models
    - Create LessonGenerationRequest, QuizGenerationRequest types
    - Add DifficultyLevel, QuestionType, BloomLevel enums
    - _Requirements: 5.1, 6.1_

  - [x] 4.2 Implement Bedrock Agent configuration and initialization
    - Configure agent with Claude 3.5 Sonnet model
    - Set agent instructions for curriculum-aligned content generation
    - Configure MCP Server connection for tool access
    - _Requirements: 3.1_

  - [x] 4.3 Implement lesson generation function
    - Accept LessonGenerationRequest with topic, subject, grade, difficulty, curriculum standards
    - Query MCP Server for curriculum standards before generation
    - Generate lesson with explanation, example, and practice sections
    - Include cultural context relevant to Nepal
    - Support bilingual content (English and Nepali)
    - Assign unique lesson ID (UUID)
    - Reference curriculum standard IDs in lesson
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.2, 5.3, 5.4_

  - [x] 4.4 Implement quiz generation function
    - Accept QuizGenerationRequest with topic, subject, grade, difficulty, question count
    - Query MCP Server for curriculum standards
    - Generate questions with mixed types (multiple-choice, true/false, short-answer)
    - Include correct answer and explanation for each question
    - Tag questions with Bloom's taxonomy level
    - Assign unique quiz and question IDs
    - _Requirements: 3.7, 3.8, 3.9, 3.10, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [ ]* 4.5 Write property tests for content generation
    - **Property 7: Bedrock Agent MCP Query Before Generation**
    - **Property 8: Lesson Structure Completeness**
    - **Property 9: Lesson Curriculum Reference**
    - **Property 10: Lesson ID Uniqueness**
    - **Property 11: Quiz Structure Completeness**
    - **Property 12: Quiz Question Type Variety**
    - **Property 13: Quiz ID Uniqueness**
    - **Property 14: Multiple Choice Options Range**
    - **Validates: Requirements 3.2, 3.3, 3.5, 3.6, 3.8, 3.9, 3.10, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.6, 6.7, 6.8**

  - [ ]* 4.6 Write unit tests for content generation
    - Test lesson generation with specific topics
    - Test quiz generation with different question counts
    - Test content generation timeout handling
    - Test invalid content handling

- [x] 5. Implement content validation pipeline
  - [x] 5.1 Create Content Validator service
    - Create ValidationResult, ContentValidationRequest models
    - Implement validation orchestrator combining all checks
    - _Requirements: 4.1_

  - [x] 5.2 Implement curriculum alignment validation
    - Invoke MCP Server validate_content_alignment tool
    - Verify alignment score >= 0.7 (70%)
    - Reject content below threshold with regeneration flag
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 5.3 Implement age-appropriateness and language validation
    - Check language complexity matches grade level
    - Verify Nepali cultural context appropriateness
    - _Requirements: 4.4, 4.5_

  - [x] 5.4 Implement safety filtering with Bedrock Guardrails
    - Configure Bedrock Guardrails for content safety
    - Detect inappropriate content, hate speech, violence
    - Immediately reject content with safety violations
    - _Requirements: 4.6_

  - [x] 5.5 Implement content regeneration logic
    - Trigger regeneration when validation fails
    - Adjust prompts with specific validation issues
    - Implement exponential backoff (1s, 2s, 4s delays)
    - Maximum 3 regeneration attempts
    - Mark as failed after 3 attempts
    - _Requirements: 4.7, 4.8_

  - [ ]* 5.6 Write property tests for content validation
    - **Property 15: Content Validation with MCP Server**
    - **Property 16: Alignment Score Threshold**
    - **Property 17: Content Rejection Below Threshold**
    - **Property 18: Comprehensive Validation Checks**
    - **Property 19: Validation Failure Triggers Regeneration**
    - **Property 20: Validation Approval Status**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9**

  - [ ]* 5.7 Write unit tests for validation pipeline
    - Test content with high/low alignment scores
    - Test safety filter with inappropriate content
    - Test regeneration loop with persistent failures
    - Test validation approval flow

- [x] 6. Checkpoint - Verify content generation and validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement learning bundle generation and storage
  - [x] 7.1 Create bundle models and compression utilities
    - Create LearningBundle, SubjectContent, BundleMetadata models
    - Implement gzip compression for JSON content
    - Implement SHA-256 checksum calculation
    - _Requirements: 7.1, 7.4_

  - [x] 7.2 Implement bundle composition logic
    - Collect validated lessons and quizzes for student's subjects
    - Organize content by subject
    - Include hints for quiz questions
    - Add bundle ID, student ID, validity period (14 days)
    - _Requirements: 7.1, 7.2, 7.6_

  - [x] 7.3 Implement bundle compression and size optimization
    - Compress lessons, quizzes, and hints with gzip
    - Target: <5MB per week of content
    - Remove optional media if size exceeds limit
    - Calculate final bundle size and checksum
    - _Requirements: 7.3_

  - [x] 7.4 Implement S3 storage and presigned URL generation
    - Upload compressed bundle to S3: s3://sikshya-sathi-bundles/{student_id}/{bundle_id}.gz
    - Generate presigned URL valid for 14 days
    - Implement retry logic for S3 upload failures
    - _Requirements: 7.5_

  - [x] 7.5 Implement DynamoDB metadata storage
    - Store bundle metadata: bundle_id, student_id, generation_timestamp, size_bytes, content_count, subjects, valid_until, s3_key, checksum
    - Use bundle_id as partition key
    - _Requirements: 7.7_

  - [ ]* 7.6 Write property tests for bundle generation
    - **Property 21: Lesson Serialization Round Trip**
    - **Property 22: Quiz Serialization Round Trip**
    - **Property 23: Learning Bundle Structure**
    - **Property 24: Bundle Compression Target**
    - **Property 25: Bundle Validity Period**
    - **Property 26: Bundle Storage and Metadata**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6**

  - [ ]* 7.7 Write unit tests for bundle generation
    - Test bundle composition with multiple subjects
    - Test compression size limits
    - Test S3 upload with retry logic
    - Test DynamoDB metadata storage

- [x] 8. Implement sync API endpoints
  - [x] 8.1 Create sync handler Lambda function
    - Create POST /api/sync/upload endpoint for performance logs
    - Create GET /api/sync/download/:sessionId endpoint for bundle download
    - Implement session management with DynamoDB
    - _Requirements: 8.1_

  - [x] 8.2 Implement upload performance logs endpoint
    - Accept studentId, logs, lastSyncTime
    - Store logs in DynamoDB or S3
    - Trigger bundle generation asynchronously
    - Return sessionId and bundleReady status
    - _Requirements: 10.1_

  - [x] 8.3 Implement download bundle endpoint
    - Accept sessionId parameter
    - Retrieve bundle metadata from DynamoDB
    - Return presigned URL, bundle size, checksum, validUntil
    - _Requirements: 8.1_

  - [ ]* 8.4 Write integration tests for sync API
    - Test upload logs and bundle generation flow
    - Test download bundle with valid session
    - Test error handling for invalid sessions

- [x] 9. Implement Local Brain sync integration
  - [x] 9.1 Update SQLite schema for lessons and quizzes
    - Create lessons table with lesson_id, student_id, subject, topic, title, difficulty, estimated_minutes, curriculum_standards, sections, created_at
    - Create quizzes table with quiz_id, student_id, subject, topic, title, difficulty, time_limit, questions, created_at
    - Add indexes for efficient querying
    - _Requirements: 8.4, 8.5, 8.6_

  - [x] 9.2 Implement bundle download with resume support
    - Download bundle from presigned URL with HTTP Range requests
    - Store download progress in SQLite for resume capability
    - Implement retry logic with exponential backoff
    - _Requirements: 8.1_

  - [x] 9.3 Implement bundle checksum verification
    - Calculate SHA-256 checksum of downloaded bundle
    - Compare with expected checksum from metadata
    - Reject bundle if checksum mismatch
    - Log error and retry download
    - _Requirements: 8.2, 8.3_

  - [x] 9.4 Implement bundle extraction and content insertion
    - Decompress gzip bundle
    - Parse JSON content
    - Extract lessons and insert into lessons table
    - Extract quizzes and insert into quizzes table
    - Preserve curriculum_standards, difficulty, estimated_minutes
    - Wrap insertion in transaction (all-or-nothing)
    - Mark sync session as successful
    - _Requirements: 8.4, 8.5, 8.6, 8.7_

  - [ ]* 9.5 Write property tests for sync integration
    - **Property 27: Sync Bundle Download**
    - **Property 28: Bundle Checksum Verification**
    - **Property 29: Sync Content Extraction and Storage**
    - **Property 30: Sync Success Status**
    - **Validates: Requirements 8.1, 8.2, 8.4, 8.5, 8.6, 8.7**

  - [ ]* 9.6 Write unit tests for Local Brain sync
    - Test bundle download with network interruption
    - Test checksum verification with corrupted data
    - Test content insertion with database errors
    - Test transaction rollback on failure

- [x] 10. Checkpoint - Verify sync functionality end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement content display in Local Brain
  - [x] 11.1 Update Lessons screen to display synced lessons
    - Query lessons table for student's lessons
    - Display title, subject, topic, difficulty, estimated_minutes
    - Add filtering by subject and difficulty
    - Mark completed lessons with checkmark
    - _Requirements: 9.1, 9.2_

  - [x] 11.2 Implement lesson detail view with section rendering
    - Render lesson sections (explanation, example, practice)
    - Support Devanagari script formatting
    - Display media attachments if present
    - Track lesson completion
    - _Requirements: 9.3_

  - [x] 11.3 Update Quizzes screen to display synced quizzes
    - Query quizzes table for student's quizzes
    - Display title, subject, topic, difficulty, question_count, time_limit
    - Add filtering by subject and difficulty
    - Mark completed quizzes with checkmark
    - _Requirements: 9.4, 9.5_

  - [x] 11.4 Implement quiz taking interface
    - Render questions with appropriate input controls (radio buttons for multiple-choice, text input for short-answer)
    - Track student answers
    - Calculate score and show explanations
    - Record quiz results for performance logs
    - _Requirements: 9.6_

  - [ ]* 11.5 Write integration tests for content display
    - Test lessons screen with synced content
    - Test lesson detail rendering
    - Test quizzes screen with synced content
    - Test quiz taking flow

- [x] 12. Implement personalization engine
  - [x] 12.1 Create knowledge model data structures
    - Create KnowledgeModel, SubjectKnowledge, TopicMastery models
    - Store in DynamoDB with student_id as partition key
    - _Requirements: 10.1_

  - [x] 12.2 Implement performance log analysis
    - Parse performance logs from sync upload
    - Extract quiz results and lesson completion data
    - Calculate topic proficiency using Bayesian knowledge tracing
    - Update mastery levels (novice, developing, proficient, advanced)
    - Identify knowledge gaps (proficiency <0.7)
    - Calculate learning velocity (topics per week)
    - _Requirements: 10.1, 10.2_

  - [x] 12.3 Implement content prioritization algorithm
    - Prioritize critical gaps (proficiency <0.5)
    - Include developing topics (proficiency 0.5-0.7)
    - Add mastery advancement (proficiency >0.8)
    - Include review topics (proficiency >0.7, not practiced in 2 weeks)
    - _Requirements: 10.3_

  - [x] 12.4 Implement difficulty selection based on mastery
    - Select easy difficulty for proficiency <0.6
    - Select medium difficulty for proficiency 0.6-0.8
    - Select hard difficulty or advance to next topic for proficiency >0.8
    - _Requirements: 10.4, 10.5_

  - [x] 12.5 Implement curriculum progression validation
    - Ensure content follows curriculum prerequisites
    - Check learning progression from MCP Server
    - Don't include topics before prerequisites are mastered
    - _Requirements: 10.6_

  - [x] 12.6 Implement study track generation
    - Generate 2-4 weeks of content based on student pace
    - Mix: 60% new material, 30% practice, 10% review
    - _Requirements: 10.7_

  - [ ]* 12.7 Write property tests for personalization
    - **Property 31: Performance Log Analysis**
    - **Property 32: Content Prioritization for Gaps**
    - **Property 33: Difficulty Selection Based on Mastery**
    - **Property 34: Mastery Progression**
    - **Property 35: Curriculum Prerequisite Following**
    - **Property 36: Study Track Duration**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7**

  - [ ]* 12.8 Write unit tests for personalization engine
    - Test proficiency calculation with correct/incorrect answers
    - Test knowledge gap identification
    - Test difficulty selection for different proficiency levels
    - Test prerequisite validation

- [x] 13. Implement error handling and resilience
  - [x] 13.1 Implement MCP Server error handling
    - Handle curriculum data file missing/corrupted
    - Implement exponential backoff retry for MCP Server unavailability (1s, 2s, 4s)
    - Use cached curriculum data after 3 failed retries
    - Flag content for manual review when using cached data
    - Log all MCP Server errors with timestamps
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 13.2 Implement Bedrock Agent error handling
    - Handle content generation timeout (30s for lessons, 20s for quizzes)
    - Implement exponential backoff retry for timeouts
    - Handle invalid content (malformed JSON, missing fields)
    - Handle Bedrock service throttling with retry
    - _Requirements: 12.5_

  - [x] 13.3 Implement content validation error handling
    - Handle content failing curriculum alignment
    - Handle content failing safety filter (immediate rejection)
    - Handle maximum regeneration attempts exceeded (3 attempts)
    - Generate alternative content for different topic on persistent failure
    - _Requirements: 4.7, 4.8_

  - [x] 13.4 Implement bundle generation error handling
    - Handle insufficient content generated (minimum 3 items)
    - Handle bundle size exceeding limit (remove media, compress harder)
    - Handle S3 upload failure with retry
    - _Requirements: 7.3_

  - [x] 13.5 Implement Local Brain error handling
    - Handle bundle download failure with resume support
    - Handle bundle checksum mismatch with retry
    - Handle bundle extraction failure (corrupted gzip/JSON)
    - Handle database insertion failure with transaction rollback
    - _Requirements: 8.2, 8.3_

  - [ ]* 13.6 Write property tests for error handling
    - **Property 37: MCP Server Cached Data Fallback**
    - **Property 38: MCP Server Error Logging**
    - **Property 39: Content Generation Timeout Retry**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.6, 12.5**

  - [ ]* 13.7 Write unit tests for error scenarios
    - Test MCP Server unavailability handling
    - Test content generation timeout handling
    - Test validation failure handling
    - Test S3 upload failure handling
    - Test bundle download failure handling

- [x] 14. Implement monitoring and audit logging
  - [x] 14.1 Implement content generation audit logging
    - Log each content generation request with student_id, subject, topic, timestamp
    - Log validation results with alignment scores and status
    - Log rejection reasons and regeneration attempts
    - Log bundle generation events with bundle_id, size, content_count
    - Store logs in CloudWatch Logs with 90-day retention
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 14.2 Implement CloudWatch metrics emission
    - Emit content generation latency (p50, p95, p99)
    - Emit validation pass rate
    - Emit MCP Server availability
    - Emit bundle generation success rate
    - Emit content generation success rate and average generation time
    - _Requirements: 12.6, 15.6_

  - [x] 14.3 Configure CloudWatch alarms
    - Alarm: Content generation failures > 5% in 5 minutes
    - Alarm: MCP Server errors > 10 in 5 minutes
    - Alarm: Bundle generation latency > 5 minutes
    - Alarm: Validation rejection rate > 30%

  - [ ]* 14.4 Write property tests for audit logging
    - **Property 40: Content Generation Metrics**
    - **Property 41: Curriculum Standard Completeness**
    - **Property 42: Curriculum Standard Prerequisites**
    - **Property 43: Content Generation Audit Logging**
    - **Property 44: Validation Result Logging**
    - **Property 45: Rejection Reason Logging**
    - **Property 46: Bundle Generation Event Logging**
    - **Property 47: Content Generation Metrics Emission**
    - **Validates: Requirements 12.6, 13.3, 13.4, 13.5, 13.6, 15.1, 15.2, 15.3, 15.4, 15.6**

- [x] 15. Implement infrastructure with AWS CDK
  - [x] 15.1 Create MCP Server Lambda function
    - Define Lambda function for MCP Server
    - Configure memory (1024 MB) and timeout (30s)
    - Set up environment variables for curriculum data path
    - _Requirements: 1.1_

  - [x] 15.2 Create Bedrock Agent and action groups
    - Define Bedrock Agent with Claude 3.5 Sonnet
    - Configure agent instructions for curriculum-aligned content
    - Create action group connecting to MCP Server Lambda
    - _Requirements: 3.1_

  - [x] 15.3 Create S3 bucket for bundle storage
    - Create S3 bucket with encryption (S3_MANAGED)
    - Enable versioning
    - Configure lifecycle rules (30-day expiration)
    - Block public access
    - _Requirements: 7.5_

  - [x] 15.4 Create DynamoDB tables
    - Create BundleMetadataTable with bundle_id partition key
    - Create KnowledgeModelTable with student_id partition key
    - Enable point-in-time recovery
    - Configure on-demand billing
    - _Requirements: 7.7, 10.1_

  - [x] 15.5 Create sync handler Lambda functions
    - Create Lambda for POST /api/sync/upload
    - Create Lambda for GET /api/sync/download/:sessionId
    - Configure API Gateway integration
    - _Requirements: 8.1_

  - [ ]* 15.6 Write integration tests for infrastructure
    - Test Lambda function invocation
    - Test S3 bucket access
    - Test DynamoDB table operations
    - Test API Gateway endpoints

- [x] 16. Final checkpoint - End-to-end system verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at major milestones
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses Python for Cloud Brain (MCP Server, Bedrock Agent, validation) and TypeScript for Local Brain (React Native app)
- Performance log collection (Requirement 10) may need coordination with existing system functionality
- All content must align with Nepal K-12 curriculum standards (70% threshold)
- Bundle compression targets <5MB per week for limited bandwidth environments
