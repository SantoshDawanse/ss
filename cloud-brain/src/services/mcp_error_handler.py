"""MCP Server error handling with caching and retry logic."""

import logging
import time
from datetime import datetime, timedelta
from typing import Any, Callable, Optional, TypeVar

from src.models.curriculum import ContentAlignment, CurriculumStandard, LearningProgression, TopicDetails
from src.utils.error_handling import RetryableError, exponential_backoff_retry
from src.utils.monitoring import get_monitoring_service
from src.utils.audit_logging import get_audit_logger

logger = logging.getLogger(__name__)
monitoring_service = get_monitoring_service()
audit_logger = get_audit_logger()

T = TypeVar("T")


class MCPCurriculumCache:
    """Cache for curriculum data when MCP Server is unavailable."""
    
    def __init__(self, ttl_seconds: int = 3600):
        """Initialize curriculum cache.
        
        Args:
            ttl_seconds: Time-to-live for cached data in seconds (default: 1 hour)
        """
        self.ttl_seconds = ttl_seconds
        self._cache: dict[str, dict[str, Any]] = {}
        self._timestamps: dict[str, datetime] = {}
        self._flagged_content: set[str] = set()
    
    def get(self, key: str) -> Optional[Any]:
        """Get cached data if not expired.
        
        Args:
            key: Cache key
            
        Returns:
            Cached data or None if expired/not found
        """
        if key not in self._cache:
            return None
        
        # Check if expired
        timestamp = self._timestamps.get(key)
        if timestamp and datetime.utcnow() - timestamp > timedelta(seconds=self.ttl_seconds):
            logger.info(f"Cache expired for key: {key}")
            del self._cache[key]
            del self._timestamps[key]
            return None
        
        logger.info(f"Cache hit for key: {key}")
        return self._cache[key]
    
    def set(self, key: str, value: Any) -> None:
        """Set cached data with timestamp.
        
        Args:
            key: Cache key
            value: Data to cache
        """
        self._cache[key] = value
        self._timestamps[key] = datetime.utcnow()
        logger.info(f"Cached data for key: {key}")
    
    def flag_content_for_review(self, content_id: str) -> None:
        """Flag content generated with cached data for manual review.
        
        Args:
            content_id: Content identifier to flag
        """
        self._flagged_content.add(content_id)
        logger.warning(f"Content {content_id} flagged for manual review (used cached curriculum data)")
    
    def is_flagged(self, content_id: str) -> bool:
        """Check if content is flagged for manual review.
        
        Args:
            content_id: Content identifier
            
        Returns:
            True if flagged
        """
        return content_id in self._flagged_content
    
    def get_flagged_content(self) -> list[str]:
        """Get all content IDs flagged for manual review.
        
        Returns:
            List of flagged content IDs
        """
        return list(self._flagged_content)
    
    def clear_flags(self) -> None:
        """Clear all content flags."""
        self._flagged_content.clear()
        logger.info("Cleared all content flags")


# Global cache instance
_curriculum_cache = MCPCurriculumCache()


def get_curriculum_cache() -> MCPCurriculumCache:
    """Get the global curriculum cache instance.
    
    Returns:
        MCPCurriculumCache instance
    """
    return _curriculum_cache


