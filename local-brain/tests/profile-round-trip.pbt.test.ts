/**
 * Property-based test for profile round trip persistence.
 * 
 * **Validates: Requirements 4.1, 4.2**
 * 
 * This test verifies that any student profile stored in SecureStore
 * can be loaded back with identical studentId and studentName data.
 */

import fc from 'fast-check';

// Mock expo-crypto to generate real UUIDs in test environment
jest.mock('expo-crypto', () => ({
  randomUUID: () => {
    // Generate a proper UUID v4 in test environment
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },
}));

// Mock expo-secure-store for testing
// We'll use a simple in-memory store to simulate SecureStore behavior
const mockStore: { [key: string]: string } = {};

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) => {
    return Promise.resolve(mockStore[key] || null);
  }),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockStore[key] = value;
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    delete mockStore[key];
    return Promise.resolve();
  }),
}));

import { StudentProfileService } from '../src/services/StudentProfileService';

describe('Profile Round Trip Persistence Property Tests', () => {
  beforeEach(() => {
    // Clear mock store before each test
    Object.keys(mockStore).forEach(key => delete mockStore[key]);
    
    // Reset singleton instance to ensure clean state
    (StudentProfileService as any).instance = null;
  });

  /**
   * Property 2: Profile Load Round Trip
   * 
   * For any student profile stored in SecureStore, loading the profile 
   * should retrieve a profile with the same studentId and studentName 
   * that was originally stored.
   * 
   * **Validates: Requirements 4.1, 4.2**
   */
  it('should retrieve stored profiles with identical studentId and studentName', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary student names for testing
        fc.string({ minLength: 1, maxLength: 100 }).filter(name => name.trim().length > 0),
        async (studentName) => {
          // Create a new profile with the generated name
          const service = StudentProfileService.getInstance();
          const createdProfile = await service.createProfile(studentName);

          // Load the profile back from SecureStore
          const loadedProfile = await service.loadProfile();

          // Verify the profile was loaded successfully
          if (!loadedProfile) {
            return false;
          }

          // Verify studentId is preserved exactly
          const studentIdMatches = loadedProfile.studentId === createdProfile.studentId;

          // Verify studentName is preserved exactly (after trimming)
          const studentNameMatches = loadedProfile.studentName === studentName.trim();

          // Both fields must match for round trip to be successful
          return studentIdMatches && studentNameMatches;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Profile persistence across service instances
   * 
   * Verifies that profiles can be loaded even after creating a new
   * service instance (simulating app restart).
   */
  it('should persist profiles across service instance recreation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }).filter(name => name.trim().length > 0),
        async (studentName) => {
          // Create profile with first service instance
          const service1 = StudentProfileService.getInstance();
          const createdProfile = await service1.createProfile(studentName);

          // Reset singleton to simulate app restart
          (StudentProfileService as any).instance = null;

          // Load profile with new service instance
          const service2 = StudentProfileService.getInstance();
          const loadedProfile = await service2.loadProfile();

          // Verify the profile was loaded successfully
          if (!loadedProfile) {
            return false;
          }

          // Verify data integrity after "restart"
          return (
            loadedProfile.studentId === createdProfile.studentId &&
            loadedProfile.studentName === createdProfile.studentName
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
