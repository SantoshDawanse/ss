# Sikshya-Sathi System Architecture Guide

## Overview

Sikshya-Sathi is an offline-first agentic tutor system for rural Nepali K-12 students using a two-brain architecture: Cloud Brain (AWS) and Local Brain (mobile app).

## System Components

### 1. Cloud Brain (AWS Backend)
**Location**: `cloud-brain/`
**Technology**: Python 3.11, AWS Lambda, DynamoDB, S3, Bedrock Agent

**Key Services**:
- Student registration and management
- AI-powered content generation (lessons, quizzes, hints)
- Personalization engine using Bedrock Agent
- Educator dashboard and analytics
- Learning bundle creation and distribution
- Sync orchestration

**API Endpoints**:
```
POST   /api/students/register          - Register new student
GET    /educator/dashboard              - Get educator dashboard data
GET    /educator/students               - List registered students
POST   /sync/upload                     - Upload performance logs
GET    /sync/download/{sessionId}       - Download learning bundles
POST   /content/generate                - Generate lessons/quizzes
```

### 2. Local Brain (Mobile App)
**Location**: `local-brain/`
**Technology**: React Native (Expo), TypeScript, SQLite

**Key Features**:
- Offline-first architecture (works 2+ weeks without connectivity)
- Student onboarding and profile management
- Lesson and quiz delivery
- Performance tracking with auto-save every 30 seconds
- Crash recovery
- Sync with cloud when connected

### 3. Educator Dashboard (Web)
**Location**: `cloud-brain/web/`
**Technology**: Next.js, React, TypeScript

**Features**:
- View registered students
- Monitor student progress
- Class performance analytics
- Curriculum coverage reports

## Data Flow

### Student Registration Flow

```
┌─────────────────┐
│  Local Brain    │
│  (Mobile App)   │
└────────┬────────┘
         │
         │ 1. Student enters name
         │    in onboarding screen
         │
         ▼
┌─────────────────────────────────────┐
│ StudentProfileService.createProfile │
│ - Generates UUID v4                 │
│ - Stores in SecureStore             │
│ - Stores in AsyncStorage            │
└────────┬────────────────────────────┘
         │
         │ 2. Background registration
         │    (non-blocking)
         │
         ▼
┌─────────────────────────────────────┐
│ POST /api/students/register         │
│ Body: {                             │
│   studentId: "uuid-v4",             │
│   studentName: "Student Name"       │
│ }                                   │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Cloud Brain - student_handler.py    │
│ - Validates UUID format             │
│ - Validates student name            │
│ - Creates DynamoDB record           │
│ - Returns 201 Created               │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ DynamoDB: students table            │
│ - studentId (PK)                    │
│ - studentName                       │
│ - registrationTimestamp             │
│ - knowledgeModel (optional)         │
│ - performanceSummary (optional)     │
└─────────────────────────────────────┘
```

### Dashboard Visibility Flow

```
┌─────────────────┐
│ Educator        │
│ Dashboard       │
└────────┬────────┘
         │
         │ 1. Fetch registered students
         │
         ▼
┌─────────────────────────────────────┐
│ GET /educator/students?limit=100    │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Cloud Brain - educator_handler.py   │
│ - Queries DynamoDB students table   │
│ - Returns list of students          │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Dashboard displays:                 │
│ - Student name                      │
│ - Student ID                        │
│ - Registration date                 │
└─────────────────────────────────────┘
         │
         │ 2. Fetch performance data
         │
         ▼
┌─────────────────────────────────────┐
│ GET /educator/dashboard             │
│   ?educator_id=EDU001               │
│   &class_ids=CLASS001               │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Returns dashboard data:             │
│ - Student progress per subject      │
│ - Class performance reports         │
│ - Curriculum coverage               │
│ - Top performers                    │
│ - Students needing support          │
└─────────────────────────────────────┘
```

### Content Delivery Flow (Lessons & Quizzes)

