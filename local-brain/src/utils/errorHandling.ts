/**
 * Error handling utilities for Local Brain.
 * Implements Requirement 26: Error Handling and User Feedback
 */

/**
 * Standard error codes for Local Brain.
 */
export enum ErrorCode {
  // Content errors
  CONTENT_NOT_FOUND = 'CONTENT_NOT_FOUND',
  CORRUPTED_BUNDLE = 'CORRUPTED_BUNDLE',
  CHECKSUM_MISMATCH = 'CHECKSUM_MISMATCH',
  INVALID_BUNDLE_FORMAT = 'INVALID_BUNDLE_FORMAT',
  
  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  DATABASE_CORRUPTED = 'DATABASE_CORRUPTED',
  DATABASE_READONLY = 'DATABASE_READONLY',
  
  // Storage errors
  STORAGE_FULL = 'STORAGE_FULL',
  STORAGE_ERROR = 'STORAGE_ERROR',
  
  // Network errors
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
  CONNECTIVITY_FAILED = 'CONNECTIVITY_FAILED',
  
  // Authentication errors
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  
  // Sync errors
  SYNC_FAILED = 'SYNC_FAILED',
  IMPORT_FAILED = 'IMPORT_FAILED',
  
  // Generic errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Error severity levels for logging and monitoring.
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Error categories for classification and handling.
 */
export type ErrorCategory = 
  | 'network' 
  | 'storage' 
  | 'database' 
  | 'content' 
  | 'auth' 
  | 'sync' 
  | 'system';

/**
 * Structured error response format.
 */
export interface ErrorResponse {
  errorCode: string;
  message: string;
  userMessage: string; // User-friendly message for UI display
  retryable: boolean;
  retryAfter?: number; // seconds
  details?: Record<string, any>;
  category: ErrorCategory;
  severity: ErrorSeverity;
}

/**
 * Error event for UI notification.
 */
export interface ErrorEvent {
  errorCode: string;
  userMessage: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  timestamp: number;
  retryable: boolean;
  retryAfter?: number;
  details?: Record<string, any>;
}

/**
 * Error event listener type.
 */
export type ErrorEventListener = (event: ErrorEvent) => void;

/**
 * Global error event emitter for UI notifications.
 */
class ErrorEventEmitter {
  private listeners: Set<ErrorEventListener> = new Set();

  addListener(listener: ErrorEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }

  emit(event: ErrorEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in error event listener:', error);
      }
    });
  }
}

// Global error event emitter instance
export const errorEventEmitter = new ErrorEventEmitter();

/**
 * Retryable error class.
 */
export class RetryableError extends Error {
  errorCode: string;
  retryAfter?: number;
  details?: Record<string, any>;
  
  constructor(
    message: string,
    errorCode: string,
    retryAfter?: number,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'RetryableError';
    this.errorCode = errorCode;
    this.retryAfter = retryAfter;
    this.details = details;
  }
}

/**
 * Non-retryable error class.
 */
export class NonRetryableError extends Error {
  errorCode: string;
  details?: Record<string, any>;
  
  constructor(
    message: string,
    errorCode: string,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'NonRetryableError';
    this.errorCode = errorCode;
    this.details = details;
  }
}

/**
 * Exponential backoff retry decorator.
 */
export function exponentialBackoffRetry<T>(
  maxAttempts: number = 3,
  initialDelay: number = 1000,
  maxDelay: number = 30000,
  exponentialBase: number = 2
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]): Promise<T> {
      let attempt = 0;
      let delay = initialDelay;
      
      while (attempt < maxAttempts) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          attempt++;
          
          // Check if error is retryable
          if (error instanceof NonRetryableError) {
            throw error;
          }
          
          if (!(error instanceof RetryableError) && attempt >= maxAttempts) {
            throw error;
          }
          
          if (attempt >= maxAttempts) {
            console.error(
              `${propertyKey} failed after ${maxAttempts} attempts:`,
              error
            );
            throw error;
          }
          
          // Calculate delay with exponential backoff
          const currentDelay = Math.min(
            delay * Math.pow(exponentialBase, attempt - 1),
            maxDelay
          );
          
          console.warn(
            `${propertyKey} attempt ${attempt} failed. Retrying in ${currentDelay}ms...`,
            error
          );
          
          await new Promise(resolve => setTimeout(resolve, currentDelay));
        }
      }
      
      throw new Error(`${propertyKey} exceeded max attempts`);
    };
    
    return descriptor;
  };
}

