# Local Brain - Cloud Sync Guide

Complete guide for connecting the local-brain mobile app to the cloud-brain API.

## Quick Start

```bash
cd local-brain
npm start
```

Open the app, navigate to Home tab, and tap "Sync Now" to test the sync feature.

## Configuration

### Environment Setup
The `.env` file contains the API configuration:

```env
API_BASE_URL=https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development
ENVIRONMENT=development
```

Configuration is loaded via `app.config.js` and accessible through `expo-constants`.

## How Sync Works

**Workflow:**
1. Check connectivity
2. Upload encrypted performance logs
3. Download learning bundles
4. Verify checksums (SHA-256)
5. Import to local database

**Features:**
- Automatic resume on interruption
- Exponential backoff retry (3 attempts)
- TLS 1.3 encryption
- Progress tracking

## Testing

### Current Behavior
- Uses demo credentials (needs real auth)
- Sync button on home screen
- Shows loading states and alerts
- Console logs show progress
- **Skips download if no logs to upload** (prevents API errors in demo mode)
- Provides helpful error messages when API is unavailable

### Expected Messages
- **"Already Up to Date"** - No new performance data to sync
- **"API Not Available"** - Cloud-brain API endpoints not yet implemented (expected in demo mode)
- **"No Internet Connection"** - Device is offline
- **"Sync Complete"** - Successfully synced (when API is available)

### Next Steps for Production
1. Replace demo credentials in `app/(tabs)/index.tsx` with real authentication
2. Implement cloud-brain API endpoints (`/sync/upload`, `/sync/download`)
3. Test with real data and network conditions

## API Endpoints

- `POST /sync/upload` - Upload compressed logs
- `GET /sync/download/{sessionId}` - Get bundle info

## Troubleshooting

**"Already Up to Date"** - No performance data to sync. Complete lessons/quizzes to generate data.

**"API Not Available"** - Cloud-brain API not implemented yet. Expected in demo mode. Data is saved locally.

**"No Internet Connection"** - Check device connection and API URL.

**"Authentication failed"** - Expected with demo credentials; implement real auth.

## Security

- AES-256 encryption for logs
- TLS 1.3 for transmission
- JWT authentication (when implemented)
- Secure key storage via device keychain

## Files Modified

- `src/services/SyncOrchestratorService.ts` - Uses environment variable for API URL
- `app/(tabs)/index.tsx` - Added sync button and handler
- `.env` - API configuration
- `app.config.js` - Environment variable loader
