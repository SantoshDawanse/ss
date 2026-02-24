/**
 * StudentProfileService handles student profile creation, persistence, and retrieval.
 * 
 * Features:
 * - UUID v4 generation for unique student IDs
 * - Secure local storage using Expo SecureStore
 * - Cloud Brain registration with retry logic
 * - Singleton pattern for service instance
 * - Profile existence checking
 * 
 * Requirements: 3.1, 3.2, 4.1, 4.2, 4.3, 5.1, 5.2, 5.5, 5.6
 */

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';

const PROFILE_KEY = 'sikshya_sathi_student_profile';
const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || process.env.API_BASE_URL || 'https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development';
const REGISTRATION_ENDPOINT = '/api/students/register';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s exponential backoff

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
   * Implements retry logic for device locked scenarios.
   * 
   * @returns Promise<boolean> - true if profile exists, false otherwise
   */
  public async hasProfile(): Promise<boolean> {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const profileJson = await SecureStore.getItemAsync(PROFILE_KEY);
        return profileJson !== null;
      } catch (error) {
        console.error(`Failed to check profile existence (attempt ${attempt + 1}/${maxRetries}):`, error);
        
        // Check if error is due to device being locked
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isDeviceLocked = errorMessage.includes('locked') || 
                              errorMessage.includes('unavailable') ||
                              errorMessage.includes('authentication');
        
        if (isDeviceLocked && attempt < maxRetries - 1) {
          console.log(`Device appears locked, retrying after ${retryDelay}ms...`);
          await this.sleep(retryDelay);
          continue;
        }
        
        // After max retries or non-lock error, treat as no profile
        if (attempt === maxRetries - 1) {
          console.warn('SecureStore access failed after retries, treating as no profile');
        }
        
        return false;
      }
    }
    
    return false;
  }

  /**
   * Load existing student profile from SecureStore.
   * Implements retry logic for device locked scenarios.
   * Handles corrupted profile data by deleting and returning null.
   * 
   * @returns Promise<StudentProfile | null> - profile if exists, null otherwise
   * @throws Error with user-friendly message if SecureStore is persistently unavailable
   */
  public async loadProfile(): Promise<StudentProfile | null> {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const profileJson = await SecureStore.getItemAsync(PROFILE_KEY);
        
        if (!profileJson) {
          return null;
        }

        // Parse and validate profile
        let profile: StudentProfile;
        try {
          profile = JSON.parse(profileJson) as StudentProfile;
        } catch (parseError) {
          console.error('Profile data is corrupted (JSON parse failed):', parseError);
          // Delete corrupted profile
          await this.deleteCorruptedProfile();
          throw new Error('Profile data was corrupted. Please create a new profile.');
        }
        
        // Validate profile structure
        if (!profile.studentId || !profile.studentName) {
          console.error('Invalid profile structure in SecureStore:', {
            hasStudentId: !!profile.studentId,
            hasStudentName: !!profile.studentName
          });
          // Delete corrupted profile
          await this.deleteCorruptedProfile();
          throw new Error('Profile data was corrupted. Please create a new profile.');
        }

        console.log('Profile loaded successfully:', profile.studentId);
        return profile;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // If this is a corruption error we threw, re-throw it
        if (errorMessage.includes('corrupted')) {
          throw error;
        }
        
        console.error(`Failed to load profile (attempt ${attempt + 1}/${maxRetries}):`, error);
        
        // Check if error is due to device being locked
        const isDeviceLocked = errorMessage.includes('locked') || 
                              errorMessage.includes('unavailable') ||
                              errorMessage.includes('authentication');
        
        if (isDeviceLocked && attempt < maxRetries - 1) {
          console.log(`Device appears locked, retrying after ${retryDelay}ms...`);
          await this.sleep(retryDelay);
          continue;
        }
        
        // After max retries, throw user-friendly error
        if (attempt === maxRetries - 1) {
          throw new Error('Unable to access secure storage. Please unlock your device and try again.');
        }
      }
    }
    
    return null;
  }
  
  /**
   * Delete corrupted profile from SecureStore.
   * Logs error if deletion fails but doesn't throw.
   * 
   * @private
   */
  private async deleteCorruptedProfile(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(PROFILE_KEY);
      console.log('Corrupted profile deleted from SecureStore');
    } catch (deleteError) {
      console.error('Failed to delete corrupted profile:', deleteError);
      // Don't throw - corruption is already handled
    }
  }

  /**
   * Create a new student profile with generated UUID.
   * Stores profile in SecureStore and registers with Cloud Brain.
   * 
   * Offline-first approach:
   * - Profile is stored locally BEFORE attempting cloud registration
   * - Returns immediately after local storage
   * - Cloud registration happens in background (fire-and-forget)
   * - Registration failures don't block user from using the app
   * 
   * @param studentName - Name of the student
   * @returns Promise<StudentProfile> - Created profile
   * 
   * Requirements: 5.1, 5.6
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

      // Store profile in SecureStore BEFORE attempting cloud registration
      await this.storeProfile(profile);

      console.log('Profile created and stored locally:', studentId);

      // Attempt cloud registration in background (fire-and-forget)
      // Don't await - return profile immediately (offline-first)
      this.registerWithCloudBrain(profile).catch(error => {
        console.error('Background registration failed (will retry on next sync):', error);
        // Error already logged in registerWithCloudBrain
      });

      return profile;
    } catch (error) {
      console.error('Failed to create profile:', error);
      
      // Provide user-friendly error message
      if (error instanceof Error) {
        throw error; // Re-throw with original message
      }
      throw new Error(`Profile creation failed: ${error}`);
    }
  }

  /**
   * Store student profile in SecureStore.
   * Implements retry logic for device locked scenarios.
   * 
   * @param profile - Profile to store
   * @throws Error with user-friendly message if storage fails after retries
   * @private
   */
  private async storeProfile(profile: StudentProfile): Promise<void> {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const profileJson = JSON.stringify(profile);
        await SecureStore.setItemAsync(PROFILE_KEY, profileJson);
        console.log('Profile stored in SecureStore');
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to store profile (attempt ${attempt + 1}/${maxRetries}):`, error);
        
        // Check if error is due to device being locked
        const isDeviceLocked = errorMessage.includes('locked') || 
                              errorMessage.includes('unavailable') ||
                              errorMessage.includes('authentication');
        
        if (isDeviceLocked && attempt < maxRetries - 1) {
          console.log(`Device appears locked, retrying after ${retryDelay}ms...`);
          await this.sleep(retryDelay);
          continue;
        }
        
        // After max retries, throw user-friendly error
        if (attempt === maxRetries - 1) {
          throw new Error('Unable to save profile to secure storage. Please unlock your device and try again.');
        }
      }
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

  /**
   * Register student profile with Cloud Brain API.
   * Implements exponential backoff retry logic for network failures.
   * 
   * Retry behavior:
   * - Network errors (timeout, DNS, connection): Retry with exponential backoff (1s, 2s, 4s)
   * - 503 Service Unavailable: Retry with exponential backoff
   * - 500 Internal Server Error: Retry with exponential backoff
   * - 400 Bad Request: No retry (validation error)
   * - After max retries: Queue for next sync, proceed anyway (offline-first)
   * 
   * @param profile - Profile to register
   * @returns Promise<void>
   * @private
   * 
   * Requirements: 5.1, 5.2, 5.5, 5.6
   */
  private async registerWithCloudBrain(profile: StudentProfile): Promise<void> {
    const url = `${API_BASE_URL}${REGISTRATION_ENDPOINT}`;
    const timeout = 10000; // 10 second timeout per request
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        console.log(`Registration attempt ${attempt + 1}/${MAX_RETRIES} for student ${profile.studentId}`);
        
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              studentId: profile.studentId,
              studentName: profile.studentName,
            }),
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);

          // Success cases: 201 (created) or 200 (already exists)
          if (response.status === 201 || response.status === 200) {
            const data = await response.json();
            console.log('Registration successful:', data.status);
            return;
          }

          // Validation error (400) - don't retry
          if (response.status === 400) {
            try {
              const error = await response.json();
              console.error('Registration validation error (no retry):', {
                error: error.error || 'VALIDATION_ERROR',
                message: error.message || 'Invalid request data',
                details: error.details || null
              });
            } catch (jsonError) {
              console.error('Registration validation error (400) - could not parse error response');
            }
            // Don't throw - proceed anyway (offline-first)
            // Profile is already saved locally, user can use the app
            return;
          }

          // Service unavailable (503) - retry
          if (response.status === 503) {
            console.warn(`Service unavailable (503), will retry after delay`);
            if (attempt < MAX_RETRIES - 1) {
              await this.sleep(RETRY_DELAYS[attempt]);
              continue;
            }
          }

          // Server error (500) - retry
          if (response.status === 500) {
            console.warn(`Server error (500), will retry after delay`);
            if (attempt < MAX_RETRIES - 1) {
              await this.sleep(RETRY_DELAYS[attempt]);
              continue;
            }
          }

          // Other errors - retry
          console.warn(`Registration failed with status ${response.status}, will retry`);
          if (attempt < MAX_RETRIES - 1) {
            await this.sleep(RETRY_DELAYS[attempt]);
            continue;
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Categorize network errors
        let errorType = 'unknown';
        if (errorMessage.includes('aborted') || errorMessage.includes('timeout')) {
          errorType = 'timeout';
        } else if (errorMessage.includes('DNS') || errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
          errorType = 'dns';
        } else if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('ECONNREFUSED')) {
          errorType = 'connection';
        }
        
        console.error(`Registration ${errorType} error (attempt ${attempt + 1}/${MAX_RETRIES}):`, errorMessage);
        
        // Retry on network errors
        if (attempt < MAX_RETRIES - 1) {
          console.log(`Retrying after ${RETRY_DELAYS[attempt]}ms...`);
          await this.sleep(RETRY_DELAYS[attempt]);
          continue;
        }
      }
    }

    // Max retries exceeded - queue for next sync
    console.warn('Registration failed after max retries, will queue for next sync');
    // TODO: Implement sync queue in future task
    // For now, just log and proceed (offline-first approach)
  }

  /**
   * Sleep helper for retry delays.
   * 
   * @param ms - Milliseconds to sleep
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