/**
 * Handle connectivity check failures.
 * Requirement 26.1: Display user-friendly message for connectivity failures
 */
export function handleConnectivityFailureError(): ErrorResponse {
  const response: ErrorResponse = {
    errorCode: ErrorCode.CONNECTIVITY_FAILED,
    message: 'Network connectivity check failed',
    userMessage: 'No internet connection. Sync will retry when online.',
    retryable: true,
    retryAfter: 30,
    category: 'network',
    severity: 'medium',
    details: {
      action: 'Check internet connection and try again',
    },
  };

  // Emit error event for UI notification
  emitErrorEvent(response);
  return response;
}

/**
 * Handle upload failure errors.
 * Requirement 26.2: Display user-friendly message for upload failures
 */
export function handleUploadFailureError(
  error: Error,
  attempt: number
): ErrorResponse {
  const response: ErrorResponse = {
    errorCode: ErrorCode.UPLOAD_FAILED,
    message: `Upload failed on attempt ${attempt}: ${error.message}`,
    userMessage: 'Upload failed. Your progress is saved and will sync later.',
    retryable: true,
    retryAfter: Math.min(5 * Math.pow(2, attempt - 1), 30),
    category: 'network',
    severity: 'medium',
    details: {
      error: error.message,
      attempt,
      action: 'Logs queued for next sync. Operation continues.',
    },
  };

  // Emit error event for UI notification
  emitErrorEvent(response);
  return response;
}

/**
 * Handle download failure errors.
 * Requirement 26.3: Display user-friendly message for download failures
 */
export function handleDownloadFailureError(
  error: Error,
  attempt: number
): ErrorResponse {
  const response: ErrorResponse = {
    errorCode: ErrorCode.DOWNLOAD_FAILED,
    message: `Download failed on attempt ${attempt}: ${error.message}`,
    userMessage: 'Download failed. Please try again when you have a stable connection.',
    retryable: true,
    retryAfter: Math.min(5 * Math.pow(2, attempt - 1), 30),
    category: 'network',
    severity: 'medium',
    details: {
      error: error.message,
      attempt,
      action: 'Retrying download with exponential backoff',
    },
  };

  // Emit error event for UI notification
  emitErrorEvent(response);
  return response;
}

/**
 * Handle checksum mismatch errors.
 * Requirement 26.4: Display user-friendly message for checksum failures
 */
export function handleChecksumMismatchError(
  expectedChecksum: string,
  actualChecksum: string
): ErrorResponse {
  const response: ErrorResponse = {
    errorCode: ErrorCode.CHECKSUM_MISMATCH,
    message: `Bundle checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`,
    userMessage: 'Content verification failed. Retrying download.',
    retryable: true,
    retryAfter: 5,
    category: 'content',
    severity: 'high',
    details: {
      expectedChecksum,
      actualChecksum,
      action: 'Re-downloading bundle from last checkpoint',
    },
  };

  // Emit error event for UI notification
  emitErrorEvent(response);
  return response;
}

/**
 * Handle authentication failure errors.
 * Requirement 26.5: Display user-friendly message for authentication failures
 */
export function handleAuthenticationFailureError(): ErrorResponse {
  const response: ErrorResponse = {
    errorCode: ErrorCode.AUTH_FAILED,
    message: 'Authentication failed - token expired or invalid',
    userMessage: 'Session expired. Please log in again.',
    retryable: false,
    category: 'auth',
    severity: 'high',
    details: {
      action: 'User needs to re-authenticate',
    },
  };

  // Emit error event for UI notification
  emitErrorEvent(response);
  return response;
}

