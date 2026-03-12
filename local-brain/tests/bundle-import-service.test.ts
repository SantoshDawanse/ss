/**
 * Unit tests for BundleImportService
 * 
 * Tests Task 7.1 requirements:
 * - Constructor accepting publicKey parameter
 * - importBundle method with checksum verification
 * - validateBundle method for pre-import checks
 * - getBundleMetadata method for metadata extraction
 * 
 * Tests Task 7.2 requirements:
 * - Calculate SHA-256 hash using crypto-js
 * - Compare calculated vs expected checksum
 * - Delete file on mismatch and throw error
 * - Log both expected and actual values on failure
 */

import { BundleImportService } from '../src/services/BundleImportService';
import * as FileSystem from 'expo-file-system/legacy';
import pako from 'pako';
import CryptoJS from 'crypto-js';

// Mock dependencies
jest.mock('expo-file-system/legacy');
jest.mock('../src/database/DatabaseManager');

describe('BundleImportService - Task 7.1', () => {
  let service: BundleImportService;
  const mockPublicKey = 'mock-rsa-public-key';
  const mockBundlePath = '/mock/path/bundle.gz';

  beforeEach(() => {
    // Create service instance with publicKey
    service = new BundleImportService(mockPublicKey);
    
    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should accept publicKey parameter', () => {
      const testKey = 'test-public-key';
      const testService = new BundleImportService(testKey);
      
      expect(testService).toBeInstanceOf(BundleImportService);
    });
  });

  describe('getBundleMetadata', () => {
    it('should extract metadata without full import', async () => {
      // Create mock bundle data
      const mockBundleData = {
        bundle_id: 'bundle-123',
        student_id: 'student-456',
        valid_from: '2024-01-01T00:00:00Z',
        valid_until: '2024-12-31T23:59:59Z',
        total_size: 5242880,
        checksum: '',
        subjects: [
          { subject: 'Mathematics', lessons: [], quizzes: [], hints: {} },
          { subject: 'Science', lessons: [], quizzes: [], hints: {} },
        ],
      };

      // Compress the bundle data
      const jsonString = JSON.stringify(mockBundleData);
      const compressed = pako.gzip(jsonString);
      const base64 = Buffer.from(compressed).toString('base64');

      // Mock file read
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      // Get metadata
      const metadata = await service.getBundleMetadata(mockBundlePath);

      // Verify metadata
      expect(metadata).not.toBeNull();
      expect(metadata?.bundleId).toBe('bundle-123');
      expect(metadata?.studentId).toBe('student-456');
      expect(metadata?.validFrom).toEqual(new Date('2024-01-01T00:00:00Z'));
      expect(metadata?.validUntil).toEqual(new Date('2024-12-31T23:59:59Z'));
      expect(metadata?.totalSize).toBe(5242880);
      expect(metadata?.subjectCount).toBe(2);
    });

    it('should return null on decompression error', async () => {
      // Mock file read to return invalid data
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('invalid-base64');

      const metadata = await service.getBundleMetadata(mockBundlePath);

      expect(metadata).toBeNull();
    });
  });

  describe('validateBundle', () => {
    it('should validate bundle with correct checksum', async () => {
      // Create mock bundle data
      const mockBundleData = {
        bundle_id: 'bundle-123',
        student_id: 'student-456',
        valid_from: '2024-01-01T00:00:00Z',
        valid_until: '2024-12-31T23:59:59Z',
        total_size: 5242880,
        checksum: '',
        subjects: [
          { subject: 'Mathematics', lessons: [], quizzes: [], hints: {} },
        ],
      };

      // Compress the bundle data
      const jsonString = JSON.stringify(mockBundleData);
      const compressed = pako.gzip(jsonString);
      const base64 = Buffer.from(compressed).toString('base64');

      // Calculate expected checksum using crypto-js approach
      const wordArray = CryptoJS.enc.Base64.parse(base64);
      const hash = CryptoJS.SHA256(wordArray);
      const expectedChecksum = hash.toString(CryptoJS.enc.Hex);

      // Mock file read
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      // Validate bundle
      const isValid = await service.validateBundle(mockBundlePath, expectedChecksum);

      expect(isValid).toBe(true);
    });

    it('should reject bundle with incorrect checksum', async () => {
      // Mock file read
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('some-base64-data');

      // Mock deleteAsync
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Validate with wrong checksum
      const isValid = await service.validateBundle(mockBundlePath, 'wrong-checksum');

      expect(isValid).toBe(false);
      // Verify file was deleted
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(mockBundlePath, { idempotent: true });
    });

    it('should reject bundle with invalid structure', async () => {
      // Create invalid bundle data (missing required fields)
      const invalidBundleData = {
        bundle_id: 'bundle-123',
        // missing student_id
        valid_from: '2024-01-01T00:00:00Z',
        valid_until: '2024-12-31T23:59:59Z',
        total_size: 5242880,
        checksum: '',
        subjects: [],
      };

      // Compress the invalid bundle data
      const jsonString = JSON.stringify(invalidBundleData);
      const compressed = pako.gzip(jsonString);
      const base64 = Buffer.from(compressed).toString('base64');

      // Calculate checksum
      const wordArray = CryptoJS.enc.Base64.parse(base64);
      const hash = CryptoJS.SHA256(wordArray);
      const expectedChecksum = hash.toString(CryptoJS.enc.Hex);

      // Mock file read
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      // Validate bundle - should fail due to missing student_id
      const isValid = await service.validateBundle(mockBundlePath, expectedChecksum);

      expect(isValid).toBe(false);
    });
  });

  describe('importBundle', () => {
    it('should have importBundle method', () => {
      expect(service.importBundle).toBeDefined();
      expect(typeof service.importBundle).toBe('function');
    });

    it('should verify checksum before import', async () => {
      // Mock file read to return invalid data
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('invalid-data');
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Attempt import with wrong checksum
      await expect(
        service.importBundle(mockBundlePath, 'expected-checksum')
      ).rejects.toThrow();
    });
  });
});

