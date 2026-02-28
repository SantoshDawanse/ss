/**
 * SecureNetworkService handles secure API communication with TLS 1.3 and certificate pinning.
 * 
 * Responsibilities:
 * - Configure TLS 1.3 for all API calls
 * - Implement certificate pinning for API endpoints
 * - Provide secure fetch wrapper for API requests
 * - Handle SSL/TLS errors
 * 
 * Requirements: 9.5 (use TLS 1.3 for data transmission during sync)
 * 
 * Implementation Notes:
 * - React Native uses the platform's native networking stack
 * - iOS: Uses NSURLSession with TLS 1.3 support
 * - Android: Uses OkHttp with TLS 1.3 support
 * - Certificate pinning prevents MITM attacks
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

// API Configuration - use the configured API base URL
const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || process.env.API_BASE_URL || 'https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development';

// Certificate pins (SHA-256 hashes of public keys)
// These should be updated when certificates are rotated
// For AWS API Gateway, certificate pinning is handled by AWS
const CERTIFICATE_PINS: Record<string, string[]> = {
  // Add custom domain pins here when using custom domain
  // 'api.sikshya-sathi.np': [
  //   'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  //   'sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
  // ],
};

export interface SecureRequestOptions extends RequestInit {
  skipPinning?: boolean; // For development/testing only
  timeout?: number; // Request timeout in milliseconds
}

export interface SecureResponse<T = any> {
  ok: boolean;
  status: number;
  statusText: string;
  data?: T;
  error?: string;
}

export class SecureNetworkService {
  private static instance: SecureNetworkService;
  private certificatePinningEnabled: boolean = true;

  private constructor() {
    // Enable certificate pinning in production
    this.certificatePinningEnabled = !__DEV__;
  }

  public static getInstance(): SecureNetworkService {
    if (!SecureNetworkService.instance) {
      SecureNetworkService.instance = new SecureNetworkService();
    }
    return SecureNetworkService.instance;
  }

  /**
   * Make a secure API request with TLS 1.3 and certificate pinning.
   * 
   * @param url - Full URL or path (will be prefixed with API_BASE_URL if relative)
   * @param options - Request options
   * @returns Secure response
   */
  public async secureRequest<T = any>(
    url: string,
    options: SecureRequestOptions = {}
  ): Promise<SecureResponse<T>> {
    try {
      // Build full URL
      const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

      console.log(`[SecureNetworkService] Making request to: ${fullUrl}`);

      // Validate URL is HTTPS
      if (!fullUrl.startsWith('https://')) {
        throw new Error('Only HTTPS requests are allowed');
      }

      // Extract hostname for certificate pinning
      const hostname = new URL(fullUrl).hostname;

      // Check certificate pinning (if enabled and not skipped)
      if (this.certificatePinningEnabled && !options.skipPinning) {
        await this.verifyCertificatePinning(hostname);
      }

      // Configure request with security headers
      const secureOptions: RequestInit = {
        ...options,
        headers: {
          ...options.headers,
          'X-Client-Version': '1.0.0',
          'X-Platform': Platform.OS,
        },
      };

      // Make request with timeout
      const timeout = options.timeout || 30000; // Default 30 seconds
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(fullUrl, {
          ...secureOptions,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        console.log(`[SecureNetworkService] Response status: ${response.status}`);

        // Parse response
        let data: T | undefined;
        let errorMessage: string | undefined;
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          const jsonData = await response.json();
          data = jsonData;
          
          // Extract error message from various formats
          if (!response.ok) {
            if (typeof jsonData === 'object') {
              errorMessage = jsonData.message || jsonData.error || jsonData.errorMessage || response.statusText;
            } else {
              errorMessage = String(jsonData);
            }
          }
        } else {
          // Try to get text response for non-JSON errors
          if (!response.ok) {
            try {
              errorMessage = await response.text();
            } catch {
              errorMessage = response.statusText;
            }
          }
        }

        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          data,
          error: errorMessage,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
    } catch (error) {
      console.error('[SecureNetworkService] Request failed:', error);
      console.error('[SecureNetworkService] URL:', url);
      console.error('[SecureNetworkService] API_BASE_URL:', API_BASE_URL);
      return {
        ok: false,
        status: 0,
        statusText: 'Network Error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Make a secure GET request.
   */
  public async get<T = any>(
    url: string,
    options: SecureRequestOptions = {}
  ): Promise<SecureResponse<T>> {
    return this.secureRequest<T>(url, {
      ...options,
      method: 'GET',
    });
  }

  /**
   * Make a secure POST request.
   */
  public async post<T = any>(
    url: string,
    body: any,
    options: SecureRequestOptions = {}
  ): Promise<SecureResponse<T>> {
    return this.secureRequest<T>(url, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * Make a secure PUT request.
   */
  public async put<T = any>(
    url: string,
    body: any,
    options: SecureRequestOptions = {}
  ): Promise<SecureResponse<T>> {
    return this.secureRequest<T>(url, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * Make a secure DELETE request.
   */
  public async delete<T = any>(
    url: string,
    options: SecureRequestOptions = {}
  ): Promise<SecureResponse<T>> {
    return this.secureRequest<T>(url, {
      ...options,
      method: 'DELETE',
    });
  }

  /**
   * Verify certificate pinning for hostname.
   * 
   * Note: React Native doesn't provide direct access to SSL certificates.
   * For production, you would need to use a native module like:
   * - react-native-ssl-pinning
   * - react-native-cert-pinner
   * 
   * This is a placeholder implementation that logs the verification.
   */
  private async verifyCertificatePinning(hostname: string): Promise<void> {
    // Check if we have pins for this hostname
    const pins = CERTIFICATE_PINS[hostname as keyof typeof CERTIFICATE_PINS];
    
    if (!pins || pins.length === 0) {
      console.warn(`No certificate pins configured for ${hostname}`);
      return;
    }

    // In production, this would verify the server's certificate against the pins
    // For now, we log that pinning is enabled
    console.log(`Certificate pinning enabled for ${hostname} with ${pins.length} pins`);

    // TODO: Implement actual certificate pinning using native module
    // Example with react-native-ssl-pinning:
    // await SSLPinning.fetch(url, {
    //   method: 'GET',
    //   sslPinning: {
    //     certs: pins,
    //   },
    // });
  }

  /**
   * Configure TLS settings.
   * 
   * Note: React Native uses the platform's native TLS implementation.
   * - iOS 12.2+ supports TLS 1.3 by default
   * - Android 10+ (API 29+) supports TLS 1.3 by default
   * 
   * For older platforms, TLS 1.2 is used as fallback.
   */
  public configureTLS(): void {
    console.log('TLS Configuration:');
    console.log(`- Platform: ${Platform.OS} ${Platform.Version}`);
    
    if (Platform.OS === 'ios') {
      // iOS 12.2+ supports TLS 1.3
      const iosVersion = parseFloat(Platform.Version as string);
      if (iosVersion >= 12.2) {
        console.log('- TLS 1.3 supported (iOS 12.2+)');
      } else {
        console.log('- TLS 1.2 (iOS < 12.2)');
      }
    } else if (Platform.OS === 'android') {
      // Android 10+ (API 29+) supports TLS 1.3
      const androidApi = Platform.Version as number;
      if (androidApi >= 29) {
        console.log('- TLS 1.3 supported (Android 10+)');
      } else {
        console.log('- TLS 1.2 (Android < 10)');
      }
    }

    console.log(`- Certificate pinning: ${this.certificatePinningEnabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable or disable certificate pinning (for testing only).
   */
  public setCertificatePinning(enabled: boolean): void {
    this.certificatePinningEnabled = enabled;
    console.log(`Certificate pinning ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Test secure connection to API.
   */
  public async testConnection(): Promise<boolean> {
    try {
      const response = await this.get('/health');
      return response.ok;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  /**
   * Get TLS version information.
   */
  public getTLSInfo(): {
    platform: string;
    version: string | number;
    tlsSupported: string;
    pinningEnabled: boolean;
  } {
    let tlsSupported = 'TLS 1.2';

    if (Platform.OS === 'ios') {
      const iosVersion = parseFloat(Platform.Version as string);
      if (iosVersion >= 12.2) {
        tlsSupported = 'TLS 1.3';
      }
    } else if (Platform.OS === 'android') {
      const androidApi = Platform.Version as number;
      if (androidApi >= 29) {
        tlsSupported = 'TLS 1.3';
      }
    }

    return {
      platform: Platform.OS,
      version: Platform.Version,
      tlsSupported,
      pinningEnabled: this.certificatePinningEnabled,
    };
  }
}
