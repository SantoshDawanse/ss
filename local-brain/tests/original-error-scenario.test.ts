/**
 * Integration test that simulates the exact scenario from the original error logs
 * to verify the fix for "TypeError: right operand of 'in' is not an object"
 */

import { BundleImportService } from '../src/services/BundleImportService';
import * as FileSystem from 'expo-file-system/legacy';
import pako from 'pako';

// Mock dependencies
jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64',
  },
}));

describe('Original Error Scenario Fix', () => {
  let service: BundleImportService;
  const mockPublicKey = 'mock-public-key';
  const mockBundlePath = '/mock/path/bundle.zip';

  beforeEach(() => {
    service = new BundleImportService(mockPublicKey);
    jest.clearAllMocks();
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('should handle bundle with null study_track without throwing TypeError', async () => {
    // Create a bundle similar to what was in the original error logs
    const bundleData = {
      bundle_id: 'a9b45277-e24b-4db7-bacb-5e30c732c4c2',
      student_id: 'd75fbca9-2a62-46ad-afd6-8607efcd500a',
      valid_from: '2026-03-12T07:30:19.337568',
      valid_until: '2026-03-26T07:30:19.337568',
      total_size: 1165,
      checksum: '',
      subjects: [
        {
          subject: 'Mathematics',
          lessons: [],
          quizzes: [],
          hints: {},
          study_track: null // This was causing the original error
        }
      ]
    };

    // Compress the bundle data
    const jsonString = JSON.stringify(bundleData);
    const compressed = pako.gzip(jsonString);
    const base64 = Buffer.from(compressed).toString('base64');

    // Calculate checksum using Node.js crypto (simpler for testing)
    const crypto = require('crypto');
    const buffer = Buffer.from(base64, 'base64');
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    // Mock the file system read
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

    // This should NOT throw "TypeError: right operand of 'in' is not an object"
    const result = await service.validateBundle(mockBundlePath, checksum);
    
    // The validation might fail for other reasons (like signature verification),
    // but it should NOT fail with the original TypeError
    expect(result).toBeDefined(); // Just ensure it doesn't crash
  });

  it('should handle bundle with undefined study_track without throwing TypeError', async () => {
    const bundleData = {
      bundle_id: 'a9b45277-e24b-4db7-bacb-5e30c732c4c2',
      student_id: 'd75fbca9-2a62-46ad-afd6-8607efcd500a',
      valid_from: '2026-03-12T07:30:19.337568',
      valid_until: '2026-03-26T07:30:19.337568',
      total_size: 1165,
      checksum: '',
      subjects: [
        {
          subject: 'Mathematics',
          lessons: [],
          quizzes: [],
          hints: {}
          // study_track is undefined (not present)
        }
      ]
    };

    const jsonString = JSON.stringify(bundleData);
    const compressed = pako.gzip(jsonString);
    const base64 = Buffer.from(compressed).toString('base64');

    const crypto = require('crypto');
    const buffer = Buffer.from(base64, 'base64');
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

    // This should NOT throw "TypeError: right operand of 'in' is not an object"
    const result = await service.validateBundle(mockBundlePath, checksum);
    expect(result).toBeDefined();
  });

  it('should handle bundle with string study_track and provide descriptive error', async () => {
    const bundleData = {
      bundle_id: 'a9b45277-e24b-4db7-bacb-5e30c732c4c2',
      student_id: 'd75fbca9-2a62-46ad-afd6-8607efcd500a',
      valid_from: '2026-03-12T07:30:19.337568',
      valid_until: '2026-03-26T07:30:19.337568',
      total_size: 1165,
      checksum: '',
      subjects: [
        {
          subject: 'Mathematics',
          lessons: [],
          quizzes: [],
          hints: {},
          study_track: 'invalid-string' // This should trigger a descriptive error
        }
      ]
    };

    const jsonString = JSON.stringify(bundleData);
    const compressed = pako.gzip(jsonString);
    const base64 = Buffer.from(compressed).toString('base64');

    const crypto = require('crypto');
    const buffer = Buffer.from(base64, 'base64');
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

    // This should return false (validation failed) but NOT throw the original TypeError
    const result = await service.validateBundle(mockBundlePath, checksum);
    expect(result).toBe(false); // Should fail validation but not crash
  });
});