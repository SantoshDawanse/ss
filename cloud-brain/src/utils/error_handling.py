"""Error handling utilities for Cloud Brain."""

import logging
import time
from dataclasses import dataclass
from enum import Enum
from functools import wraps
from typing import Any, Callable, Optional, TypeVar, cast

logger = logging.getLogger(__name__)

T = TypeVar("T")


class ErrorCode(str, Enum):
    """Standard error codes for Cloud Brain."""
    
    # Bedrock Agent errors
    BEDROCK_TIMEOUT = "BEDROCK_TIMEOUT"
    BEDROCK_THROTTLED = "BEDROCK_THROTTLED"
    BEDROCK_INVALID_RESPONSE = "BEDROCK_INVALID_RESPONSE"
    BEDROCK_SERVICE_ERROR = "BEDROCK_SERVICE_ERROR"
    
    # MCP Server errors
    MCP_UNAVAILABLE = "MCP_UNAVAILABLE"
    MCP_TIMEOUT = "MCP_TIMEOUT"
    MCP_INVALID_RESPONSE = "MCP_INVALID_RESPONSE"
    
    # Validation errors
    VALIDATION_FAILED = "VALIDATION_FAILED"
    CONTENT_REGENERATION_FAILED = "CONTENT_REGENERATION_FAILED"
    
    # Storage errors
    S3_UPLOAD_FAILED = "S3_UPLOAD_FAILED"
    DYNAMODB_ERROR = "DYNAMODB_ERROR"
    
    # Sync errors
    STUDENT_NOT_FOUND = "STUDENT_NOT_FOUND"
    BUNDLE_GENERATION_TIMEOUT = "BUNDLE_GENERATION_TIMEOUT"
    INVALID_LOGS = "INVALID_LOGS"
    
    # Generic errors
    INTERNAL_ERROR = "INTERNAL_ERROR"
    INVALID_REQUEST = "INVALID_REQUEST"


@dataclass
class ErrorResponse:
    """Structured error response format."""
    
    error_code: str
    message: str
    retryable: bool
    retry_after: Optional[int] = None  # seconds
    details: Optional[dict[str, Any]] = None
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for API response."""
        result = {
            "errorCode": self.error_code,
            "message": self.message,
            "retryable": self.retryable,
        }
        if self.retry_after is not None:
            result["retryAfter"] = self.retry_after
        if self.details:
            result["details"] = self.details
        return result


class RetryableError(Exception):
    """Exception that can be retried."""
    
    def __init__(
        self,
        message: str,
        error_code: str,
        retry_after: Optional[int] = None,
        details: Optional[dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.error_code = error_code
        self.retry_after = retry_after
        self.details = details


class NonRetryableError(Exception):
    """Exception that should not be retried."""
    
    def __init__(
        self,
        message: str,
        error_code: str,
        details: Optional[dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.error_code = error_code
        self.details = details


def exponential_backoff_retry(
    max_attempts: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 30.0,
    exponential_base: float = 2.0,
    retryable_exceptions: tuple = (RetryableError,),
) -> Callable:
    """
    Decorator for exponential backoff retry logic.
    
    Args:
        max_attempts: Maximum number of retry attempts
        initial_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
        exponential_base: Base for exponential calculation
        retryable_exceptions: Tuple of exception types to retry
        
    Returns:
        Decorated function with retry logic
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> T:
            attempt = 0
            delay = initial_delay
            
            while attempt < max_attempts:
                try:
                    return func(*args, **kwargs)
                except retryable_exceptions as e:
                    attempt += 1
                    
                    if attempt >= max_attempts:
                        logger.error(
                            f"{func.__name__} failed after {max_attempts} attempts: {e}"
                        )
                        raise
                    
                    # Calculate delay with exponential backoff
                    current_delay = min(delay * (exponential_base ** (attempt - 1)), max_delay)
                    
                    logger.warning(
                        f"{func.__name__} attempt {attempt} failed: {e}. "
                        f"Retrying in {current_delay:.2f}s..."
                    )
                    
                    time.sleep(current_delay)
                except NonRetryableError:
                    # Don't retry non-retryable errors
                    logger.error(f"{func.__name__} failed with non-retryable error")
                    raise
                except Exception as e:
                    # Unexpected errors - don't retry
                    logger.error(f"{func.__name__} failed with unexpected error: {e}")
                    raise
            
            # Should never reach here
            raise RuntimeError(f"{func.__name__} exceeded max attempts")
        
        return cast(Callable[..., T], wrapper)
    return decorator


