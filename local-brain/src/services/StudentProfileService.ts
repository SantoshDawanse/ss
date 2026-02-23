/**
 * StudentProfileService handles student profile creation, persistence, and retrieval.
 * 
 * Features:
 * - UUID v4 generation for unique student IDs
 * - Secure local storage using Expo SecureStore
 * - Singleton pattern for service instance
 * - Profile existence checking
 * 
 * Requirements: 3.1, 3.2, 4.1, 4.2, 4.3
 */

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const PROFILE_KEY = 'sikshya_sathi_student_profile';

export interface StudentProfile {
  studentId: string;  // UUID v4
  studentName: string;
  createdAt?: string; // ISO 8601 timestamp
}

/**
 * Service for managing student profile creation and persistence.
 * Implements singleton pattern.
 */
export class StudentProfileService {
  private static instance: StudentProfileService | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance of StudentProfileService.
   */
  public static getInstance(): StudentProfileService {
    if (!StudentProfileService.instance) {
      StudentProfileService.instance = new StudentProfileService();
    }
    return StudentProfileService.instance;
  }

  /**
   * Check if a student profile exists in SecureStore.
   * 
   * @returns Promise<boolean> - true if profile exists, false otherwise
   */
  public async hasProfile(): Promise<boolean> {
    try {
      const profileJson = await SecureStore.getItemAsync(PROFILE_KEY);
      return profileJson !== null;
    } catch (error) {
      console.error('Failed to check profile existence:', error);
      return false;
    }
  }

  /**
   * Load existing student profile from SecureStore.
   * 
   * @returns Promise<StudentProfile | null> - profile if exists, null otherwise
   */
  public async loadProfile(): Promise<StudentProfile | null> {
    try {
      const profileJson = await SecureStore.getItemAsync(PROFILE_KEY);
      
      if (!profileJson) {
        return null;
      }

      const profile = JSON.parse(profileJson) as StudentProfile;
      
      // Validate profile structure
      if (!profile.studentId || !profile.studentName) {
        console.error('Invalid profile structure in SecureStore');
        // Delete corrupted profile
        await SecureStore.deleteItemAsync(PROFILE_KEY);
        return null;
      }

      console.log('Profile loaded successfully:', profile.studentId);
      return profile;
    } catch (error) {
      console.error('Failed to load profile:', error);
      
      // If JSON parse error or corruption, delete and return null
      try {
        await SecureStore.deleteItemAsync(PROFILE_KEY);
      } catch (deleteError) {
        console.error('Failed to delete corrupted profile:', deleteError);
      }
      
      return null;
    }
  }

  /**
   * Create a new student profile with generated UUID.
   * Stores profile in SecureStore.
   * 
   * @param studentName - Name of the student
   * @returns Promise<StudentProfile> - Created profile
   */
  public async createProfile(studentName: string): Promise<StudentProfile> {
    try {
      // Validate student name
      const trimmedName = studentName.trim();
      if (!trimmedName) {
        throw new Error('Student name cannot be empty');
      }

      // Generate UUID v4
      const studentId = this.generateStudentId();
      
      // Create profile object
      const profile: StudentProfile = {
        studentId,
        studentName: trimmedName,
        createdAt: new Date().toISOString(),
      };

      // Store profile in SecureStore
      await this.storeProfile(profile);

      console.log('Profile created successfully:', studentId);
      return profile;
    } catch (error) {
      console.error('Failed to create profile:', error);
      throw new Error(`Profile creation failed: ${error}`);
    }
  }

  /**
   * Store student profile in SecureStore.
   * 
   * @param profile - Profile to store
   * @private
   */
  private async storeProfile(profile: StudentProfile): Promise<void> {
    try {
      const profileJson = JSON.stringify(profile);
      await SecureStore.setItemAsync(PROFILE_KEY, profileJson);
      console.log('Profile stored in SecureStore');
    } catch (error) {
      console.error('Failed to store profile:', error);
      throw new Error(`Profile storage failed: ${error}`);
    }
  }

  /**
   * Generate a UUID v4 for student ID.
   * Uses expo-crypto for cryptographically secure random generation.
   * 
   * @returns string - UUID v4 in format 8-4-4-4-12 hexadecimal
   * @private
   */
  private generateStudentId(): string {
    try {
      // Use expo-crypto to generate UUID v4
      const uuid = Crypto.randomUUID();
      
      // Validate UUID format (8-4-4-4-12 hexadecimal pattern)
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(uuid)) {
        throw new Error('Generated UUID does not match v4 format');
      }

      return uuid;
    } catch (error) {
      console.error('UUID generation failed:', error);
      throw new Error(`UUID generation failed: ${error}`);
    }
  }
}
