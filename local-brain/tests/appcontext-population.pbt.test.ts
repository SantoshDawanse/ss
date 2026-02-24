/**
 * Property-based test for AppContext population.
 * 
 * **Validates: Requirements 6.1**
 * 
 * This test verifies that when a student profile is loaded,
 * the AppContext receives the correct studentId from the loaded profile.
 * 
 * Note: This test focuses on the StudentProfileService.loadProfile() behavior
 * which is the core mechanism that AppContext uses to populate studentId.
 * The AppContext initialization logic calls loadProfile() and uses the result
 * to set the studentId state.
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

// Mock expo-constants
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        apiBaseUrl: 'https://test-api.example.com',
      },
    },
  },
}));

// Mock fetch to prevent actual network calls
global.fetch = jest.fn(() =>
  Promise.resolve({
    status: 201,
    json: () => Promise.resolve({ status: 'registered' }),
  })
) as jest.Mock;

import { StudentProfileService, StudentProfile } from '../src/services/StudentProfileService';

describe('AppContext Population Property Tests', () => {
  beforeEach(() => {
    // Clear mock store before each test
    Object.keys(mockStore).forEach(key => delete mockStore[key]);
    
    // Reset singleton instance to ensure clean state
    (StudentProfileService as any).instance = null;
    
    // Clear fetch mock
    (global.fetch as jest.Mock).mockClear();
  });

  /**
   * Property 9: AppContext Population
   * 
   * For any profile load operation, the AppContext should be updated 
   * with the studentId from the loaded profile.
   * 
   * This test verifies the core mechanism: StudentProfileService.loadProfile()
   * returns the correct studentId that AppContext will use to populate its state.
   * 
   * **Validates: Requirements 6.1**
   */
  it('should load profile with correct studentId for AppContext population', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary student names for testing
        fc.string({ minLength: 1, maxLength: 100 }).filter(name => name.trim().length > 0),
        async (studentName) => {
          // STEP 1: Create a profile using StudentProfileService
          const profileService = StudentProfileService.getInstance();
          const createdProfile = await profileService.createProfile(studentName);

          // STEP 2: Reset singleton to simulate app restart (when AppContext initializes)
          (StudentProfileService as any).instance = null;

          // STEP 3: Load the profile (this is what AppContext does in useEffect)
          const newProfileService = StudentProfileService.getInstance();
          const loadedProfile = await newProfileService.loadProfile();

          // STEP 4: Verify the loaded profile has the correct studentId
          // This is the value that AppContext will use to populate its studentId state
          if (!loadedProfile) {
            return false;
          }

          // The studentId from loadProfile() should match the created profile's studentId
          // This ensures AppContext will receive the correct studentId
          return loadedProfile.studentId === createdProfile.studentId;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Profile load returns null when no profile exists
   * 
   * Verifies that when no profile exists in SecureStore, loadProfile()
   * returns null, which AppContext uses to determine it should navigate
   * to onboarding instead of populating studentId.
   * 
   * **Validates: Requirements 1.1, 1.2**
   */
  it('should return null when no profile exists for AppContext to detect', async () => {
    // Ensure no profile exists in mock store
    Object.keys(mockStore).forEach(key => delete mockStore[key]);

    const profileService = StudentProfileService.getInstance();
    const loadedProfile = await profileService.loadProfile();

    // When no profile exists, loadProfile should return null
    // AppContext uses this to know it should navigate to onboarding
    expect(loadedProfile).toBeNull();
  });

  /**
   * Additional property: Profile data integrity for AppContext
   * 
   * Verifies that the profile loaded by StudentProfileService contains
   * all required fields (studentId and studentName) that AppContext needs.
   * 
   * **Validates: Requirements 4.1, 4.2, 6.1**
   */
  it('should load complete profile data for AppContext to use', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }).filter(name => name.trim().length > 0),
        async (studentName) => {
          // Create a profile
          const profileService = StudentProfileService.getInstance();
          const createdProfile = await profileService.createProfile(studentName);

          // Reset and load (simulating AppContext initialization)
          (StudentProfileService as any).instance = null;
          const newProfileService = StudentProfileService.getInstance();
          const loadedProfile = await newProfileService.loadProfile();

          if (!loadedProfile) {
            return false;
          }

          // Verify all required fields are present for AppContext
          const hasStudentId = typeof loadedProfile.studentId === 'string' && loadedProfile.studentId.length > 0;
          const hasStudentName = typeof loadedProfile.studentName === 'string' && loadedProfile.studentName.length > 0;
          
          // Verify the data matches what was created
          const studentIdMatches = loadedProfile.studentId === createdProfile.studentId;
          const studentNameMatches = loadedProfile.studentName === createdProfile.studentName;

          return hasStudentId && hasStudentName && studentIdMatches && studentNameMatches;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Profile persistence across multiple loads
   * 
   * Verifies that the profile can be loaded multiple times with consistent
   * results, which is important for AppContext reliability across app restarts.
   * 
   * **Validates: Requirements 4.1, 6.1**
   */
  it('should consistently load same studentId across multiple loads', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }).filter(name => name.trim().length > 0),
        async (studentName) => {
          // Create a profile
          const profileService = StudentProfileService.getInstance();
          const createdProfile = await profileService.createProfile(studentName);

          // Load the profile multiple times (simulating multiple app restarts)
          const loadedProfiles: StudentProfile[] = [];
          for (let i = 0; i < 5; i++) {
            (StudentProfileService as any).instance = null;
            const service = StudentProfileService.getInstance();
            const profile = await service.loadProfile();
            if (profile) {
              loadedProfiles.push(profile);
            }
          }

          // All loads should have succeeded
          if (loadedProfiles.length !== 5) {
            return false;
          }

          // All loaded profiles should have the same studentId
          const allStudentIdsMatch = loadedProfiles.every(
            profile => profile.studentId === createdProfile.studentId
          );

          return allStudentIdsMatch;
        }
      ),
      { numRuns: 100 }
    );
  });
});
