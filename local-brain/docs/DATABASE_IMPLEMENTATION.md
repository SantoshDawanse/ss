# Local Brain Database Implementation

## Overview

This document describes the SQLite database implementation for the Sikshya-Sathi Local Brain, including schema design, data access layer, and encryption support.

## Architecture

### Database Manager

**File**: `src/database/DatabaseManager.ts`

The `DatabaseManager` class is a singleton that handles:
- Database initialization and connection management
- SQLCipher encryption (AES-256) for data at rest
- Schema creation (tables and indexes)
- Transaction support
- Error handling and recovery
- Database statistics and health checks

**Key Features**:
- Promise-based API using `react-native-sqlite-storage`
- Foreign key constraint enforcement
- Automatic schema migration support
- Database reset and cleanup utilities

### Database Schema

**File**: `src/database/schema.ts`

The schema includes 8 tables optimized for offline-first operation:

1. **learning_bundles**: Stores metadata for synchronized learning content
2. **lessons**: Stores lesson content with curriculum alignment
3. **quizzes**: Stores quiz questions and metadata
4. **hints**: Stores progressive hints for quiz questions
5. **performance_logs**: Tracks all student interactions for sync
6. **sync_sessions**: Manages synchronization state and history
7. **student_state**: Persists current learning state for crash recovery
8. **study_tracks**: Stores personalized learning paths

**Indexes**: 13 indexes created for optimal query performance on:
- Student lookups
- Subject/topic filtering
- Sync status queries
- Timestamp-based sorting

### Data Access Layer (Repositories)

**Directory**: `src/database/repositories/`

Each table has a dedicated repository class extending `BaseRepository`:

#### BaseRepository
- Abstract base class providing common CRUD operations
- Generic type support for type-safe queries
- Transaction wrapper methods
- Error handling and logging

#### Specific Repositories

1. **LearningBundleRepository**
   - Create and manage learning bundles
   - Find active bundles by student
   - Archive old bundles
   - Delete expired content

2. **LessonRepository**
   - CRUD operations for lessons
   - Bulk insert support for efficient bundle import
   - Find by subject, topic, or bundle
   - Parse JSON content to typed objects

3. **QuizRepository**
   - CRUD operations for quizzes
   - Bulk insert support
   - Find by subject, topic, or bundle
   - Parse JSON questions to typed objects

4. **HintRepository**
   - CRUD operations for hints
   - Find hints by quiz and question
   - Progressive hint level support (1-3)
   - Bulk insert for efficient import

5. **PerformanceLogRepository**
   - Create performance logs for all interactions
   - Find unsynced logs for upload
   - Find recent logs for adaptive rules
   - Mark logs as synced after upload
   - Cleanup old synced logs

6. **SyncSessionRepository**
   - Create and manage sync sessions
   - Update session status and progress
   - Track upload/download completion
   - Find last completed sync
   - Cleanup old session history

7. **StudentStateRepository**
   - Upsert student state (create or update)
   - Update current subject and lesson
   - Track last active timestamp
   - Support crash recovery

8. **StudyTrackRepository**
   - CRUD operations for study tracks
   - Find by bundle and subject
   - Parse JSON week plans
   - Bulk insert support

## Security

### Encryption

The database uses SQLCipher for AES-256 encryption:
- Encryption key stored securely in device keychain
- All data encrypted at rest
- Transparent encryption/decryption
- No performance impact on queries

### Data Integrity

- Foreign key constraints enforce referential integrity
- Transactions ensure atomic operations
- Checksums verify bundle integrity
- Cascade deletes prevent orphaned records

## Performance Optimizations

### Indexes

13 strategically placed indexes optimize:
- Student-specific queries (most common)
- Subject/topic filtering
- Sync status checks
- Timestamp-based sorting
- Bundle lookups

### Bulk Operations

All repositories support bulk inserts using transactions:
- Lessons: Import entire bundle in single transaction
- Quizzes: Batch insert with questions
- Hints: Bulk import for all questions
- Study Tracks: Import all subjects at once

### Query Optimization

- Prepared statements prevent SQL injection
- Parameterized queries enable query plan caching
- LIMIT clauses prevent excessive memory usage
- Indexed columns in WHERE clauses

## Error Handling

### Database Errors

