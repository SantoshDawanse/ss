/**
 * Unit tests for BundleImportService - Task 7.6: Bundle Structure Validation
 * 
 * Tests comprehensive validation of bundle structure:
 * - Required fields: bundle_id, student_id, valid_from, valid_until, checksum, subjects
 * - Subjects array structure: subject name, lessons array, quizzes array
 * - Field types: strings, integers, dates, arrays, nested objects
 * - Descriptive errors for missing or invalid fields
 */

import { BundleImportService } from '../src/services/BundleImportService';
import * as FileSystem from 'expo-file-system/legacy';
import pako from 'pako';
import CryptoJS from 'crypto-js';

// Mock dependencies
jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64',
  },
}));
jest.mock('../src/database/DatabaseManager');

describe('BundleImportService - Task 7.6: Bundle Structure Validation', () => {
  let service: BundleImportService;
  const mockPublicKey = 'mock-rsa-public-key';
  const mockBundlePath = '/mock/path/bundle.gz';

  beforeEach(() => {
    // Create fresh service instance
    service = new BundleImportService(mockPublicKey);
    
    // Clear all mocks completely
    jest.clearAllMocks();
    jest.resetAllMocks();
    
    // Set up fresh mock implementations
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Helper function to create and compress bundle data
  const createCompressedBundle = (bundleData: any) => {
    const jsonString = JSON.stringify(bundleData);
    const compressed = pako.gzip(jsonString);
    const base64 = Buffer.from(compressed).toString('base64');
    
    // Calculate checksum
    const wordArray = CryptoJS.enc.Base64.parse(base64);
    const hash = CryptoJS.SHA256(wordArray);
    const checksum = hash.toString(CryptoJS.enc.Hex);
    
    return { base64, checksum };
  };

  // Valid bundle data template
  const validBundleData = {
    bundle_id: 'bundle-123',
    student_id: 'student-456',
    valid_from: '2024-01-01T00:00:00Z',
    valid_until: '2024-12-31T23:59:59Z',
    total_size: 5242880,
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
            difficulty: 'easy',
            estimated_minutes: 30,
            curriculum_standards: ['CCSS.MATH.CONTENT.6.EE.A.1'],
            sections: [{ type: 'text', content: 'Welcome to algebra!' }],
          },
        ],
        quizzes: [
          {
            quiz_id: 'quiz-1',
            subject: 'Mathematics',
            topic: 'Algebra',
            title: 'Algebra Quiz 1',
            difficulty: 'easy',
            time_limit: 15,
            questions: [{ id: 'q1', text: 'What is x + 1?', type: 'short_answer' }],
          },
        ],
        hints: {
          'quiz-1': [
            {
              hint_id: 'hint-1',
              quiz_id: 'quiz-1',
              question_id: 'q1',
              level: 1,
              hint_text: 'Think about basic addition',
            },
          ],
        },
        study_track: {
          track_id: 'track-1',
          subject: 'Mathematics',
          weeks: [
            {
              week: 1,
              days: [
                { day: 1, lesson_ids: ['lesson-1'], quiz_ids: ['quiz-1'] },
              ],
            },
          ],
        },
      },
    ],
  };

  describe('Required Field Validation', () => {
    it('should reject bundle missing bundle_id', async () => {
      const invalidBundle = { ...validBundleData };
      delete (invalidBundle as any).bundle_id;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject bundle missing student_id', async () => {
      const invalidBundle = { ...validBundleData };
      delete (invalidBundle as any).student_id;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject bundle missing valid_from', async () => {
      const invalidBundle = { ...validBundleData };
      delete (invalidBundle as any).valid_from;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject bundle missing valid_until', async () => {
      const invalidBundle = { ...validBundleData };
      delete (invalidBundle as any).valid_until;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject bundle missing total_size', async () => {
      const invalidBundle = { ...validBundleData };
      delete (invalidBundle as any).total_size;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject bundle missing checksum field', async () => {
      const invalidBundle = { ...validBundleData };
      delete (invalidBundle as any).checksum;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject bundle missing subjects array', async () => {
      const invalidBundle = { ...validBundleData };
      delete (invalidBundle as any).subjects;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });
  });

  describe('Field Type Validation', () => {
    it('should reject bundle with non-string bundle_id', async () => {
      const invalidBundle = { ...validBundleData, bundle_id: 123 };

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject bundle with non-string student_id', async () => {
      const invalidBundle = { ...validBundleData, student_id: 456 };

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject bundle with non-number total_size', async () => {
      const invalidBundle = { ...validBundleData, total_size: '5242880' };

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject bundle with non-array subjects', async () => {
      const invalidBundle = { ...validBundleData, subjects: 'not-an-array' };

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });
  });

  describe('String Value Validation', () => {
    it('should reject bundle with empty bundle_id', async () => {
      const invalidBundle = { ...validBundleData, bundle_id: '   ' };

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject bundle with empty student_id', async () => {
      const invalidBundle = { ...validBundleData, student_id: '' };

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });
  });

  describe('Date Validation', () => {
    it('should reject bundle with invalid valid_from date', async () => {
      const invalidBundle = { ...validBundleData, valid_from: 'not-a-date' };

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject bundle with invalid valid_until date', async () => {
      const invalidBundle = { ...validBundleData, valid_until: '2024-13-45T99:99:99Z' };

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });
  });

  describe('Numeric Value Validation', () => {
    it('should reject bundle with negative total_size', async () => {
      const invalidBundle = { ...validBundleData, total_size: -100 };

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject bundle with zero total_size', async () => {
      const invalidBundle = { ...validBundleData, total_size: 0 };

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });
  });

  describe('Subject Structure Validation', () => {
    it('should reject subject missing name', async () => {
      const invalidBundle = { ...validBundleData };
      delete invalidBundle.subjects[0].subject;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject subject with empty name', async () => {
      const invalidBundle = { ...validBundleData };
      invalidBundle.subjects[0].subject = '  ';

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject subject missing lessons array', async () => {
      const invalidBundle = { ...validBundleData };
      delete (invalidBundle.subjects[0] as any).lessons;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject subject missing quizzes array', async () => {
      const invalidBundle = { ...validBundleData };
      delete (invalidBundle.subjects[0] as any).quizzes;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject subject missing hints object', async () => {
      const invalidBundle = { ...validBundleData };
      delete (invalidBundle.subjects[0] as any).hints;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject subject with non-array lessons', async () => {
      const invalidBundle = { ...validBundleData };
      (invalidBundle.subjects[0] as any).lessons = 'not-an-array';

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject subject with non-array quizzes', async () => {
      const invalidBundle = { ...validBundleData };
      (invalidBundle.subjects[0] as any).quizzes = 'not-an-array';

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject subject with hints as array instead of object', async () => {
      const invalidBundle = { ...validBundleData };
      (invalidBundle.subjects[0] as any).hints = [];

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });
  });

  describe('Lesson Structure Validation', () => {
    it('should reject lesson with missing required fields', async () => {
      const invalidBundle = { ...validBundleData };
      delete (invalidBundle.subjects[0].lessons[0] as any).lesson_id;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject lesson with invalid difficulty', async () => {
      const invalidBundle = { ...validBundleData };
      invalidBundle.subjects[0].lessons[0].difficulty = 'invalid' as any;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject lesson with negative estimated_minutes', async () => {
      const invalidBundle = { ...validBundleData };
      invalidBundle.subjects[0].lessons[0].estimated_minutes = -5;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });
  });

  describe('Quiz Structure Validation', () => {
    it('should reject quiz with missing required fields', async () => {
      const invalidBundle = { ...validBundleData };
      delete (invalidBundle.subjects[0].quizzes[0] as any).quiz_id;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject quiz with invalid difficulty', async () => {
      const invalidBundle = { ...validBundleData };
      invalidBundle.subjects[0].quizzes[0].difficulty = 'impossible' as any;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject quiz with empty questions array', async () => {
      const invalidBundle = { ...validBundleData };
      invalidBundle.subjects[0].quizzes[0].questions = [];

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject quiz with negative time_limit', async () => {
      const invalidBundle = { ...validBundleData };
      invalidBundle.subjects[0].quizzes[0].time_limit = -10;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });
  });

  describe('Study Track Validation', () => {
    it('should reject study track with missing required fields', async () => {
      const invalidBundle = { ...validBundleData };
      delete (invalidBundle.subjects[0].study_track as any).track_id;

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should reject study track with empty weeks array', async () => {
      const invalidBundle = { ...validBundleData };
      invalidBundle.subjects[0].study_track!.weeks = [];

      const { base64, checksum } = createCompressedBundle(invalidBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(false);
    });

    it('should accept bundle without study track (optional field)', async () => {
      const bundleWithoutStudyTrack = {
        ...validBundleData,
        subjects: [
          {
            ...validBundleData.subjects[0],
            // Remove study_track by not including it
          }
        ]
      };
      delete bundleWithoutStudyTrack.subjects[0].study_track;

      const { base64, checksum } = createCompressedBundle(bundleWithoutStudyTrack);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      try {
        const isValid = await service.validateBundle(mockBundlePath, checksum);
        expect(isValid).toBe(true);
      } catch (error) {
        console.error('Test failed with error:', error);
        throw error;
      }
    });
  });

  describe('Valid Bundle Acceptance', () => {
    it('should accept valid bundle with all required fields', async () => {
      const { base64, checksum } = createCompressedBundle(validBundleData);
      
      // Ensure mock is properly set
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);
      
      // Verify mock is set correctly
      expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(0);

      try {
        const isValid = await service.validateBundle(mockBundlePath, checksum);
        
        // Verify the mock was called
        expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(mockBundlePath, { encoding: 'base64' });
        
        expect(isValid).toBe(true);
      } catch (error) {
        console.error('Test failed with error:', error);
        console.error('Mock call count:', (FileSystem.readAsStringAsync as jest.Mock).mock.calls.length);
        console.error('Mock calls:', (FileSystem.readAsStringAsync as jest.Mock).mock.calls);
        throw error;
      }
    });

    it('should accept bundle with multiple subjects', async () => {
      const multiSubjectBundle = {
        ...validBundleData,
        subjects: [
          ...validBundleData.subjects,
          {
            subject: 'Science',
            lessons: [],
            quizzes: [],
            hints: {},
          },
        ],
      };

      const { base64, checksum } = createCompressedBundle(multiSubjectBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(true);
    });

    it('should accept bundle with empty lessons and quizzes arrays', async () => {
      const emptyContentBundle = {
        ...validBundleData,
        subjects: [
          {
            subject: 'Mathematics',
            lessons: [],
            quizzes: [],
            hints: {},
          },
        ],
      };

      const { base64, checksum } = createCompressedBundle(emptyContentBundle);
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      const isValid = await service.validateBundle(mockBundlePath, checksum);
      expect(isValid).toBe(true);
    });
  });
});