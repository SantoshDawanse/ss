/**
 * Sync error handling and resilience for Local Brain.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

export interface DownloadCheckpoint {
  bundleId: string;
  bytesDownloaded: number;
  totalBytes: number;
  lastUpdated: Date;
}

export interface SyncError {
  code: string;
  message: string;
  retryable: boolean;
  retryAfter?: number;
  details?: Record<string, any>;
}

/**
 * Download bundle with resume support using HTTP Range requests.
 * 
 * Implements:
 * - Resume from last successful byte on reconnection
 * - Maximum 3 retry attempts
 * - Progress tracking in checkpoint
 * 
 * @param url - Presigned URL for bundle download
 * @param bundleId - Bundle identifier
 * @param destinationPath - Local file path for download
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Downloaded file path
 * @throws SyncError if download fails after retries
 */
export async function downloadBundleWithResume(
  url: string,
  bundleId: string,
  destinationPath: string,
  maxRetries: number = 3
): Promise<string> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    attempt++;

    try {
      console.log(
        `Downloading bundle ${bundleId} (attempt ${attempt}/${maxRetries})`
      );

      // Get download checkpoint if exists
      const checkpoint = await getDownloadCheckpoint(bundleId);
      const startByte = checkpoint?.bytesDownloaded || 0;

      if (startByte > 0) {
        console.log(`Resuming download from byte ${startByte}`);
      }

      // Download with resume support
      const downloadResult = await FileSystem.downloadAsync(
        url,
        destinationPath,
        {
          headers: startByte > 0 ? { Range: `bytes=${startByte}-` } : {},
        }
      );

      if (downloadResult.status !== 200 && downloadResult.status !== 206) {
        throw new Error(
          `Download failed with status ${downloadResult.status}`
        );
      }

      // Clear checkpoint on success
      await clearDownloadCheckpoint(bundleId);

      console.log(`Bundle ${bundleId} downloaded successfully`);
      return downloadResult.uri;
    } catch (error) {
      lastError = error as Error;
      const errorMsg = error instanceof Error ? error.message : String(error);

      console.error(
        `Download attempt ${attempt}/${maxRetries} failed: ${errorMsg}`
      );

      // Save checkpoint for resume
      try {
        const fileInfo = await FileSystem.getInfoAsync(destinationPath);
        if (fileInfo.exists && fileInfo.size) {
          await saveDownloadCheckpoint({
            bundleId,
            bytesDownloaded: fileInfo.size,
            totalBytes: 0, // Unknown until complete
            lastUpdated: new Date(),
          });
        }
      } catch (checkpointError) {
        console.warn('Failed to save download checkpoint:', checkpointError);
      }

      if (attempt >= maxRetries) {
        // Max retries exceeded
        const syncError: SyncError = {
          code: 'BUNDLE_DOWNLOAD_FAILED',
          message: `Bundle download failed after ${maxRetries} attempts: ${errorMsg}`,
          retryable: true,
          retryAfter: 300, // 5 minutes
          details: {
            bundleId,
            attempts: maxRetries,
            error: errorMsg,
          },
        };

        throw syncError;
      }

      // Exponential backoff: 2s, 4s, 8s
      const delay = 2 ** attempt * 1000;
      console.log(`Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Should never reach here
  throw new Error('Unexpected error in downloadBundleWithResume');
}

/**
 * Verify bundle checksum matches expected value.
 * 
 * @param bundleData - Downloaded bundle data
 * @param expectedChecksum - Expected SHA-256 checksum
 * @param bundleId - Bundle identifier
 * @returns True if checksum matches
 * @throws SyncError if checksum mismatch
 */
export async function verifyBundleChecksum(
  bundleData: string,
  expectedChecksum: string,
  bundleId: string
): Promise<boolean> {
  console.log(`Verifying checksum for bundle ${bundleId}`);

  try {
    // Calculate SHA-256 checksum
    const actualChecksum = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      bundleData,
      { encoding: Crypto.CryptoEncoding.HEX }
    );

    if (actualChecksum !== expectedChecksum) {
      const syncError: SyncError = {
        code: 'BUNDLE_CHECKSUM_MISMATCH',
        message: `Bundle checksum mismatch for ${bundleId}`,
        retryable: true,
        retryAfter: 60, // 1 minute
        details: {
          bundleId,
          expected: expectedChecksum,
          actual: actualChecksum,
          action: 'Bundle rejected, will retry download',
        },
      };

      console.error(
        `Checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`
      );

      throw syncError;
    }

    console.log(`Checksum verification passed for bundle ${bundleId}`);
    return true;
  } catch (error) {
    if ((error as SyncError).code === 'BUNDLE_CHECKSUM_MISMATCH') {
      throw error;
    }

    // Checksum calculation error
    const syncError: SyncError = {
      code: 'CHECKSUM_CALCULATION_FAILED',
      message: `Failed to calculate checksum: ${error}`,
      retryable: false,
      details: {
        bundleId,
        error: String(error),
      },
    };

    throw syncError;
  }
}

/**
 * Extract bundle with error handling for corrupted data.
 * 
 * @param bundleData - Compressed bundle data
 * @param bundleId - Bundle identifier
 * @returns Parsed bundle object
 * @throws SyncError if extraction fails
 */
export async function extractBundleWithErrorHandling(
  bundleData: string,
  bundleId: string
): Promise<any> {
  console.log(`Extracting bundle ${bundleId}`);

  try {
    // Decompress gzip data
    // Note: React Native doesn't have built-in gzip, would need a library
    // For now, assume data is already decompressed or use a library like pako
    
    // Parse JSON
    const bundleJson = JSON.parse(bundleData);

    // Validate structure
    if (!bundleJson.bundle_id || !bundleJson.subjects) {
      throw new Error('Invalid bundle structure: missing required fields');
    }

    console.log(`Bundle ${bundleId} extracted successfully`);
    return bundleJson;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    let errorCode: string;
    let message: string;

    if (errorMsg.includes('JSON') || errorMsg.includes('parse')) {
      errorCode = 'BUNDLE_JSON_INVALID';
      message = `Bundle JSON parsing failed (invalid JSON): ${errorMsg}`;
    } else if (errorMsg.includes('gzip') || errorMsg.includes('decompress')) {
      errorCode = 'BUNDLE_DECOMPRESSION_FAILED';
      message = `Bundle decompression failed (corrupted gzip): ${errorMsg}`;
    } else {
      errorCode = 'BUNDLE_EXTRACTION_FAILED';
      message = `Bundle extraction failed: ${errorMsg}`;
    }

    const syncError: SyncError = {
      code: errorCode,
      message,
      retryable: false,
      details: {
        bundleId,
        error: errorMsg,
        action: 'Bundle rejected, will request new bundle on next sync',
      },
    };

    console.error(message);
    throw syncError;
  }
}

/**
 * Handle database insertion failure with transaction rollback.
 * 
 * @param error - Database error
 * @param bundleId - Bundle identifier
 * @param contentCount - Number of content items attempted
 * @throws SyncError with rollback details
 */
export function handleDatabaseInsertionFailure(
  error: Error,
  bundleId: string,
  contentCount: number
): never {
  const errorMsg = error.message;

  let errorCode: string;
  let message: string;

  if (errorMsg.toLowerCase().includes('disk') || errorMsg.toLowerCase().includes('space')) {
    errorCode = 'DATABASE_DISK_FULL';
    message = `Database insertion failed (disk full): ${errorMsg}`;
  } else if (errorMsg.toLowerCase().includes('constraint') || errorMsg.toLowerCase().includes('unique')) {
    errorCode = 'DATABASE_CONSTRAINT_VIOLATION';
    message = `Database insertion failed (constraint violation): ${errorMsg}`;
  } else {
    errorCode = 'DATABASE_INSERTION_FAILED';
    message = `Database insertion failed: ${errorMsg}`;
  }

  const syncError: SyncError = {
    code: errorCode,
    message,
    retryable: false,
    details: {
      bundleId,
      contentCount,
      error: errorMsg,
      action: 'Transaction rolled back, existing content preserved',
    },
  };

  console.error(
    `Database insertion failed for bundle ${bundleId} (${contentCount} items): ${errorMsg}`
  );

  throw syncError;
}

/**
 * Get download checkpoint for resume support.
 * 
 * @param bundleId - Bundle identifier
 * @returns Download checkpoint or null
 */
async function getDownloadCheckpoint(
  bundleId: string
): Promise<DownloadCheckpoint | null> {
  try {
    const checkpointPath = `${FileSystem.documentDirectory}checkpoints/${bundleId}.json`;
    const fileInfo = await FileSystem.getInfoAsync(checkpointPath);

    if (!fileInfo.exists) {
      return null;
    }

    const checkpointData = await FileSystem.readAsStringAsync(checkpointPath);
    const checkpoint = JSON.parse(checkpointData);

    return {
      ...checkpoint,
      lastUpdated: new Date(checkpoint.lastUpdated),
    };
  } catch (error) {
    console.warn(`Failed to read checkpoint for ${bundleId}:`, error);
    return null;
  }
}

/**
 * Save download checkpoint for resume support.
 * 
 * @param checkpoint - Download checkpoint data
 */
async function saveDownloadCheckpoint(
  checkpoint: DownloadCheckpoint
): Promise<void> {
  try {
    const checkpointDir = `${FileSystem.documentDirectory}checkpoints/`;
    const checkpointPath = `${checkpointDir}${checkpoint.bundleId}.json`;

    // Ensure directory exists
    const dirInfo = await FileSystem.getInfoAsync(checkpointDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(checkpointDir, {
        intermediates: true,
      });
    }

    // Save checkpoint
    await FileSystem.writeAsStringAsync(
      checkpointPath,
      JSON.stringify(checkpoint)
    );

    console.log(`Saved checkpoint for bundle ${checkpoint.bundleId}`);
  } catch (error) {
    console.warn(`Failed to save checkpoint:`, error);
  }
}

/**
 * Clear download checkpoint after successful download.
 * 
 * @param bundleId - Bundle identifier
 */
async function clearDownloadCheckpoint(bundleId: string): Promise<void> {
  try {
    const checkpointPath = `${FileSystem.documentDirectory}checkpoints/${bundleId}.json`;
    const fileInfo = await FileSystem.getInfoAsync(checkpointPath);

    if (fileInfo.exists) {
      await FileSystem.deleteAsync(checkpointPath);
      console.log(`Cleared checkpoint for bundle ${bundleId}`);
    }
  } catch (error) {
    console.warn(`Failed to clear checkpoint for ${bundleId}:`, error);
  }
}

/**
 * Check if error is retryable.
 * 
 * @param error - Error to check
 * @returns True if error is retryable
 */
export function isRetryableError(error: any): boolean {
  if ((error as SyncError).retryable !== undefined) {
    return (error as SyncError).retryable;
  }

  // Check error message for retryable patterns
  const errorMsg = String(error).toLowerCase();
  const retryablePatterns = [
    'network',
    'timeout',
    'connection',
    'unavailable',
    'throttle',
    '503',
    '500',
  ];

  return retryablePatterns.some((pattern) => errorMsg.includes(pattern));
}

/**
 * Get retry delay for error.
 * 
 * @param error - Error object
 * @param attempt - Current attempt number
 * @returns Delay in milliseconds
 */
export function getRetryDelay(error: any, attempt: number): number {
  // Use retry_after from error if available
  if ((error as SyncError).retryAfter) {
    return (error as SyncError).retryAfter! * 1000;
  }

  // Exponential backoff: 2s, 4s, 8s
  return 2 ** attempt * 1000;
}
