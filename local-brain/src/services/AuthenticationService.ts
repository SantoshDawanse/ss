/**
 * AuthenticationService handles JWT token management and authentication.
 * 
 * Responsibilities:
 * - Manage JWT access tokens and refresh tokens
 * - Implement token refresh logic
 * - Store tokens securely using device keychain
 * - Provide authentication state
 * 
 * Requirements: 9.4 (require authentication before accessing student profiles)
 * 
 * Implementation Notes:
 * - Uses expo-secure-store for secure token storage
 * - Access tokens expire after 24 hours
 * - Refresh tokens used for obtaining new access tokens
 * - Automatic token refresh before expiry
 */

import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'sikshya_sathi_access_token';
const REFRESH_TOKEN_KEY = 'sikshya_sathi_refresh_token';
const TOKEN_EXPIRY_KEY = 'sikshya_sathi_token_expiry';
const STUDENT_ID_KEY = 'sikshya_sathi_student_id';

// API Configuration
const API_BASE_URL = 'https://api.sikshya-sathi.np/v1';
const AUTH_LOGIN_ENDPOINT = '/auth/login';
const AUTH_REFRESH_ENDPOINT = '/auth/refresh';
const AUTH_LOGOUT_ENDPOINT = '/auth/logout';

// Token expiry buffer (refresh 5 minutes before expiry)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
}

export interface LoginCredentials {
  studentId: string;
  password: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  studentId: string | null;
  accessToken: string | null;
}

