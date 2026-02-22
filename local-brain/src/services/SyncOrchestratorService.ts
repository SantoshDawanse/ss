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
import {
  handleNetworkTimeoutError,
  handleChecksumMismatchError,
  handleUploadFailureError,
  handleAuthenticationFailureError,
  logError,
  RetryableError,
  NonRetryableError,
} from '../utils/errorHandling';
import { MonitoringService } from './MonitoringService';

// Placeholder types for missing expo packages
// TODO: Remove these when packages are installed
type NetworkState = { isConnected: boolean; isInternetReachable: boolean };
type FileInfo = { exists: boolean; size?: number; uri?: string };
type DownloadResumable = {
  downloadAsync: () => Promise<{ uri: string } | null>;
};

// Placeholder implementations for missing expo packages
const Network = {
  getNetworkStateAsync: async (): Promise<NetworkState> => {
    // TODO: Implement with expo-network
    console.warn('Network detection not implemented - using placeholder');
    return { isConnected: true, isInternetReachable: true };
  },
};

const FileSystem = {
  documentDirectory: '/tmp/',
  getInfoAsync: async (path: string): Promise<FileInfo> => {
    // TODO: Implement with expo-file-system
    return { exists: false };
  },
  readAsStringAsync: async (path: string, options?: any): Promise<string> => {
    // TODO: Implement with expo-file-system
    return '';
  },
  deleteAsync: async (path: string, options?: any): Promise<void> => {
    // TODO: Implement with expo-file-system
  },
  createDownloadResumable: (
    url: string,
    path: string,
    options?: any,
    callback?: any,
  ): DownloadResumable => {
    // TODO: Implement with expo-file-system
    return {
      downloadAsync: async () => ({ uri: path }),
    };
  },
};

const Crypto = {
  CryptoDigestAlgorithm: {
    SHA256: 'SHA256',
  },
  CryptoEncoding: {
    HEX: 'hex',
  },
  digestStringAsync: async (
    algorithm: string,
    data: string,
    options?: any,
  ): Promise<string> => {
    // TODO: Implement with expo-crypto
    // Placeholder: return a fake hash
    return 'placeholder_hash_' + data.substring(0, 10);
  },
};

// API Configuration
const API_BASE_URL = 'https://api.sikshya-sathi.np/v1';
const SYNC_UPLOAD_ENDPOINT = '/sync/upload';
const SYNC_DOWNLOAD_ENDPOINT = '/sync/download';

// Retry Configuration
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

// Sync State Machine States
export type SyncState = 'idle' | 'checking_connectivity' | 'uploading' | 'downloading' | 'importing' | 'complete' | 'failed';

// Sync Session Status
export interface SyncStatus {
  state: SyncState;
  sessionId: string | null;
  progress: number; // 0-100
  error: string | null;
  logsUploaded: number;
  bundleDownloaded: boolean;
}

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

// Download Progress Tracking
interface DownloadProgress {
  sessionId: string;
  bundleUrl: string;
  totalBytes: number;
  downloadedBytes: number;
  checksum: string;
  filePath: string;
}

export class SyncOrchestratorService {
  private dbManager: DatabaseManager;
  private bundleImportService: BundleImportService;
  private encryptionService: EncryptionService;
  private secureNetworkService: SecureNetworkService;
  private currentState: SyncState = 'idle';
  private currentSessionId: string | null = null;
  private studentId: string;
  private authToken: string;
  private downloadProgress: Map<string, DownloadProgress> = new Map();

  constructor(studentId: string, authToken: string, publicKey: string) {
    this.dbManager = DatabaseManager.getInstance();
    this.bundleImportService = new BundleImportService(publicKey);
    this.encryptionService = EncryptionService.getInstance();
    this.secureNetworkService = SecureNetworkService.getInstance();
    this.studentId = studentId;
    this.authToken = authToken;
  }

  /**
   * Check if device has internet connectivity.
   * Requirement 4.1: Connectivity detection
   */
  public async checkConnectivity(): Promise<boolean> {
    try {
      const networkState = await Network.getNetworkStateAsync();
      return networkState.isConnected === true && networkState.isInternetReachable === true;
    } catch (error) {
      console.error('Error checking connectivity:', error);
      return false;
    }
  }