/**
 * Handle bundle import failure errors.
 * Requirement 26.6: Display user-friendly message for import failures
 */
export function handleBundleImportFailureError(
  error: Error,
  bundleId?: string
): ErrorResponse {
  const response: ErrorResponse = {
    errorCode: ErrorCode.IMPORT_FAILED,
    message: `Bundle import failed: ${error.message}`,
    userMessage: 'Content import failed. Please contact support.',
    retryable: false,
    category: 'content',
    severity: 'high',
    details: {
      error: error.message,
      bundleId,
      action: 'Contact support for assistance',
    },
  };

  // Emit error event for UI notification
  emitErrorEvent(response);
  return response;
}

/**
 * Handle network timeout errors.
 */
export function handleNetworkTimeoutError(
  operation: string,
  attempt: number
): ErrorResponse {
  const response: ErrorResponse = {
    errorCode: ErrorCode.NETWORK_TIMEOUT,
    message: `Network timeout during ${operation} (attempt ${attempt})`,
    userMessage: 'Connection timeout. Retrying...',
    retryable: true,
    retryAfter: Math.min(5 * Math.pow(2, attempt - 1), 30),
    category: 'network',
    severity: 'medium',
    details: {
      operation,
      attempt,
      action: 'Retrying with exponential backoff',
    },
  };

  // Emit error event for UI notification
  emitErrorEvent(response);
  return response;
}

/**
 * Handle content not found errors.
 */
export function handleContentNotFoundError(contentId: string): ErrorResponse {
  const response: ErrorResponse = {
    errorCode: ErrorCode.CONTENT_NOT_FOUND,
    message: `Content not found: ${contentId}`,
    userMessage: 'Content not found. Please sync to download new content.',
    retryable: false,
    category: 'content',
    severity: 'medium',
    details: {
      contentId,
      suggestion: 'Sync with Cloud Brain when connectivity is available',
    },
  };

  // Emit error event for UI notification
  emitErrorEvent(response);
  return response;
}

/**
 * Handle corrupted bundle errors.
 */
export function handleCorruptedBundleError(
  bundleId: string,
  reason: string
): ErrorResponse {
  const response: ErrorResponse = {
    errorCode: ErrorCode.CORRUPTED_BUNDLE,
    message: `Bundle corrupted: ${bundleId} - ${reason}`,
    userMessage: 'Bundle is corrupted. Re-downloading...',
    retryable: true,
    retryAfter: 5,
    category: 'content',
    severity: 'high',
    details: {
      bundleId,
      reason,
      action: 'Validating checksum and re-downloading if needed',
    },
  };

  // Emit error event for UI notification
  emitErrorEvent(response);
  return response;
}

/**
 * Handle database errors with recovery.
 */
export function handleDatabaseError(
  error: Error,
  operation: string
): ErrorResponse {
  const errorStr = error.message.toLowerCase();
  let errorCode = ErrorCode.DATABASE_ERROR;
  let userMessage = 'Database error occurred. Retrying...';
  let severity: ErrorSeverity = 'medium';
  
  // Check for corruption
  if (errorStr.includes('corrupt') || errorStr.includes('malformed')) {
    errorCode = ErrorCode.DATABASE_CORRUPTED;
    userMessage = 'Database corrupted. Attempting recovery...';
    severity = 'high';
  }
  
  // Check for read-only mode
  if (errorStr.includes('readonly') || errorStr.includes('read only')) {
    errorCode = ErrorCode.DATABASE_READONLY;
    userMessage = 'Database in read-only mode. Some features may be limited.';
    severity = 'medium';
  }
  
  const response: ErrorResponse = {
    errorCode,
    message: `Database error during ${operation}: ${error.message}`,
    userMessage,
    retryable: errorCode !== ErrorCode.DATABASE_READONLY,
    retryAfter: errorCode === ErrorCode.DATABASE_CORRUPTED ? 10 : 3,
    category: 'database',
    severity,
    details: {
      operation,
      error: error.message,
      action: errorCode === ErrorCode.DATABASE_CORRUPTED 
        ? 'Attempting database recovery or fallback to read-only mode'
        : 'Retrying database operation',
    },
  };

  // Emit error event for UI notification
  emitErrorEvent(response);
  return response;
}

