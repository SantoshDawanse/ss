/**
 * Test for initializeDatabase function to verify it uses dynamic studentId
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { initializeDatabase } from '../src/utils/initializeDatabase';

// Mock the database manager
jest.mock('../src/database/DatabaseManager');

describe('initializeDatabase', () => {
  let mockDbManager: jest.Mocked<DatabaseManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock database manager with all required repositories
    mockDbManager = {
      learningBundleRepository: {
        getActiveBundle: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue(undefined),
      },
      lessonRepository: {
        insert: jest.fn().mockResolvedValue(undefined),
      },
      quizRepository: {
        insert: jest.fn().mockResolvedValue(undefined),
      },
      hintRepository: {
        insert: jest.fn().mockResolvedValue(undefined),
      },
      studyTrackRepository: {
        insert: jest.fn().mockResolvedValue(undefined),
      },
      studentStateRepository: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    } as any;
  });

  it('should initialize database with provided studentId', async () => {
    const testStudentId = 'test-student-123';

    await initializeDatabase(mockDbManager, testStudentId);

    // Verify getActiveBundle was called with the correct studentId
    expect(mockDbManager.learningBundleRepository.getActiveBundle).toHaveBeenCalledWith(testStudentId);

    // Verify learning bundle was inserted with the correct studentId
    expect(mockDbManager.learningBundleRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: testStudentId,
      })
    );

    // Verify student state was initialized with the correct studentId
    expect(mockDbManager.studentStateRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: testStudentId,
      })
    );
  });

  it('should skip initialization if bundle already exists', async () => {
    const testStudentId = 'test-student-456';
    
    // Mock existing bundle
    mockDbManager.learningBundleRepository.getActiveBundle.mockResolvedValue({
      bundleId: 'existing-bundle',
      studentId: testStudentId,
    } as any);

    await initializeDatabase(mockDbManager, testStudentId);

    // Verify getActiveBundle was called
    expect(mockDbManager.learningBundleRepository.getActiveBundle).toHaveBeenCalledWith(testStudentId);

    // Verify no insert operations were performed
    expect(mockDbManager.learningBundleRepository.insert).not.toHaveBeenCalled();
    expect(mockDbManager.studentStateRepository.upsert).not.toHaveBeenCalled();
  });

  it('should work with different studentIds', async () => {
    const studentIds = ['student-001', 'student-002', 'uuid-123-456'];

    for (const studentId of studentIds) {
      jest.clearAllMocks();
      mockDbManager.learningBundleRepository.getActiveBundle.mockResolvedValue(null);

      await initializeDatabase(mockDbManager, studentId);

      expect(mockDbManager.learningBundleRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId,
        })
      );

      expect(mockDbManager.studentStateRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId,
        })
      );
    }
  });
});
