# Local Brain Monitoring Implementation

## Overview

The Local Brain monitoring system provides comprehensive crash reporting, analytics tracking, and resource monitoring for the offline-first Sikshya-Sathi mobile application. This implementation fulfills task 21.2 and validates Requirements 12.1-12.10.

## Architecture

### MonitoringService

The `MonitoringService` is a singleton service that handles all monitoring operations:

- **Crash Reporting**: Captures and stores application crashes with context
- **Analytics Events**: Tracks user interactions and system events
- **Sync Analytics**: Monitors sync success rate and performance
- **Offline Analytics**: Tracks offline operation duration
- **Resource Usage**: Monitors storage and battery consumption

### Data Storage

All monitoring data is persisted locally using AsyncStorage:

- `@monitoring/crash_reports`: Last 50 crash reports
- `@monitoring/analytics_events`: Last 1000 analytics events
- `@monitoring/sync_analytics`: Cumulative sync statistics
- `@monitoring/offline_analytics`: Offline session tracking
- `@monitoring/last_battery_level`: Battery level for delta tracking

## Features

### 1. Crash Reporting

Automatically captures unhandled errors and crashes:

```typescript
// Automatic crash capture via global error handler
ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
  monitoringService.recordCrash(error, { isFatal });
});

// Manual crash reporting
await monitoringService.recordCrash(error, { context: 'user_action' });

// Retrieve crash reports
const reports = await monitoringService.getCrashReports();
```

**Features:**
- Captures error message and stack trace
- Stores contextual information
- Limits to last 50 reports to manage storage
- Includes app version and device info

### 2. Sync Analytics

Tracks synchronization performance and reliability:

```typescript
// Record sync success
await monitoringService.recordSyncSuccess(duration);

// Record sync failure
await monitoringService.recordSyncFailure(errorMessage);

// Get sync analytics
const analytics = await monitoringService.getSyncAnalytics();
// Returns: {
//   totalAttempts: number,
//   successfulSyncs: number,
//   failedSyncs: number,
//   successRate: number,
//   lastSyncTime: Date,
//   averageDuration: number
// }
```

**Metrics:**
- Total sync attempts
- Success/failure counts
- Success rate percentage
- Average sync duration
- Last successful sync time

### 3. Offline Operation Tracking

Monitors how long the app operates without connectivity:

```typescript
// Start offline session
await monitoringService.startOfflineSession();

// End offline session
await monitoringService.endOfflineSession();

// Get offline analytics
const analytics = await monitoringService.getOfflineAnalytics();
// Returns: {
//   totalOfflineDuration: number,
//   currentOfflineSession: number,
//   offlineSessionStart: Date,
//   longestOfflineSession: number
// }
```

**Metrics:**
- Total offline duration (cumulative)
- Current offline session duration
- Longest offline session
- Offline session start time

### 4. Resource Usage Monitoring

Tracks storage and battery consumption:

```typescript
// Get current resource usage
const usage = await monitoringService.getResourceUsage();
// Returns: {
//   storageUsed: number,
//   storageAvailable: number,
//   storagePercentage: number,
//   batteryLevel: number,
//   batteryState: 'charging' | 'unplugged' | 'full' | 'unknown'
// }

// Track storage usage (records event)
await monitoringService.trackStorageUsage();

// Track battery usage (records delta)
await monitoringService.trackBatteryUsage();
```

**Metrics:**
- Storage used/available (bytes)
- Storage usage percentage
- Battery level (0-1)
- Battery state (charging/unplugged/full)
- Battery delta (consumption since last check)

### 5. App Lifecycle Tracking

Monitors app state transitions:

```typescript
// Record app going to background
await monitoringService.recordAppBackground();

// Record app coming to foreground
await monitoringService.recordAppForeground();
```

## Integration

### SyncOrchestratorService Integration

The monitoring service is integrated with the sync orchestrator to automatically track sync operations:

```typescript
// In SyncOrchestratorService.startSync()
const syncStartTime = Date.now();

try {
  // ... sync operations ...
  
  const syncDuration = Date.now() - syncStartTime;
  await MonitoringService.getInstance().recordSyncSuccess(syncDuration);
} catch (error) {
  await MonitoringService.getInstance().recordSyncFailure(
    error instanceof Error ? error.message : 'Unknown error'
  );
}
```