/**
 * Handle storage full errors.
 */
export function handleStorageFullError(
  requiredSpace: number,
  availableSpace: number
): ErrorResponse {
  const response: ErrorResponse = {
    errorCode: ErrorCode.STORAGE_FULL,
    message: `Storage full: need ${requiredSpace} bytes, have ${availableSpace} bytes`,
    userMessage: 'Storage full. Please free up space.',
    retryable: false,
    category: 'storage',
    severity: 'high',
    details: {
      requiredSpace,
      availableSpace,
      suggestion: 'Archive old content or delete unused files',
    },
  };

  // Emit error event for UI notification
  emitErrorEvent(response);
  return response;
}

/**
 * Handle generic sync failures.
 */
export function handleSyncFailureError(
  error: Error,
  phase: string
): ErrorResponse {
  const response: ErrorResponse = {
    errorCode: ErrorCode.SYNC_FAILED,
    message: `Sync failed during ${phase}: ${error.message}`,
    userMessage: 'Sync failed. Will retry automatically.',
    retryable: true,
    retryAfter: 60,
    category: 'sync',
    severity: 'medium',
    details: {
      phase,
      error: error.message,
      action: 'Sync will be retried automatically',
    },
  };

  // Emit error event for UI notification
  emitErrorEvent(response);
  return response;
}

/**
 * Create a structured error response.
 */
export function createErrorResponse(
  errorCode: string,
  message: string,
  userMessage: string,
  category: ErrorCategory,
  severity: ErrorSeverity,
  retryable: boolean = false,
  retryAfter?: number,
  details?: Record<string, any>
): ErrorResponse {
  const response: ErrorResponse = {
    errorCode,
    message,
    userMessage,
    retryable,
    retryAfter,
    details,
    category,
    severity,
  };

  // Emit error event for UI notification
  emitErrorEvent(response);
  return response;
}

/**
 * Emit error event for UI notification.
 */
function emitErrorEvent(errorResponse: ErrorResponse): void {
  const event: ErrorEvent = {
    errorCode: errorResponse.errorCode,
    userMessage: errorResponse.userMessage,
    category: errorResponse.category,
    severity: errorResponse.severity,
    timestamp: Date.now(),
    retryable: errorResponse.retryable,
    retryAfter: errorResponse.retryAfter,
    details: errorResponse.details,
  };

  errorEventEmitter.emit(event);
}

/**
 * Log error with structured data.
 * Requirement 26: Log structured error data with category, severity, message, details
 */
export function logError(
  category: ErrorCategory,
  severity: ErrorSeverity,
  message: string,
  details?: Record<string, any>,
  stackTrace?: string
): void {
  const errorLog = {
    timestamp: new Date().toISOString(),
    category,
    severity,
    message,
    details,
    stackTrace,
  };
  
  // Log to console with appropriate level
  if (severity === 'critical' || severity === 'high') {
    console.error('[ERROR]', errorLog);
  } else if (severity === 'medium') {
    console.warn('[WARNING]', errorLog);
  } else {
    console.log('[INFO]', errorLog);
  }
  
  // TODO: In production, send to analytics/logging service
  // This could include services like Sentry, LogRocket, or custom analytics
}

/**
 * Add global error event listener.
 * Returns a function to remove the listener.
 */
export function addErrorEventListener(listener: ErrorEventListener): () => void {
  return errorEventEmitter.addListener(listener);
}

/**
 * Remove all error event listeners.
 */
export function removeAllErrorEventListeners(): void {
  errorEventEmitter.removeAllListeners();
}