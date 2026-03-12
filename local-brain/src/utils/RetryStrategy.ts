/**
 * RetryStrategy - Implements retry logic with exponential backoff and jitter.
 * 
 * Features:
 * - Configurable retry attempts (default 3)
 * - Exponential backoff: 1s, 2s, 4s
 * - Random jitter (0-1000ms) added to each delay
 * - Maximum delay cap at 30 seconds
 * - Error classification (retryable vs non-retryable)
 * 
 * Requirements: 4.1-4.7
 */

import { RetryableError, NonRetryableError } from './errorHandling';

/**
 * Configuration options for RetryStrategy.
 */
export interface RetryStrategyConfig {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitterMaxMs?: number;
}

/**
 * Result of a retry operation.
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
}

/**
 * RetryStrategy class with exponential backoff and jitter.
 * 
 * **Validates: Requirements 4.1-4.7**
 */
export class RetryStrategy {
  private readonly maxAttempts: number;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitterMaxMs: number;

  /**
   * Create a new RetryStrategy instance.
   * 
   * @param config - Configuration options
   */
  constructor(config: RetryStrategyConfig = {}) {
    this.maxAttempts = config.maxAttempts ?? 3;
    this.initialDelayMs = config.initialDelayMs ?? 1000;
    this.maxDelayMs = config.maxDelayMs ?? 30000;
    this.jitterMaxMs = config.jitterMaxMs ?? 1000;
  }

  /**
   * Execute an operation with retry logic.
   * 
   * @param operation - Async operation to execute
   * @param operationName - Name for logging purposes
   * @returns Promise resolving to the operation result
   * @throws NonRetryableError if a non-retryable error occurs
   * @throws Error if all retry attempts fail
   * 
   * **Validates: Requirements 4.1, 4.5, 4.7**
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.maxAttempts) {
      attempt++;

      try {
        const result = await operation();
        
        if (attempt > 1) {
          console.log(
            `[RetryStrategy] ${operationName} succeeded on attempt ${attempt}`
          );
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;

        // Non-retryable errors should be thrown immediately (Requirement 4.7)
        if (this.isNonRetryable(error)) {
          console.error(
            `[RetryStrategy] ${operationName} failed with non-retryable error:`,
            error
          );
          throw error;
        }

        // If we've exhausted all attempts, throw the error
        if (attempt >= this.maxAttempts) {
          console.error(
            `[RetryStrategy] ${operationName} failed after ${this.maxAttempts} attempts:`,
            error
          );
          break;
        }

        // Calculate backoff delay and wait before retrying
        const delayMs = this.calculateBackoff(attempt);
        console.warn(
          `[RetryStrategy] ${operationName} attempt ${attempt} failed. Retrying in ${delayMs}ms...`,
          error instanceof Error ? error.message : error
        );

        await this.sleep(delayMs);
      }
    }

    // All attempts failed
    throw new Error(
      `${operationName} failed after ${this.maxAttempts} attempts: ${lastError?.message}`
    );
  }

  /**
   * Calculate exponential backoff delay with jitter.
   * 
   * Formula: min(initialDelay * 2^(attempt-1), maxDelay) + random(0, jitterMax)
   * 
   * Examples:
   * - Attempt 1: 1000ms * 2^0 = 1000ms + jitter
   * - Attempt 2: 1000ms * 2^1 = 2000ms + jitter
   * - Attempt 3: 1000ms * 2^2 = 4000ms + jitter
   * 
   * @param attempt - Current attempt number (1-indexed)
   * @returns Delay in milliseconds
   * 
   * **Validates: Requirements 4.2, 4.3, 4.4**
   */
  calculateBackoff(attempt: number): number {
    // Calculate exponential backoff: initialDelay * 2^(attempt-1)
    const exponentialDelay = this.initialDelayMs * Math.pow(2, attempt - 1);
    
    // Cap at maximum delay (Requirement 4.4)
    const cappedDelay = Math.min(exponentialDelay, this.maxDelayMs);
    
    // Add random jitter between 0 and jitterMaxMs (Requirement 4.3)
    const jitter = Math.random() * this.jitterMaxMs;
    
    return cappedDelay + jitter;
  }

  /**
   * Classify an error as retryable or non-retryable.
   * 
   * Non-retryable errors:
   * - NonRetryableError instances
   * - Authentication errors (401)
   * - Authorization errors (403)
   * - Client errors (400, 404)
   * - Invalid bundle structure
   * - Disk space exhausted
   * 
   * Retryable errors:
   * - Network timeouts
   * - Server errors (500, 502, 503)
   * - Checksum mismatches
   * - Temporary file system errors
   * - Database lock errors
   * 
   * @param error - Error to classify
   * @returns true if non-retryable, false if retryable
   * 
   * **Validates: Requirement 4.7**
   */
  isNonRetryable(error: any): boolean {
    // Explicit non-retryable error class
    if (error instanceof NonRetryableError) {
      return true;
    }

    // Check for HTTP status codes in error message or properties
    if (error.status || error.statusCode) {
      const status = error.status || error.statusCode;
      
      // Authentication and authorization errors are non-retryable
      if (status === 401 || status === 403) {
        return true;
      }
      
      // Client errors (4xx except 408 timeout) are non-retryable
      if (status >= 400 && status < 500 && status !== 408) {
        return true;
      }
    }

    // Check error messages for non-retryable conditions
    const errorMessage = error.message?.toLowerCase() || '';
    
    // Disk space errors
    if (errorMessage.includes('disk full') || 
        errorMessage.includes('no space left') ||
        errorMessage.includes('storage full')) {
      return true;
    }
    
    // Invalid data errors
    if (errorMessage.includes('invalid bundle') ||
        errorMessage.includes('malformed') ||
        errorMessage.includes('parse error')) {
      return true;
    }

    // Default to retryable
    return false;
  }

  /**
   * Check if an error is retryable.
   * 
   * @param error - Error to check
   * @returns true if retryable, false if non-retryable
   */
  isRetryable(error: any): boolean {
    return !this.isNonRetryable(error);
  }

  /**
   * Get the maximum number of retry attempts.
   */
  getMaxAttempts(): number {
    return this.maxAttempts;
  }

  /**
   * Sleep for a specified duration.
   * 
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a default RetryStrategy instance.
 * 
 * Default configuration:
 * - maxAttempts: 3
 * - initialDelayMs: 1000 (1 second)
 * - maxDelayMs: 30000 (30 seconds)
 * - jitterMaxMs: 1000 (1 second)
 */
export function createDefaultRetryStrategy(): RetryStrategy {
  return new RetryStrategy({
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    jitterMaxMs: 1000,
  });
}
