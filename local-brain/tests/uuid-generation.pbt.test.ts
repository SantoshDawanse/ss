/**
 * Property-based test for UUID generation format validation.
 * 
 * **Validates: Requirements 3.1, 3.2**
 * 
 * This test verifies that all generated UUIDs from StudentProfileService
 * match the UUID v4 format pattern (8-4-4-4-12 hexadecimal).
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
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { StudentProfileService } from '../src/services/StudentProfileService';

describe('UUID Generation Format Property Tests', () => {
  /**
   * Property 4: UUID Generation Format
   * 
   * For any profile creation, the generated studentId should be a valid 
   * UUID v4 format matching the pattern 8-4-4-4-12 hexadecimal characters.
   * 
   * **Validates: Requirements 3.1, 3.2**
   */
  it('should generate valid UUID v4 format for all profile creations', async () => {
    // UUID v4 format pattern: 8-4-4-4-12 hexadecimal
    // The 4th group must start with 8, 9, a, or b (variant bits)
    // The 3rd group must start with 4 (version 4)
    const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary student names for testing
        fc.string({ minLength: 1, maxLength: 50 }).filter(name => name.trim().length > 0),
        async (studentName) => {
          // Create a new profile with the generated name
          const service = StudentProfileService.getInstance();
          const profile = await service.createProfile(studentName);

          // Verify the studentId matches UUID v4 format
          const isValidUUID = uuidV4Pattern.test(profile.studentId);

          // Additional checks for UUID v4 specific requirements
          const parts = profile.studentId.toLowerCase().split('-');
          const hasCorrectStructure = 
            parts.length === 5 &&
            parts[0].length === 8 &&
            parts[1].length === 4 &&
            parts[2].length === 4 &&
            parts[3].length === 4 &&
            parts[4].length === 12;

          // Check version bit (3rd group starts with '4')
          const hasCorrectVersion = parts[2][0] === '4';

          // Check variant bits (4th group starts with 8, 9, a, or b)
          const hasCorrectVariant = ['8', '9', 'a', 'b'].includes(parts[3][0]);

          return isValidUUID && hasCorrectStructure && hasCorrectVersion && hasCorrectVariant;
        }
      ),
      { numRuns: 100 }
    );
  });
});