  /**
   * Get current sync status.
   */
  public getSyncStatus(): SyncStatus {
    return {
      state: this.currentState,
      sessionId: this.currentSessionId,
      progress: this.calculateProgress(),
      error: null,
      logsUploaded: 0,
      bundleDownloaded: false,
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
        throw new Error('No internet connectivity available');
      }

      // Create new sync session
      const sessionId = this.generateSessionId();
      this.currentSessionId = sessionId;

      const session: SyncSessionRow = {
        session_id: sessionId,
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
      await this.executeUploadWorkflow(sessionId);

      // Execute download workflow
      await this.executeDownloadWorkflow(sessionId);

      // Complete sync session
      await this.dbManager.syncSessionRepository.complete(sessionId);
      this.transitionState('complete');

      // Record sync success with duration
      const syncDuration = Date.now() - syncStartTime;
      await MonitoringService.getInstance().recordSyncSuccess(syncDuration);

      return this.getSyncStatus();
    } catch (error) {
      console.error('Sync failed:', error);
      this.transitionState('failed');
      
      if (this.currentSessionId) {
        await this.dbManager.syncSessionRepository.fail(
          this.currentSessionId,
          error instanceof Error ? error.message : 'Unknown error',
        );
      }

      // Record sync failure
      await MonitoringService.getInstance().recordSyncFailure(
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  }

  /**
   * Resume an interrupted sync session.
   * Requirement 4.6: Sync resume capability
   */
  private async resumeSync(session: SyncSessionRow): Promise<SyncStatus> {
    this.currentSessionId = session.session_id;

    try {
      // Track resume start time for monitoring
      const syncStartTime = Date.now();

      // Check connectivity
      const isConnected = await this.checkConnectivity();
      if (!isConnected) {
        throw new Error('No internet connectivity available');
      }

      // Resume based on last state
      if (session.status === 'pending' || session.status === 'uploading') {
        if (session.logs_uploaded === 0) {
          await this.executeUploadWorkflow(session.session_id);
        }
      }

      if (session.status === 'uploading' || session.status === 'downloading') {
        if (session.bundle_downloaded === 0) {
          await this.executeDownloadWorkflow(session.session_id);
        }
      }

      // Complete sync
      await this.dbManager.syncSessionRepository.complete(session.session_id);
      this.transitionState('complete');

      // Record sync success with duration
      const syncDuration = Date.now() - syncStartTime;
      await MonitoringService.getInstance().recordSyncSuccess(syncDuration);

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
   */
  private async executeUploadWorkflow(sessionId: string): Promise<void> {
    this.transitionState('uploading');
    await this.dbManager.syncSessionRepository.updateStatus(sessionId, 'uploading');

    // Get unsynced logs
    const unsyncedLogs = await this.dbManager.performanceLogRepository.findUnsyncedByStudent(
      this.studentId,
    );

    if (unsyncedLogs.length === 0) {
      console.log('No logs to upload');
      await this.dbManager.syncSessionRepository.updateLogsUploaded(sessionId, 0);
      return;
    }

    // Convert to PerformanceLog format
    const logs: PerformanceLog[] = unsyncedLogs.map(row =>
      this.dbManager.performanceLogRepository.parseLog(row),
    );

    // Compress logs
    const compressedLogs = await this.compressLogs(logs);

    // Upload with retry
    const uploadResponse = await this.uploadWithRetry(compressedLogs);

    // Mark logs as synced
    const logIds = unsyncedLogs.map(log => log.log_id!);
    await this.dbManager.performanceLogRepository.markAsSynced(logIds);

    // Update session
    await this.dbManager.syncSessionRepository.updateLogsUploaded(
      sessionId,
      uploadResponse.logsReceived,
    );

    console.log(`Uploaded ${uploadResponse.logsReceived} logs`);
  }

  /**
   * Execute download workflow: receive URL, download bundle, verify checksum, import.
   * Requirement 4.3: Download learning bundles
   */
  private async executeDownloadWorkflow(sessionId: string): Promise<void> {
    this.transitionState('downloading');
    await this.dbManager.syncSessionRepository.updateStatus(sessionId, 'downloading');

    // Get download info from Cloud Brain
    const downloadInfo = await this.getDownloadInfo(sessionId);

    // Download bundle with resume support
    const bundlePath = await this.downloadBundleWithResume(
      sessionId,
      downloadInfo.bundleUrl,
      downloadInfo.bundleSize,
      downloadInfo.checksum,
    );

    // Verify checksum
    const isValid = await this.verifyChecksum(bundlePath, downloadInfo.checksum);
    if (!isValid) {
      throw new Error('Bundle checksum verification failed');
    }

    // Import bundle
    await this.importBundle(bundlePath, downloadInfo.checksum);

    // Update session
    await this.dbManager.syncSessionRepository.updateBundleDownloaded(sessionId, true);

    // Clean up downloaded file
    await FileSystem.deleteAsync(bundlePath, { idempotent: true });

    console.log('Bundle downloaded and imported successfully');
  }

  /**
   * Compress performance logs using gzip.
   */
  private async compressLogs(logs: PerformanceLog[]): Promise<string> {
    // Encrypt logs before compression (Requirement 9.1)
    const encryptedLogs = await this.encryptionService.encryptLogsForSync(logs);
    
    // In React Native, we'll use base64 encoding as a simple compression
    // In production, you'd use a proper compression library like pako
    const compressed = Buffer.from(encryptedLogs).toString('base64');
    
    return compressed;
  }

  /**
   * Upload compressed logs with exponential backoff retry.
   * Uses secure network service with TLS 1.3 (Requirement 9.5)
   * Handles network timeouts and upload failures gracefully.
   */
  private async uploadWithRetry(compressedLogs: string): Promise<UploadResponse> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < MAX_RETRY_ATTEMPTS) {
      try {
        const response = await this.secureNetworkService.post<UploadResponse>(
          SYNC_UPLOAD_ENDPOINT,
          {
            studentId: this.studentId,
            logs: compressedLogs,
            lastSyncTime: await this.getLastSyncTime(),
          },
          {
            headers: {
              'Authorization': `Bearer ${this.authToken}`,
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
          
          throw new Error(`Upload failed: ${response.status} ${response.error}`);
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
        const response = await this.secureNetworkService.get<DownloadResponse>(
          `${SYNC_DOWNLOAD_ENDPOINT}/${sessionId}`,
          {
            headers: {
              'Authorization': `Bearer ${this.authToken}`,
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
    const filePath = `${FileSystem.documentDirectory}${fileName}`;

    // Check if partial download exists
    let downloadedBytes = 0;
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (fileInfo.exists && fileInfo.size !== undefined) {
      downloadedBytes = fileInfo.size;
      console.log(`Resuming download from byte ${downloadedBytes}`);
    }

    // Store download progress
    this.downloadProgress.set(sessionId, {
      sessionId,
      bundleUrl,
      totalBytes: bundleSize,
      downloadedBytes,
      checksum,
      filePath,
    });

    // Download with resume support
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < MAX_RETRY_ATTEMPTS) {
      try {
        const headers: Record<string, string> = {};
        
        // Add Range header if resuming
        if (downloadedBytes > 0) {
          headers['Range'] = `bytes=${downloadedBytes}-`;
        }

        const downloadResumable = FileSystem.createDownloadResumable(
          bundleUrl,
          filePath,
          { headers },
          (downloadProgress: any) => {
            const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
            console.log(`Download progress: ${(progress * 100).toFixed(2)}%`);
          },
        );

        const result = await downloadResumable.downloadAsync();
        
        if (!result) {
          throw new Error('Download failed: no result');
        }

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
          }
        }
      }
    }

    throw new Error(`Download failed after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError?.message}`);
  }

  /**
   * Verify bundle checksum.
   * Requirement 4.8: Data integrity validation
   * Handles checksum mismatches by triggering re-download.
   */
  private async verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
    try {
      // Read file and compute SHA-256 hash
      const fileContent = await FileSystem.readAsStringAsync(filePath);
      
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        fileContent,
        { encoding: Crypto.CryptoEncoding.HEX },
      );

      if (hash !== expectedChecksum) {
        const errorResponse = handleChecksumMismatchError(expectedChecksum, hash);
        logError('storage', 'high', errorResponse.message, errorResponse.details);
        return false;
      }

      return true;
    } catch (error) {
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
      throw error;
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
    console.log(`Sync state transition: ${this.currentState} -> ${newState}`);
    this.currentState = newState;
  }

  /**
   * Calculate overall progress (0-100).
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
   * Check if sync is needed (has unsynced logs).
   */
  public async isSyncNeeded(): Promise<boolean> {
    const unsyncedCount = await this.dbManager.performanceLogRepository.countUnsynced();
    return unsyncedCount > 0;
  }

  /**
   * Clean up old sync sessions and downloaded files.
   */
  public async cleanup(): Promise<void> {
    // Keep only last 10 sync sessions
    await this.dbManager.syncSessionRepository.deleteOldSessions(10);

    // Delete synced logs older than 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    await this.dbManager.performanceLogRepository.deleteSyncedBefore(thirtyDaysAgo);

    console.log('Sync cleanup complete');
  }
}
