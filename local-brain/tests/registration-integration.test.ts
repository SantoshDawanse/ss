/**
 * Integration test for Cloud Brain registration with retry logic.
 * 
 * Tests the registerWithCloudBrain method behavior with different
 * HTTP response scenarios.
 */

import { StudentProfileService } from '../src/services/StudentProfileService';

// Mock expo-crypto
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '550e8400-e29b-41d4-a716-446655440000'),
}));

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        apiBaseUrl: 'https://test-api.example.com',
      },
    },
  },
}));

// Mock global fetch
global.fetch = jest.fn();

describe('Registration Integration Tests', () => {
  let service: StudentProfileService;

  beforeEach(() => {
    jest.clearAllMocks();
    (StudentProfileService as any).instance = null;
    service = StudentProfileService.getInstance();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should successfully register on first attempt with 201 response', async () => {
    // Mock successful registration
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 201,
      json: async () => ({
        studentId: '550e8400-e29b-41d4-a716-446655440000',
        studentName: 'Test Student',
        registrationTimestamp: '2024-01-15T10:30:00Z',
        status: 'registered',
      }),
    });

    const profile = await service.createProfile('Test Student');

    // Wait a bit for background registration to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(profile.studentId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Just verify the endpoint path is correct, not the full URL
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/students/register'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: '550e8400-e29b-41d4-a716-446655440000',
          studentName: 'Test Student',
        }),
      })
    );
  });

  it('should handle 200 response for existing student', async () => {
    // Mock idempotent response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        studentId: '550e8400-e29b-41d4-a716-446655440000',
        studentName: 'Test Student',
        registrationTimestamp: '2024-01-10T08:15:00Z',
        status: 'already_registered',
      }),
    });

    const profile = await service.createProfile('Test Student');

    // Wait for background registration
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(profile.studentId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should not retry on 400 validation error', async () => {
    // Mock validation error
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 400,
      json: async () => ({
        error: 'INVALID_UUID',
        message: 'studentId must be a valid UUID v4',
        retryable: false,
      }),
    });

    const profile = await service.createProfile('Test Student');

    // Wait for background registration
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(profile.studentId).toBe('550e8400-e29b-41d4-a716-446655440000');
    // Should only try once, no retries
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should retry on 503 service unavailable with exponential backoff', async () => {
    // Mock 503 errors followed by success
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        status: 503,
        json: async () => ({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable',
          retryable: true,
        }),
      })
      .mockResolvedValueOnce({
        status: 503,
        json: async () => ({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable',
          retryable: true,
        }),
      })
      .mockResolvedValueOnce({
        status: 201,
        json: async () => ({
          studentId: '550e8400-e29b-41d4-a716-446655440000',
          studentName: 'Test Student',
          registrationTimestamp: '2024-01-15T10:30:00Z',
          status: 'registered',
        }),
      });

    const profile = await service.createProfile('Test Student');

    // Wait for retries to complete (1s + 2s + processing time)
    await new Promise(resolve => setTimeout(resolve, 3500));

    expect(profile.studentId).toBe('550e8400-e29b-41d4-a716-446655440000');
    // Should have tried 3 times (2 failures + 1 success)
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('should retry on network error with exponential backoff', async () => {
    // Mock network errors followed by success
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        status: 201,
        json: async () => ({
          studentId: '550e8400-e29b-41d4-a716-446655440000',
          studentName: 'Test Student',
          registrationTimestamp: '2024-01-15T10:30:00Z',
          status: 'registered',
        }),
      });

    const profile = await service.createProfile('Test Student');

    // Wait for retry (1s + processing time)
    await new Promise(resolve => setTimeout(resolve, 1500));

    expect(profile.studentId).toBe('550e8400-e29b-41d4-a716-446655440000');
    // Should have tried 2 times (1 failure + 1 success)
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should proceed after max retries exceeded', async () => {
    // Mock all retries failing
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    const profile = await service.createProfile('Test Student');

    // Wait for all retries (1s + 2s + 4s + processing time)
    await new Promise(resolve => setTimeout(resolve, 7500));

    expect(profile.studentId).toBe('550e8400-e29b-41d4-a716-446655440000');
    // Should have tried 3 times (max retries)
    expect(global.fetch).toHaveBeenCalledTimes(3);
  }, 10000); // Increase timeout to 10 seconds

  it('should store profile locally before attempting registration', async () => {
    const SecureStore = require('expo-secure-store');
    
    // Mock registration to take some time
    (global.fetch as jest.Mock).mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({
        status: 201,
        json: async () => ({
          studentId: '550e8400-e29b-41d4-a716-446655440000',
          studentName: 'Test Student',
          registrationTimestamp: '2024-01-15T10:30:00Z',
          status: 'registered',
        }),
      }), 100))
    );

    const profile = await service.createProfile('Test Student');

    // Profile should be returned immediately (before registration completes)
    expect(profile.studentId).toBe('550e8400-e29b-41d4-a716-446655440000');
    
    // SecureStore should have been called before createProfile returns
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'sikshya_sathi_student_profile',
      expect.stringContaining('550e8400-e29b-41d4-a716-446655440000')
    );
  });
});
