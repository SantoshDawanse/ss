/**
 * SyncOrchestratorService manages bidirectional synchronization with Cloud Brain.
 * 
 * Responsibilities:
 * - Detect connectivity
 * - Manage sync session state machine
 * - Upload performance logs (compress, upload, receive acknowledgment)
 * - Download learning bundles (receive URL, download, verify checksum, import)
 * - Resume interrupted syncs
 * - Handle errors with exponential backoff
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.6, 4.8, 7.7
 * 
 * TODO: Install required packages:
 * - expo-network (for connectivity detection)
 * - expo-file-system (for file operations)
 * - expo-crypto (for checksum verification)
 */

import { DatabaseManager } from '../database/DatabaseManager';
import { PerformanceLog, LearningBundle } from '../models';
import { SyncSessionRow } from '../database/repositories/SyncSessionRepository';
import { PerformanceLogRow } from '../database/repositories/PerformanceLogRepository';
import { BundleImportService } from './BundleImportService';
import { EncryptionService } from './EncryptionService';
import { SecureNetworkService } from './SecureNetworkService';
import { AuthenticationService } from './AuthenticationService';
import { SyncState, SyncStatus, SyncStateChangeEvent, SyncEventListener, DownloadProgress } from '../types/sync';
import {
  handleNetworkTimeoutError,
  handleChecksumMismatchError,
  handleUploadFailureError,
  handleAuthenticationFailureError,
  handleConnectivityFailureError,
  handleBundleImportFailureError,
  logError,
  RetryableError,
  NonRetryableError,
} from '../utils/errorHandling';
import { MonitoringService } from './MonitoringService';

// Import expo packages for file system and crypto operations
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

// API Configuration
import Constants from 'expo-constants';

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || process.env.API_BASE_URL || 'https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development';
const SYNC_UPLOAD_ENDPOINT = '/sync/upload';
const SYNC_DOWNLOAD_ENDPOINT = '/sync/download';

// Retry Configuration
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

// Upload Response from Cloud Brain
interface UploadResponse {
  sessionId: string;
  logsReceived: number;
  bundleReady: boolean;
}

// Download Response from Cloud Brain
interface DownloadResponse {
  bundleUrl: string;
  bundleSize: number;
  checksum: string;
  validUntil: string;
}

export class SyncOrchestratorService {
  private dbManager: DatabaseManager;
  private bundleImportService: BundleImportService;
  private encryptionService: EncryptionService;
  private secureNetworkService: SecureNetworkService;
  private authenticationService: AuthenticationService;
  private currentState: SyncState = 'idle';
  private currentSessionId: string | null = null;
  private studentId: string;
  private eventListeners: Set<SyncEventListener> = new Set();

  constructor(studentId: string, authToken: string, publicKey: string) {
    this.dbManager = DatabaseManager.getInstance();
    this.bundleImportService = new BundleImportService(publicKey);
    this.encryptionService = EncryptionService.getInstance();
    this.secureNetworkService = SecureNetworkService.getInstance();
    this.authenticationService = AuthenticationService.getInstance();
    this.studentId = studentId;
    
    // Initialize authentication service with the provided token if not already initialized
    this.initializeAuth(authToken);
    
    // Log API configuration for debugging
    console.log('[SyncOrchestratorService] Initialized with API_BASE_URL:', API_BASE_URL);
  }

  /**
   * Initialize authentication service with the provided token.
   * This ensures token refresh works properly.
   */
  private async initializeAuth(authToken: string): Promise<void> {
      try {
        // Set the token in AuthenticationService for proper refresh handling
        await this.authenticationService.initialize();

        // If we have a valid token from initialization, use it
        // Otherwise, use the provided token (for backward compatibility)
        const authState = this.authenticationService.getAuthState();
        if (!authState.accessToken && authToken) {
          console.log('[SyncOrchestratorService] Using provided authToken');
          // Set the provided token as a temporary token for this sync session
          this.authenticationService.setTemporaryToken(authToken, 24);
        }
      } catch (error) {
        console.error('[SyncOrchestratorService] Failed to initialize auth:', error);
      }
    }

  /**
   * Get a valid auth token, refreshing if necessary.
   * This ensures we always use a fresh token for API requests.
   */
  private async getValidAuthToken(): Promise<string> {
    try {
      return await this.authenticationService.getAccessToken();
    } catch (error) {
      console.error('[SyncOrchestratorService] Failed to get valid auth token:', error);
      throw new NonRetryableError(
        'Authentication failed. Please log in again.',
        'AUTH_FAILED',
        { context: { action: 'User needs to re-authenticate' } }
      );
    }
  }

  /**
   * Check if device has internet connectivity.
   * Requirement 4.1: Connectivity detection
   */
  public async checkConnectivity(): Promise<boolean> {
    try {
      // Simple connectivity check by attempting to reach the API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(API_BASE_URL + '/health', {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.error('Error checking connectivity:', error);
      return false;
    }
  }

  /**
   * Get current sync status.
   */
  /**
     * Get current sync status with progress tracking.
     * Requirement 27.1-27.8: Sync progress indication
     * 
     * Returns:
     * - state: Current sync state
     * - sessionId: Current session ID (null if idle)
     * - progress: Progress percentage (0-100)
     * - error: Error message (null if no error)
     * - logsUploaded: Number of logs uploaded in current session
     * - bundleDownloaded: Whether bundle has been downloaded
     */
    public async getSyncStatus(): Promise<SyncStatus> {
      // Get session data if we have a current session
      let logsUploaded = 0;
      let bundleDownloaded = false;
      let error: string | null = null;

      if (this.currentSessionId) {
        try {
          const session = await this.dbManager.syncSessionRepository.findById(this.currentSessionId);
          if (session) {
            logsUploaded = session.logs_uploaded;
            bundleDownloaded = session.bundle_downloaded === 1;
            error = session.error_message;
          }
        } catch (err) {
          console.error('Error fetching session data for status:', err);
        }
      }

      return {
        state: this.currentState,
        sessionId: this.currentSessionId,
        progress: this.calculateProgress(),
        error,
        logsUploaded,
        bundleDownloaded,
      };
    }

