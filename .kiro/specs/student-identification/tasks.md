# Implementation Plan: Student Identification and Registration

## Overview

This implementation plan converts the student identification feature design into actionable coding tasks. The implementation follows a phased approach: first establishing the Local Brain foundation (profile service, onboarding UI, secure storage), then building the Cloud Brain infrastructure (registration API, DynamoDB integration), and finally integrating everything by replacing hardcoded student IDs throughout the codebase.

Each task builds incrementally on previous work, with checkpoints to validate functionality before proceeding. Testing tasks are marked as optional (*) to enable faster MVP delivery while maintaining the option for comprehensive test coverage.

## Tasks

- [x] 1. Set up Local Brain student profile infrastructure
  - [x] 1.1 Create StudentProfileService with UUID generation and SecureStore integration
    - Create `local-brain/src/services/StudentProfileService.ts`
    - Implement UUID v4 generation using expo-crypto
    - Implement SecureStore read/write methods for profile persistence
    - Implement singleton pattern for service instance
    - Add methods: `hasProfile()`, `loadProfile()`, `createProfile()`, `storeProfile()`, `generateStudentId()`
    - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.3_
  
  - [x] 1.2 Write property test for UUID generation format
    - **Property 4: UUID Generation Format**
    - **Validates: Requirements 3.1, 3.2**
    - Use fast-check to verify all generated UUIDs match v4 format pattern
    - Run 100 iterations to ensure consistency
  
  - [ ]* 1.3 Write property test for profile round trip persistence
    - **Property 2: Profile Load Round Trip**
    - **Validates: Requirements 4.1, 4.2**
    - Use fast-check to verify stored profiles can be retrieved with identical data
  
  - [ ]* 1.4 Write unit tests for StudentProfileService
    - Test profile creation with valid name
    - Test profile storage and retrieval
    - Test profile retrieval when none exists
    - Test SecureStore error handling
    - _Requirements: 3.1, 4.1, 4.4_

- [ ] 2. Implement Cloud Brain registration API
  - [ ] 2.1 Create DynamoDB students table infrastructure
    - Update `cloud-brain/infrastructure/dynamodb.tf` (or equivalent)
    - Define table with studentId as partition key
    - Configure pay-per-request billing mode
    - Enable point-in-time recovery for production
    - Add CloudWatch alarms for throttling
    - _Requirements: 5.3, 7.5, 8.5_
  
  - [ ] 2.2 Create StudentRepository for DynamoDB operations
    - Create `cloud-brain/src/repositories/student_repository.py`
    - Implement `create_student()` method with idempotent logic
    - Implement `get_student()` method
    - Implement `list_students()` method for educator dashboard
    - Implement `student_exists()` method
    - Handle DynamoDB errors with appropriate exceptions
    - _Requirements: 5.3, 8.5, 8.6, 10.1_
  
  - [ ]* 2.3 Write property test for registration input validation
    - **Property 13: Registration Input Validation**
    - **Validates: Requirements 8.2, 8.3, 8.4**
    - Use hypothesis to test validation with random inputs
    - Verify 400 responses for invalid UUIDs and empty names
  
  - [ ]* 2.4 Write unit tests for StudentRepository
    - Test create_student with valid data
    - Test create_student idempotency (duplicate studentId)
    - Test get_student by ID
    - Test list_students pagination
    - Test DynamoDB error handling
    - _Requirements: 5.3, 8.5, 8.6_

