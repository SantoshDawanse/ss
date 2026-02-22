/**
 * Error handling utilities for Local Brain.
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
  
  // Authentication errors
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  
  // Generic errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Structured error response format.
 */
export interface ErrorResponse {
  errorCode: string;
  message: string;
  retryable: boolean;
  retryAfter?: number; // seconds
  details?: Record<string, any>;
}

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
 * Handle content not found errors.
 */
export function handleContentNotFoundError(contentId: string): ErrorResponse {
  return {
    errorCode: ErrorCode.CONTENT_NOT_FOUND,
    message: 'Content not found. Please sync to download new content.',
    retryable: false,
    details: {
      contentId,
      suggestion: 'Sync with Cloud Brain when connectivity is available',
    },
  };
}

/**
 * Handle corrupted bundle errors.
 */
export function handleCorruptedBundleError(
  bundleId: string,
  reason: string
): ErrorResponse {
  return {
    errorCode: ErrorCode.CORRUPTED_BUNDLE,
    message: 'Bundle is corrupted. Re-downloading...',
    retryable: true,
    retryAfter: 5,
    details: {
      bundleId,
      reason,
      action: 'Validating checksum and re-downloading if needed',
    },
  };
}

/**
 * Handle database errors with recovery.
 */
export function handleDatabaseError(
  error: Error,
  operation: string
): ErrorResponse {
  const errorStr = error.message.toLowerCase();
  
  // Check for corruption
  if (errorStr.includes('corrupt') || errorStr.includes('malformed')) {
    return {
      errorCode: ErrorCode.DATABASE_CORRUPTED,
      message: 'Database corrupted. Attempting recovery...',
      retryable: true,
      retryAfter: 10,
      details: {
        operation,
        error: error.message,
        action: 'Attempting database recovery or fallback to read-only mode',
      },
    };
  }
  
  // Check for read-only mode
  if (errorStr.includes('readonly') || errorStr.includes('read only')) {
    return {
      errorCode: ErrorCode.DATABASE_READONLY,
      message: 'Database in read-only mode',
      retryable: false,
      details: {
        operation,
        error: error.message,
        action: 'Operating in read-only mode. Some features may be limited.',
      },
    };
  }
  
  // Generic database error
  return {
    errorCode: ErrorCode.DATABASE_ERROR,
    message: 'Database operation failed',
    retryable: true,
    retryAfter: 3,
    details: {
      operation,
      error: error.message,
    },
  };
}

/**
 * Handle storage full errors.
 */
export function handleStorageFullError(
  requiredSpace: number,
  availableSpace: number
): ErrorResponse {
  return {
    errorCode: ErrorCode.STORAGE_FULL,
    message: 'Storage full. Please free up space.',
    retryable: false,
    details: {
      requiredSpace,
      availableSpace,
      suggestion: 'Archive old content or delete unused files',
    },
  };
}

/**
 * Handle network timeout errors.
 */
export function handleNetworkTimeoutError(
  operation: string,
  attempt: number
): ErrorResponse {
  return {
    errorCode: ErrorCode.NETWORK_TIMEOUT,
    message: `Network timeout during ${operation}`,
    retryable: true,
    retryAfter: Math.min(5 * Math.pow(2, attempt - 1), 30),
    details: {
      operation,
      attempt,
      action: 'Retrying with exponential backoff',
    },
  };
}

/**
 * Handle checksum mismatch errors.
 */
export function handleChecksumMismatchError(
  expectedChecksum: string,
  actualChecksum: string
): ErrorResponse {
  return {
    errorCode: ErrorCode.CHECKSUM_MISMATCH,
    message: 'Bundle checksum mismatch. Re-downloading...',
    retryable: true,
    retryAfter: 5,
    details: {
      expectedChecksum,
      actualChecksum,
      action: 'Re-downloading bundle from last checkpoint',
    },
  };
}

/**
 * Handle upload failure errors.
 */
export function handleUploadFailureError(
  error: Error,
  attempt: number
): ErrorResponse {
  return {
    errorCode: ErrorCode.UPLOAD_FAILED,
    message: 'Upload failed. Queuing for next sync...',
    retryable: true,
    retryAfter: Math.min(5 * Math.pow(2, attempt - 1), 30),
    details: {
      error: error.message,
      attempt,
      action: 'Logs queued for next sync. Operation continues.',
    },
  };
}

/**
 * Handle authentication failure errors.
 */
export function handleAuthenticationFailureError(): ErrorResponse {
  return {
    errorCode: ErrorCode.AUTH_FAILED,
    message: 'Authentication failed. Please log in again.',
    retryable: false,
    details: {
      action: 'User needs to re-authenticate',
    },
  };
}

/**
 * Create a structured error response.
 */
export function createErrorResponse(
  errorCode: string,
  message: string,
  retryable: boolean = false,
  retryAfter?: number,
  details?: Record<string, any>
): ErrorResponse {
  return {
    errorCode,
    message,
    retryable,
    retryAfter,
    details,
  };
}

/**
 * Log error with context.
 */
export function logError(
  errorType: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  message: string,
  context?: Record<string, any>,
  stackTrace?: string
): void {
  const errorLog = {
    timestamp: new Date().toISOString(),
    errorType,
    severity,
    message,
    context,
    stackTrace,
  };
  
  // Log to console (in production, this would go to a logging service)
  if (severity === 'critical' || severity === 'high') {
    console.error('[ERROR]', errorLog);
  } else if (severity === 'medium') {
    console.warn('[WARNING]', errorLog);
  } else {
    console.log('[INFO]', errorLog);
  }
  
  // TODO: In production, send to analytics/logging service
}