describe('BundleImportService - Task 7.2: Checksum Verification', () => {
  let service: BundleImportService;
  const mockPublicKey = 'mock-rsa-public-key';
  const mockBundlePath = '/mock/path/bundle.gz';
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new BundleImportService(mockPublicKey);
    jest.clearAllMocks();
    
    // Spy on console methods to verify logging
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('SHA-256 Hash Calculation', () => {
    it('should calculate SHA-256 hash using crypto-js', async () => {
      const testData = 'test-bundle-content';
      const base64Data = Buffer.from(testData).toString('base64');
      
      // Calculate expected hash
      const wordArray = CryptoJS.enc.Base64.parse(base64Data);
      const hash = CryptoJS.SHA256(wordArray);
      const expectedChecksum = hash.toString(CryptoJS.enc.Hex);

      // Mock file read
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64Data);

      // Create a minimal valid bundle for decompression
      const mockBundleData = {
        bundle_id: 'test-bundle',
        student_id: 'test-student',
        valid_from: '2024-01-01T00:00:00Z',
        valid_until: '2024-12-31T23:59:59Z',
        total_size: 100,
        checksum: '',
        subjects: [],
      };
      const compressed = pako.gzip(JSON.stringify(mockBundleData));
      const compressedBase64 = Buffer.from(compressed).toString('base64');
      
      // Calculate checksum for compressed data
      const compressedWordArray = CryptoJS.enc.Base64.parse(compressedBase64);
      const compressedHash = CryptoJS.SHA256(compressedWordArray);
      const compressedChecksum = compressedHash.toString(CryptoJS.enc.Hex);

      // Mock file read to return compressed data
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(compressedBase64);

      // Validate with correct checksum
      const isValid = await service.validateBundle(mockBundlePath, compressedChecksum);

      expect(isValid).toBe(true);
    });
  });

  describe('Checksum Comparison', () => {
    it('should compare calculated vs expected checksum', async () => {
      const testData = 'test-content';
      const base64Data = Buffer.from(testData).toString('base64');
      
      // Calculate correct checksum
      const wordArray = CryptoJS.enc.Base64.parse(base64Data);
      const hash = CryptoJS.SHA256(wordArray);
      const correctChecksum = hash.toString(CryptoJS.enc.Hex);

      // Mock file read
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64Data);
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Test with correct checksum - should not throw
      const mockBundleData = {
        bundle_id: 'test',
        student_id: 'test',
        valid_from: '2024-01-01T00:00:00Z',
        valid_until: '2024-12-31T23:59:59Z',
        total_size: 100,
        checksum: '',
        subjects: [],
      };
      const compressed = pako.gzip(JSON.stringify(mockBundleData));
      const compressedBase64 = Buffer.from(compressed).toString('base64');
      const compressedWordArray = CryptoJS.enc.Base64.parse(compressedBase64);
      const compressedHash = CryptoJS.SHA256(compressedWordArray);
      const compressedChecksum = compressedHash.toString(CryptoJS.enc.Hex);

      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(compressedBase64);
      
      const validResult = await service.validateBundle(mockBundlePath, compressedChecksum);
      expect(validResult).toBe(true);

      // Test with incorrect checksum - should throw
      const wrongChecksum = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const invalidResult = await service.validateBundle(mockBundlePath, wrongChecksum);
      expect(invalidResult).toBe(false);
    });

    it('should handle case-insensitive checksum comparison', async () => {
      const mockBundleData = {
        bundle_id: 'test',
        student_id: 'test',
        valid_from: '2024-01-01T00:00:00Z',
        valid_until: '2024-12-31T23:59:59Z',
        total_size: 100,
        checksum: '',
        subjects: [],
      };
      const compressed = pako.gzip(JSON.stringify(mockBundleData));
      const base64 = Buffer.from(compressed).toString('base64');
      
      const wordArray = CryptoJS.enc.Base64.parse(base64);
      const hash = CryptoJS.SHA256(wordArray);
      const checksumLower = hash.toString(CryptoJS.enc.Hex).toLowerCase();
      const checksumUpper = checksumLower.toUpperCase();

      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

      // Both should be valid
      const lowerValid = await service.validateBundle(mockBundlePath, checksumLower);
      expect(lowerValid).toBe(true);

      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);
      const upperValid = await service.validateBundle(mockBundlePath, checksumUpper);
      expect(upperValid).toBe(true);
    });
  });

  describe('File Deletion on Mismatch', () => {
    it('should delete file when checksum does not match', async () => {
      const testData = 'test-content';
      const base64Data = Buffer.from(testData).toString('base64');
      const wrongChecksum = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64Data);
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Attempt validation with wrong checksum
      const isValid = await service.validateBundle(mockBundlePath, wrongChecksum);

      expect(isValid).toBe(false);
      // Verify deleteAsync was called with correct parameters
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(mockBundlePath, { idempotent: true });
    });

    it('should handle file deletion errors gracefully', async () => {
      const testData = 'test-content';
      const base64Data = Buffer.from(testData).toString('base64');
      const wrongChecksum = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64Data);
      (FileSystem.deleteAsync as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      // Should still fail validation even if deletion fails
      const isValid = await service.validateBundle(mockBundlePath, wrongChecksum);

      expect(isValid).toBe(false);
      expect(FileSystem.deleteAsync).toHaveBeenCalled();
      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete corrupted file')
      );
    });
  });

  describe('Logging on Failure', () => {
    it('should log both expected and actual checksum values on mismatch', async () => {
      const testData = 'test-content';
      const base64Data = Buffer.from(testData).toString('base64');
      
      // Calculate actual checksum
      const wordArray = CryptoJS.enc.Base64.parse(base64Data);
      const hash = CryptoJS.SHA256(wordArray);
      const actualChecksum = hash.toString(CryptoJS.enc.Hex);
      
      const expectedChecksum = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64Data);
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Attempt validation
      await service.validateBundle(mockBundlePath, expectedChecksum);

      // Verify logging of both checksums
      expect(consoleErrorSpy).toHaveBeenCalledWith('Checksum mismatch detected:');
      expect(consoleErrorSpy).toHaveBeenCalledWith(`  Expected: ${expectedChecksum}`);
      expect(consoleErrorSpy).toHaveBeenCalledWith(`  Actual:   ${actualChecksum}`);
      expect(consoleErrorSpy).toHaveBeenCalledWith(`  File:     ${mockBundlePath}`);
    });

    it('should log file path on checksum failure', async () => {
      const testData = 'test-content';
      const base64Data = Buffer.from(testData).toString('base64');
      const wrongChecksum = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64Data);
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      await service.validateBundle(mockBundlePath, wrongChecksum);

      // Verify file path was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(`  File:     ${mockBundlePath}`);
    });
  });

  describe('Error Throwing on Mismatch', () => {
    it('should throw error with details when checksum does not match', async () => {
      const testData = 'test-content';
      const base64Data = Buffer.from(testData).toString('base64');
      
      // Calculate actual checksum
      const wordArray = CryptoJS.enc.Base64.parse(base64Data);
      const hash = CryptoJS.SHA256(wordArray);
      const actualChecksum = hash.toString(CryptoJS.enc.Hex);
      
      const expectedChecksum = 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64Data);
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Attempt import (which calls verifyChecksum internally)
      await expect(
        service.importBundle(mockBundlePath, expectedChecksum)
      ).rejects.toThrow(/Checksum verification failed/);
    });
  });

  describe('Integration with importBundle', () => {
    it('should perform checksum verification before decompression', async () => {
      const wrongChecksum = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('some-data');
      (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

      // Should fail at checksum verification, before attempting decompression
      await expect(
        service.importBundle(mockBundlePath, wrongChecksum)
      ).rejects.toThrow(/Checksum verification failed/);

      // Verify file was deleted
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(mockBundlePath, { idempotent: true });
    });
  });
});
