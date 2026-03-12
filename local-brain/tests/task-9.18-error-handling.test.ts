/**
 * Tests for Task 9.18: Error handling and user feedback
 * 
 * This test suite validates:
 * - User-friendly error messages for each error type (Requirement 26.1-26.7)
 * - Structured error logging with category, severity, message, details
 * - Error event emission for UI notification
 */

import {
  ErrorCode,
  ErrorResponse,
  ErrorEvent,
  ErrorEventListener,
  handleConnectivityFailureError,
  handleUploadFailureError,
  handleDownloadFailureError,
  handleChecksumMismatchError,
  handleAuthenticationFailureError,
  handleBundleImportFailureError,
  handleNetworkTimeoutError,
  handleContentNotFoundError,
  handleCorruptedBundleError,
  handleDatabaseError,
  handleStorageFullError,
  handleSyncFailureError,
  createErrorResponse,
  logError,
  addErrorEventListener,
  removeAllErrorEventListeners,
  errorEventEmitter,
} from '../src/utils/errorHandling';

describe('Task 9.18: Error Handling and User Feedback', () => {
  let errorEvents: ErrorEvent[] = [];
  let removeListener: (() => void) | null = null;

  beforeEach(() => {
    // Clear error events
    errorEvents = [];
    
    // Add error event listener
    const listener: ErrorEventListener = (event) => {
      errorEvents.push(event);
    };
    removeListener = addErrorEventListener(listener);
  });

  afterEach(() => {
    // Remove listener
    if (removeListener) {
      removeListener();
      removeListener = null;
    }
    
    // Clear all listeners
    removeAllErrorEventListeners();
  });

  describe('User-Friendly Error Messages (Requirement 26.1-26.7)', () => {
    test('connectivity failure shows user-friendly message', () => {
      // Requirement 26.1: "No internet connection. Sync will retry when online."
      const response = handleConnectivityFailureError();
      
      expect(response.userMessage).toBe('No internet connection. Sync will retry when online.');
      expect(response.errorCode).toBe(ErrorCode.CONNECTIVITY_FAILED);
      expect(response.retryable).toBe(true);
      expect(response.category).toBe('network');
      expect(response.severity).toBe('medium');
      
      // Verify error event was emitted
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].userMessage).toBe('No internet connection. Sync will retry when online.');
    });

    test('upload failure shows user-friendly message', () => {
      // Requirement 26.2: "Upload failed. Your progress is saved and will sync later."
      const error = new Error('Network timeout');
      const response = handleUploadFailureError(error, 2);
      
      expect(response.userMessage).toBe('Upload failed. Your progress is saved and will sync later.');
      expect(response.errorCode).toBe(ErrorCode.UPLOAD_FAILED);
      expect(response.retryable).toBe(true);
      expect(response.category).toBe('network');
      expect(response.severity).toBe('medium');
      
      // Verify error event was emitted
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].userMessage).toBe('Upload failed. Your progress is saved and will sync later.');
    });

    test('download failure shows user-friendly message', () => {
      // Requirement 26.3: "Download failed. Please try again when you have a stable connection."
      const error = new Error('Connection reset');
      const response = handleDownloadFailureError(error, 1);
      
      expect(response.userMessage).toBe('Download failed. Please try again when you have a stable connection.');
      expect(response.errorCode).toBe(ErrorCode.DOWNLOAD_FAILED);
      expect(response.retryable).toBe(true);
      expect(response.category).toBe('network');
      expect(response.severity).toBe('medium');
      
      // Verify error event was emitted
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].userMessage).toBe('Download failed. Please try again when you have a stable connection.');
    });

    test('checksum verification failure shows user-friendly message', () => {
      // Requirement 26.4: "Content verification failed. Retrying download."
      const response = handleChecksumMismatchError('expected123', 'actual456');
      
      expect(response.userMessage).toBe('Content verification failed. Retrying download.');
      expect(response.errorCode).toBe(ErrorCode.CHECKSUM_MISMATCH);
      expect(response.retryable).toBe(true);
      expect(response.category).toBe('content');
      expect(response.severity).toBe('high');
      
      // Verify error event was emitted
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].userMessage).toBe('Content verification failed. Retrying download.');
    });

    test('authentication failure shows user-friendly message', () => {
      // Requirement 26.5: "Session expired. Please log in again."
      const response = handleAuthenticationFailureError();
      
      expect(response.userMessage).toBe('Session expired. Please log in again.');
      expect(response.errorCode).toBe(ErrorCode.AUTH_FAILED);
      expect(response.retryable).toBe(false);
      expect(response.category).toBe('auth');
      expect(response.severity).toBe('high');
      
      // Verify error event was emitted
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].userMessage).toBe('Session expired. Please log in again.');
    });

    test('bundle import failure shows user-friendly message', () => {
      // Requirement 26.6: "Content import failed. Please contact support."
      const error = new Error('Invalid bundle format');
      const response = handleBundleImportFailureError(error, 'bundle123');
      
      expect(response.userMessage).toBe('Content import failed. Please contact support.');
      expect(response.errorCode).toBe(ErrorCode.IMPORT_FAILED);
      expect(response.retryable).toBe(false);
      expect(response.category).toBe('content');
      expect(response.severity).toBe('high');
      
      // Verify error event was emitted
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].userMessage).toBe('Content import failed. Please contact support.');
    });

    test('error messages avoid technical jargon', () => {
      // Requirement 26.7: Error messages shall be user-friendly and avoid technical jargon
      const responses = [
        handleConnectivityFailureError(),
        handleUploadFailureError(new Error('HTTP 500'), 1),
        handleDownloadFailureError(new Error('ECONNRESET'), 1),
        handleChecksumMismatchError('abc', 'def'),
        handleAuthenticationFailureError(),
        handleBundleImportFailureError(new Error('JSON parse error')),
      ];

      responses.forEach(response => {
        // Check that user messages don't contain technical terms
        const technicalTerms = [
          'HTTP', 'ECONNRESET', 'JSON', 'SHA-256', 'TLS', 'SSL',
          'TCP', 'UDP', 'API', 'REST', 'SQL', 'database',
          'exception', 'stack trace', 'null pointer', 'undefined'
        ];
        
        technicalTerms.forEach(term => {
          expect(response.userMessage.toLowerCase()).not.toContain(term.toLowerCase());
        });
        
        // Check that messages are helpful and actionable
        expect(response.userMessage.length).toBeGreaterThan(10);
        expect(response.userMessage).toMatch(/[.!]$/); // Ends with punctuation
      });
    });
  });

  describe('Structured Error Logging', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(console, 'warn').mockImplementation();
      jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    test('logs error with category, severity, message, and details', () => {
      const category = 'network';
      const severity = 'high';
      const message = 'Upload failed after retries';
      const details = { attempt: 3, error: 'timeout' };

      logError(category, severity, message, details);

      expect(console.error).toHaveBeenCalledWith(
        '[ERROR]',
        expect.objectContaining({
          timestamp: expect.any(String),
          category,
          severity,
          message,
          details,
        })
      );
    });

    test('uses appropriate console method based on severity', () => {
      logError('system', 'critical', 'Critical error', {});
      expect(console.error).toHaveBeenCalled();

      logError('system', 'high', 'High error', {});
      expect(console.error).toHaveBeenCalled();

      logError('system', 'medium', 'Medium error', {});
      expect(console.warn).toHaveBeenCalled();

      logError('system', 'low', 'Low error', {});
      expect(console.log).toHaveBeenCalled();
    });

    test('includes stack trace when provided', () => {
      const stackTrace = 'Error: test\n    at test.js:1:1';
      logError('system', 'high', 'Test error', {}, stackTrace);

      expect(console.error).toHaveBeenCalledWith(
        '[ERROR]',
        expect.objectContaining({
          stackTrace,
        })
      );
    });
  });

  describe('Error Event Emission for UI Notification', () => {
    test('emits error events when errors occur', () => {
      const error = new Error('Test error');
      handleUploadFailureError(error, 1);

      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]).toMatchObject({
        errorCode: ErrorCode.UPLOAD_FAILED,
        userMessage: 'Upload failed. Your progress is saved and will sync later.',
        category: 'network',
        severity: 'medium',
        timestamp: expect.any(Number),
        retryable: true,
      });
    });

    test('supports multiple error event listeners', () => {
      const events1: ErrorEvent[] = [];
      const events2: ErrorEvent[] = [];

      const remove1 = addErrorEventListener((event) => events1.push(event));
      const remove2 = addErrorEventListener((event) => events2.push(event));

      handleConnectivityFailureError();

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
      expect(errorEvents).toHaveLength(1); // From beforeEach listener

      remove1();
      remove2();
    });

    test('handles listener errors gracefully', () => {
      const faultyListener: ErrorEventListener = () => {
        throw new Error('Listener error');
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      addErrorEventListener(faultyListener);
      handleConnectivityFailureError();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in error event listener:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    test('can remove all listeners', () => {
      const events: ErrorEvent[] = [];
      addErrorEventListener((event) => events.push(event));

      removeAllErrorEventListeners();
      handleConnectivityFailureError();

      expect(events).toHaveLength(0);
      expect(errorEvents).toHaveLength(0); // beforeEach listener was also removed
    });
  });

  describe('Additional Error Handlers', () => {
    test('handles network timeout errors', () => {
      const response = handleNetworkTimeoutError('upload', 2);
      
      expect(response.userMessage).toBe('Connection timeout. Retrying...');
      expect(response.errorCode).toBe(ErrorCode.NETWORK_TIMEOUT);
      expect(response.retryable).toBe(true);
      expect(response.category).toBe('network');
    });

    test('handles content not found errors', () => {
      const response = handleContentNotFoundError('lesson123');
      
      expect(response.userMessage).toBe('Content not found. Please sync to download new content.');
      expect(response.errorCode).toBe(ErrorCode.CONTENT_NOT_FOUND);
      expect(response.retryable).toBe(false);
      expect(response.category).toBe('content');
    });

    test('handles corrupted bundle errors', () => {
      const response = handleCorruptedBundleError('bundle123', 'invalid format');
      
      expect(response.userMessage).toBe('Bundle is corrupted. Re-downloading...');
      expect(response.errorCode).toBe(ErrorCode.CORRUPTED_BUNDLE);
      expect(response.retryable).toBe(true);
      expect(response.category).toBe('content');
    });

    test('handles database errors with different types', () => {
      // Test corruption error
      const corruptError = new Error('database disk image is malformed');
      const corruptResponse = handleDatabaseError(corruptError, 'insert');
      
      expect(corruptResponse.userMessage).toBe('Database corrupted. Attempting recovery...');
      expect(corruptResponse.errorCode).toBe(ErrorCode.DATABASE_CORRUPTED);
      expect(corruptResponse.severity).toBe('high');

      // Test read-only error
      const readOnlyError = new Error('attempt to write a readonly database');
      const readOnlyResponse = handleDatabaseError(readOnlyError, 'update');
      
      expect(readOnlyResponse.userMessage).toBe('Database in read-only mode. Some features may be limited.');
      expect(readOnlyResponse.errorCode).toBe(ErrorCode.DATABASE_READONLY);
      expect(readOnlyResponse.retryable).toBe(false);

      // Test generic database error
      const genericError = new Error('constraint failed');
      const genericResponse = handleDatabaseError(genericError, 'delete');
      
      expect(genericResponse.userMessage).toBe('Database error occurred. Retrying...');
      expect(genericResponse.errorCode).toBe(ErrorCode.DATABASE_ERROR);
      expect(genericResponse.retryable).toBe(true);
    });

    test('handles storage full errors', () => {
      const response = handleStorageFullError(1000000, 500000);
      
      expect(response.userMessage).toBe('Storage full. Please free up space.');
      expect(response.errorCode).toBe(ErrorCode.STORAGE_FULL);
      expect(response.retryable).toBe(false);
      expect(response.category).toBe('storage');
      expect(response.severity).toBe('high');
    });

    test('handles generic sync failures', () => {
      const error = new Error('Unexpected error');
      const response = handleSyncFailureError(error, 'download');
      
      expect(response.userMessage).toBe('Sync failed. Will retry automatically.');
      expect(response.errorCode).toBe(ErrorCode.SYNC_FAILED);
      expect(response.retryable).toBe(true);
      expect(response.category).toBe('sync');
    });
  });

  describe('Custom Error Response Creation', () => {
    test('creates structured error response', () => {
      const response = createErrorResponse(
        'CUSTOM_ERROR',
        'Internal error message',
        'User-friendly message',
        'system',
        'medium',
        true,
        30,
        { context: 'test' }
      );

      expect(response).toMatchObject({
        errorCode: 'CUSTOM_ERROR',
        message: 'Internal error message',
        userMessage: 'User-friendly message',
        category: 'system',
        severity: 'medium',
        retryable: true,
        retryAfter: 30,
        details: { context: 'test' },
      });

      // Verify error event was emitted
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].userMessage).toBe('User-friendly message');
    });
  });

  describe('Error Response Structure Validation', () => {
    test('all error handlers return complete ErrorResponse structure', () => {
      const handlers = [
        () => handleConnectivityFailureError(),
        () => handleUploadFailureError(new Error('test'), 1),
        () => handleDownloadFailureError(new Error('test'), 1),
        () => handleChecksumMismatchError('a', 'b'),
        () => handleAuthenticationFailureError(),
        () => handleBundleImportFailureError(new Error('test')),
        () => handleNetworkTimeoutError('test', 1),
        () => handleContentNotFoundError('test'),
        () => handleCorruptedBundleError('test', 'reason'),
        () => handleDatabaseError(new Error('test'), 'operation'),
        () => handleStorageFullError(1000, 500),
        () => handleSyncFailureError(new Error('test'), 'phase'),
      ];

      handlers.forEach((handler, index) => {
        const response = handler();
        
        expect(response).toHaveProperty('errorCode');
        expect(response).toHaveProperty('message');
        expect(response).toHaveProperty('userMessage');
        expect(response).toHaveProperty('retryable');
        expect(response).toHaveProperty('category');
        expect(response).toHaveProperty('severity');
        
        expect(typeof response.errorCode).toBe('string');
        expect(typeof response.message).toBe('string');
        expect(typeof response.userMessage).toBe('string');
        expect(typeof response.retryable).toBe('boolean');
        expect(typeof response.category).toBe('string');
        expect(typeof response.severity).toBe('string');
        
        expect(response.errorCode.length).toBeGreaterThan(0);
        expect(response.message.length).toBeGreaterThan(0);
        expect(response.userMessage.length).toBeGreaterThan(0);
      });
    });
  });
});