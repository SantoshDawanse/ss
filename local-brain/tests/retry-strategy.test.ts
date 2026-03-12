/**
 * Unit tests for RetryStrategy.
 * 
 * Tests cover:
 * - Retry attempt limits
 * - Exponential backoff timing
 * - Jitter bounds
 * - Maximum delay cap
 * - Error classification (retryable vs non-retryable)
 * - Successful operations
 * - Failed operations after retries
 * 
 * Requirements: 4.1-4.7
 */

import { RetryStrategy, createDefaultRetryStrategy } from '../src/utils/RetryStrategy';
import { NonRetryableError, RetryableError } from '../src/utils/errorHandling';

describe('RetryStrategy', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('Configuration', () => {
    it('should use default configuration when no config provided', () => {
      const strategy = new RetryStrategy();
      expect(strategy.getMaxAttempts()).toBe(3);
    });

    it('should accept custom maxAttempts', () => {
      const strategy = new RetryStrategy({ maxAttempts: 5 });
      expect(strategy.getMaxAttempts()).toBe(5);
    });

    it('should create default strategy with factory function', () => {
      const strategy = createDefaultRetryStrategy();
      expect(strategy.getMaxAttempts()).toBe(3);
    });
  });

  describe('Requirement 4.1: Retry Attempt Limit', () => {
    it('should retry up to 3 times before failing', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 3 });
      let attemptCount = 0;

      const failingOperation = jest.fn(async () => {
        attemptCount++;
        throw new Error('Network error');
      });

      // Execute and catch immediately
      let caughtError: any = null;
      const promise = strategy.execute(failingOperation, 'test-operation').catch(e => {
        caughtError = e;
      });

      // Fast-forward through all retry delays
      await jest.runAllTimersAsync();
      await promise;

      expect(caughtError).toBeTruthy();
      expect(caughtError.message).toContain('test-operation failed after 3 attempts');
      expect(attemptCount).toBe(3);
    });

    it('should not exceed maxAttempts', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 2 });
      let attemptCount = 0;

      const failingOperation = jest.fn(async () => {
        attemptCount++;
        throw new Error('Network error');
      });

      // Execute and catch immediately
      let caughtError: any = null;
      const promise = strategy.execute(failingOperation, 'test-operation').catch(e => {
        caughtError = e;
      });

      // Fast-forward through all retry delays
      await jest.runAllTimersAsync();
      await promise;

      expect(caughtError).toBeTruthy();
      expect(caughtError.message).toContain('failed after 2 attempts');
      expect(attemptCount).toBe(2);
    });
  });

  describe('Requirement 4.2: Exponential Backoff Timing', () => {
    it('should calculate backoff with exponential pattern: 1s, 2s, 4s', () => {
      const strategy = new RetryStrategy({
        initialDelayMs: 1000,
        jitterMaxMs: 0, // Disable jitter for precise testing
      });

      const delay1 = strategy.calculateBackoff(1);
      const delay2 = strategy.calculateBackoff(2);
      const delay3 = strategy.calculateBackoff(3);

      expect(delay1).toBe(1000); // 1000 * 2^0 = 1000
      expect(delay2).toBe(2000); // 1000 * 2^1 = 2000
      expect(delay3).toBe(4000); // 1000 * 2^2 = 4000
    });

    it('should follow exponential pattern for higher attempts', () => {
      const strategy = new RetryStrategy({
        initialDelayMs: 1000,
        jitterMaxMs: 0,
        maxDelayMs: 100000, // High cap to test exponential growth
      });

      expect(strategy.calculateBackoff(4)).toBe(8000);  // 1000 * 2^3
      expect(strategy.calculateBackoff(5)).toBe(16000); // 1000 * 2^4
    });
  });

  describe('Requirement 4.3: Jitter Bounds', () => {
    it('should add jitter between 0 and 1000ms', () => {
      const strategy = new RetryStrategy({
        initialDelayMs: 1000,
        jitterMaxMs: 1000,
      });

      // Test multiple times to verify jitter range
      for (let i = 0; i < 10; i++) {
        const delay = strategy.calculateBackoff(1);
        expect(delay).toBeGreaterThanOrEqual(1000); // Base delay
        expect(delay).toBeLessThanOrEqual(2000);    // Base + max jitter
      }
    });

    it('should support custom jitter range', () => {
      const strategy = new RetryStrategy({
        initialDelayMs: 1000,
        jitterMaxMs: 500,
      });

      for (let i = 0; i < 10; i++) {
        const delay = strategy.calculateBackoff(1);
        expect(delay).toBeGreaterThanOrEqual(1000);
        expect(delay).toBeLessThanOrEqual(1500);
      }
    });

    it('should allow zero jitter', () => {
      const strategy = new RetryStrategy({
        initialDelayMs: 1000,
        jitterMaxMs: 0,
      });

      const delay = strategy.calculateBackoff(1);
      expect(delay).toBe(1000);
    });
  });

  describe('Requirement 4.4: Maximum Delay Cap', () => {
    it('should cap delay at 30 seconds', () => {
      const strategy = new RetryStrategy({
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        jitterMaxMs: 0,
      });

      // Attempt 10 would be 1000 * 2^9 = 512000ms without cap
      const delay = strategy.calculateBackoff(10);
      expect(delay).toBe(30000);
    });

    it('should apply cap before adding jitter', () => {
      const strategy = new RetryStrategy({
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        jitterMaxMs: 1000,
      });

      const delay = strategy.calculateBackoff(10);
      expect(delay).toBeGreaterThanOrEqual(30000);
      expect(delay).toBeLessThanOrEqual(31000); // Cap + jitter
    });

    it('should support custom maximum delay', () => {
      const strategy = new RetryStrategy({
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        jitterMaxMs: 0,
      });

      const delay = strategy.calculateBackoff(10);
      expect(delay).toBe(10000);
    });
  });

  describe('Requirement 4.7: Non-Retryable Authentication Errors', () => {
    it('should not retry on 401 authentication errors', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 3 });
      let attemptCount = 0;

      const authError = new Error('Unauthorized');
      (authError as any).status = 401;

      const failingOperation = jest.fn(async () => {
        attemptCount++;
        throw authError;
      });

      await expect(
        strategy.execute(failingOperation, 'auth-operation')
      ).rejects.toThrow('Unauthorized');

      expect(attemptCount).toBe(1); // Should fail immediately
    });

    it('should not retry on NonRetryableError instances', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 3 });
      let attemptCount = 0;

      const failingOperation = jest.fn(async () => {
        attemptCount++;
        throw new NonRetryableError(
          'Authentication failed',
          'AUTH_FAILED'
        );
      });

      await expect(
        strategy.execute(failingOperation, 'auth-operation')
      ).rejects.toThrow('Authentication failed');

      expect(attemptCount).toBe(1);
    });

    it('should not retry on 403 authorization errors', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 3 });
      let attemptCount = 0;

      const authError = new Error('Forbidden');
      (authError as any).status = 403;

      const failingOperation = jest.fn(async () => {
        attemptCount++;
        throw authError;
      });

      await expect(
        strategy.execute(failingOperation, 'auth-operation')
      ).rejects.toThrow('Forbidden');

      expect(attemptCount).toBe(1);
    });

    it('should not retry on 400 client errors', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 3 });
      let attemptCount = 0;

      const clientError = new Error('Bad Request');
      (clientError as any).status = 400;

      const failingOperation = jest.fn(async () => {
        attemptCount++;
        throw clientError;
      });

      await expect(
        strategy.execute(failingOperation, 'client-operation')
      ).rejects.toThrow('Bad Request');

      expect(attemptCount).toBe(1);
    });

    it('should not retry on disk full errors', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 3 });
      let attemptCount = 0;

      const failingOperation = jest.fn(async () => {
        attemptCount++;
        throw new Error('Disk full - no space left on device');
      });

      await expect(
        strategy.execute(failingOperation, 'storage-operation')
      ).rejects.toThrow('Disk full');

      expect(attemptCount).toBe(1);
    });

    it('should not retry on invalid bundle errors', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 3 });
      let attemptCount = 0;

      const failingOperation = jest.fn(async () => {
        attemptCount++;
        throw new Error('Invalid bundle structure');
      });

      await expect(
        strategy.execute(failingOperation, 'bundle-operation')
      ).rejects.toThrow('Invalid bundle');

      expect(attemptCount).toBe(1);
    });
  });

  describe('Error Classification', () => {
    it('should classify 500 errors as retryable', () => {
      const strategy = new RetryStrategy();
      const error = new Error('Internal Server Error');
      (error as any).status = 500;

      expect(strategy.isRetryable(error)).toBe(true);
      expect(strategy.isNonRetryable(error)).toBe(false);
    });

    it('should classify 503 errors as retryable', () => {
      const strategy = new RetryStrategy();
      const error = new Error('Service Unavailable');
      (error as any).status = 503;

      expect(strategy.isRetryable(error)).toBe(true);
    });

    it('should classify network timeout as retryable', () => {
      const strategy = new RetryStrategy();
      const error = new Error('Network timeout');

      expect(strategy.isRetryable(error)).toBe(true);
    });

    it('should classify RetryableError as retryable', () => {
      const strategy = new RetryStrategy();
      const error = new RetryableError(
        'Upload failed',
        'UPLOAD_FAILED',
        5
      );

      expect(strategy.isRetryable(error)).toBe(true);
    });

    it('should classify 408 timeout as retryable', () => {
      const strategy = new RetryStrategy();
      const error = new Error('Request Timeout');
      (error as any).status = 408;

      expect(strategy.isRetryable(error)).toBe(true);
    });
  });

  describe('Successful Operations', () => {
    it('should return result on first successful attempt', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 3 });
      const successfulOperation = jest.fn(async () => 'success');

      const result = await strategy.execute(successfulOperation, 'test-operation');

      expect(result).toBe('success');
      expect(successfulOperation).toHaveBeenCalledTimes(1);
    });

    it('should return result after retries', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 3 });
      let attemptCount = 0;

      const eventuallySuccessfulOperation = jest.fn(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary error');
        }
        return 'success';
      });

      const promise = strategy.execute(
        eventuallySuccessfulOperation,
        'test-operation'
      );

      // Fast-forward through retry delays
      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
    });

    it('should handle operations returning complex objects', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 3 });
      const complexResult = { data: [1, 2, 3], status: 'ok' };
      const operation = jest.fn(async () => complexResult);

      const result = await strategy.execute(operation, 'test-operation');

      expect(result).toEqual(complexResult);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle mixed success and failure attempts', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 5 });
      let attemptCount = 0;

      const operation = jest.fn(async () => {
        attemptCount++;
        // Fail on attempts 1, 2, 4, succeed on attempt 3
        if (attemptCount === 1 || attemptCount === 2 || attemptCount === 4) {
          throw new Error('Temporary error');
        }
        return 'success';
      });

      const promise = strategy.execute(operation, 'test-operation');

      // Fast-forward through retry delays
      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
    });

    it('should respect operation name in error messages', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 2 });
      const operation = jest.fn(async () => {
        throw new Error('Network error');
      });

      // Execute and catch immediately
      let caughtError: any = null;
      const promise = strategy.execute(operation, 'upload-logs').catch(e => {
        caughtError = e;
      });

      await jest.runAllTimersAsync();
      await promise;

      expect(caughtError).toBeTruthy();
      expect(caughtError.message).toContain('upload-logs failed after 2 attempts');
    });

    it('should handle operations with no name', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 1 });
      const operation = jest.fn(async () => {
        throw new Error('Error');
      });

      await expect(
        strategy.execute(operation)
      ).rejects.toThrow('operation failed after 1 attempts');
    });
  });

  describe('Edge Cases', () => {
    it('should handle maxAttempts of 1', async () => {
      const strategy = new RetryStrategy({ maxAttempts: 1 });
      let attemptCount = 0;

      const operation = jest.fn(async () => {
        attemptCount++;
        throw new Error('Error');
      });

      await expect(
        strategy.execute(operation, 'test-operation')
      ).rejects.toThrow();

      expect(attemptCount).toBe(1);
    });

    it('should handle very small initial delay', () => {
      const strategy = new RetryStrategy({
        initialDelayMs: 10,
        jitterMaxMs: 0,
      });

      expect(strategy.calculateBackoff(1)).toBe(10);
      expect(strategy.calculateBackoff(2)).toBe(20);
    });

    it('should handle errors without status property', () => {
      const strategy = new RetryStrategy();
      const error = new Error('Generic error');

      expect(strategy.isRetryable(error)).toBe(true);
    });

    it('should handle errors with statusCode instead of status', () => {
      const strategy = new RetryStrategy();
      const error = new Error('Unauthorized');
      (error as any).statusCode = 401;

      expect(strategy.isNonRetryable(error)).toBe(true);
    });
  });
});
