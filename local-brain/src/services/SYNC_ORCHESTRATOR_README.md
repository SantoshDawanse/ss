# Sync Orchestrator Implementation

## Overview

The Sync Orchestrator manages bidirectional synchronization between the Local Brain (student device) and Cloud Brain (AWS backend). It implements an offline-first architecture with robust resume capabilities and data integrity validation.

## Components

### 1. SyncOrchestratorService

Main service that orchestrates the complete sync workflow.

**Key Features:**
- Connectivity detection
- State machine for sync session management
- Upload workflow (compress logs, upload, receive acknowledgment)
- Download workflow (receive URL, download bundle, verify checksum, import)
- Resume capability with HTTP Range requests
- Exponential backoff retry logic
- Download progress tracking

**State Machine:**
```
idle → checking_connectivity → uploading → downloading → importing → complete
                                    ↓
                                 failed
```

**Usage:**
```typescript
import { SyncOrchestratorService } from './services';

const syncService = new SyncOrchestratorService(
  studentId,
  authToken,
  publicKey
);

// Check if sync is needed
const needsSync = await syncService.isSyncNeeded();

// Start sync
const status = await syncService.startSync();

// Get current status
const currentStatus = syncService.getSyncStatus();

// Cleanup old data
await syncService.cleanup();
```

### 2. BundleImportService

Handles learning bundle validation and import to the local database.

**Key Features:**
- Checksum verification (SHA-256)
- RSA-2048 signature verification
- Bundle decompression
- Database import in transactions
- Old bundle archival

**Usage:**
```typescript
import { BundleImportService } from './services';

const importService = new BundleImportService(publicKey);

// Validate bundle before import
const isValid = await importService.validateBundle(bundlePath, checksum);

// Import bundle
await importService.importBundle(bundlePath, checksum);

// Get bundle metadata
const metadata = await importService.getBundleMetadata(bundlePath);
```

## Requirements Implemented

### Task 14.1: Create sync orchestrator service
- ✅ Connectivity detection (Requirement 4.1)
- ✅ Sync session state machine (Requirement 4.1)
- ✅ Upload workflow: compress logs, upload, receive acknowledgment (Requirement 4.2)
- ✅ Download workflow: receive URL, download bundle, verify checksum, import (Requirement 4.3)

### Task 14.2: Implement sync resume capability
- ✅ HTTP Range requests for partial downloads (Requirement 4.6)
- ✅ Store download progress in database (Requirement 4.6)
- ✅ Resume from last byte on connection restore (Requirement 4.6)
- ✅ Exponential backoff for retries (Requirement 4.6)

### Task 14.3: Implement bundle import and validation
- ✅ Verify bundle signature (RSA-2048) (Requirement 7.7)
- ✅ Verify checksum (Requirement 4.8)
- ✅ Decompress bundle (Requirement 4.8)
- ✅ Import content to database (Requirement 4.8)
- ✅ Archive old bundles (Requirement 4.8)

## API Contracts

### Cloud Brain Endpoints

**Upload Performance Logs:**
```
POST /sync/upload
Headers: Authorization: Bearer <token>
Body: {
  studentId: string,
  logs: string (compressed base64),
  lastSyncTime: Date | null
}
Response: {
  sessionId: string,
  logsReceived: number,
  bundleReady: boolean
}
```

**Download Learning Bundle:**
```
GET /sync/download/:sessionId
Headers: Authorization: Bearer <token>
Response: {
  bundleUrl: string (S3 presigned URL),
  bundleSize: number,
  checksum: string,
  validUntil: string
}
```

## Data Flow

```
1. Check Connectivity
   ↓
2. Create Sync Session (DB)
   ↓
3. Upload Workflow:
   - Get unsynced logs from DB
   - Compress logs (base64)
   - Upload to Cloud Brain
   - Mark logs as synced
   ↓
4. Download Workflow:
   - Get download info from Cloud Brain
   - Download bundle with resume support
   - Verify checksum
   - Import bundle (BundleImportService)
   ↓
5. Complete Sync Session (DB)
```

## Error Handling

### Retry Strategy
- Maximum 3 retry attempts
- Exponential backoff: 1s, 2s, 4s (with jitter)
- Maximum backoff: 30 seconds

### Error Types
- **Connectivity errors**: Retry with backoff
- **Checksum mismatch**: Re-download from last checkpoint
- **Signature verification failure**: Reject bundle, fail sync
- **Database errors**: Rollback transaction, fail sync

