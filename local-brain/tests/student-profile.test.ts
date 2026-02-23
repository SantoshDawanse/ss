/**
 * Unit tests for StudentProfileService.
 * Tests UUID generation, profile creation, and SecureStore integration.
 */

import { StudentProfileService, StudentProfile } from '../src/services/StudentProfileService';
import * as SecureStore from 'expo-secure-store';

// Mock expo-secure-store
jest.mock('expo-secure-store');

// Mock expo-crypto
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '550e8400-e29b-41d4-a716-446655440000'),
}));

describe('StudentProfileService', () => {
  let service: StudentProfileService;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Get service instance
    service = StudentProfileService.getInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = StudentProfileService.getInstance();
      const instance2 = StudentProfileService.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('hasProfile', () => {
    it('should return true when profile exists', async () => {
      // Mock SecureStore to return a profile
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
        JSON.stringify({ studentId: 'test-id', studentName: 'Test Student' })
      );

      const result = await service.hasProfile();
      
      expect(result).toBe(true);
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('sikshya_sathi_student_profile');
    });

    it('should return false when profile does not exist', async () => {
      // Mock SecureStore to return null
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const result = await service.hasProfile();
      
      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      // Mock SecureStore to throw error
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('SecureStore error'));

      const result = await service.hasProfile();
      
      expect(result).toBe(false);
    });
  });

  describe('loadProfile', () => {
    it('should load existing profile', async () => {
      const mockProfile = {
        studentId: '550e8400-e29b-41d4-a716-446655440000',
        studentName: 'Rajesh Kumar',
        createdAt: '2024-01-15T10:30:00Z',
      };

      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(mockProfile));

      const result = await service.loadProfile();
      
      expect(result).toEqual(mockProfile);
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('sikshya_sathi_student_profile');
    });

    it('should return null when no profile exists', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const result = await service.loadProfile();
      
      expect(result).toBeNull();
    });

    it('should handle corrupted profile data', async () => {
      // Mock corrupted JSON
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('invalid-json');
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await service.loadProfile();
      
      expect(result).toBeNull();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('sikshya_sathi_student_profile');
    });

    it('should handle profile with missing fields', async () => {
      // Mock profile with missing studentName
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
        JSON.stringify({ studentId: 'test-id' })
      );
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await service.loadProfile();
      
      expect(result).toBeNull();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('sikshya_sathi_student_profile');
    });
  });

  describe('createProfile', () => {
    it('should create profile with valid name', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await service.createProfile('Rajesh Kumar');
      
      expect(result.studentId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.studentName).toBe('Rajesh Kumar');
      expect(result.createdAt).toBeDefined();
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'sikshya_sathi_student_profile',
        expect.stringContaining('550e8400-e29b-41d4-a716-446655440000')
      );
    });

    it('should trim whitespace from student name', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await service.createProfile('  Rajesh Kumar  ');
      
      expect(result.studentName).toBe('Rajesh Kumar');
    });

    it('should throw error for empty name', async () => {
      await expect(service.createProfile('')).rejects.toThrow('Student name cannot be empty');
    });

    it('should throw error for whitespace-only name', async () => {
      await expect(service.createProfile('   ')).rejects.toThrow('Student name cannot be empty');
    });

    it('should handle SecureStore errors', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('Storage error'));

      await expect(service.createProfile('Test Student')).rejects.toThrow('Profile creation failed');
    });
  });

  describe('UUID Generation', () => {
    it('should generate valid UUID v4 format', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await service.createProfile('Test Student');
      
      // UUID v4 format: 8-4-4-4-12 hexadecimal
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result.studentId).toMatch(uuidPattern);
    });
  });
});