```
┌─────────────────┐
│  Local Brain    │
│  Database       │
└────────┬────────┘
         │
         │ On first launch
         │
         ▼
┌─────────────────────────────────────┐
│ initializeDatabase()                │
│ - Loads sample data from            │
│   sampleData.ts                     │
│ - Creates learning bundle           │
│ - Inserts lessons, quizzes, hints   │
│ - Sets bundle status to 'active'    │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ SQLite Database Tables:             │
│ - learning_bundles                  │
│ - lessons                           │
│ - quizzes                           │
│ - hints                             │
│ - study_tracks                      │
│ - student_state                     │
│ - performance_logs                  │
└────────┬────────────────────────────┘
         │
         │ User navigates to
         │ Lessons or Quizzes tab
         │
         ▼
┌─────────────────────────────────────┐
│ lessons.tsx / quizzes.tsx           │
│ 1. Query active bundle:             │
│    SELECT bundle_id                 │
│    FROM learning_bundles            │
│    WHERE student_id = ?             │
│      AND status = 'active'          │
│                                     │
│ 2. Query content:                   │
│    SELECT * FROM lessons            │
│    WHERE bundle_id = ?              │
│                                     │
│ 3. Display in UI                    │
└─────────────────────────────────────┘
```

## Current Status & Issues

### ✅ Working Components

1. **Student Registration**
   - Local profile creation works
   - UUID generation works
   - Cloud registration API works
   - Students appear in educator dashboard

2. **Database Initialization**
   - Sample data loads on first launch
   - SQLite tables created correctly
   - Learning bundles stored locally

3. **Educator Dashboard**
   - Can fetch registered students
   - Displays student list
   - Shows registration dates

### ⚠️ Known Issues

#### Issue 1: Lessons/Quizzes Not Showing in Local Brain

**Problem**: When you open the Lessons or Quizzes tab, you see "No lessons available" or "No quizzes available".

**Root Cause**: The query to find the active bundle is failing because:
- The `student_id` in the `learning_bundles` table doesn't match the current student's ID
- Sample data is initialized with a specific bundle_id but may not be linked to the student

**Evidence from Code**:
```typescript
// lessons.tsx line 63-68
const activeBundleResult = await dbManager.executeSql(
  `SELECT bundle_id FROM learning_bundles 
   WHERE student_id = ? AND status = 'active' 
   ORDER BY valid_from DESC LIMIT 1`,
  [studentId]
);
```

**Solution**: The `initializeDatabase()` function should be called with the correct `studentId` after profile creation. Check if:
1. `initializeDatabase()` is being called in `AppContext` initialization
2. The `studentId` parameter is correctly passed
3. The bundle is being inserted with the correct `studentId`

#### Issue 2: Dashboard Shows Students But No Performance Data

**Problem**: Dashboard shows registered students but no performance metrics (lessons completed, quiz scores, etc.)

**Root Cause**: 
- Students register successfully
- But they haven't completed any lessons/quizzes yet
- No performance logs have been synced to cloud

**Expected Flow**:
1. Student completes lesson/quiz in local app
2. Performance log saved to local SQLite
3. Student taps "Sync Now" on home screen
4. Logs uploaded to cloud via `/sync/upload`
5. Cloud updates knowledge model in DynamoDB
6. Dashboard shows updated metrics

**Current State**: Steps 1-2 work, but sync (steps 3-5) is not fully implemented.

## Testing the System

### Test Student Registration

1. **Local Brain**:
   ```bash
   cd local-brain
   npm start
   # Open app, enter student name
   # Check console for registration success
   ```

2. **Verify in Dashboard**:
   ```bash
   cd cloud-brain/web
   npm run dev
   # Open http://localhost:3000
   # Should see student in list
   ```

3. **Check DynamoDB**:
   ```bash
   aws dynamodb scan \
     --table-name sikshya-sathi-students-development \
     --region us-east-1
   ```

### Test Content Availability

1. **Check Local Database**:
   - Open app
   - Navigate to Lessons tab
   - If empty, check console logs for errors

2. **Debug Query**:
   ```typescript
   // Add logging in lessons.tsx
   console.log('Student ID:', studentId);
   console.log('Active bundle result:', activeBundleResult);
   ```

3. **Verify Sample Data**:
   - Check `local-brain/src/utils/sampleData.ts`
   - Ensure bundle has lessons and quizzes
   - Verify bundle structure matches schema

### Test Dashboard

1. **Seed Sample Data**:
   ```bash
   cd cloud-brain
   python scripts/seed_sample_data.py
   ```

2. **Open Dashboard**:
   ```bash
   cd cloud-brain/web
   npm run dev
   ```

3. **Expected Results**:
   - See 5 sample students (S001-S005)
   - See performance metrics
   - See class reports