- [ ] 3. Implement registration API endpoint
  - [ ] 3.1 Create student registration handler
    - Create `cloud-brain/src/handlers/student_handler.py`
    - Implement `register()` function for POST /api/students/register
    - Add UUID format validation using regex pattern
    - Add student name validation (non-empty, max 100 chars)
    - Integrate with StudentRepository
    - Return 201 for new registrations, 200 for existing students
    - Return 400 for validation errors with descriptive messages
    - Return 503 for DynamoDB errors
    - Add CORS headers
    - _Requirements: 5.3, 5.4, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_
  
  - [ ] 3.2 Update API Gateway configuration
    - Add POST /api/students/register route
    - Configure Lambda integration for student_handler.register
    - Set up CORS for mobile app origin
    - Configure request/response models
    - Add API Gateway throttling (100 req/sec)
    - _Requirements: 8.1_
  
  - [ ]* 3.3 Write property test for registration idempotency
    - **Property 15: Registration Idempotency**
    - **Validates: Requirements 8.6**
    - Use hypothesis to verify duplicate registrations return 200
  
  - [ ]* 3.4 Write property test for successful registration response
    - **Property 14: Successful Registration Response**
    - **Validates: Requirements 5.3, 5.4, 8.5, 8.7**
    - Verify 201 responses include all required fields
  
  - [ ]* 3.5 Write unit tests for registration handler
    - Test valid registration returns 201
    - Test duplicate registration returns 200
    - Test invalid UUID returns 400
    - Test empty name returns 400
    - Test missing fields return 400
    - Test DynamoDB error returns 503
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [ ] 4. Checkpoint - Verify Cloud Brain registration API
  - Deploy Cloud Brain changes to dev environment
  - Test registration endpoint with curl or Postman
  - Verify DynamoDB table creation and data storage
  - Ensure all tests pass, ask the user if questions arise

- [ ] 5. Build onboarding screen UI
  - [ ] 5.1 Create onboarding screen component
    - Create `local-brain/app/onboarding.tsx`
    - Add welcome message and app description
    - Add text input for student name with validation
    - Add submit button (disabled when name is invalid)
    - Add loading indicator during registration
    - Add error message display for registration failures
    - Implement real-time name validation (enable/disable submit button)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [ ]* 5.2 Write property test for name validation controls
    - **Property 3: Name Validation Controls Submit Button**
    - **Validates: Requirements 2.3, 2.4**
    - Use fast-check to verify button state matches name validity
  
  - [ ]* 5.3 Write unit tests for onboarding screen
    - Test screen renders input field and submit button
    - Test submit button disabled when name is empty
    - Test submit button enabled when name is valid
    - Test loading indicator shown during registration
    - Test error message shown on registration failure
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 6. Implement registration with retry logic
  - [ ] 6.1 Add Cloud Brain registration to StudentProfileService
    - Implement `registerWithCloudBrain()` private method
    - Add exponential backoff retry logic (1s, 2s, 4s delays)
    - Make HTTP POST request to /api/students/register
    - Handle network errors with retries
    - Handle 400 errors without retries (validation failures)
    - Handle 503 errors with retries (service unavailable)
    - Queue registration for next sync after max retries
    - Log all registration attempts and outcomes
    - _Requirements: 5.1, 5.2, 5.5, 5.6_
  
  - [ ] 6.2 Integrate registration into createProfile flow
    - Update `createProfile()` to call `registerWithCloudBrain()`
    - Store profile locally before attempting cloud registration
    - Proceed to app even if registration fails (offline-first)
    - Return profile immediately after local storage
    - _Requirements: 5.1, 5.6_
  
  - [ ]* 6.3 Write property test for registration retry logic
    - **Property 8: Registration Retry Logic**
    - **Validates: Requirements 5.5**
    - Verify retry attempts with correct backoff delays
  
  - [ ]* 6.4 Write property test for registration request completeness
    - **Property 7: Registration Request Completeness**
    - **Validates: Requirements 5.1, 5.2**
    - Verify all requests include studentId and studentName
  
  - [ ]* 6.5 Write unit tests for registration with retry
    - Test successful registration on first attempt
    - Test retry on network failure
    - Test max retries exceeded
    - Test queue for sync after failures
    - Test no retry on 400 errors
    - _Requirements: 5.5, 5.6_