  /**
   * Start a new sync session.
   * Implements the complete sync workflow:
   * 1. Check connectivity
   * 2. Upload performance logs
   * 3. Download learning bundle
   * 4. Verify and import bundle
   * 
   * Requirements: 4.1, 4.2, 4.3
   */
  public async startSync(): Promise<SyncStatus> {
    try {
      // Check for existing in-progress sync
      const inProgressSyncs = await this.dbManager.syncSessionRepository.findInProgress();
      if (inProgressSyncs.length > 0) {
        console.log('Resuming existing sync session');
        return await this.resumeSync(inProgressSyncs[0]);
      }

      // Transition to checking connectivity
      this.transitionState('checking_connectivity');

      // Check connectivity
      const isConnected = await this.checkConnectivity();
      if (!isConnected) {
        // Abort sync and return to idle state on connectivity failure
        this.transitionState('idle');
        const errorResponse = handleConnectivityFailureError();
        logError('network', 'medium', errorResponse.message, errorResponse.details);
        throw new Error(errorResponse.userMessage);
      }

      // Create new sync session
      const sessionId = this.generateSessionId();
      this.currentSessionId = sessionId;

      const session: SyncSessionRow = {
        session_id: sessionId,
        backend_session_id: null,
        start_time: Date.now(),
        end_time: null,
        status: 'pending',
        logs_uploaded: 0,
        bundle_downloaded: 0,
        error_message: null,
      };

      await this.dbManager.syncSessionRepository.create(session);

      // Track sync start time for monitoring
      const syncStartTime = Date.now();

      // Execute upload workflow
      const uploadResult = await this.executeUploadWorkflow(sessionId);

      // Execute download workflow only if there were logs to upload
      // or if the API indicates a bundle is available
      // Use the backend session ID for download
      if (uploadResult.shouldDownload) {
        console.log(`Starting download workflow with backend session ID: ${uploadResult.backendSessionId}`);
        await this.executeDownloadWorkflow(uploadResult.backendSessionId);
      } else {
        console.log('Skipping download - no new data uploaded or API not available');
      }

      // Complete sync session
      await this.dbManager.syncSessionRepository.complete(sessionId);
      this.transitionState('complete');

      // Record sync success with duration
      const syncDuration = Date.now() - syncStartTime;
      await MonitoringService.getInstance().recordSyncSuccess(syncDuration);

      // Run cleanup operations after successful sync
      // Requirement 23.4: Run cleanup automatically after successful sync
      await this.cleanup();

      return this.getSyncStatus();
    } catch (error) {
      console.error('Sync failed:', error);
      
      // Handle connectivity failures differently - they should return to idle, not failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('No internet connection')) {
        // For connectivity failures, we already transitioned to idle above
        // Don't transition to failed state
        console.log('Sync aborted due to connectivity failure, returned to idle state');
      } else {
        // For other errors, transition to failed state
        this.transitionState('failed');
        
        if (this.currentSessionId) {
          await this.dbManager.syncSessionRepository.fail(
            this.currentSessionId,
            errorMessage,
          );
        }
      }

      // Record sync failure
      await MonitoringService.getInstance().recordSyncFailure(errorMessage);

      throw error;
    }
  }

  /**
   * Resume an interrupted sync session.
   * Requirement 20.1-20.7: Sync session resume capability
   */
  private async resumeSync(session: SyncSessionRow): Promise<SyncStatus> {
    this.currentSessionId = session.session_id;

    try {
      // Track resume start time for monitoring
      const syncStartTime = Date.now();

      // Check connectivity first
      const isConnected = await this.checkConnectivity();
      if (!isConnected) {
        const errorResponse = handleConnectivityFailureError();
        logError('network', 'medium', errorResponse.message, errorResponse.details);
        throw new Error(errorResponse.userMessage);
      }

      // Determine last completed phase from status and flags
      // Requirement 20.3: Determine last completed phase from session status field
      
      // Requirement 20.4: Restart upload if status='pending' or 'uploading' and logs_uploaded=0
      if ((session.status === 'pending' || session.status === 'uploading') && session.logs_uploaded === 0) {
        console.log('Resuming upload workflow - no logs uploaded yet');
        const uploadResult = await this.executeUploadWorkflow(session.session_id);
        
        // If upload indicates we should download, continue to download phase
        if (uploadResult.shouldDownload && uploadResult.backendSessionId) {
          console.log(`Upload complete, proceeding to download with backend session: ${uploadResult.backendSessionId}`);
          await this.executeDownloadWorkflow(uploadResult.backendSessionId);
        }
      }
      // Requirement 20.5: Restart download if status='uploading' or 'downloading' and bundle_downloaded=0
      else if ((session.status === 'uploading' || session.status === 'downloading') && session.bundle_downloaded === 0) {
        console.log('Resuming download workflow - bundle not downloaded yet');
        
        // Use stored backend session ID for download resume
        // Requirement 20.6: Use stored session_id for resume operations
        if (!session.backend_session_id) {
          throw new Error('Cannot resume download: backend session ID not found. Upload may need to be retried.');
        }
        
        await this.executeDownloadWorkflow(session.backend_session_id);
      }
      else {
        console.log('Session already completed all phases, marking as complete');
      }

      // Requirement 20.7: Update session status to 'complete' on successful resume
      await this.dbManager.syncSessionRepository.complete(session.session_id);
      this.transitionState('complete');

      // Record sync success with duration
      const syncDuration = Date.now() - syncStartTime;
      await MonitoringService.getInstance().recordSyncSuccess(syncDuration);

      // Run cleanup operations after successful sync
      // Requirement 23.4: Run cleanup automatically after successful sync
      await this.cleanup();

      return this.getSyncStatus();
    } catch (error) {
      console.error('Resume sync failed:', error);

      // Record sync failure
      await MonitoringService.getInstance().recordSyncFailure(
        error instanceof Error ? error.message : 'Unknown error'
      );
      this.transitionState('failed');
      
      await this.dbManager.syncSessionRepository.fail(
        session.session_id,
        error instanceof Error ? error.message : 'Unknown error',
      );

      throw error;
    }
  }

  /**
   * Execute upload workflow: compress logs, upload, receive acknowledgment.
   * Requirement 4.2: Upload performance logs
   * 
   * For first-time users with no logs, still proceeds to download initial bundle.
   */
  private async executeUploadWorkflow(sessionId: string): Promise<{ shouldDownload: boolean; logsUploaded: number; backendSessionId: string }> {
    this.transitionState('uploading');
    await this.dbManager.syncSessionRepository.updateStatus(sessionId, 'uploading');

    // Get unsynced logs
    const unsyncedLogs = await this.dbManager.performanceLogRepository.findUnsyncedByStudent(
      this.studentId,
    );

    // Check if this is a first-time user (no active bundle)
    const activeBundle = await this.dbManager.learningBundleRepository.findActiveByStudent(
      this.studentId
    );
    const isFirstTimeUser = !activeBundle;

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

    // For first-time users or users with logs, always call upload endpoint
    // This creates the sync session on the backend
    let logs: PerformanceLog[] = [];
    
    if (isFirstTimeUser) {
      // First-time users always send empty logs array (Requirement 3.2)
      console.log('First-time user - sending empty logs array to create sync session');
      logs = [];
    } else if (unsyncedLogs.length > 0) {
      // Convert to PerformanceLog format
      logs = unsyncedLogs.map(row =>
        this.dbManager.performanceLogRepository.parseLog(row),
      );
    } else if (hasContent) {
      // Check if bundle is getting old (more than 7 days) or if student has been active
      const bundleAge = activeBundle ? Date.now() - new Date(activeBundle.valid_from).getTime() : 0;
      const bundleAgeDays = bundleAge / (1000 * 60 * 60 * 24);
      
      // Check recent activity (lessons completed in last 3 days)
      const recentActivity = await this.dbManager.executeSql(
        'SELECT COUNT(*) as count FROM performance_logs WHERE student_id = ? AND event_type = ? AND timestamp > ?',
        [this.studentId, 'lesson_complete', Date.now() - (3 * 24 * 60 * 60 * 1000)]
      );
      const hasRecentActivity = (recentActivity[0]?.count || 0) > 0;
      
      if (bundleAgeDays > 7 || hasRecentActivity) {
        // Bundle is old or student has been active - sync to get fresh content
        console.log(`Bundle is ${bundleAgeDays.toFixed(1)} days old or student has recent activity - syncing for fresh content`);
        logs = []; // Send empty logs to trigger new bundle generation
      } else {
        // Bundle is fresh and no recent activity - skip sync
        console.log('Bundle is fresh and no recent activity - skipping sync');
        await this.dbManager.syncSessionRepository.updateLogsUploaded(sessionId, 0);
        return { shouldDownload: false, logsUploaded: 0, backendSessionId: sessionId };
      }
    } else {
      // Bundle without content - send empty array to create session
      console.log('Bundle exists but has no content - re-syncing');
    }

    // Compress logs (empty array for first-time users)
    const compressedLogs = await this.compressLogs(logs);

    // Upload with retry
    try {
      const uploadResponse = await this.uploadWithRetry(compressedLogs);

      // Mark logs as synced
      if (isFirstTimeUser && unsyncedLogs.length > 0) {
        // For first-time users, mark existing logs as synced even though we sent empty array
        // This prevents them from being sent in future syncs
        const logIds = unsyncedLogs.map(log => log.log_id!);
        await this.dbManager.performanceLogRepository.markAsSynced(logIds);
        console.log(`Marked ${logIds.length} existing logs as synced for first-time user`);
      } else if (!isFirstTimeUser && unsyncedLogs.length > 0) {
        // For returning users, mark the logs we actually sent
        const logIds = unsyncedLogs.map(log => log.log_id!);
        await this.dbManager.performanceLogRepository.markAsSynced(logIds);
      }

      // Update session
      await this.dbManager.syncSessionRepository.updateLogsUploaded(
        sessionId,
        uploadResponse.logsReceived,
      );

      // Store backend session ID for resume capability
      await this.dbManager.syncSessionRepository.updateBackendSessionId(
        sessionId,
        uploadResponse.sessionId,
      );

      console.log(`Uploaded ${uploadResponse.logsReceived} logs, backend session ID: ${uploadResponse.sessionId}`);
      
      return { 
        shouldDownload: uploadResponse.bundleReady || isFirstTimeUser || !hasContent, 
        logsUploaded: uploadResponse.logsReceived,
        backendSessionId: uploadResponse.sessionId
      };
    } catch (error) {
      // Handle upload failures gracefully
      console.error('Upload failed after retries:', error);
      
      // For retryable errors, keep logs unsynced for next attempt
      if (error instanceof RetryableError) {
        console.log('Upload failed with retryable error - logs will be retried in next sync');
        logError('network', 'medium', 'Upload failed - will retry in next sync', {
          error: error.message,
          logsCount: logs.length,
          sessionId
        });
        
        // Don't mark logs as synced - they'll be retried next time
        return { shouldDownload: false, logsUploaded: 0, backendSessionId: sessionId };
      }
      
      // For non-retryable errors, fail the sync
      if (error instanceof NonRetryableError) {
        console.error('Upload failed with non-retryable error:', error.message);
        logError('network', 'high', 'Upload failed with non-retryable error', {
          error: error.message,
          errorCode: error.errorCode,
          logsCount: logs.length,
          sessionId
        });
        throw error;
      }
      
      // For other errors, treat as retryable
      console.warn('Upload failed with unknown error - treating as retryable:', error);
      logError('network', 'medium', 'Upload failed with unknown error', {
        error: error instanceof Error ? error.message : String(error),
        logsCount: logs.length,
        sessionId
      });
      
      return { shouldDownload: false, logsUploaded: 0, backendSessionId: sessionId };
    }
  }

  /**
   * Execute download workflow: receive URL, download bundle, verify checksum, import.
   * Requirement 4.3: Download learning bundles
   */
  private async executeDownloadWorkflow(sessionId: string): Promise<void> {
    this.transitionState('downloading');
    await this.dbManager.syncSessionRepository.updateStatus(sessionId, 'downloading');

    console.log(`[SyncOrchestratorService] Starting download workflow for session: ${sessionId}`);

    // Get download info from Cloud Brain
    console.log(`[SyncOrchestratorService] Requesting download info for session: ${sessionId}`);
    const downloadInfo = await this.getDownloadInfo(sessionId);
    console.log(`[SyncOrchestratorService] Download info received:`, {
      bundleUrl: downloadInfo.bundleUrl ? 'URL_PROVIDED' : 'NO_URL',
      bundleSize: downloadInfo.bundleSize,
      checksum: downloadInfo.checksum ? 'CHECKSUM_PROVIDED' : 'NO_CHECKSUM'
    });

    // Download bundle with resume support
    console.log(`[SyncOrchestratorService] Starting bundle download...`);
    const bundlePath = await this.downloadBundleWithResume(
      sessionId,
      downloadInfo.bundleUrl,
      downloadInfo.bundleSize,
      downloadInfo.checksum,
    );

    // Verify checksum
    console.log(`[SyncOrchestratorService] Verifying bundle checksum...`);
    const isValid = await this.verifyChecksum(bundlePath, downloadInfo.checksum);
    if (!isValid) {
      throw new Error('Bundle checksum verification failed');
    }
    console.log(`[SyncOrchestratorService] Checksum verification passed`);

    // Import bundle
    console.log(`[SyncOrchestratorService] Starting bundle import...`);
    await this.importBundle(bundlePath, downloadInfo.checksum);
    console.log(`[SyncOrchestratorService] Bundle import completed successfully`);

    // Update session
    await this.dbManager.syncSessionRepository.updateBundleDownloaded(sessionId, true);
    console.log(`[SyncOrchestratorService] Download workflow completed for session: ${sessionId}`);

    // Clean up downloaded file
    await FileSystem.deleteAsync(bundlePath, { idempotent: true });

    console.log('Bundle downloaded and imported successfully');
  }

  /**
   * Compress performance logs using gzip.
   */
  private async compressLogs(logs: PerformanceLog[]): Promise<any[]> {
    // Convert logs to cloud-brain API format
    return logs.map(log => {
      // Create a clean log object with snake_case field names
      const cleanLog: any = {
        student_id: log.studentId,
        timestamp: log.timestamp.toISOString(),
        event_type: log.eventType,
        content_id: log.contentId,
        subject: log.subject,
        topic: log.topic,
      };
      
      // Handle data field - ensure it's a plain object
      if (log.data && typeof log.data === 'object') {
        // Clone the data object to avoid mutating the original
        const data: Record<string, any> = {};
        
        // Copy known properties, skipping undefined/null
        if (log.data.timeSpent !== undefined && log.data.timeSpent !== null) {
          data.timeSpent = log.data.timeSpent;
        }
        if (log.data.answer !== undefined && log.data.answer !== null) {
          data.answer = log.data.answer;
        }
        if (log.data.correct !== undefined && log.data.correct !== null) {
          data.correct = log.data.correct;
        }
        if (log.data.hintsUsed !== undefined && log.data.hintsUsed !== null) {
          data.hintsUsed = log.data.hintsUsed;
        }
        if (log.data.attempts !== undefined && log.data.attempts !== null) {
          data.attempts = log.data.attempts;
        }
        
        cleanLog.data = data;
      } else {
        cleanLog.data = {};
      }
      
      return cleanLog;
    });
  }

  /**
   * Upload compressed logs with exponential backoff retry.
   * Uses secure network service with TLS 1.3 (Requirement 9.5)
   * Handles network timeouts and upload failures gracefully.
   */
  private async uploadWithRetry(compressedLogs: any[]): Promise<UploadResponse> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < MAX_RETRY_ATTEMPTS) {
      try {
        const requestBody = {
          student_id: this.studentId,  // Use snake_case to match Pydantic model
          logs: compressedLogs,
          last_sync_time: await this.getLastSyncTime(),  // Use snake_case
        };
        
        // Log request details for debugging
        console.log('[SyncOrchestratorService] Upload request:', {
          student_id: this.studentId,
          logsLength: compressedLogs.length,
          logsType: 'array',
          last_sync_time: requestBody.last_sync_time,
        });
        
        // Debug: log first log entry to see format
        if (compressedLogs.length > 0) {
          console.log('[SyncOrchestratorService] First log entry:', JSON.stringify(compressedLogs[0], null, 2));
        }
        
        // Get fresh auth token (will refresh if expired)
        const authToken = await this.getValidAuthToken();
        
        const response = await this.secureNetworkService.post<UploadResponse>(
          SYNC_UPLOAD_ENDPOINT,
          requestBody,
          {
            headers: {
              'Authorization': `Bearer ${authToken}`,
            },
          }
        );

        if (!response.ok) {
          // Handle authentication failures
          if (response.status === 401) {
            const authError = handleAuthenticationFailureError();
            logError('network', 'high', authError.message, authError.details);
            throw new NonRetryableError(
              authError.message,
              authError.errorCode,
              authError.details
            );
          }
          
          // Handle server errors (500, 502, 503, etc.)
          if (response.status >= 500) {
            throw new Error(`Upload failed: ${response.status} Internal server error`);
          }
          
          // Handle client errors (400, 404, etc.)
          throw new Error(`Upload failed: ${response.status} ${response.error || 'Client error'}`);
        }

        return response.data!;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        attempt++;

        // Handle non-retryable errors
        if (error instanceof NonRetryableError) {
          throw error;
        }

        if (attempt < MAX_RETRY_ATTEMPTS) {
          const errorResponse = handleUploadFailureError(lastError, attempt);
          logError('network', 'medium', errorResponse.message, errorResponse.details);
          
          const backoffMs = this.calculateBackoff(attempt);
          console.log(`Upload attempt ${attempt} failed, retrying in ${backoffMs}ms`);
          await this.sleep(backoffMs);
        } else {
          // Max attempts reached - queue logs for next sync
          logError(
            'network',
            'high',
            'Upload failed after max attempts. Logs queued for next sync.',
            { attempts: MAX_RETRY_ATTEMPTS, error: lastError.message }
          );
        }
      }
    }

    throw new RetryableError(
      `Upload failed after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError?.message}`,
      'UPLOAD_FAILED',
      60, // Retry after 60 seconds
      { attempts: MAX_RETRY_ATTEMPTS }
    );
  }

  /**
   * Get download information from Cloud Brain.
   * Uses secure network service with TLS 1.3 (Requirement 9.5)
   */
  private async getDownloadInfo(sessionId: string): Promise<DownloadResponse> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < MAX_RETRY_ATTEMPTS) {
      try {
        // Get fresh auth token (will refresh if expired)
        const authToken = await this.getValidAuthToken();
        
        const response = await this.secureNetworkService.get<DownloadResponse>(
          `${SYNC_DOWNLOAD_ENDPOINT}/${sessionId}`,
          {
            headers: {
              'Authorization': `Bearer ${authToken}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Download info failed: ${response.status} ${response.error}`);
        }

        return response.data!;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        attempt++;

        if (attempt < MAX_RETRY_ATTEMPTS) {
          const backoffMs = this.calculateBackoff(attempt);
          console.log(`Download info attempt ${attempt} failed, retrying in ${backoffMs}ms`);
          await this.sleep(backoffMs);
        }
      }
    }

    throw new Error(`Download info failed after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError?.message}`);
  }

  /**
   * Download bundle with resume support using HTTP Range requests.
   * Requirement 4.6: Resume capability
   */
  private async downloadBundleWithResume(
    sessionId: string,
    bundleUrl: string,
    bundleSize: number,
    checksum: string,
  ): Promise<string> {
    const fileName = `bundle_${sessionId}.zip`;
    // Access directory constants - they exist at runtime even if TypeScript doesn't see them
    const docDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
    const filePath = `${docDir}${fileName}`;

    console.log(`Downloading bundle: size=${bundleSize}, checksum=${checksum}`);
    console.log(`Download URL: ${bundleUrl.substring(0, 100)}...`);

    // Check for existing download progress in database
    let downloadedBytes = 0;
    const existingProgress = await this.dbManager.downloadProgressRepository.getProgress(sessionId);
    
    if (existingProgress) {
      console.log(`Found existing download progress: ${existingProgress.downloadedBytes}/${existingProgress.totalBytes} bytes`);
      
      // Verify the partial file exists and is valid
      const fileInfo = await FileSystem.getInfoAsync(existingProgress.filePath);
      if (fileInfo.exists && fileInfo.size !== undefined) {
        // Verify partial file integrity before resume
        if (await this.verifyPartialFileIntegrity(existingProgress.filePath, fileInfo.size, existingProgress.checksum)) {
          downloadedBytes = fileInfo.size;
          console.log(`Resuming download from ${downloadedBytes} bytes`);
        } else {
          console.log(`Partial file corrupted, deleting and restarting download`);
          await FileSystem.deleteAsync(existingProgress.filePath, { idempotent: true });
          await this.dbManager.downloadProgressRepository.deleteProgress(sessionId);
          downloadedBytes = 0;
        }
      } else {
        console.log(`Partial file not found, restarting download`);
        await this.dbManager.downloadProgressRepository.deleteProgress(sessionId);
        downloadedBytes = 0;
      }
    } else {
      // Check if file exists from previous attempt without progress record
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists && fileInfo.size !== undefined) {
        console.log(`Deleting existing file to start fresh download`);
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      }
    }

    // Store/update download progress in database
    const progressData: DownloadProgress = {
      sessionId,
      bundleUrl,
      totalBytes: bundleSize,
      downloadedBytes,
      checksum,
      filePath,
    };
    
    await this.dbManager.downloadProgressRepository.saveProgress(progressData);

    // Download with resume support
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < MAX_RETRY_ATTEMPTS) {
      try {
        const headers: Record<string, string> = {};
        
        // Add Range header if resuming
        if (downloadedBytes > 0) {
          headers['Range'] = `bytes=${downloadedBytes}-`;
          console.log(`Resuming download with Range header: bytes=${downloadedBytes}-`);
        }

        const downloadResumable = FileSystem.createDownloadResumable(
          bundleUrl,
          filePath,
          { headers },
          async (downloadProgress: any) => {
            const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
            const currentBytes = downloadedBytes + downloadProgress.totalBytesWritten;
            
            // Update progress in database periodically (every 100KB or 10% progress)
            if (downloadProgress.totalBytesWritten % (100 * 1024) === 0 || 
                Math.floor(progress * 10) !== Math.floor((currentBytes - 100 * 1024) / bundleSize * 10)) {
              await this.dbManager.downloadProgressRepository.updateProgress(sessionId, currentBytes);
            }
            
            console.log(`Download progress: ${(progress * 100).toFixed(2)}%`);
          },
        );

        const result = await downloadResumable.downloadAsync();
        
        if (!result) {
          throw new Error('Download failed: no result');
        }

        // Log the actual downloaded file size
        const downloadedFileInfo = await FileSystem.getInfoAsync(result.uri);
        if (downloadedFileInfo.exists && downloadedFileInfo.size !== undefined) {
          console.log(`Downloaded file size: ${downloadedFileInfo.size} bytes (expected: ${bundleSize} bytes)`);
          
          // Read first few bytes to check if it's actually a zip file
          const firstBytes = await FileSystem.readAsStringAsync(result.uri, {
            encoding: FileSystem.EncodingType.Base64,
            length: 100,
          });
          const decoded = atob(firstBytes);
          const hexBytes = Array.from(decoded.substring(0, 10)).map(c => 
            c.charCodeAt(0).toString(16).padStart(2, '0')
          ).join(' ');
          console.log(`First 10 bytes (hex): ${hexBytes}`);
          console.log(`First 10 bytes (ascii): ${decoded.substring(0, 10).split('').map(c => {
            const code = c.charCodeAt(0);
            return code >= 32 && code < 127 ? c : '.';
          }).join('')}`);
        }

        // Download completed successfully, clean up progress record
        await this.dbManager.downloadProgressRepository.deleteProgress(sessionId);
        console.log('Download complete:', result.uri);
        return result.uri;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        attempt++;

        if (attempt < MAX_RETRY_ATTEMPTS) {
          const backoffMs = this.calculateBackoff(attempt);
          console.log(`Download attempt ${attempt} failed, retrying in ${backoffMs}ms`);
          await this.sleep(backoffMs);

          // Update downloaded bytes for next attempt
          const fileInfo = await FileSystem.getInfoAsync(filePath);
          if (fileInfo.exists && fileInfo.size !== undefined) {
            downloadedBytes = fileInfo.size;
            await this.dbManager.downloadProgressRepository.updateProgress(sessionId, downloadedBytes);
          }
        }
      }
    }

    throw new Error(`Download failed after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError?.message}`);
  }

  /**
   * Verify bundle checksum.
   * Requirement 4.8: Data integrity validation
   * Uses crypto-js for reliable binary hashing that matches Python's hashlib.
   */
  private async verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
    try {
      // Get file info first
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        logError('storage', 'high', 'File does not exist for checksum verification', { filePath });
        return false;
      }
      
      console.log(`Verifying checksum for file: ${filePath}, size: ${fileInfo.size} bytes`);
      
      // Read file as base64
      const fileContentBase64 = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      console.log(`File content (base64 length): ${fileContentBase64.length} chars`);
      
      // Parse base64 to WordArray (binary data)
      const wordArray = CryptoJS.enc.Base64.parse(fileContentBase64);
      
      // Hash the binary data using SHA256
      const hash = CryptoJS.SHA256(wordArray);
      
      // Convert hash to hex string (built-in function)
      const hashHex = hash.toString(CryptoJS.enc.Hex);

      console.log(`Checksum verification: expected=${expectedChecksum}, actual=${hashHex}`);

      if (hashHex !== expectedChecksum) {
        const errorResponse = handleChecksumMismatchError(expectedChecksum, hashHex);
        logError('storage', 'high', errorResponse.message, errorResponse.details);
        return false;
      }

      console.log('✓ Checksum verification passed!');
      return true;
    } catch (error) {
      console.error('Checksum verification error:', error);
      logError(
        'storage',
        'high',
        'Checksum verification failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
      return false;
    }
  }

  /**
   * Verify partial file integrity before resume.
   * This is a simplified check - in a full implementation, we would need
   * to verify the partial content against the expected checksum range.
   * For now, we check basic file properties and structure.
   */
  private async verifyPartialFileIntegrity(filePath: string, fileSize: number, expectedChecksum: string): Promise<boolean> {
    try {
      // Basic file existence and size check
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists || fileInfo.size === undefined) {
        console.log('Partial file does not exist or has no size');
        return false;
      }

      if (fileInfo.size !== fileSize) {
        console.log(`Partial file size mismatch: expected ${fileSize}, actual ${fileInfo.size}`);
        return false;
      }

      // For a more robust implementation, we could:
      // 1. Read the first few KB and verify they match expected content structure
      // 2. Check if the file has valid zip headers (if it's a zip file)
      // 3. Verify partial checksum if the server supports it
      
      // For now, we do a basic structure check by reading the first few bytes
      try {
        const firstBytes = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.Base64,
          length: 100,
        });
        
        if (firstBytes.length === 0) {
          console.log('Partial file appears to be empty');
          return false;
        }

        // Decode and check if it looks like valid binary data
        const decoded = atob(firstBytes);
        if (decoded.length === 0) {
          console.log('Partial file contains invalid base64 data');
          return false;
        }

        console.log('Partial file integrity check passed');
        return true;
      } catch (readError) {
        console.log('Failed to read partial file for integrity check:', readError);
        return false;
      }
    } catch (error) {
      console.error('Partial file integrity check error:', error);
      return false;
    }
  }

  /**
   * Import bundle to database.
   * Requirement 4.8, 7.7: Bundle validation and import
   */
  private async importBundle(bundlePath: string, checksum: string): Promise<void> {
    this.transitionState('importing');
    
    try {
      await this.bundleImportService.importBundle(bundlePath, checksum);
      console.log('Bundle imported successfully');
    } catch (error) {
      console.error('Bundle import failed:', error);
      const errorResponse = handleBundleImportFailureError(
        error instanceof Error ? error : new Error('Unknown import error'),
        bundlePath.includes('bundle_') ? bundlePath.split('bundle_')[1]?.split('.')[0] : undefined
      );
      logError('content', 'high', errorResponse.message, errorResponse.details);
      throw new Error(errorResponse.userMessage);
    }
  }

  /**
   * Get last sync time from database.
   */
  private async getLastSyncTime(): Promise<Date | null> {
    const lastSync = await this.dbManager.syncSessionRepository.findLastCompleted();
    return lastSync ? new Date(lastSync.end_time!) : null;
  }

  /**
   * Generate unique session ID.
   */
  private generateSessionId(): string {
    return `sync_${this.studentId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate exponential backoff delay.
   */
  private calculateBackoff(attempt: number): number {
    const backoff = Math.min(
      INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1),
      MAX_BACKOFF_MS,
    );
    // Add jitter
    return backoff + Math.random() * 1000;
  }

  /**
   * Sleep for specified milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Transition sync state machine.
   */
  private transitionState(newState: SyncState): void {
    const previousState = this.currentState;
    console.log(`Sync state transition: ${previousState} -> ${newState}`);
    this.currentState = newState;
    
    // Emit state change event for UI updates
    this.emitStateChange(previousState, newState);
  }

  /**
   * Emit state change event to all registered listeners.
   */
  private emitStateChange(previousState: SyncState, currentState: SyncState): void {
    const event: SyncStateChangeEvent = {
      previousState,
      currentState,
      sessionId: this.currentSessionId,
      progress: this.calculateProgress(),
      timestamp: Date.now(),
    };

    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in sync state change listener:', error);
      }
    });
  }

  /**
   * Add event listener for sync state changes.
   * Returns a function to remove the listener.
   */
  public addStateChangeListener(listener: SyncEventListener): () => void {
    this.eventListeners.add(listener);
    
    // Return cleanup function
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  /**
   * Remove all event listeners.
   */
  public removeAllListeners(): void {
    this.eventListeners.clear();
  }

  /**
   * Calculate overall progress (0-100).
   */
  /**
     * Calculate overall progress (0-100).
     * Requirement 27.2-27.7: Map states to progress percentages
     * 
     * Progress mapping:
     * - idle: 0%
     * - checking_connectivity: 10%
     * - uploading: 30%
     * - downloading: 60%
     * - importing: 90%
     * - complete: 100%
     * - failed: 0%
     * 
     * Ensures progress bounds: 0-100 inclusive
     */
    private calculateProgress(): number {
      switch (this.currentState) {
        case 'idle':
          return 0;
        case 'checking_connectivity':
          return 10;
        case 'uploading':
          return 30;
        case 'downloading':
          return 60;
        case 'importing':
          return 90;
        case 'complete':
          return 100;
        case 'failed':
          return 0;
        default:
          return 0;
      }
    }

  /**
   * Check if sync is needed (has unsynced logs or old bundle).
   */
  public async isSyncNeeded(): Promise<boolean> {
    // Check for unsynced logs
    const unsyncedCount = await this.dbManager.performanceLogRepository.countUnsynced();
    if (unsyncedCount > 0) {
      return true;
    }

    // Check if bundle is old or if there's recent activity
    const activeBundle = await this.dbManager.learningBundleRepository.findActiveByStudent(
      this.studentId
    );

    if (!activeBundle) {
      // No bundle - definitely need sync
      return true;
    }

    // Check bundle age
    const bundleAge = Date.now() - new Date(activeBundle.valid_from).getTime();
    const bundleAgeDays = bundleAge / (1000 * 60 * 60 * 24);
    
    if (bundleAgeDays > 7) {
      // Bundle is old - need sync
      return true;
    }

    // Check for recent activity (lessons completed in last 3 days)
    const recentActivity = await this.dbManager.executeSql(
      'SELECT COUNT(*) as count FROM performance_logs WHERE student_id = ? AND event_type = ? AND timestamp > ?',
      [this.studentId, 'lesson_complete', Date.now() - (3 * 24 * 60 * 60 * 1000)]
    );
    const hasRecentActivity = (recentActivity[0]?.count || 0) > 0;

    return hasRecentActivity;
  }

  /**
   * Create mock content bundle for development when cloud-brain is unavailable
   */
  private async createMockBundle(): Promise<void> {
    try {
      console.log('Creating mock learning bundle...');
      
      // Generate a unique bundle ID
      const bundleId = `mock_bundle_${Date.now()}`;
      const validFrom = new Date();
      const validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

      // Create bundle record
      const bundleRow = {
        bundle_id: bundleId,
        student_id: this.studentId,
        valid_from: validFrom.getTime(),
        valid_until: validUntil.getTime(),
        total_size: 1024, // Mock size
        checksum: 'mock_checksum',
        status: 'active' as const,
        created_at: Date.now(),
      };

      // Archive old bundles first
      await this.dbManager.learningBundleRepository.archiveOldBundles(this.studentId);

      // Create new bundle
      await this.dbManager.learningBundleRepository.create(bundleRow);

      // Create mock lessons
      const mockLessons = [
        {
          lesson_id: `lesson_${Date.now()}_1`,
          bundle_id: bundleId,
          subject: 'Mathematics',
          topic: 'Algebra',
          title: 'Introduction to Variables',
          difficulty: 'easy' as const,
          estimated_minutes: 15,
          curriculum_standards: JSON.stringify(['CCSS.MATH.CONTENT.6.EE.A.2']),
          content_json: JSON.stringify([
            {
              type: 'text',
              content: 'A variable is a symbol that represents a number. Variables are usually letters like x, y, or z.'
            },
            {
              type: 'example',
              content: 'If x = 5, then x + 3 = 8'
            },
            {
              type: 'practice',
              content: 'Try solving: If y = 7, what is y + 2?'
            }
          ]),
        },
        {
          lesson_id: `lesson_${Date.now()}_2`,
          bundle_id: bundleId,
          subject: 'Mathematics',
          topic: 'Algebra',
          title: 'Solving Simple Equations',
          difficulty: 'medium' as const,
          estimated_minutes: 20,
          curriculum_standards: JSON.stringify(['CCSS.MATH.CONTENT.6.EE.B.7']),
          content_json: JSON.stringify([
            {
              type: 'text',
              content: 'To solve an equation, we need to find the value of the variable that makes the equation true.'
            },
            {
              type: 'example',
              content: 'Solve: x + 5 = 12. Subtract 5 from both sides: x = 7'
            },
            {
              type: 'practice',
              content: 'Try solving: y - 3 = 10'
            }
          ]),
        }
      ];

      // Insert mock lessons
      for (const lesson of mockLessons) {
        await this.dbManager.lessonRepository.create(lesson);
      }

      // Create mock quiz
      const mockQuiz = {
        quiz_id: `quiz_${Date.now()}`,
        bundle_id: bundleId,
        subject: 'Mathematics',
        topic: 'Algebra',
        title: 'Variables and Equations Quiz',
        difficulty: 'easy' as const,
        time_limit: 10,
        questions_json: JSON.stringify([
          {
            question_id: 'q1',
            type: 'multiple_choice',
            question: 'If x = 4, what is x + 6?',
            options: ['8', '10', '12', '14'],
            correct_answer: '10',
            explanation: 'x + 6 = 4 + 6 = 10'
          },
          {
            question_id: 'q2',
            type: 'multiple_choice',
            question: 'Solve: y - 2 = 8',
            options: ['6', '8', '10', '12'],
            correct_answer: '10',
            explanation: 'y - 2 = 8, so y = 8 + 2 = 10'
          }
        ]),
      };

      // Insert mock quiz
      await this.dbManager.quizRepository.create(mockQuiz);

      console.log(`Mock bundle created successfully: ${bundleId}`);
      console.log(`- ${mockLessons.length} lessons created`);
      console.log(`- 1 quiz created`);
      
    } catch (error) {
      console.error('Failed to create mock bundle:', error);
      throw error;
    }
  }

  /**
   * Clean up old sync sessions and downloaded files.
   */
  /**
   * Clean up old sync data.
   * Requirements 23.1-23.6: Data cleanup and retention
   * 
   * This method:
   * - Deletes synced logs older than 30 days (Req 23.1)
   * - Deletes archived bundles older than 30 days (Req 23.2)
   * - Keeps only last 10 sync session records (Req 23.3)
   * - Only deletes synced data (Req 23.5)
   * - Preserves all unsynced logs regardless of age (Req 23.6)
   * 
   * Note: Archived bundle deletion also happens during bundle import
   * in BundleImportService.archiveOldBundles()
   */
  public async cleanup(): Promise<void> {
    try {
      // Requirement 23.3: Keep only last 10 sync sessions
      await this.dbManager.syncSessionRepository.deleteOldSessions(10);

      // Requirement 23.1: Delete synced logs older than 30 days
      // Requirement 23.5: Only delete data that has been successfully synced
      // Requirement 23.6: Preserve all unsynced logs regardless of age
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      await this.dbManager.performanceLogRepository.deleteSyncedBefore(thirtyDaysAgo);

      // Requirement 23.2: Delete archived bundles older than 30 days
      // Note: This is also called during bundle import in BundleImportService
      await this.dbManager.learningBundleRepository.deleteArchivedBefore(thirtyDaysAgo);

      // Clean up old download progress records (older than 7 days)
      await this.dbManager.downloadProgressRepository.cleanupOldProgress();

      console.log('Sync cleanup complete');
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Don't throw - cleanup failures shouldn't fail the sync
    }
  }
}