## Verification Steps

### Step 1: Verify Student Registration

**In Local Brain App**:
1. Open the app (it should show onboarding screen)
2. Enter a student name (e.g., "Test Student")
3. Tap "Get Started"
4. Check console logs for:
   ```
   Profile created: <uuid>
   Initializing services with studentId: <uuid>
   Initializing database with sample data...
   Database initialization complete!
   ```

**In Educator Dashboard**:
1. Open `http://localhost:3000` (or deployed URL)
2. Should see the registered student in the list
3. If not visible, check:
   - API endpoint in `.env.local`
   - DynamoDB table has the record
   - CORS headers are correct

**Verify in DynamoDB**:
```bash
aws dynamodb scan \
  --table-name sikshya-sathi-students-development \
  --region us-east-1 \
  --output json
```

### Step 2: Verify Content Availability

**Check Database Initialization**:
1. After onboarding, check console logs for:
   ```
   Inserted learning bundle
   Inserted X lessons for Mathematics
   Inserted X quizzes for Mathematics
   Inserted hints for Mathematics
   Database initialization complete!
   ```

2. Navigate to Lessons tab
3. Should see lessons listed (Mathematics, Science, Social Studies)
4. If empty, check console for errors

**Debug Content Query**:
Add logging to `lessons.tsx`:
```typescript
console.log('Student ID:', studentId);
console.log('Active bundle query result:', activeBundleResult);

// Also check if bundle exists at all
const allBundles = await dbManager.executeSql(
  'SELECT * FROM learning_bundles',
  []
);
console.log('All bundles:', allBundles);
```

### Step 3: Verify Dashboard Data Flow

**Test with Sample Data**:
```bash
cd cloud-brain
python scripts/seed_sample_data.py
```

This creates 5 students (S001-S005) with performance data.

**Expected Dashboard Display**:
- Total Students: 5
- Active Students: 5
- Average Accuracy: ~85%
- Student progress table with metrics
- Class performance charts
- Curriculum coverage reports

## Troubleshooting

### Issue: Students Not Appearing in Dashboard

**Symptoms**: Dashboard shows "No Student Data Available" or empty list

**Possible Causes**:
1. API endpoint misconfigured
2. DynamoDB table empty
3. CORS errors in browser console
4. Lambda function not deployed

**Debug Steps**:
```bash
# 1. Check CloudWatch logs
aws logs tail /aws/lambda/sikshya-sathi-educator-handler-development --follow

# 2. Test API directly
curl https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development/educator/students?limit=100

# 3. Check DynamoDB
aws dynamodb scan \
  --table-name sikshya-sathi-students-development \
  --region us-east-1

# 4. Check API Gateway
aws apigateway get-rest-apis --region us-east-1
```

**Solution**:
- Verify `NEXT_PUBLIC_API_URL` in dashboard `.env.local`
- Ensure Lambda has DynamoDB read permissions
- Check CORS configuration in API Gateway

### Issue: Lessons/Quizzes Not Showing in Local App

**Symptoms**: Lessons or Quizzes tab shows "No lessons available" or "No quizzes available"

**Possible Causes**:
1. Database initialization failed
2. Student ID mismatch between profile and bundle
3. Bundle status not set to 'active'
4. Sample data structure invalid

**Debug Steps**:
```typescript
// Add to lessons.tsx or quizzes.tsx
console.log('Current studentId:', studentId);
console.log('Is initialized:', isInitialized);
console.log('DB Manager:', dbManager ? 'exists' : 'null');

// Check if bundles exist
const allBundles = await dbManager.executeSql(
  'SELECT * FROM learning_bundles',
  []
);
console.log('All bundles in DB:', allBundles);

// Check if lessons exist
const allLessons = await dbManager.executeSql(
  'SELECT COUNT(*) as count FROM lessons',
  []
);
console.log('Total lessons in DB:', allLessons);

// Check active bundle for student
const activeBundleResult = await dbManager.executeSql(
  'SELECT * FROM learning_bundles WHERE student_id = ? AND status = ?',
  [studentId, 'active']
);
console.log('Active bundle for student:', activeBundleResult);
```