def handle_bedrock_error(error: Exception) -> ErrorResponse:
    """
    Handle Bedrock Agent errors and return structured response.
    
    Args:
        error: Exception from Bedrock Agent
        
    Returns:
        ErrorResponse with appropriate error code and retry info
    """
    error_str = str(error).lower()
    
    # Timeout errors
    if "timeout" in error_str or "timed out" in error_str:
        return ErrorResponse(
            error_code=ErrorCode.BEDROCK_TIMEOUT,
            message="Bedrock Agent request timed out",
            retryable=True,
            retry_after=5,
            details={"error": str(error)},
        )
    
    # Throttling errors
    if "throttl" in error_str or "rate" in error_str:
        return ErrorResponse(
            error_code=ErrorCode.BEDROCK_THROTTLED,
            message="Bedrock Agent request throttled",
            retryable=True,
            retry_after=10,
            details={"error": str(error)},
        )
    
    # Invalid response errors
    if "invalid" in error_str or "parse" in error_str:
        return ErrorResponse(
            error_code=ErrorCode.BEDROCK_INVALID_RESPONSE,
            message="Bedrock Agent returned invalid response",
            retryable=True,
            retry_after=2,
            details={"error": str(error)},
        )
    
    # Generic service errors
    return ErrorResponse(
        error_code=ErrorCode.BEDROCK_SERVICE_ERROR,
        message="Bedrock Agent service error",
        retryable=True,
        retry_after=5,
        details={"error": str(error)},
    )


def handle_mcp_error(error: Exception) -> ErrorResponse:
    """
    Handle MCP Server errors and return structured response.
    
    Args:
        error: Exception from MCP Server
        
    Returns:
        ErrorResponse with appropriate error code and retry info
    """
    error_str = str(error).lower()
    
    # Connection/availability errors
    if "connection" in error_str or "unavailable" in error_str:
        return ErrorResponse(
            error_code=ErrorCode.MCP_UNAVAILABLE,
            message="MCP Server unavailable",
            retryable=True,
            retry_after=10,
            details={"error": str(error), "fallback": "Use cached curriculum data"},
        )
    
    # Timeout errors
    if "timeout" in error_str:
        return ErrorResponse(
            error_code=ErrorCode.MCP_TIMEOUT,
            message="MCP Server request timed out",
            retryable=True,
            retry_after=5,
            details={"error": str(error)},
        )
    
    # Invalid response errors
    if "invalid" in error_str or "parse" in error_str:
        return ErrorResponse(
            error_code=ErrorCode.MCP_INVALID_RESPONSE,
            message="MCP Server returned invalid response",
            retryable=True,
            retry_after=2,
            details={"error": str(error)},
        )
    
    # Generic MCP errors
    return ErrorResponse(
        error_code=ErrorCode.MCP_UNAVAILABLE,
        message="MCP Server error",
        retryable=True,
        retry_after=5,
        details={"error": str(error)},
    )


def handle_validation_error(error: Exception, attempt: int = 1) -> ErrorResponse:
    """
    Handle content validation errors.
    
    Args:
        error: Validation exception
        attempt: Current regeneration attempt
        
    Returns:
        ErrorResponse with regeneration guidance
    """
    return ErrorResponse(
        error_code=ErrorCode.VALIDATION_FAILED,
        message=f"Content validation failed (attempt {attempt})",
        retryable=True,
        retry_after=2,
        details={
            "error": str(error),
            "action": "Regenerating content with adjusted prompts",
        },
    )


def handle_storage_error(error: Exception, storage_type: str) -> ErrorResponse:
    """
    Handle storage errors (S3, DynamoDB).
    
    Args:
        error: Storage exception
        storage_type: Type of storage (S3, DynamoDB)
        
    Returns:
        ErrorResponse with retry info
    """
    error_str = str(error).lower()
    
    if storage_type.lower() == "s3":
        return ErrorResponse(
            error_code=ErrorCode.S3_UPLOAD_FAILED,
            message="S3 upload failed",
            retryable=True,
            retry_after=5,
            details={
                "error": str(error),
                "action": "Retrying with exponential backoff",
            },
        )
    else:
        return ErrorResponse(
            error_code=ErrorCode.DYNAMODB_ERROR,
            message="DynamoDB operation failed",
            retryable=True,
            retry_after=3,
            details={"error": str(error)},
        )


def create_error_response(
    error_code: str,
    message: str,
    retryable: bool = False,
    retry_after: Optional[int] = None,
    details: Optional[dict[str, Any]] = None,
) -> ErrorResponse:
    """
    Create a structured error response.
    
    Args:
        error_code: Error code from ErrorCode enum
        message: Human-readable error message
        retryable: Whether the error can be retried
        retry_after: Seconds to wait before retry
        details: Additional error details
        
    Returns:
        ErrorResponse object
    """
    return ErrorResponse(
        error_code=error_code,
        message=message,
        retryable=retryable,
        retry_after=retry_after,
        details=details,
    )