- Connection failures: Retry with exponential backoff
- Constraint violations: Detailed error messages
- Transaction rollback: Automatic on any error
- Corruption detection: Checksum validation

### Recovery Strategies

- Crash recovery: Restore from last persisted state
- Corrupted database: Re-download bundle from cloud
- Storage full: Archive old content, prompt user
- Foreign key violations: Cascade deletes, cleanup orphans

## Testing

### Unit Tests

**File**: `tests/database.test.ts`

Comprehensive test suite covering:
- Database initialization
- CRUD operations for all repositories
- Transaction support and rollback
- Foreign key constraints
- Error handling
- Bulk operations
- Query performance

### Test Coverage

- Schema creation and indexes
- All repository methods
- Transaction rollback on error
- Constraint violation handling
- Duplicate key detection
- Cascade deletes

## Usage Examples

### Initialize Database

```typescript
import { DatabaseManager } from './database';

const dbManager = DatabaseManager.getInstance({
  name: 'sikshya_sathi.db',
  location: 'default',
  encryption: true,
  encryptionKey: await getSecureKey(),
});

await dbManager.initialize();
```

### Create Learning Bundle

```typescript
import { LearningBundleRepository } from './database/repositories';

const bundleRepo = new LearningBundleRepository();

await bundleRepo.create({
  bundle_id: 'bundle-123',
  student_id: 'student-456',
  valid_from: Date.now(),
  valid_until: Date.now() + 14 * 24 * 60 * 60 * 1000, // 2 weeks
  total_size: 5000000,
  checksum: 'abc123def456',
  status: 'active',
});
```

### Record Performance Log

```typescript
import { PerformanceLogRepository } from './database/repositories';

const logRepo = new PerformanceLogRepository();

const logId = await logRepo.create({
  student_id: 'student-456',
  timestamp: Date.now(),
  event_type: 'quiz_answer',
  content_id: 'quiz-789',
  subject: 'Mathematics',
  topic: 'Algebra',
  data_json: JSON.stringify({
    correct: true,
    timeSpent: 45,
    hintsUsed: 1,
  }),
  synced: 0,
});
```

### Find Unsynced Logs

```typescript
const unsyncedLogs = await logRepo.findUnsyncedByStudent('student-456');
console.log(`${unsyncedLogs.length} logs pending sync`);
```

### Transaction Example

```typescript
await dbManager.transaction(async (tx) => {
  // Create bundle
  await tx.executeSql(
    'INSERT INTO learning_bundles (...) VALUES (...)',
    [...]
  );
  
  // Create lessons
  for (const lesson of lessons) {
    await tx.executeSql(
      'INSERT INTO lessons (...) VALUES (...)',
      [...]
    );
  }
  
  // All or nothing - rollback on any error
});
```

## Database Statistics

Get real-time database statistics:

```typescript
const stats = await dbManager.getStats();
console.log(`Total records: ${stats.totalRecords}`);
console.log(`Lessons: ${stats.tables.lessons}`);
console.log(`Performance logs: ${stats.tables.performance_logs}`);
```

## Maintenance

### Cleanup Old Data

```typescript
// Delete synced logs older than 30 days
const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
await logRepo.deleteSyncedBefore(thirtyDaysAgo);

// Delete archived bundles older than 60 days
const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
await bundleRepo.deleteArchivedBefore(sixtyDaysAgo);

// Keep only last 10 sync sessions
await syncRepo.deleteOldSessions(10);
```

### Database Reset (Testing Only)

```typescript
// WARNING: Deletes all data!
await dbManager.reset();
```

## Requirements Satisfied

This implementation satisfies the following requirements:

- **Requirement 10.6**: SQLite database with proper schema and indexes
- **Requirement 9.1**: SQLCipher encryption for data at rest (AES-256)
- **Requirement 3.4**: Local storage of performance logs
- **Requirement 4.8**: Data integrity validation with checksums
- **Requirement 8.8**: State persistence for crash recovery
- **Requirement 11.6**: Aggressive state persistence every 30 seconds

## Next Steps

The database layer is now complete and ready for integration with:
1. Content Delivery Service (Task 11)
2. Performance Tracking Service (Task 12)
3. Sync Orchestrator Service (Task 14)

All services can now use the repository pattern to interact with the database in a type-safe, efficient manner.