**Solution**:
1. Verify `initializeDatabase()` completed successfully (check console logs)
2. Ensure `studentId` is passed correctly to `initializeDatabase()`
3. Check that sample data in `sampleData.ts` is valid
4. Verify bundle status is set to 'active' in sample data
5. If still failing, try clearing app data and re-onboarding:
   ```typescript
   // In development, you can reset by:
   // 1. Uninstall app
   // 2. Clear AsyncStorage and SecureStore
   // 3. Reinstall and onboard again
   ```

**Expected Flow**:
```
1. User completes onboarding
2. AppContext.initializeServices() called with studentId
3. initializeDatabase(db, studentId) called
4. Sample bundle inserted with studentId
5. Lessons/quizzes inserted linked to bundle
6. Bundle status set to 'active'
7. Lessons tab queries: WHERE student_id = ? AND status = 'active'
8. Returns bundle_id
9. Queries lessons: WHERE bundle_id = ?
10. Displays lessons in UI
```

### Issue: Sync Not Working

**Symptoms**: Tapping "Sync Now" shows "Already Up to Date" or "API Not Available"

**Expected Behavior**:
- "Already Up to Date" - No new performance data to sync (expected if no lessons/quizzes completed)
- "API Not Available" - Sync endpoints not implemented yet (expected in current state)
- "Sync Complete" - Successfully synced (when API is fully implemented)

**Current Implementation Status**:
- ✅ Local performance tracking works
- ✅ Logs saved to SQLite
- ⚠️ Upload endpoint exists but needs testing
- ⚠️ Download endpoint exists but needs testing
- ❌ End-to-end sync flow not fully tested

**Debug Steps**:
```bash
# 1. Test upload endpoint
curl -X POST \
  https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development/sync/upload \
  -H 'Content-Type: application/json' \
  -d '{
    "studentId": "test-uuid",
    "sessionId": "test-session",
    "logs": [
      {
        "eventType": "lesson_complete",
        "contentId": "lesson-1",
        "timestamp": "2024-02-24T10:00:00Z",
        "metadata": {}
      }
    ]
  }'

# 2. Check CloudWatch logs
aws logs tail /aws/lambda/sikshya-sathi-sync-upload-development --follow

# 3. Verify API Gateway endpoint
aws apigateway get-rest-apis --region us-east-1
```

**Solution**:
1. Complete lessons/quizzes to generate performance data
2. Verify API_BASE_URL in local-brain `.env`
3. Test sync endpoints with curl
4. Check Lambda function logs for errors
5. Implement missing sync logic if needed

**To Test Sync**:
1. Complete a lesson in the app
2. Check local SQLite for performance_logs
3. Tap "Sync Now"
4. Check console logs for sync progress
5. Verify data appears in DynamoDB knowledge_models table

### Issue: Dashboard Shows Students But No Performance Data

**Symptoms**: Dashboard displays registered students but shows:
- 0 lessons completed
- 0 quizzes completed
- No accuracy metrics
- Empty progress charts

**Root Cause**: This is EXPECTED behavior when:
1. Students have registered but haven't used the app yet
2. Students completed content but haven't synced
3. No sample data seeded in DynamoDB

**Solution**:

**Option 1: Seed Sample Data** (for testing)
```bash
cd cloud-brain
python scripts/seed_sample_data.py
```
This creates 5 students with realistic performance data.

**Option 2: Generate Real Data** (for production)
1. Student completes lessons/quizzes in local app
2. Performance logs saved locally
3. Student taps "Sync Now"
4. Logs uploaded to cloud
5. Cloud updates knowledge model
6. Dashboard shows updated metrics

**Expected Data Flow**:
```
Local App → Performance Logs → Sync Upload → 
Cloud Brain → Knowledge Model Update → 
Dashboard API → Dashboard Display
```

**Verify Each Step**:
```bash
# 1. Check local logs (in app console)
SELECT * FROM performance_logs WHERE student_id = ?

# 2. Check sync sessions (DynamoDB)
aws dynamodb scan --table-name sikshya-sathi-sync-sessions-development

# 3. Check knowledge models (DynamoDB)
aws dynamodb scan --table-name sikshya-sathi-knowledge-models-development

# 4. Test dashboard API
curl "https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development/educator/dashboard?educator_id=EDU001&class_ids=CLASS001"
```

## Next Steps

### Immediate Fixes Needed

1. **Fix Content Display**:
   - Verify `initializeDatabase()` is called with correct studentId
   - Add logging to debug bundle query
   - Ensure sample data structure matches schema