- [ ] 7. Update AppContext for dynamic student ID
  - [ ] 7.1 Modify AppContext to use dynamic studentId state
    - Update `local-brain/src/contexts/AppContext.tsx`
    - Replace hardcoded SAMPLE_STUDENT_ID with state variable
    - Add `studentId` state (string | null)
    - Add `setStudentId` function
    - Add `isProfileLoaded` state (boolean)
    - Initialize studentId from StudentProfileService on app startup
    - Show loading screen while profile is being loaded
    - Navigate to onboarding if no profile exists
    - _Requirements: 1.1, 1.2, 1.3, 6.1, 6.2_
  
  - [ ]* 7.2 Write property test for AppContext population
    - **Property 9: AppContext Population**
    - **Validates: Requirements 6.1**
    - Verify AppContext receives studentId from loaded profile
  
  - [ ]* 7.3 Write unit tests for AppContext initialization
    - Test AppContext loads existing profile on startup
    - Test AppContext navigates to onboarding when no profile
    - Test AppContext updates studentId state correctly
    - Test isProfileLoaded flag behavior
    - _Requirements: 1.1, 1.2, 1.3, 6.1_

- [ ] 8. Integrate onboarding with app startup flow
  - [ ] 8.1 Wire onboarding screen to app navigation
    - Update app navigation to include onboarding route
    - Implement onboarding completion handler
    - Call StudentProfileService.createProfile() on submit
    - Update AppContext with new studentId
    - Navigate to main app after profile creation
    - Handle registration errors with user-friendly messages
    - _Requirements: 1.2, 2.5, 5.1, 6.1_
  
  - [ ]* 8.2 Write property test for profile existence check
    - **Property 1: Profile Existence Check on Startup**
    - **Validates: Requirements 1.1, 1.3**
    - Verify app checks SecureStore and routes correctly
  
  - [ ]* 8.3 Write integration tests for first launch flow
    - Test end-to-end first launch with profile creation
    - Test end-to-end returning user flow
    - Test profile persistence across app restarts
    - _Requirements: 1.1, 1.2, 1.3, 2.5_

- [ ] 9. Checkpoint - Verify Local Brain onboarding flow
  - Test first launch experience on iOS/Android simulator
  - Verify profile creation and storage
  - Verify navigation to main app after onboarding
  - Test app restart with existing profile
  - Ensure all tests pass, ask the user if questions arise

- [ ] 10. Replace hardcoded student IDs in Local Brain components
  - [ ] 10.1 Update lesson components to use AppContext studentId
    - Update `local-brain/app/(tabs)/lessons.tsx`
    - Replace SAMPLE_STUDENT_ID with studentId from useApp()
    - Update LessonDisplay component to receive studentId prop
    - Update all SQLite queries to use dynamic studentId
    - _Requirements: 6.3, 7.1_
  
  - [ ] 10.2 Update quiz components to use AppContext studentId
    - Update `local-brain/app/(tabs)/quizzes.tsx`
    - Update `local-brain/src/components/QuizDisplay.tsx`
    - Replace SAMPLE_STUDENT_ID with studentId from useApp()
    - Update all SQLite queries to use dynamic studentId
    - _Requirements: 6.3, 7.2_
  
  - [ ] 10.3 Update progress tracking to use AppContext studentId
    - Update `local-brain/app/(tabs)/progress.tsx`
    - Update `local-brain/app/(tabs)/index.tsx` (home screen)
    - Replace SAMPLE_STUDENT_ID with studentId from useApp()
    - Update all SQLite queries to use dynamic studentId
    - _Requirements: 6.3, 7.3_
  
  - [ ] 10.4 Update sync service to use AppContext studentId
    - Update sync-related services to use dynamic studentId
    - Update all API calls to include studentId from AppContext
    - Remove SAMPLE_STUDENT_ID constant from codebase
    - _Requirements: 6.4, 7.4_
  
  - [ ]* 10.5 Write property test for data isolation
    - **Property 11: Data Isolation**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
    - Verify all local storage operations include studentId
  
  - [ ]* 10.6 Write property test for API calls include student ID
    - **Property 10: API Calls Include Student ID**
    - **Validates: Requirements 6.4**
    - Verify all Cloud Brain API calls include studentId
  
  - [ ]* 10.7 Write unit tests for component updates
    - Test lessons component uses correct studentId
    - Test quizzes component uses correct studentId
    - Test progress component uses correct studentId
    - Test sync service includes studentId in API calls
    - _Requirements: 6.3, 6.4, 7.1, 7.2, 7.3, 7.4_