export class AuthenticationService {
  private static instance: AuthenticationService;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: number | null = null;
  private studentId: string | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): AuthenticationService {
    if (!AuthenticationService.instance) {
      AuthenticationService.instance = new AuthenticationService();
    }
    return AuthenticationService.instance;
  }

  /**
   * Initialize authentication service by loading stored tokens.
   * This should be called once during app initialization.
   */
  public async initialize(): Promise<void> {
    try {
      // Load tokens from secure storage
      this.accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      this.refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      this.studentId = await SecureStore.getItemAsync(STUDENT_ID_KEY);
      
      const expiryStr = await SecureStore.getItemAsync(TOKEN_EXPIRY_KEY);
      this.tokenExpiresAt = expiryStr ? parseInt(expiryStr, 10) : null;

      // Check if tokens are valid
      if (this.accessToken && this.tokenExpiresAt) {
        if (this.isTokenExpired()) {
          console.log('Access token expired, attempting refresh');
          await this.refreshAccessToken();
        } else {
          console.log('Loaded valid access token from secure store');
          this.scheduleTokenRefresh();
        }
      } else {
        console.log('No valid tokens found in secure store');
      }
    } catch (error) {
      console.error('Failed to initialize authentication service:', error);
      // Don't throw - allow app to continue to login screen
    }
  }

  /**
   * Login with student credentials.
   * 
   * @param credentials - Student ID and password
   * @returns Authentication tokens
   */
  public async login(credentials: LoginCredentials): Promise<AuthTokens> {
    try {
      const response = await fetch(`${API_BASE_URL}${AUTH_LOGIN_ENDPOINT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      const data = await response.json();
      const tokens: AuthTokens = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: Date.now() + (data.expiresIn * 1000), // Convert seconds to ms
      };

      // Store tokens securely
      await this.storeTokens(tokens, credentials.studentId);

      // Update in-memory state
      this.accessToken = tokens.accessToken;
      this.refreshToken = tokens.refreshToken;
      this.tokenExpiresAt = tokens.expiresAt;
      this.studentId = credentials.studentId;

      // Schedule automatic token refresh
      this.scheduleTokenRefresh();

      console.log('Login successful');
      return tokens;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  /**
   * Logout and clear all stored tokens.
   */
  public async logout(): Promise<void> {
    try {
      // Call logout endpoint if we have a token
      if (this.accessToken) {
        await fetch(`${API_BASE_URL}${AUTH_LOGOUT_ENDPOINT}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout API call failed:', error);
      // Continue with local cleanup even if API call fails
    }

    // Clear tokens from secure storage
    await this.clearTokens();

    // Clear in-memory state
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
    this.studentId = null;

    // Cancel refresh timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    console.log('Logout successful');
  }

  /**
   * Refresh access token using refresh token.
   * 
   * @returns New authentication tokens
   */
  public async refreshAccessToken(): Promise<AuthTokens> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(`${API_BASE_URL}${AUTH_REFRESH_ENDPOINT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: this.refreshToken,
        }),
      });

      if (!response.ok) {
        // Refresh token is invalid or expired
        await this.clearTokens();
        throw new Error('Token refresh failed - please login again');
      }

      const data = await response.json();
      const tokens: AuthTokens = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || this.refreshToken, // Some APIs don't rotate refresh tokens
        expiresAt: Date.now() + (data.expiresIn * 1000),
      };

      // Store new tokens
      await this.storeTokens(tokens, this.studentId!);

      // Update in-memory state
      this.accessToken = tokens.accessToken;
      this.refreshToken = tokens.refreshToken;
      this.tokenExpiresAt = tokens.expiresAt;

      // Schedule next refresh
      this.scheduleTokenRefresh();

      console.log('Token refresh successful');
      return tokens;
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
  }

  /**
   * Get current access token, refreshing if necessary.
   * 
   * @returns Valid access token
   */
  public async getAccessToken(): Promise<string> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    // Check if token needs refresh
    if (this.isTokenExpiringSoon()) {
      console.log('Token expiring soon, refreshing');
      await this.refreshAccessToken();
    }

    return this.accessToken;
  }

  /**
   * Get current authentication state.
   */
  public getAuthState(): AuthState {
    return {
      isAuthenticated: this.accessToken !== null && !this.isTokenExpired(),
      studentId: this.studentId,
      accessToken: this.accessToken,
    };
  }

  /**
   * Get current student ID.
   */
  public getStudentId(): string | null {
    return this.studentId;
  }

  /**
   * Check if user is authenticated.
   */
  public isAuthenticated(): boolean {
    return this.accessToken !== null && !this.isTokenExpired();
  }

  /**
   * Store tokens securely in device keychain.
   */
  private async storeTokens(tokens: AuthTokens, studentId: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });
      
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });
      
      await SecureStore.setItemAsync(TOKEN_EXPIRY_KEY, tokens.expiresAt.toString(), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });
      
      await SecureStore.setItemAsync(STUDENT_ID_KEY, studentId, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });

      console.log('Tokens stored securely');
    } catch (error) {
      console.error('Failed to store tokens:', error);
      throw new Error('Failed to store authentication tokens');
    }
  }

  /**
   * Clear all tokens from secure storage.
   */
  private async clearTokens(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      await SecureStore.deleteItemAsync(TOKEN_EXPIRY_KEY);
      await SecureStore.deleteItemAsync(STUDENT_ID_KEY);
      console.log('Tokens cleared from secure store');
    } catch (error) {
      console.error('Failed to clear tokens:', error);
    }
  }

  /**
   * Check if access token is expired.
   */
  private isTokenExpired(): boolean {
    if (!this.tokenExpiresAt) {
      return true;
    }
    return Date.now() >= this.tokenExpiresAt;
  }

  /**
   * Check if access token is expiring soon (within buffer time).
   */
  private isTokenExpiringSoon(): boolean {
    if (!this.tokenExpiresAt) {
      return true;
    }
    return Date.now() >= (this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS);
  }

  /**
   * Schedule automatic token refresh before expiry.
   */
  private scheduleTokenRefresh(): void {
    // Cancel existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.tokenExpiresAt) {
      return;
    }

    // Calculate time until refresh needed
    const timeUntilRefresh = this.tokenExpiresAt - Date.now() - TOKEN_REFRESH_BUFFER_MS;

    if (timeUntilRefresh > 0) {
      this.refreshTimer = setTimeout(async () => {
        try {
          console.log('Automatic token refresh triggered');
          await this.refreshAccessToken();
        } catch (error) {
          console.error('Automatic token refresh failed:', error);
        }
      }, timeUntilRefresh);

      console.log(`Token refresh scheduled in ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`);
    } else {
      // Token already needs refresh
      console.log('Token needs immediate refresh');
      this.refreshAccessToken().catch(error => {
        console.error('Immediate token refresh failed:', error);
      });
    }
  }
}
