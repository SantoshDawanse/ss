# Requirements Document

## Introduction

The Student Identification and Registration feature enables first-time users of the Sikshya-Sathi system to create a student profile with a unique identifier. This feature replaces the current hardcoded demo student IDs with real, persistent student identities that enable proper data isolation, progress tracking, and multi-student support. The system generates a UUID for each student, stores their profile locally using secure storage, and registers them in the cloud backend for synchronization and educator dashboard access.

## Glossary

- **Local_Brain**: The mobile application component of Sikshya-Sathi that runs on student devices
- **Cloud_Brain**: The backend API and database infrastructure that stores student data and serves the educator dashboard
- **Student_Profile**: A data structure containing studentId (UUID) and studentName
- **Secure_Storage**: Expo SecureStore API for encrypted local data persistence
- **Registration_API**: Cloud Brain endpoint that creates student records in DynamoDB
- **AppContext**: React context that manages global application state including student identity
- **First_Launch**: The initial app startup when no Student_Profile exists in Secure_Storage
- **Onboarding_Screen**: The welcome interface that collects student name during First_Launch
- **UUID**: Universally Unique Identifier version 4 used as studentId

## Requirements

### Requirement 1: First Launch Detection

**User Story:** As a student, I want the app to detect when I'm using it for the first time, so that I can set up my profile only once.

#### Acceptance Criteria

1. WHEN the Local_Brain starts, THE Local_Brain SHALL check Secure_Storage for an existing Student_Profile
2. IF no Student_Profile exists in Secure_Storage, THEN THE Local_Brain SHALL display the Onboarding_Screen
3. IF a Student_Profile exists in Secure_Storage, THEN THE Local_Brain SHALL load the Student_Profile into AppContext and proceed to the main application interface

### Requirement 2: Student Name Collection

**User Story:** As a student, I want to enter my name during first launch, so that the system can identify me.

#### Acceptance Criteria

1. THE Onboarding_Screen SHALL display a text input field for student name
2. THE Onboarding_Screen SHALL display a submit button to complete registration
3. WHEN the student name input is empty, THE Onboarding_Screen SHALL disable the submit button
4. WHEN the student name input contains at least one non-whitespace character, THE Onboarding_Screen SHALL enable the submit button
5. WHEN the submit button is pressed, THE Local_Brain SHALL proceed to student profile creation

### Requirement 3: Unique Student ID Generation

**User Story:** As the system, I want to generate a unique identifier for each student, so that student data remains isolated and identifiable.

#### Acceptance Criteria

1. WHEN creating a new Student_Profile, THE Local_Brain SHALL generate a UUID version 4 as the studentId
2. THE Local_Brain SHALL ensure the generated studentId is a valid UUID format (8-4-4-4-12 hexadecimal pattern)
3. FOR ALL Student_Profiles created, THE studentId SHALL be unique across all students

### Requirement 4: Local Profile Persistence

**User Story:** As a student, I want my profile saved securely on my device, so that I don't need to re-register every time I open the app.

#### Acceptance Criteria

1. WHEN a Student_Profile is created, THE Local_Brain SHALL store the Student_Profile in Secure_Storage
2. THE Local_Brain SHALL store both studentId and studentName in the Student_Profile
3. WHEN storing the Student_Profile, THE Local_Brain SHALL use encryption provided by Secure_Storage
4. WHEN the Local_Brain starts, THE Local_Brain SHALL retrieve the Student_Profile from Secure_Storage within 500ms

### Requirement 5: Cloud Registration

**User Story:** As an educator, I want new students automatically registered in the cloud, so that I can see their progress in the dashboard.

#### Acceptance Criteria

1. WHEN a Student_Profile is created locally, THE Local_Brain SHALL send a registration request to the Registration_API
2. THE Registration_API request SHALL include studentId and studentName
3. WHEN the Registration_API receives a valid request, THE Cloud_Brain SHALL create a student record in DynamoDB
4. WHEN the Registration_API completes successfully, THE Cloud_Brain SHALL return a success response with HTTP status 201
5. IF the Registration_API fails, THEN THE Local_Brain SHALL retry the registration request up to 3 times with exponential backoff (1s, 2s, 4s)
6. IF all registration retries fail, THEN THE Local_Brain SHALL proceed to the main application and queue the registration for the next sync operation

