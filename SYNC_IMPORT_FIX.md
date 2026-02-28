# Sync Import Fix - No Lessons/Quizzes Appearing

## Problem
Sync was completing successfully but no new lessons or quizzes were appearing in the app after download.

## Root Causes

### 1. Property Name Mismatch (Primary Issue)
The `BundleImportService` had a **property name mismatch** between the TypeScript interfaces and the actual data from the backend:

1. **TypeScript models** used camelCase: `lessonId`, `quizId`, `estimatedMinutes`, etc.
2. **Backend bundle data** used snake_case: `lesson_id`, `quiz_id`, `estimated_minutes`, etc.

This caused the import to fail silently because:
- The code tried to access `lesson.lessonId` but the actual property was `lesson.lesson_id`
- TypeScript errors were present but the transaction would fail without proper error logging
- The sync would complete but the database inserts would fail

### 2. Sync Skip Logic (Secondary Issue)
The `SyncOrchestratorService` was skipping downloads when:
- A bundle record existed in the database (even if empty/corrupted)
- No new performance logs to upload

This prevented re-downloading content when the bundle existed but had no actual lessons/quizzes (e.g., from a previous failed import).

**Log evidence:**
```
LOG  No new logs to upload and bundle exists - skipping sync
LOG  Skipping download - no new data uploaded or API not available
```

## Solution

### 1. Created Raw Data Interfaces
Added new interfaces matching the backend's snake_case format:

```typescript
interface RawLesson {
  lesson_id: string;
  subject: string;
  topic: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  estimated_minutes: number;
  curriculum_standards: string[];
  sections: any[];
}

interface RawQuiz {
  quiz_id: string;
  subject: string;
  topic: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  time_limit?: number;
  questions: any[];
}

interface RawHint {
  hint_id: string;
  level: number;
  text: string;
}

interface RawStudyTrack {
  track_id: string;
  subject: string;
  weeks: any[];
}
```

### 2. Updated SubjectData Interface
Changed from using camelCase TypeScript models to snake_case raw interfaces:

```typescript
interface SubjectData {
  subject: string;
  lessons: RawLesson[];      // Was: Lesson[]
  quizzes: RawQuiz[];        // Was: Quiz[]
  hints: Record<string, RawHint[]>;  // Was: Hint[]
  revision_plan?: any;
  study_track?: RawStudyTrack;  // Was: StudyTrack
}
```

### 3. Fixed Property Access in importSubjectContent
Updated all property accesses to use snake_case:

```typescript
// Before:
lesson.lessonId → lesson.lesson_id
lesson.estimatedMinutes → lesson.estimated_minutes
lesson.curriculumStandards → lesson.curriculum_standards

quiz.quizId → quiz.quiz_id
quiz.timeLimit → quiz.time_limit

hint.hintId → hint.hint_id

studyTrack.trackId → study_track.track_id
```

### 4. Fixed archiveOldBundles Call
```typescript
// Before:
await this.archiveOldBundles(bundleData.studentId, bundleData.bundleId);

// After:
await this.archiveOldBundles(bundleData.student_id, bundleData.bundle_id);
```

### 5. Fixed getBundleMetadata Return
```typescript
// Before:
bundleId: bundleData.bundleId,
studentId: bundleData.studentId,
// ...

// After:
bundleId: bundleData.bundle_id,
studentId: bundleData.student_id,
// ...
```

### 6. Added Better Error Logging
Added try-catch blocks and console logs to track import progress:

```typescript
console.log(`Importing subject: ${subject.subject}`);
console.log(`  - ${subject.lessons.length} lessons`);
console.log(`  - ${subject.quizzes.length} quizzes`);
// ... with error handling for each section
```

### 7. Fixed Sync Skip Logic (SyncOrchestratorService)
Added content verification before skipping sync:

```typescript
// Check if we have actual content (lessons/quizzes) even if bundle exists
let hasContent = false;
if (activeBundle) {
  const lessonCount = await this.dbManager.executeSql(
    'SELECT COUNT(*) as count FROM lessons WHERE bundle_id = ?',
    [activeBundle.bundle_id]
  );
  const quizCount = await this.dbManager.executeSql(
    'SELECT COUNT(*) as count FROM quizzes WHERE bundle_id = ?',
    [activeBundle.bundle_id]
  );
  hasContent = (lessonCount[0]?.count > 0 || quizCount[0]?.count > 0);
  console.log(`Active bundle has ${lessonCount[0]?.count || 0} lessons and ${quizCount[0]?.count || 0} quizzes`);
}

// Only skip if bundle exists AND has content
} else if (!isFirstTimeUser && hasContent) {
  console.log('No new logs to upload and bundle with content exists - skipping sync');
  return { shouldDownload: false, logsUploaded: 0, backendSessionId: sessionId };
} else {
  console.log(isFirstTimeUser 
    ? 'First-time user with no logs - creating sync session'
    : 'Bundle exists but has no content - re-syncing');
}

// Update shouldDownload to include content check
return { 
  shouldDownload: uploadResponse.bundleReady || isFirstTimeUser || !hasContent,
  // ...
};
```