def mcp_call_with_retry_and_cache(
    mcp_function: Callable[..., T],
    cache_key: str,
    tool_name: Optional[str] = None,
    content_id: Optional[str] = None,
    max_attempts: int = 3,
    *args: Any,
    **kwargs: Any,
) -> T:
    """Call MCP Server function with retry logic and caching fallback.
    
    Implements exponential backoff retry (1s, 2s, 4s) and falls back to
    cached data after 3 failed attempts. Flags content for manual review
    when using cached data.
    
    Args:
        mcp_function: MCP Server function to call
        cache_key: Key for caching the result
        tool_name: Optional MCP tool name for metrics
        content_id: Optional content ID to flag if using cached data
        max_attempts: Maximum retry attempts (default: 3)
        *args: Positional arguments for mcp_function
        **kwargs: Keyword arguments for mcp_function
        
    Returns:
        Result from MCP Server or cached data
        
    Raises:
        RetryableError: If MCP Server fails and no cached data available
    """
    cache = get_curriculum_cache()
    
    # Try MCP Server with exponential backoff
    for attempt in range(max_attempts):
        try:
            result = mcp_function(*args, **kwargs)
            
            # Cache successful result
            cache.set(cache_key, result)
            
            # Emit MCP Server availability metric (success)
            monitoring_service.emit_mcp_server_availability(
                available=True,
                tool_name=tool_name,
            )
            
            return result
            
        except Exception as e:
            error_timestamp = datetime.utcnow().isoformat()
            
            # Emit MCP Server error metric
            monitoring_service.emit_mcp_server_error(
                error_type="unavailable" if attempt == max_attempts - 1 else "retry",
                tool_name=tool_name,
            )
            
            # Log MCP Server error to audit log
            audit_logger.log_mcp_server_error(
                error_type="unavailable" if attempt == max_attempts - 1 else "retry",
                error_message=str(e),
                tool_name=tool_name,
                retry_attempt=attempt + 1,
                max_retries=max_attempts,
            )
            
            if attempt < max_attempts - 1:
                # Exponential backoff: 1s, 2s, 4s
                delay = 2 ** attempt
                logger.warning(
                    f"MCP Server call failed (attempt {attempt + 1}/{max_attempts}), "
                    f"retrying in {delay}s. Error: {e}. Timestamp: {error_timestamp}"
                )
                time.sleep(delay)
            else:
                # All retries exhausted
                logger.error(
                    f"MCP Server unavailable after {max_attempts} attempts. "
                    f"Error: {e}. Timestamp: {error_timestamp}"
                )
                
                # Emit MCP Server availability metric (failure)
                monitoring_service.emit_mcp_server_availability(
                    available=False,
                    tool_name=tool_name,
                )
                
                # Try to use cached data
                cached_result = cache.get(cache_key)
                if cached_result is not None:
                    logger.warning(
                        f"Using cached curriculum data for key: {cache_key}. "
                        f"Timestamp: {error_timestamp}"
                    )
                    
                    # Flag content for manual review if content_id provided
                    if content_id:
                        cache.flag_content_for_review(content_id)
                    
                    return cached_result
                else:
                    # No cached data available
                    logger.error(
                        f"No cached data available for key: {cache_key}. "
                        f"Timestamp: {error_timestamp}"
                    )
                    raise RetryableError(
                        f"MCP Server unavailable and no cached data: {e}",
                        "MCP_UNAVAILABLE",
                        retry_after=60,
                        details={
                            "cache_key": cache_key,
                            "timestamp": error_timestamp,
                            "attempts": max_attempts,
                        },
                    )
    
    # Should never reach here
    raise RuntimeError("Unexpected error in mcp_call_with_retry_and_cache")


def get_curriculum_standards_with_fallback(
    mcp_server: Any,
    grade: int,
    subject: str,
    content_id: Optional[str] = None,
) -> list[CurriculumStandard]:
    """Get curriculum standards with retry and cache fallback.
    
    Args:
        mcp_server: MCP Server instance
        grade: Grade level
        subject: Subject name
        content_id: Optional content ID for flagging
        
    Returns:
        List of curriculum standards
    """
    cache_key = f"standards_{grade}_{subject}"
    
    return mcp_call_with_retry_and_cache(
        mcp_server.get_curriculum_standards,
        cache_key,
        tool_name="get_curriculum_standards",
        content_id=content_id,
        grade=grade,
        subject=subject,
    )


def get_topic_details_with_fallback(
    mcp_server: Any,
    topic_id: str,
    content_id: Optional[str] = None,
) -> Optional[TopicDetails]:
    """Get topic details with retry and cache fallback.
    
    Args:
        mcp_server: MCP Server instance
        topic_id: Topic identifier
        content_id: Optional content ID for flagging
        
    Returns:
        TopicDetails or None
    """
    cache_key = f"topic_{topic_id}"
    
    return mcp_call_with_retry_and_cache(
        mcp_server.get_topic_details,
        cache_key,
        tool_name="get_topic_details",
        content_id=content_id,
        topic_id=topic_id,
    )


def validate_content_alignment_with_fallback(
    mcp_server: Any,
    content: str,
    target_standards: list[str],
    content_id: Optional[str] = None,
) -> ContentAlignment:
    """Validate content alignment with retry and cache fallback.
    
    Args:
        mcp_server: MCP Server instance
        content: Content to validate
        target_standards: Target standard IDs
        content_id: Optional content ID for flagging
        
    Returns:
        ContentAlignment result
    """
    # Use a hash of content for cache key (first 100 chars + standards)
    content_hash = content[:100] + "_" + "_".join(sorted(target_standards))
    cache_key = f"alignment_{hash(content_hash)}"
    
    return mcp_call_with_retry_and_cache(
        mcp_server.validate_content_alignment,
        cache_key,
        tool_name="validate_content_alignment",
        content_id=content_id,
        content=content,
        target_standards=target_standards,
    )


def get_learning_progression_with_fallback(
    mcp_server: Any,
    subject: str,
    grade_start: int,
    grade_end: int,
    content_id: Optional[str] = None,
) -> Optional[LearningProgression]:
    """Get learning progression with retry and cache fallback.
    
    Args:
        mcp_server: MCP Server instance
        subject: Subject name
        grade_start: Starting grade
        grade_end: Ending grade
        content_id: Optional content ID for flagging
        
    Returns:
        LearningProgression or None
    """
    cache_key = f"progression_{subject}_{grade_start}_{grade_end}"
    
    return mcp_call_with_retry_and_cache(
        mcp_server.get_learning_progression,
        cache_key,
        tool_name="get_learning_progression",
        content_id=content_id,
        subject=subject,
        grade_start=grade_start,
        grade_end=grade_end,
    )