2. **Complete Sync Implementation**:
   - Implement `/sync/upload` handler
   - Implement `/sync/download` handler
   - Test end-to-end sync flow

3. **Dashboard Enhancements**:
   - Show "no data yet" message when students registered but no performance
   - Add refresh button
   - Add student detail view

### Future Enhancements

1. **Authentication**:
   - Replace demo credentials with real auth
   - Implement JWT tokens
   - Add educator login

2. **Content Generation**:
   - Connect Bedrock Agent
   - Implement MCP server
   - Generate personalized content

3. **Offline Sync**:
   - Implement bundle download
   - Add checksum verification
   - Handle sync conflicts

## Architecture Diagrams

### High-Level Architecture
```
┌──────────────────────────────────────────────────────────┐
│                    Sikshya-Sathi System                   │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────────────────┐        ┌─────────────────────┐  │
│  │   Cloud Brain       │◄──────►│   Local Brain       │  │
│  │   (AWS)             │  Sync  │   (Mobile)          │  │
│  │                     │        │                     │  │
│  │  • Lambda Functions │        │  • React Native     │  │
│  │  • DynamoDB         │        │  • SQLite           │  │
│  │  • S3 Bundles       │        │  • Offline-first    │  │
│  │  • Bedrock Agent    │        │  • Auto-save        │  │
│  │  • API Gateway      │        │  • Crash recovery   │  │
│  └─────────────────────┘        └─────────────────────┘  │
│           ▲                                               │
│           │                                               │
│           │ HTTPS                                         │
│           │                                               │
│  ┌────────┴────────────┐                                 │
│  │  Educator Dashboard │                                 │
│  │  (Next.js Web)      │                                 │
│  │                     │                                 │
│  │  • Student list     │                                 │
│  │  • Progress tracking│                                 │
│  │  • Analytics        │                                 │
│  └─────────────────────┘                                 │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Data Storage

**Cloud (DynamoDB)**:
- `students` - Student profiles and registration
- `knowledge_models` - Student learning progress and proficiency
- `bundles` - Learning bundle metadata
- `sync_sessions` - Sync history and status

**Local (SQLite)**:
- `learning_bundles` - Downloaded content packages
- `lessons` - Lesson content
- `quizzes` - Quiz questions and answers
- `hints` - Progressive hints for quizzes
- `study_tracks` - Learning paths
- `performance_logs` - Student activity and scores
- `student_state` - Current progress and state

## Key Files Reference

### Cloud Brain
- `src/handlers/student_handler.py` - Student registration
- `src/handlers/educator_handler.py` - Dashboard APIs
- `src/handlers/sync_handler.py` - Sync orchestration
- `src/repositories/student_repository.py` - Student data access
- `infrastructure/stacks/cloud_brain_stack.py` - AWS infrastructure

### Local Brain
- `app/onboarding.tsx` - Student registration UI
- `app/(tabs)/lessons.tsx` - Lessons screen
- `app/(tabs)/quizzes.tsx` - Quizzes screen
- `src/services/StudentProfileService.ts` - Profile management
- `src/utils/initializeDatabase.ts` - Database setup
- `src/utils/sampleData.ts` - Sample content

### Dashboard
- `cloud-brain/web/app/components/EducatorDashboard.tsx` - Main dashboard
- `cloud-brain/web/app/types.ts` - TypeScript types

## Environment Variables

### Cloud Brain
```bash
AWS_REGION=us-east-1
STUDENTS_TABLE=sikshya-sathi-students-development
BUNDLES_TABLE=sikshya-sathi-bundles-development
KNOWLEDGE_MODEL_TABLE=sikshya-sathi-knowledge-models-development
BUNDLES_BUCKET=sikshya-sathi-bundles-development
```

### Local Brain
```bash
API_BASE_URL=https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development
ENVIRONMENT=development
```

### Dashboard
```bash
NEXT_PUBLIC_API_URL=https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development
```

## Conclusion

The Sikshya-Sathi system is a sophisticated offline-first learning platform with a clear separation between cloud and local components. The student registration flow works end-to-end, but content delivery in the local app needs debugging to ensure the active bundle query returns results. The dashboard successfully displays registered students but needs performance data from completed lessons/quizzes to show full analytics.

## Quick Reference

### Common Commands

**Local Brain (Mobile App)**:
```bash
cd local-brain
npm install              # Install dependencies
npm start               # Start Expo dev server
npm run android         # Run on Android
npm run ios             # Run on iOS
npm test                # Run tests
npm run test:pbt        # Run property-based tests
```

**Cloud Brain (Backend)**:
```bash
cd cloud-brain
pip install -r requirements.txt          # Install dependencies
pytest                                   # Run tests
pytest -m property_test                  # Run property tests
python scripts/seed_sample_data.py       # Seed sample data
cd infrastructure && cdk deploy          # Deploy to AWS
```

**Educator Dashboard (Web)**:
```bash
cd cloud-brain/web
npm install             # Install dependencies
npm run dev            # Start dev server (http://localhost:3000)
npm run build          # Build for production
npm start              # Start production server
```

### API Endpoints Quick Reference

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/students/register` | POST | Register new student | ✅ Working |
| `/educator/students` | GET | List registered students | ✅ Working |
| `/educator/dashboard` | GET | Get dashboard data | ✅ Working |
| `/educator/student-progress` | GET | Get student progress | ✅ Working |
| `/sync/upload` | POST | Upload performance logs | ⚠️ Needs testing |
| `/sync/download/{sessionId}` | GET | Download learning bundle | ⚠️ Needs testing |
| `/content/generate` | POST | Generate content | ⚠️ Partial |