### Requirement 6: AppContext Integration

**User Story:** As a developer, I want the real student ID available throughout the app, so that all features use the correct student identity.

#### Acceptance Criteria

1. WHEN a Student_Profile is loaded, THE Local_Brain SHALL populate AppContext with the studentId
2. THE AppContext SHALL provide the studentId to all components that require student identification
3. THE Local_Brain SHALL replace all hardcoded demo student IDs with the studentId from AppContext
4. FOR ALL API calls to Cloud_Brain, THE Local_Brain SHALL include the studentId from AppContext

### Requirement 7: Data Isolation

**User Story:** As a student, I want my learning data kept separate from other students, so that my progress is tracked accurately.

#### Acceptance Criteria

1. WHEN storing lesson bundles locally, THE Local_Brain SHALL associate each bundle with the studentId from AppContext
2. WHEN storing quiz results locally, THE Local_Brain SHALL associate each result with the studentId from AppContext
3. WHEN storing progress logs locally, THE Local_Brain SHALL associate each log entry with the studentId from AppContext
4. WHEN syncing data to Cloud_Brain, THE Local_Brain SHALL include the studentId with all uploaded data
5. THE Cloud_Brain SHALL store all student data partitioned by studentId in DynamoDB

### Requirement 8: Registration API Endpoint

**User Story:** As the Local Brain, I want a registration endpoint in the Cloud Brain, so that I can register new students.

#### Acceptance Criteria

1. THE Cloud_Brain SHALL provide a POST endpoint at `/api/students/register`
2. WHEN the Registration_API receives a request, THE Cloud_Brain SHALL validate that studentId is a valid UUID format
3. WHEN the Registration_API receives a request, THE Cloud_Brain SHALL validate that studentName is a non-empty string
4. IF validation fails, THEN THE Cloud_Brain SHALL return HTTP status 400 with an error message
5. WHEN validation succeeds, THE Cloud_Brain SHALL create a student record in DynamoDB with studentId, studentName, and registrationTimestamp
6. IF a student record with the same studentId already exists, THEN THE Cloud_Brain SHALL return HTTP status 200 (idempotent operation)
7. WHEN the student record is created successfully, THE Cloud_Brain SHALL return HTTP status 201 with the created student record

### Requirement 9: Multi-Student Device Support

**User Story:** As a family with multiple students, I want the system designed to support multiple student profiles on one device, so that siblings can share a device in the future.

#### Acceptance Criteria

1. THE Local_Brain SHALL design the Student_Profile storage schema to support multiple profiles
2. THE Local_Brain SHALL design the data isolation mechanism to support switching between student profiles
3. WHERE multiple student profiles exist, THE Local_Brain SHALL associate all local data with the correct studentId

### Requirement 10: Educator Dashboard Integration

**User Story:** As an educator, I want to see real student data in the dashboard, so that I can monitor actual student progress.

#### Acceptance Criteria

1. THE Cloud_Brain SHALL provide an API endpoint to fetch all registered students
2. WHEN the educator dashboard loads, THE Cloud_Brain SHALL retrieve student records from DynamoDB instead of mock data
3. THE Cloud_Brain SHALL return student data including studentId, studentName, and registrationTimestamp
4. WHEN displaying student progress, THE Cloud_Brain SHALL fetch progress data associated with the correct studentId

## Notes

This feature establishes the foundation for proper student identity management in Sikshya-Sathi. The design intentionally supports future multi-student scenarios (Requirement 9) while implementing the minimal viable solution for single-student registration. The registration process is designed to be resilient to network failures through retry logic and offline queueing (Requirement 5).

The UUID-based identification system ensures global uniqueness without requiring centralized ID generation, enabling offline-first operation. All existing features (lessons, quizzes, sync, progress tracking) already expect a studentId parameter and will work seamlessly once AppContext provides real IDs instead of hardcoded values.