### App Initialization

Initialize monitoring service on app startup:

```typescript
import { MonitoringService } from './services/MonitoringService';

// In App.tsx or main entry point
useEffect(() => {
  const initMonitoring = async () => {
    const monitoring = MonitoringService.getInstance();
    await monitoring.initialize();
  };
  
  initMonitoring();
}, []);
```

### App State Listeners

Track app lifecycle events:

```typescript
import { AppState } from 'react-native';

useEffect(() => {
  const subscription = AppState.addEventListener('change', async (nextAppState) => {
    const monitoring = MonitoringService.getInstance();
    
    if (nextAppState === 'background') {
      await monitoring.recordAppBackground();
    } else if (nextAppState === 'active') {
      await monitoring.recordAppForeground();
    }
  });
  
  return () => subscription.remove();
}, []);
```

## Metric Types

The service supports the following metric types:

```typescript
enum MetricType {
  CRASH = 'crash',
  SYNC_SUCCESS = 'sync_success',
  SYNC_FAILURE = 'sync_failure',
  OFFLINE_DURATION = 'offline_duration',
  STORAGE_USAGE = 'storage_usage',
  BATTERY_USAGE = 'battery_usage',
  APP_START = 'app_start',
  APP_BACKGROUND = 'app_background',
  APP_FOREGROUND = 'app_foreground',
}
```

## Data Management

### Storage Limits

To prevent excessive storage usage:
- Crash reports: Limited to last 50
- Analytics events: Limited to last 1000
- Older data is automatically trimmed

### Data Retrieval

```typescript
// Get all crash reports
const crashes = await monitoringService.getCrashReports();

// Get all analytics events
const events = await monitoringService.getAnalyticsEvents();

// Get sync analytics
const syncStats = await monitoringService.getSyncAnalytics();

// Get offline analytics
const offlineStats = await monitoringService.getOfflineAnalytics();
```

### Data Clearing

```typescript
// Clear all monitoring data
await monitoringService.clearAllData();
```

## Testing

Comprehensive unit tests are provided in `tests/monitoring.test.ts`:

- Crash reporting functionality
- Analytics event tracking
- Sync analytics calculations
- Offline session tracking
- Resource usage monitoring
- App lifecycle events
- Data management operations

Run tests:
```bash
npm test -- monitoring.test.ts
```

## Requirements Validation

This implementation validates the following requirements:

### Requirement 12.1: Student Learning Improvement Tracking
- Tracks engagement through app lifecycle events
- Monitors offline learning duration

### Requirement 12.2: Daily Active Usage
- Records app start, foreground, and background events
- Tracks session durations

### Requirement 12.5: Sync Success Rates
- Comprehensive sync analytics with success/failure tracking
- Calculates success rate percentage
- Tracks average sync duration

### Requirement 12.6: Weekly Progress Reports
- Provides data foundation for progress reporting
- Tracks cumulative metrics over time

### Requirement 12.8: Student Retention
- Monitors app usage patterns
- Tracks offline operation duration

### Additional Monitoring
- Crash reporting for reliability tracking
- Storage usage monitoring for capacity planning
- Battery usage tracking for performance optimization

## Future Enhancements

1. **Remote Analytics**: Upload monitoring data to Cloud Brain during sync
2. **Real-time Alerts**: Notify users of critical issues (low storage, sync failures)
3. **Performance Metrics**: Track UI rendering performance and response times
4. **Network Quality**: Monitor connection speed and reliability
5. **User Behavior Analytics**: Track learning patterns and content engagement

## Dependencies

- `@react-native-async-storage/async-storage`: Local data persistence
- `expo-battery`: Battery level and state monitoring
- `expo-file-system`: Storage usage tracking

## Notes

- All monitoring operations are non-blocking and fail gracefully
- Errors in monitoring do not affect app functionality
- Data is stored locally and can be synced to Cloud Brain
- Privacy-conscious: No PII is collected in monitoring data