### Database Tables

**Cloud (DynamoDB)**:
- `sikshya-sathi-students-development` - Student profiles
- `sikshya-sathi-knowledge-models-development` - Learning progress
- `sikshya-sathi-bundles-development` - Bundle metadata
- `sikshya-sathi-sync-sessions-development` - Sync history

**Local (SQLite)**:
- `learning_bundles` - Downloaded content packages
- `lessons` - Lesson content
- `quizzes` - Quiz questions
- `hints` - Progressive hints
- `study_tracks` - Learning paths
- `performance_logs` - Activity logs
- `student_state` - Current state

### Key Configuration Files

| File | Purpose |
|------|---------|
| `local-brain/.env` | API URL and environment |
| `local-brain/app.config.js` | Expo configuration |
| `cloud-brain/infrastructure/stacks/cloud_brain_stack.py` | AWS infrastructure |
| `cloud-brain/web/.env.local` | Dashboard API URL |
| `local-brain/src/utils/sampleData.ts` | Sample content data |

### Useful AWS Commands

```bash
# View CloudWatch logs
aws logs tail /aws/lambda/sikshya-sathi-educator-handler-development --follow
aws logs tail /aws/lambda/sikshya-sathi-student-handler-development --follow
aws logs tail /aws/lambda/sikshya-sathi-sync-upload-development --follow

# Query DynamoDB
aws dynamodb scan --table-name sikshya-sathi-students-development --region us-east-1
aws dynamodb scan --table-name sikshya-sathi-knowledge-models-development --region us-east-1

# List API Gateway endpoints
aws apigateway get-rest-apis --region us-east-1

# Get API Gateway stages
aws apigateway get-stages --rest-api-id <api-id> --region us-east-1
```

### Testing Checklist

- [ ] Student can complete onboarding
- [ ] Student profile saved locally
- [ ] Student registered in cloud (visible in dashboard)
- [ ] Database initialized with sample data
- [ ] Lessons visible in Lessons tab
- [ ] Quizzes visible in Quizzes tab
- [ ] Can complete a lesson
- [ ] Performance log saved locally
- [ ] Progress tab shows user profile (name, avatar, join date)
- [ ] Progress tab shows learning statistics (lessons, quizzes, study time)
- [ ] Can tap "Sync Now"
- [ ] Sync uploads data to cloud
- [ ] Dashboard shows updated metrics
- [ ] Educator can view student progress

### Support & Documentation

- **Main README**: `README.md`
- **Cloud Brain**: `cloud-brain/README.md`
- **Local Brain**: `local-brain/README.md`
- **Dashboard**: `cloud-brain/web/README.md`
- **Sync Guide**: `local-brain/SYNC_GUIDE.md`
- **Troubleshooting**: `TROUBLESHOOTING.md`
- **Deployment**: `DEPLOYMENT_SUCCESS.md`

---

**Document Version**: 1.0  
**Last Updated**: February 24, 2026  
**Status**: Active Development
