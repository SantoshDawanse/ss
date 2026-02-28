"""Bundle generation error handling and resilience."""

import gzip
import logging
from typing import Any, Optional

from src.models.content import Lesson, LessonSection, Quiz
from src.utils.error_handling import NonRetryableError, RetryableError

logger = logging.getLogger(__name__)


class BundleGenerationError(Exception):
    """Base exception for bundle generation errors."""
    pass


class InsufficientContentError(BundleGenerationError):
    """Raised when bundle has insufficient content."""
    pass


class BundleSizeExceededError(BundleGenerationError):
    """Raised when bundle size exceeds limit."""
    pass


def validate_bundle_content(
    lessons: list[Lesson],
    quizzes: list[Quiz],
    min_items: int = 3,
) -> None:
    """Validate that bundle has sufficient content.
    
    Args:
        lessons: List of lessons in bundle
        quizzes: List of quizzes in bundle
        min_items: Minimum number of content items required
        
    Raises:
        InsufficientContentError: If content is insufficient
    """
    total_items = len(lessons) + len(quizzes)
    
    if total_items < min_items:
        error_msg = (
            f"Insufficient content in bundle: {total_items} items "
            f"(minimum: {min_items}). Lessons: {len(lessons)}, Quizzes: {len(quizzes)}"
        )
        logger.error(error_msg)
        raise InsufficientContentError(error_msg)
    
    logger.info(f"Bundle content validation passed: {total_items} items")


def optimize_bundle_size(
    bundle_data: dict[str, Any],
    max_size_bytes: int = 5_000_000,  # 5MB
) -> dict[str, Any]:
    """Optimize bundle size by removing media and compressing.
    
    Implements the following optimizations:
    1. Remove optional media attachments
    2. Reduce number of practice problems
    3. Compress with higher compression level
    
    Args:
        bundle_data: Bundle data dictionary
        max_size_bytes: Maximum bundle size in bytes
        
    Returns:
        Optimized bundle data
        
    Raises:
        BundleSizeExceededError: If size cannot be reduced below limit
    """
    import json
    
    # Calculate initial size
    initial_json = json.dumps(bundle_data)
    initial_compressed = gzip.compress(initial_json.encode('utf-8'), compresslevel=6)
    initial_size = len(initial_compressed)
    
    logger.info(f"Initial bundle size: {initial_size:,} bytes (limit: {max_size_bytes:,})")
    
    if initial_size <= max_size_bytes:
        logger.info("Bundle size within limit, no optimization needed")
        return bundle_data
    
    # Create a copy for optimization
    optimized_bundle = bundle_data.copy()
    
    # Step 1: Remove media attachments
    logger.info("Optimization step 1: Removing media attachments")
    media_removed = 0
    
    for subject_content in optimized_bundle.get("subjects", []):
        for lesson in subject_content.get("lessons", []):
            for section in lesson.get("sections", []):
                if section.get("media"):
                    section["media"] = None
                    media_removed += 1
    
    if media_removed > 0:
        logger.info(f"Removed {media_removed} media attachments")
        
        # Recalculate size
        optimized_json = json.dumps(optimized_bundle)
        optimized_compressed = gzip.compress(optimized_json.encode('utf-8'), compresslevel=6)
        current_size = len(optimized_compressed)
        
        logger.info(f"Size after removing media: {current_size:,} bytes")
        
        if current_size <= max_size_bytes:
            logger.info("Bundle size now within limit after removing media")
            return optimized_bundle
    
    # Step 2: Reduce practice problems (keep only first 3 in each practice section)
    logger.info("Optimization step 2: Reducing practice problems")
    practice_reduced = 0
    
    for subject_content in optimized_bundle.get("subjects", []):
        for lesson in subject_content.get("lessons", []):
            for section in lesson.get("sections", []):
                if section.get("type") == "practice":
                    # Truncate content if too long
                    content = section.get("content", "")
                    if len(content) > 500:
                        section["content"] = content[:500] + "..."
                        practice_reduced += 1
    
    if practice_reduced > 0:
        logger.info(f"Reduced {practice_reduced} practice sections")
        
        # Recalculate size
        optimized_json = json.dumps(optimized_bundle)
        optimized_compressed = gzip.compress(optimized_json.encode('utf-8'), compresslevel=6)
        current_size = len(optimized_compressed)
        
        logger.info(f"Size after reducing practice: {current_size:,} bytes")
        
        if current_size <= max_size_bytes:
            logger.info("Bundle size now within limit after reducing practice")
            return optimized_bundle
    
    # Step 3: Use maximum compression
    logger.info("Optimization step 3: Using maximum compression")
    optimized_json = json.dumps(optimized_bundle)
    max_compressed = gzip.compress(optimized_json.encode('utf-8'), compresslevel=9)
    final_size = len(max_compressed)
    
    logger.info(f"Size with maximum compression: {final_size:,} bytes")
    
    if final_size <= max_size_bytes:
        logger.info("Bundle size now within limit with maximum compression")
        return optimized_bundle
    
    # Still too large - raise error
    error_msg = (
        f"Bundle size {final_size:,} bytes exceeds limit {max_size_bytes:,} bytes "
        f"even after optimization (initial: {initial_size:,} bytes)"
    )
    logger.error(error_msg)
    raise BundleSizeExceededError(error_msg)