- [ ] 11. Update educator dashboard to use real student data
  - [ ] 11.1 Create students list API endpoint
    - Create handler function in `cloud-brain/src/handlers/educator_handler.py`
    - Implement GET /api/educator/students endpoint
    - Use StudentRepository.list_students() to fetch data
    - Return student records with studentId, studentName, registrationTimestamp
    - Add pagination support (limit parameter)
    - _Requirements: 10.1, 10.2, 10.3_
  
  - [ ] 11.2 Update EducatorDashboard component to fetch real data
    - Update `cloud-brain/web/app/components/EducatorDashboard.tsx`
    - Remove mock data generation from `cloud-brain/web/app/mockData.ts`
    - Fetch students from GET /api/educator/students
    - Display real student names and registration dates
    - Handle loading and error states
    - _Requirements: 10.2, 10.3_
  
  - [ ] 11.3 Update progress data queries to filter by studentId
    - Update all educator dashboard queries to include studentId filter
    - Ensure progress data is correctly associated with students
    - _Requirements: 10.4_
  
  - [ ]* 11.4 Write property test for dashboard data completeness
    - **Property 16: Educator Dashboard Data Completeness**
    - **Validates: Requirements 10.3**
    - Verify all student records include required fields
  
  - [ ]* 11.5 Write property test for progress data isolation
    - **Property 17: Progress Data Isolation**
    - **Validates: Requirements 10.4**
    - Verify progress data is filtered by correct studentId
  
  - [ ]* 11.6 Write unit tests for educator dashboard
    - Test students list endpoint returns real data
    - Test dashboard component fetches and displays students
    - Test progress data filtered by studentId
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 12. Add comprehensive error handling
  - [ ] 12.1 Implement SecureStore error handling
    - Add try-catch blocks for all SecureStore operations
    - Handle device locked scenarios
    - Handle corrupted profile data
    - Show user-friendly error messages
    - Log errors for debugging
    - _Requirements: 4.3, 4.4_
  
  - [ ] 12.2 Implement network error handling
    - Handle timeout errors in registration
    - Handle DNS resolution failures
    - Handle server errors (500, 503)
    - Show appropriate user messages
    - _Requirements: 5.5, 5.6_
  
  - [ ] 12.3 Implement validation error handling
    - Handle 400 responses from registration API
    - Display validation error messages to user
    - Prevent retry on validation errors
    - _Requirements: 8.4_

- [ ] 13. Final checkpoint and integration testing
  - [ ]* 13.1 Run all property-based tests
    - Execute all 17 property tests
    - Verify 100+ iterations per test
    - Fix any failing properties
  
  - [ ]* 13.2 Run all unit tests with coverage
    - Execute full test suite for Local Brain
    - Execute full test suite for Cloud Brain
    - Verify >80% code coverage
  
  - [ ]* 13.3 Perform end-to-end integration testing
    - Test complete first launch flow (onboarding → registration → main app)
    - Test returning user flow (load profile → main app)
    - Test offline registration (queue for sync)
    - Test multiple app restarts
    - Test data isolation with different student profiles
  
  - [ ] 13.4 Verify all requirements are met
    - Review all 10 requirements and acceptance criteria
    - Test each acceptance criterion manually
    - Document any known issues or limitations
    - Ensure all tests pass, ask the user if questions arise

- [ ] 14. Documentation and deployment preparation
  - [ ] 14.1 Update API documentation
    - Document POST /api/students/register endpoint
    - Document GET /api/educator/students endpoint
    - Include request/response schemas
    - Add error code documentation
  
  - [ ] 14.2 Update developer documentation
    - Document StudentProfileService usage
    - Document AppContext changes
    - Add migration guide for removing SAMPLE_STUDENT_ID
    - Document SecureStore key format
  
  - [ ] 14.3 Prepare deployment checklist
    - Verify DynamoDB table creation in all environments
    - Verify API Gateway routes configured
    - Verify environment variables set
    - Verify CloudWatch alarms configured
    - Create rollback plan

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at critical milestones
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation is designed to be offline-first, with cloud registration as a background operation
- All existing features (lessons, quizzes, sync) already support studentId parameters and will work seamlessly once AppContext provides real IDs
- The design supports future multi-student scenarios while implementing the minimal viable solution for single-student registration