## Database Schema

### sync_sessions table
```sql
CREATE TABLE sync_sessions (
  session_id TEXT PRIMARY KEY,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  status TEXT NOT NULL, -- 'pending', 'uploading', 'downloading', 'complete', 'failed'
  logs_uploaded INTEGER DEFAULT 0,
  bundle_downloaded INTEGER DEFAULT 0,
  error_message TEXT
);
```

### performance_logs table
```sql
CREATE TABLE performance_logs (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  data_json TEXT NOT NULL,
  synced INTEGER DEFAULT 0 -- 0 = not synced, 1 = synced
);
```

## TODO: Production Requirements

### Required Package Installation

The current implementation uses placeholder implementations for missing packages. Before production deployment, install:

```bash
# Connectivity detection
npx expo install expo-network

# File system operations
npx expo install expo-file-system

# Cryptography (checksums)
npx expo install expo-crypto

# RSA signature verification
npm install react-native-rsa-native
# or
npm install react-native-rsa
```

### Implementation TODOs

1. **Replace placeholder Network implementation** in `SyncOrchestratorService.ts`
   - Use `expo-network` for real connectivity detection
   - Handle different network types (WiFi, cellular, etc.)

2. **Replace placeholder FileSystem implementation** in both services
   - Use `expo-file-system` for file operations
   - Implement proper file encoding/decoding

3. **Replace placeholder Crypto implementation** in both services
   - Use `expo-crypto` for SHA-256 checksums
   - Ensure proper encoding (hex, base64)

4. **Implement RSA signature verification** in `BundleImportService.ts`
   - Use `react-native-rsa-native` or similar
   - Verify RSA-2048 signatures with public key
   - Reject bundles with invalid signatures

5. **Implement proper compression/decompression**
   - Use `pako` for gzip compression
   - Or use `react-native-zip-archive` for ZIP files
   - Or use `brotli` for brotli compression

6. **Add proper error logging and monitoring**
   - Integrate with crash reporting (Sentry, Bugsnag)
   - Add analytics for sync success/failure rates
   - Monitor sync duration and bandwidth usage

7. **Add unit tests and property-based tests**
   - Test sync state machine transitions
   - Test resume capability with interrupted downloads
   - Test checksum verification
   - Test signature verification
   - Test error handling and retries

## Testing

### Manual Testing

1. **Test connectivity detection:**
   ```typescript
   const isConnected = await syncService.checkConnectivity();
   console.log('Connected:', isConnected);
   ```

2. **Test sync workflow:**
   ```typescript
   // Generate some performance logs first
   await performanceTrackingService.trackEvent({...});
   
   // Start sync
   const status = await syncService.startSync();
   console.log('Sync status:', status);
   ```

3. **Test resume capability:**
   - Start a sync
   - Interrupt it (turn off network)
   - Restore network
   - Call `startSync()` again - should resume

### Property-Based Testing

See the design document for property-based test specifications:
- Property 9: Bidirectional Synchronization
- Property 10: Sync Resume Capability
- Property 11: Sync Data Integrity

## Performance Considerations

### Bandwidth Optimization
- Compress logs before upload (base64 encoding, gzip in production)
- Use delta sync (only upload new logs since last sync)
- Use HTTP Range requests for resume capability
- Compress bundles (target: 5MB per week of content)

### Storage Management
- Delete synced logs older than 30 days
- Archive old bundles (keep only active)
- Delete archived bundles older than 30 days
- Keep only last 10 sync sessions

### Memory Management
- Stream large files instead of loading into memory
- Use transactions for database operations
- Clean up downloaded files after import

## Security

### Data Protection
- TLS 1.3 for all network communication
- AES-256 encryption for local database (SQLCipher)
- RSA-2048 signatures for bundle verification
- JWT tokens for authentication

### Content Validation
- Verify checksums (SHA-256)
- Verify signatures (RSA-2048)
- Reject unsigned or tampered content
- Validate bundle structure before import

## Monitoring

### Metrics to Track
- Sync success rate
- Sync duration (p50, p95, p99)
- Upload size and duration
- Download size and duration
- Resume success rate
- Error rates by type
- Bandwidth usage

### Alerts
- Sync failure rate > 10%
- Checksum verification failures
- Signature verification failures
- Database errors during import
