/**
 * Test to verify the sync fix for downloading new content after lesson completion
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SyncOrchestratorService } from '../src/services/SyncOrchestratorService';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { SecureNetworkService } from '../src/services/SecureNetworkService';
import { AuthenticationService } from '../src/services/AuthenticationService';
import { MonitoringService } from '../src/services/MonitoringService';

// Mock external dependencies
jest.mock('../src/services/SecureNetworkService');
jest.mock('../src/services/AuthenticationService');
jest.mock('../src/services/MonitoringService');

describe('Sync Fix Verification', () => {
  let dbManager: DatabaseManager;
  let syncService: SyncOrchestratorService;
  let mockNetworkService: jest.Mocked<SecureNetworkService>;
  let mockAuthService: jest.Mocked<AuthenticationService>;
  const testStudentId = 'test-student-sync-fix';
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

    (SecureNetworkService.getInstance as jest.Mock).mockReturnValue(mockNetworkService);
    (AuthenticationService.getInstance as jest.Mock).mockReturnValue(mockAuthService);

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

  describe('Upload Logic Fix', () => {
    it('should trigger sync when bundle is old (>7 days)', async () => {
      // Create an old bundle (8 days ago)
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await dbManager.learningBundleRepository.create({
        bundle_id: 'old-bundle-123',
        student_id: testStudentId,
        valid_from: oldDate.toISOString(),
        valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        total_size: 1024,
        checksum: 'test-checksum',
        status: 'active',
      });

      // Add some lessons to make it have content
      await dbManager.executeSql(
        'INSERT INTO lessons (lesson_id, bundle_id, subject, topic, difficulty, content_json, estimated_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['lesson-1', 'old-bundle-123', 'Mathematics', 'Addition', 'easy', '{}', 30]
      );

      // Mock successful upload response
      mockNetworkService.post.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          sessionId: 'session-123',
          logsReceived: 0,
          bundleReady: true,
        },
      });

      // Test the upload workflow directly
      const uploadResult = await (syncService as any).executeUploadWorkflow('test-session-id');

      // Should trigger download because bundle is old
      expect(uploadResult.shouldDownload).toBe(true);
      expect(mockNetworkService.post).toHaveBeenCalledWith(
        expect.stringContaining('/sync/upload'),
        expect.objectContaining({
          student_id: testStudentId,
          logs: [], // Empty logs but should still sync due to old bundle
        }),
        expect.any(Object)
      );
    });

    it('should trigger sync when student has recent activity', async () => {
      // Create a fresh bundle (2 days ago)
      const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      await dbManager.learningBundleRepository.create({
        bundle_id: 'recent-bundle-456',
        student_id: testStudentId,
        valid_from: recentDate.toISOString(),
        valid_until: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
        total_size: 1024,
        checksum: 'test-checksum',
        status: 'active',
      });

      // Add some lessons to make it have content
      await dbManager.executeSql(
        'INSERT INTO lessons (lesson_id, bundle_id, subject, topic, difficulty, content_json, estimated_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['lesson-2', 'recent-bundle-456', 'Mathematics', 'Subtraction', 'easy', '{}', 30]
      );

      // Add recent activity (lesson completed 1 day ago)
      await dbManager.performanceLogRepository.create({
        student_id: testStudentId,
        timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
        event_type: 'lesson_complete',
        content_id: 'lesson-2',
        subject: 'Mathematics',
        topic: 'Subtraction',
        data_json: JSON.stringify({ timeSpent: 1800 }),
        synced: 1, // Already synced, so no new logs to upload
      });

      // Mock successful upload response
      mockNetworkService.post.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          sessionId: 'session-456',
          logsReceived: 0,
          bundleReady: true,
        },
      });

      // Test the upload workflow directly
      const uploadResult = await (syncService as any).executeUploadWorkflow('test-session-id-2');

      // Should trigger download because of recent activity
      expect(uploadResult.shouldDownload).toBe(true);
      expect(mockNetworkService.post).toHaveBeenCalledWith(
        expect.stringContaining('/sync/upload'),
        expect.objectContaining({
          student_id: testStudentId,
          logs: [], // Empty logs but should still sync due to recent activity
        }),
        expect.any(Object)
      );
    });

    it('should skip sync when bundle is fresh and no recent activity', async () => {
      // Create a very fresh bundle (1 day ago)
      const freshDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      await dbManager.learningBundleRepository.create({
        bundle_id: 'fresh-bundle-789',
        student_id: testStudentId,
        valid_from: freshDate.toISOString(),
        valid_until: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000).toISOString(),
        total_size: 1024,
        checksum: 'test-checksum',
        status: 'active',
      });

      // Add some lessons to make it have content
      await dbManager.executeSql(
        'INSERT INTO lessons (lesson_id, bundle_id, subject, topic, difficulty, content_json, estimated_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['lesson-3', 'fresh-bundle-789', 'Mathematics', 'Multiplication', 'easy', '{}', 30]
      );

      // No recent activity (no performance logs in last 3 days)

      // Test the upload workflow directly
      const uploadResult = await (syncService as any).executeUploadWorkflow('test-session-id-3');

      // Should NOT trigger download because bundle is fresh and no recent activity
      expect(uploadResult.shouldDownload).toBe(false);
      expect(mockNetworkService.post).not.toHaveBeenCalled();
    });
  });

  describe('Sync Need Detection', () => {
    it('should detect sync is needed when bundle is old', async () => {
      // Create an old bundle
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      await dbManager.learningBundleRepository.create({
        bundle_id: 'old-bundle-sync-check',
        student_id: testStudentId,
        valid_from: oldDate.toISOString(),
        valid_until: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
        total_size: 1024,
        checksum: 'test-checksum',
        status: 'active',
      });

      const syncNeeded = await syncService.isSyncNeeded();
      expect(syncNeeded).toBe(true);
    });

    it('should detect sync is needed when there are unsynced logs', async () => {
      // Create a fresh bundle
      const freshDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      await dbManager.learningBundleRepository.create({
        bundle_id: 'fresh-bundle-sync-check',
        student_id: testStudentId,
        valid_from: freshDate.toISOString(),
        valid_until: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000).toISOString(),
        total_size: 1024,
        checksum: 'test-checksum',
        status: 'active',
      });

      // Add unsynced performance log
      await dbManager.performanceLogRepository.create({
        student_id: testStudentId,
        timestamp: Date.now(),
        event_type: 'lesson_complete',
        content_id: 'lesson-new',
        subject: 'Mathematics',
        topic: 'Division',
        data_json: JSON.stringify({ timeSpent: 900 }),
        synced: 0, // Not synced yet
      });

      const syncNeeded = await syncService.isSyncNeeded();
      expect(syncNeeded).toBe(true);
    });
  });
});