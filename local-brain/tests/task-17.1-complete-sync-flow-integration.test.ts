/**
 * Task 17.1: Integration test for complete sync flow
 * 
 * Tests the end-to-end sync workflow including:
 * - Connectivity check through import
 * - First-time user flow with empty logs
 * - Sync with various log counts (0, 1, 100)
 * - Resume after interruption at each phase
 * 
 * This integration test validates the entire sync system working together,
 * from the SyncOrchestratorService through network calls, bundle download,
 * checksum verification, decompression, and database import.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SyncOrchestratorService } from '../src/services/SyncOrchestratorService';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { BundleImportService } from '../src/services/BundleImportService';
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

describe('Task 17.1: Complete Sync Flow Integration', () => {
  let dbManager: DatabaseManager;
  let syncService: SyncOrchestratorService;
  let mockNetworkService: jest.Mocked<SecureNetworkService>;
  let mockAuthService: jest.Mocked<AuthenticationService>;
  let mockMonitoringService: jest.Mocked<MonitoringService>;
  const testStudentId = 'integration-test-student';
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

    mockMonitoringService = {
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

    // Clear file system mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (dbManager) {
      await dbManager.close();
    }
    jest.restoreAllMocks();
  });

  /**
   * Helper function to create a valid compressed bundle
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
              topic: 'Addition',
              title: 'Basic Addition',
              difficulty: 'easy',
              content: [{ type: 'text', text: 'Learn addition' }],
              estimated_minutes: 10,
              curriculum_standards: ['CCSS.MATH.1.OA.A.1'],
            },
          ],
          quizzes: [
            {
              quiz_id: 'quiz-1',
              subject: 'Mathematics',
              topic: 'Addition',
              title: 'Addition Quiz',
              difficulty: 'easy',
              time_limit: 5,
              questions: [
                {
                  question_id: 'q1',
                  question_text: 'What is 2 + 2?',
                  question_type: 'multiple_choice',
                  options: ['3', '4', '5'],
                  correct_answer: '4',
                  explanation: 'Two plus two equals four',
                },
              ],
            },
          ],
          hints: {
            'quiz-1': [
              {
                quiz_id: 'quiz-1',
                question_id: 'q1',
                level: 1,
                hint_text: 'Think about counting',
              },
            ],
          },
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

    return { base64, checksum, bundleData };
  }

  describe('First-Time User Flow', () => {
    it('should complete full sync for first-time user with empty logs', async () => {
      const bundleId = 'first-time-bundle-123';
      const backendSessionId = 'backend-session-456';
      const { base64, checksum } = createMockBundle(testStudentId, bundleId);

      // Mock upload response
      mockNetworkService.post.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          sessionId: backendSessionId,
          logsReceived: 0,
          bundleReady: true,
        },
      });

      // Mock download info response (uses GET)
      mockNetworkService.get.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          bundleUrl: 'https://s3.amazonaws.com/test-bundle.gz',
          bundleSize: base64.length,
          checksum: checksum,
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      // Mock file download
      (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
        uri: '/mock/path/bundle.gz',
        status: 200,
      });

      // Mock file read for checksum verification and import
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      // Mock file deletion after import
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Execute sync
      const result = await syncService.startSync();

      // Verify sync completed successfully
      expect(result.state).toBe('complete');
      expect(result.progress).toBe(100);

      // Verify bundle was imported
      const activeBundle = await dbManager.learningBundleRepository.findActiveByStudent(testStudentId);
      expect(activeBundle).not.toBeNull();
      expect(activeBundle?.bundle_id).toBe(bundleId);

      // Verify lessons were imported
      const lessons = await dbManager.executeSql(
        'SELECT * FROM lessons WHERE bundle_id = ?',
        [bundleId]
      );
      expect(lessons.length).toBeGreaterThan(0);

      // Verify monitoring was called
      expect(mockMonitoringService.recordSyncSuccess).toHaveBeenCalled();
    });
  });

  describe('Sync with Various Log Counts', () => {
    it('should sync successfully with 1 performance log', async () => {
      // Create a performance log
      await dbManager.performanceLogRepository.create({
        student_id: testStudentId,
        timestamp: Date.now(),
        event_type: 'lesson_start',
        content_id: 'lesson-1',
        subject: 'Mathematics',
        topic: 'Addition',
        data_json: JSON.stringify({ timeSpent: 300 }),
        synced: 0,
      });

      const bundleId = 'sync-with-logs-bundle';
      const backendSessionId = 'backend-session-789';
      const { base64, checksum } = createMockBundle(testStudentId, bundleId);

      // Mock upload response
      mockNetworkService.post.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          sessionId: backendSessionId,
          logsReceived: 1,
          bundleReady: true,
        },
      });

      // Mock download info response (uses GET)
      mockNetworkService.get.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          bundleUrl: 'https://s3.amazonaws.com/test-bundle.gz',
          bundleSize: base64.length,
          checksum: checksum,
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      // Mock file operations
      (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
        uri: '/mock/path/bundle.gz',
        status: 200,
      });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Execute sync
      const result = await syncService.startSync();

      // Verify sync completed
      expect(result.state).toBe('complete');

      // Verify log was marked as synced
      const unsyncedLogs = await dbManager.performanceLogRepository.findUnsyncedByStudent(testStudentId);
      expect(unsyncedLogs.length).toBe(0);
    });

    it('should sync successfully with 100 performance logs', async () => {
      // Create 100 performance logs
      for (let i = 0; i < 100; i++) {
        await dbManager.performanceLogRepository.create({
          student_id: testStudentId,
          timestamp: Date.now() + i,
          event_type: i % 2 === 0 ? 'lesson_start' : 'quiz_answer',
          content_id: `content-${i}`,
          subject: 'Mathematics',
          topic: 'Addition',
          data_json: JSON.stringify({ index: i }),
          synced: 0,
        });
      }

      const bundleId = 'sync-100-logs-bundle';
      const backendSessionId = 'backend-session-100';
      const { base64, checksum } = createMockBundle(testStudentId, bundleId);

      // Mock upload response
      mockNetworkService.post.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          sessionId: backendSessionId,
          logsReceived: 100,
          bundleReady: true,
        },
      });

      // Mock download info response
      mockNetworkService.post.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          bundleUrl: 'https://s3.amazonaws.com/test-bundle.gz',
          bundleSize: base64.length,
          checksum: checksum,
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      // Mock file operations
      (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
        uri: '/mock/path/bundle.gz',
        status: 200,
      });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Execute sync
      const result = await syncService.startSync();

      // Verify sync completed
      expect(result.state).toBe('complete');

      // Verify all logs were marked as synced
      const unsyncedLogs = await dbManager.performanceLogRepository.findUnsyncedByStudent(testStudentId);
      expect(unsyncedLogs.length).toBe(0);
    });
  });

  describe('Resume After Interruption', () => {
    it('should resume sync after interruption during upload phase', async () => {
      // Create an in-progress session in uploading state
      const sessionId = `resume-upload-${Date.now()}`;
      await dbManager.syncSessionRepository.create({
        session_id: sessionId,
        backend_session_id: null,
        start_time: Date.now() - 60000,
        end_time: null,
        status: 'uploading',
        logs_uploaded: 0,
        bundle_downloaded: 0,
        error_message: null,
      });

      // Create unsynced logs
      await dbManager.performanceLogRepository.create({
        student_id: testStudentId,
        timestamp: Date.now(),
        event_type: 'lesson_complete',
        content_id: 'lesson-1',
        subject: 'Mathematics',
        topic: 'Addition',
        data_json: JSON.stringify({ timeSpent: 600 }),
        synced: 0,
      });

      const bundleId = 'resume-upload-bundle';
      const backendSessionId = 'backend-resume-123';
      const { base64, checksum } = createMockBundle(testStudentId, bundleId);

      // Mock upload response
      mockNetworkService.post.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          sessionId: backendSessionId,
          logsReceived: 1,
          bundleReady: true,
        },
      });

      // Mock download info response
      mockNetworkService.post.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          bundleUrl: 'https://s3.amazonaws.com/test-bundle.gz',
          bundleSize: base64.length,
          checksum: checksum,
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      // Mock file operations
      (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
        uri: '/mock/path/bundle.gz',
        status: 200,
      });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Execute sync (should resume)
      const result = await syncService.startSync();

      // Verify sync completed
      expect(result.state).toBe('complete');

      // Verify session was updated
      const updatedSession = await dbManager.syncSessionRepository.findById(sessionId);
      expect(updatedSession?.status).toBe('complete');
      expect(updatedSession?.logs_uploaded).toBeGreaterThan(0);
    });

    it('should resume sync after interruption during download phase', async () => {
      // Create an in-progress session in downloading state
      const sessionId = `resume-download-${Date.now()}`;
      const backendSessionId = 'backend-download-456';
      await dbManager.syncSessionRepository.create({
        session_id: sessionId,
        backend_session_id: backendSessionId,
        start_time: Date.now() - 60000,
        end_time: null,
        status: 'downloading',
        logs_uploaded: 5,
        bundle_downloaded: 0,
        error_message: null,
      });

      const bundleId = 'resume-download-bundle';
      const { base64, checksum } = createMockBundle(testStudentId, bundleId);

      // Mock download info response (no upload needed)
      mockNetworkService.post.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          bundleUrl: 'https://s3.amazonaws.com/test-bundle.gz',
          bundleSize: base64.length,
          checksum: checksum,
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      // Mock file operations
      (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
        uri: '/mock/path/bundle.gz',
        status: 200,
      });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Execute sync (should resume from download)
      const result = await syncService.startSync();

      // Verify sync completed
      expect(result.state).toBe('complete');

      // Verify session was updated
      const updatedSession = await dbManager.syncSessionRepository.findById(sessionId);
      expect(updatedSession?.status).toBe('complete');
      expect(updatedSession?.bundle_downloaded).toBe(1);
    });
  });

  describe('State Transitions', () => {
    it('should transition through all states correctly', async () => {
      const states: string[] = [];
      
      // Track state changes
      syncService.on('stateChange', (state) => {
        states.push(state);
      });

      const bundleId = 'state-transition-bundle';
      const backendSessionId = 'backend-state-789';
      const { base64, checksum } = createMockBundle(testStudentId, bundleId);

      // Mock responses
      mockNetworkService.post.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          sessionId: backendSessionId,
          logsReceived: 0,
          bundleReady: true,
        },
      });

      mockNetworkService.post.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          bundleUrl: 'https://s3.amazonaws.com/test-bundle.gz',
          bundleSize: base64.length,
          checksum: checksum,
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
        uri: '/mock/path/bundle.gz',
        status: 200,
      });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Execute sync
      await syncService.startSync();

      // Verify state transitions
      expect(states).toContain('checking_connectivity');
      expect(states).toContain('uploading');
      expect(states).toContain('downloading');
      expect(states).toContain('importing');
      expect(states).toContain('complete');
    });
  });
});
