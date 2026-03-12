/**
 * Task 17.2: Integration test for download resume
 * 
 * Tests download resume functionality including:
 * - Resume with partial download
 * - Resume across app restart
 * - Corrupted partial file handling
 * 
 * Validates Requirements 6.1-6.7: Resume Capability for Interrupted Downloads
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SyncOrchestratorService } from '../src/services/SyncOrchestratorService';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { SecureNetworkService } from '../src/services/SecureNetworkService';
import { AuthenticationService } from '../src/services/AuthenticationService';
import { MonitoringService } from '../src/services/MonitoringService';
import * as FileSystem from 'expo-file-system/legacy';
import pako from 'pako';
import CryptoJS from 'crypto-js';

// Mock external dependencies
jest.mock('expo-file-system/legacy');
jest.mock('../src/services/SecureNetworkService');
jest.mock('../src/services/AuthenticationService');
jest.mock('../src/services/MonitoringService');

describe('Task 17.2: Download Resume Integration', () => {
  let dbManager: DatabaseManager;
  let syncService: SyncOrchestratorService;
  let mockNetworkService: jest.Mocked<SecureNetworkService>;
  let mockAuthService: jest.Mocked<AuthenticationService>;
  const testStudentId = 'download-resume-test-student';
  const testAuthToken = 'test-auth-token';
  const testPublicKey = 'test-public-key';

  beforeEach(async () => {
    // Initialize fresh in-memory database
    dbManager = new DatabaseManager({
      name: ':memory:',
      location: 'default',
      encryption: false,
    });
    await dbManager.initialize();

    // Mock DatabaseManager.getInstance
    jest.spyOn(DatabaseManager, 'getInstance').mockReturnValue(dbManager);

    // Setup mock services
    mockNetworkService = {
      post: jest.fn(),
      get: jest.fn(),
    } as any;

    mockAuthService = {
      initialize: jest.fn(),
      getAuthState: jest.fn().mockReturnValue({ accessToken: 'valid-token' }),
      getAccessToken: jest.fn().mockResolvedValue('valid-token'),
      setTemporaryToken: jest.fn(),
    } as any;

    const mockMonitoringService = {
      recordSyncSuccess: jest.fn(),
      recordSyncFailure: jest.fn(),
    } as any;

    (SecureNetworkService.getInstance as jest.Mock).mockReturnValue(mockNetworkService);
    (AuthenticationService.getInstance as jest.Mock).mockReturnValue(mockAuthService);
    (MonitoringService.getInstance as jest.Mock).mockReturnValue(mockMonitoringService);

    // Mock global fetch for connectivity check
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    // Create sync service
    syncService = new SyncOrchestratorService(testStudentId, testAuthToken, testPublicKey);

    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (dbManager) {
      await dbManager.close();
    }
    jest.restoreAllMocks();
  });

  /**
   * Helper function to create a mock bundle
   */
  function createMockBundle(studentId: string, bundleId: string) {
    const bundleData = {
      bundle_id: bundleId,
      student_id: studentId,
      valid_from: new Date().toISOString(),
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      total_size: 1024,
      checksum: '',
      subjects: [
        {
          subject: 'Mathematics',
          lessons: [
            {
              lesson_id: 'lesson-1',
              subject: 'Mathematics',
              topic: 'Algebra',
              title: 'Introduction to Algebra',
              difficulty: 'medium',
              content: [{ type: 'text', text: 'Learn algebra basics' }],
              estimated_minutes: 15,
              curriculum_standards: ['CCSS.MATH.6.EE.A.1'],
            },
          ],
          quizzes: [],
          hints: {},
        },
      ],
    };

    const jsonString = JSON.stringify(bundleData);
    const compressed = pako.gzip(jsonString);
    const base64 = Buffer.from(compressed).toString('base64');

    // Calculate checksum
    const wordArray = CryptoJS.enc.Base64.parse(base64);
    const hash = CryptoJS.SHA256(wordArray);
    const checksum = hash.toString(CryptoJS.enc.Hex);

    return { base64, checksum, bundleData, compressed };
  }

  describe('Resume with Partial Download', () => {
    it('should resume download from where it stopped', async () => {
      const bundleId = 'partial-download-bundle';
      const backendSessionId = 'backend-partial-123';
      const { base64, checksum, compressed } = createMockBundle(testStudentId, bundleId);

      // Simulate partial download (50% complete)
      const totalBytes = compressed.length;
      const downloadedBytes = Math.floor(totalBytes / 2);
      const partialData = compressed.slice(0, downloadedBytes);
      const partialPath = '/mock/path/partial-bundle.gz';

      // Create download progress record
      await dbManager.executeSql(
        `INSERT INTO download_progress (session_id, bundle_url, total_bytes, downloaded_bytes, checksum, file_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [backendSessionId, 'https://s3.amazonaws.com/test-bundle.gz', totalBytes, downloadedBytes, checksum, partialPath]
      );

      // Create session in downloading state
      await dbManager.syncSessionRepository.create({
        session_id: `resume-partial-${Date.now()}`,
        backend_session_id: backendSessionId,
        start_time: Date.now() - 60000,
        end_time: null,
        status: 'downloading',
        logs_uploaded: 3,
        bundle_downloaded: 0,
        error_message: null,
      });

      // Mock file info to show partial file exists
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        size: downloadedBytes,
        uri: partialPath,
      });

      // Mock download info response
      mockNetworkService.post.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          bundleUrl: 'https://s3.amazonaws.com/test-bundle.gz',
          bundleSize: totalBytes,
          checksum: checksum,
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      // Mock resumable download with Range header
      (FileSystem.downloadAsync as jest.Mock).mockImplementation((url, fileUri, options) => {
        // Verify Range header was sent
        expect(options?.headers?.Range).toBe(`bytes=${downloadedBytes}-`);
        
        return Promise.resolve({
          uri: fileUri,
          status: 206, // Partial Content
        });
      });

      // Mock file read for complete bundle
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Execute sync (should resume download)
      const result = await syncService.startSync();

      // Verify sync completed
      expect(result.state).toBe('complete');

      // Verify Range header was used
      expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Range: `bytes=${downloadedBytes}-`,
          }),
        })
      );
    });
  });

  describe('Resume Across App Restart', () => {
    it('should resume download after app restart', async () => {
      const bundleId = 'restart-resume-bundle';
      const backendSessionId = 'backend-restart-456';
      const { base64, checksum, compressed } = createMockBundle(testStudentId, bundleId);

      const totalBytes = compressed.length;
      const downloadedBytes = Math.floor(totalBytes * 0.75); // 75% complete
      const partialPath = '/mock/path/restart-bundle.gz';

      // Simulate app restart: create session and progress from previous run
      await dbManager.syncSessionRepository.create({
        session_id: `restart-session-${Date.now()}`,
        backend_session_id: backendSessionId,
        start_time: Date.now() - 120000, // 2 minutes ago
        end_time: null,
        status: 'downloading',
        logs_uploaded: 5,
        bundle_downloaded: 0,
        error_message: null,
      });

      await dbManager.executeSql(
        `INSERT INTO download_progress (session_id, bundle_url, total_bytes, downloaded_bytes, checksum, file_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [backendSessionId, 'https://s3.amazonaws.com/test-bundle.gz', totalBytes, downloadedBytes, checksum, partialPath]
      );

      // Mock partial file exists
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        size: downloadedBytes,
        uri: partialPath,
      });

      // Mock download info response
      mockNetworkService.post.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          bundleUrl: 'https://s3.amazonaws.com/test-bundle.gz',
          bundleSize: totalBytes,
          checksum: checksum,
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      // Mock resumable download
      (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
        uri: partialPath,
        status: 206,
      });

      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Execute sync (simulating app restart and resume)
      const result = await syncService.startSync();

      // Verify sync completed
      expect(result.state).toBe('complete');

      // Verify download was resumed, not restarted
      expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Range: `bytes=${downloadedBytes}-`,
          }),
        })
      );
    });
  });

  describe('Corrupted Partial File Handling', () => {
    it('should delete corrupted partial file and restart download', async () => {
      const bundleId = 'corrupted-partial-bundle';
      const backendSessionId = 'backend-corrupted-789';
      const { base64, checksum, compressed } = createMockBundle(testStudentId, bundleId);

      const totalBytes = compressed.length;
      const downloadedBytes = Math.floor(totalBytes / 2);
      const corruptedPath = '/mock/path/corrupted-bundle.gz';

      // Create session and progress
      await dbManager.syncSessionRepository.create({
        session_id: `corrupted-session-${Date.now()}`,
        backend_session_id: backendSessionId,
        start_time: Date.now() - 60000,
        end_time: null,
        status: 'downloading',
        logs_uploaded: 2,
        bundle_downloaded: 0,
        error_message: null,
      });

      await dbManager.executeSql(
        `INSERT INTO download_progress (session_id, bundle_url, total_bytes, downloaded_bytes, checksum, file_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [backendSessionId, 'https://s3.amazonaws.com/test-bundle.gz', totalBytes, downloadedBytes, checksum, corruptedPath]
      );

      // Mock corrupted partial file (size mismatch)
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        exists: true,
        size: downloadedBytes - 100, // Size doesn't match expected
        uri: corruptedPath,
      });

      // Mock download info response
      mockNetworkService.post.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          bundleUrl: 'https://s3.amazonaws.com/test-bundle.gz',
          bundleSize: totalBytes,
          checksum: checksum,
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      // Mock file deletion
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Mock fresh download (no Range header)
      (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
        uri: '/mock/path/fresh-bundle.gz',
        status: 200,
      });

      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      // Execute sync
      const result = await syncService.startSync();

      // Verify sync completed
      expect(result.state).toBe('complete');

      // Verify corrupted file was deleted
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(corruptedPath, expect.any(Object));

      // Verify fresh download was started (no Range header)
      expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.not.objectContaining({
          headers: expect.objectContaining({
            Range: expect.any(String),
          }),
        })
      );
    });
  });
});