## Files Modified
1. `local-brain/src/services/BundleImportService.ts`
   - Added raw data interfaces (RawLesson, RawQuiz, RawHint, RawStudyTrack)
   - Updated SubjectData interface
   - Fixed all property accesses in importSubjectContent
   - Fixed archiveOldBundles call
   - Fixed getBundleMetadata return
   - Added comprehensive error logging

2. `local-brain/src/services/SyncOrchestratorService.ts`
   - Added content check before skipping sync
   - Now checks if bundle has actual lessons/quizzes, not just bundle record
   - Will re-download if bundle exists but has no content
   - Updated shouldDownload logic to include `!hasContent` condition

## Testing
After this fix:
1. Sync should complete successfully ✓
2. Lessons should appear in the database ✓
3. Quizzes should appear in the database ✓
4. Hints should be linked to quizzes ✓
5. Study tracks should be imported ✓
6. Console logs will show detailed import progress

## Prevention
To prevent similar issues in the future:
1. Always match interface property names with backend data format
2. Use snake_case for raw backend data interfaces
3. Convert to camelCase TypeScript models only when needed for app logic
4. Add comprehensive error logging in data import operations
5. Run TypeScript diagnostics to catch property access errors


## Expected Log Output After Fix

### Scenario 1: Bundle exists but has no content (your case)
```
LOG  [SyncOrchestratorService] Initialized with API_BASE_URL: ...
LOG  Sync state transition: idle -> checking_connectivity
LOG  Sync state transition: checking_connectivity -> uploading
LOG  Active bundle has 0 lessons and 0 quizzes
LOG  Bundle exists but has no content - re-syncing
LOG  [SyncOrchestratorService] Upload request: ...
LOG  Uploaded 0 logs, backend session ID: sync_xxx
LOG  Sync state transition: uploading -> downloading
LOG  Downloading bundle: size=..., checksum=...
LOG  Download progress: ...
LOG  Checksum verification: expected=..., actual=...
LOG  ✓ Checksum verification passed!
LOG  Sync state transition: downloading -> importing
LOG  Starting bundle import: ...
LOG  ✓ Checksum verified
LOG  ✓ Bundle decompressed
LOG  ✓ Signature verified
LOG  ✓ Created bundle record: bundle_xxx
LOG  Importing subject: Mathematics
LOG    - 5 lessons
LOG    - 3 quizzes
LOG    - 3 quiz hint sets
LOG    ✓ Imported 5 lessons
LOG    ✓ Imported 3 quizzes
LOG    ✓ Imported 15 hints
LOG    ✓ Imported study track
LOG  ✓ Bundle imported to database
LOG  ✓ Old bundles archived
LOG  Bundle import complete
LOG  Sync state transition: importing -> complete
```

### Scenario 2: Bundle exists with content, no new logs
```
LOG  Active bundle has 5 lessons and 3 quizzes
LOG  No new logs to upload and bundle with content exists - skipping sync
LOG  Skipping download - no new data uploaded or API not available
LOG  Sync state transition: uploading -> complete
```

### Scenario 3: First-time user
```
LOG  First-time user with no logs - creating sync session
LOG  [SyncOrchestratorService] Upload request: ...
LOG  Uploaded 0 logs, backend session ID: sync_xxx
LOG  Sync state transition: uploading -> downloading
... (continues with download and import)
```

## How to Force Re-sync

If you need to force a re-download even with existing content, you can:

1. **Delete the bundle record** (will trigger first-time user flow):
   ```sql
   DELETE FROM learning_bundles WHERE student_id = 'your_student_id';
   ```

2. **Delete lessons/quizzes** (will trigger content check):
   ```sql
   DELETE FROM lessons WHERE bundle_id = 'your_bundle_id';
   DELETE FROM quizzes WHERE bundle_id = 'your_bundle_id';
   ```

3. **Archive the bundle** (will trigger first-time user flow):
   ```sql
   UPDATE learning_bundles SET status = 'archived' WHERE student_id = 'your_student_id';
   ```