def handle_s3_upload_failure(
    error: Exception,
    bundle_id: str,
    attempt: int,
    max_attempts: int = 3,
) -> None:
    """Handle S3 upload failure with retry logic.
    
    Args:
        error: Upload exception
        bundle_id: Bundle identifier
        attempt: Current attempt number
        max_attempts: Maximum retry attempts
        
    Raises:
        RetryableError: If should retry
        NonRetryableError: If max attempts exceeded
    """
    error_str = str(error).lower()
    
    # Check if error is retryable
    retryable_errors = [
        "timeout",
        "connection",
        "network",
        "throttl",
        "503",
        "500",
    ]
    
    is_retryable = any(err in error_str for err in retryable_errors)
    
    if not is_retryable:
        logger.error(f"Non-retryable S3 upload error for bundle {bundle_id}: {error}")
        raise NonRetryableError(
            f"S3 upload failed with non-retryable error: {error}",
            "S3_UPLOAD_FAILED",
            details={"bundle_id": bundle_id, "error": str(error)},
        )
    
    if attempt >= max_attempts:
        logger.error(
            f"S3 upload failed for bundle {bundle_id} after {max_attempts} attempts: {error}"
        )
        raise NonRetryableError(
            f"S3 upload failed after {max_attempts} retries: {error}",
            "S3_UPLOAD_FAILED",
            details={
                "bundle_id": bundle_id,
                "attempts": max_attempts,
                "error": str(error),
            },
        )
    
    # Calculate retry delay
    delay = 2 ** (attempt - 1)  # 1s, 2s, 4s
    
    logger.warning(
        f"S3 upload failed for bundle {bundle_id} (attempt {attempt}/{max_attempts}), "
        f"will retry in {delay}s: {error}"
    )
    
    raise RetryableError(
        f"S3 upload failed, retrying: {error}",
        "S3_UPLOAD_FAILED",
        retry_after=delay,
        details={
            "bundle_id": bundle_id,
            "attempt": attempt,
            "max_attempts": max_attempts,
        },
    )


def handle_bundle_extraction_failure(
    error: Exception,
    bundle_id: str,
) -> None:
    """Handle bundle extraction failure.
    
    Args:
        error: Extraction exception
        bundle_id: Bundle identifier
        
    Raises:
        NonRetryableError: Always (extraction failures are not retryable)
    """
    error_type = type(error).__name__
    error_msg = str(error)
    
    logger.error(
        f"Bundle extraction failed for {bundle_id}: {error_type} - {error_msg}"
    )
    
    # Determine specific error type
    if "gzip" in error_msg.lower() or "decompress" in error_msg.lower():
        error_code = "BUNDLE_DECOMPRESSION_FAILED"
        message = f"Bundle decompression failed (corrupted gzip): {error_msg}"
    elif "json" in error_msg.lower() or "parse" in error_msg.lower():
        error_code = "BUNDLE_JSON_INVALID"
        message = f"Bundle JSON parsing failed (invalid JSON): {error_msg}"
    else:
        error_code = "BUNDLE_EXTRACTION_FAILED"
        message = f"Bundle extraction failed: {error_msg}"
    
    raise NonRetryableError(
        message,
        error_code,
        details={
            "bundle_id": bundle_id,
            "error_type": error_type,
            "error": error_msg,
        },
    )


def handle_database_insertion_failure(
    error: Exception,
    bundle_id: str,
    content_count: int,
) -> None:
    """Handle database insertion failure.
    
    Args:
        error: Database exception
        bundle_id: Bundle identifier
        content_count: Number of content items attempted
        
    Raises:
        NonRetryableError: Always (requires transaction rollback)
    """
    error_type = type(error).__name__
    error_msg = str(error)
    
    logger.error(
        f"Database insertion failed for bundle {bundle_id} "
        f"({content_count} items): {error_type} - {error_msg}"
    )
    
    # Check for specific error types
    if "disk" in error_msg.lower() or "space" in error_msg.lower():
        error_code = "DATABASE_DISK_FULL"
        message = f"Database insertion failed (disk full): {error_msg}"
    elif "constraint" in error_msg.lower() or "unique" in error_msg.lower():
        error_code = "DATABASE_CONSTRAINT_VIOLATION"
        message = f"Database insertion failed (constraint violation): {error_msg}"
    else:
        error_code = "DATABASE_INSERTION_FAILED"
        message = f"Database insertion failed: {error_msg}"
    
    raise NonRetryableError(
        message,
        error_code,
        details={
            "bundle_id": bundle_id,
            "content_count": content_count,
            "error_type": error_type,
            "error": error_msg,
            "action": "Transaction rolled back, existing content preserved",
        },
    )
