"""Tests for error handling and resilience."""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

from src.services.mcp_error_handler import (
    MCPCurriculumCache,
    mcp_call_with_retry_and_cache,
    get_curriculum_cache,
)
from src.services.bundle_error_handler import (
    validate_bundle_content,
    optimize_bundle_size,
    handle_s3_upload_failure,
    InsufficientContentError,
    BundleSizeExceededError,
)
from src.utils.error_handling import RetryableError, NonRetryableError


class TestMCPErrorHandling:
    """Test MCP Server error handling with caching and retry."""
    
    def test_mcp_cache_basic_operations(self):
        """Test basic cache operations."""
        cache = MCPCurriculumCache(ttl_seconds=3600)
        
        # Test set and get
        cache.set("test_key", {"data": "value"})
        result = cache.get("test_key")
        assert result == {"data": "value"}
        
        # Test cache miss
        result = cache.get("nonexistent_key")
        assert result is None
    
    def test_mcp_cache_expiration(self):
        """Test cache expiration."""
        cache = MCPCurriculumCache(ttl_seconds=0)  # Immediate expiration
        
        cache.set("test_key", {"data": "value"})
        
        # Should be expired immediately
        import time
        time.sleep(0.1)
        result = cache.get("test_key")
        assert result is None
    
    def test_mcp_cache_content_flagging(self):
        """Test content flagging for manual review."""
        cache = MCPCurriculumCache()
        
        # Flag content
        cache.flag_content_for_review("content-123")
        cache.flag_content_for_review("content-456")
        
        # Check flags
        assert cache.is_flagged("content-123")
        assert cache.is_flagged("content-456")
        assert not cache.is_flagged("content-789")
        
        # Get all flagged content
        flagged = cache.get_flagged_content()
        assert len(flagged) == 2
        assert "content-123" in flagged
        assert "content-456" in flagged
        
        # Clear flags
        cache.clear_flags()
        assert len(cache.get_flagged_content()) == 0
    
    def test_mcp_call_with_retry_success(self):
        """Test successful MCP call with caching."""
        mock_function = Mock(return_value={"result": "success"})
        
        result = mcp_call_with_retry_and_cache(
            mock_function,
            cache_key="test_key",
            content_id="content-123",
            max_attempts=3,
            arg1="value1",
        )
        
        assert result == {"result": "success"}
        assert mock_function.call_count == 1
        
        # Result should be cached
        cache = get_curriculum_cache()
        cached_result = cache.get("test_key")
        assert cached_result == {"result": "success"}
    
    def test_mcp_call_with_retry_and_fallback(self):
        """Test MCP call with retry and cache fallback."""
        # Mock function that always fails
        mock_function = Mock(side_effect=Exception("MCP Server unavailable"))
        
        # Pre-populate cache
        cache = get_curriculum_cache()
        cache.set("test_key", {"cached": "data"})
        
        # Should fall back to cached data
        result = mcp_call_with_retry_and_cache(
            mock_function,
            cache_key="test_key",
            content_id="content-123",
            max_attempts=3,
        )
        
        assert result == {"cached": "data"}
        assert mock_function.call_count == 3  # Should retry 3 times
        
        # Content should be flagged
        assert cache.is_flagged("content-123")
    
    def test_mcp_call_with_retry_no_cache(self):
        """Test MCP call failure with no cached data."""
        mock_function = Mock(side_effect=Exception("MCP Server unavailable"))
        
        # Clear cache
        cache = get_curriculum_cache()
        cache.clear_flags()
        
        # Should raise RetryableError
        with pytest.raises(RetryableError) as exc_info:
            mcp_call_with_retry_and_cache(
                mock_function,
                cache_key="nonexistent_key",
                content_id="content-123",
                max_attempts=3,
            )
        
        assert exc_info.value.error_code == "MCP_UNAVAILABLE"
        assert mock_function.call_count == 3


class TestBundleErrorHandling:
    """Test bundle generation error handling."""
    
    def test_validate_bundle_content_sufficient(self):
        """Test bundle content validation with sufficient content."""
        from src.models.content import Lesson, Quiz
        
        lessons = [
            Mock(spec=Lesson),
            Mock(spec=Lesson),
        ]
        quizzes = [
            Mock(spec=Quiz),
        ]
        
        # Should not raise error (3 items total)
        validate_bundle_content(lessons, quizzes, min_items=3)
    
    def test_validate_bundle_content_insufficient(self):
        """Test bundle content validation with insufficient content."""
        from src.models.content import Lesson, Quiz
        
        lessons = [Mock(spec=Lesson)]
        quizzes = []
        
        # Should raise InsufficientContentError (only 1 item)
        with pytest.raises(InsufficientContentError) as exc_info:
            validate_bundle_content(lessons, quizzes, min_items=3)
        
        assert "Insufficient content" in str(exc_info.value)
    
    def test_optimize_bundle_size_within_limit(self):
        """Test bundle size optimization when already within limit."""
        bundle_data = {
            "bundle_id": "test-bundle",
            "subjects": [
                {
                    "subject": "Mathematics",
                    "lessons": [
                        {
                            "lesson_id": "lesson-1",
                            "sections": [
                                {"type": "explanation", "content": "Short content", "media": None}
                            ],
                        }
                    ],
                }
            ],
        }
        
        # Should return unchanged (small bundle)
        result = optimize_bundle_size(bundle_data, max_size_bytes=5_000_000)
        assert result == bundle_data
    
    def test_optimize_bundle_size_remove_media(self):
        """Test bundle size optimization by removing media."""
        bundle_data = {
            "bundle_id": "test-bundle",
            "subjects": [
                {
                    "subject": "Mathematics",
                    "lessons": [
                        {
                            "lesson_id": "lesson-1",
                            "sections": [
                                {
                                    "type": "explanation",
                                    "content": "x" * 1000,  # Large content
                                    "media": {"type": "image", "url": "http://example.com/image.jpg"},
                                }
                            ],
                        }
                    ],
                }
            ],
        }
        
        # Optimize with reasonable limit
        result = optimize_bundle_size(bundle_data, max_size_bytes=5_000_000)
        
        # Should succeed (bundle is small enough)
        assert result is not None
        
        # Test with very small limit to trigger error
        with pytest.raises(BundleSizeExceededError):
            optimize_bundle_size(bundle_data, max_size_bytes=50)
    
    def test_handle_s3_upload_failure_retryable(self):
        """Test S3 upload failure handling for retryable errors."""
        error = Exception("Connection timeout")
        
        # Should raise RetryableError for attempt < max_attempts
        with pytest.raises(RetryableError) as exc_info:
            handle_s3_upload_failure(error, "bundle-123", attempt=1, max_attempts=3)
        
        assert exc_info.value.error_code == "S3_UPLOAD_FAILED"
        assert exc_info.value.retry_after > 0
    
    def test_handle_s3_upload_failure_max_attempts(self):
        """Test S3 upload failure after max attempts."""
        error = Exception("Connection timeout")
        
        # Should raise NonRetryableError after max attempts
        with pytest.raises(NonRetryableError) as exc_info:
            handle_s3_upload_failure(error, "bundle-123", attempt=3, max_attempts=3)
        
        assert exc_info.value.error_code == "S3_UPLOAD_FAILED"
    
    def test_handle_s3_upload_failure_non_retryable(self):
        """Test S3 upload failure for non-retryable errors."""
        error = Exception("Access denied")
        
        # Should raise NonRetryableError immediately
        with pytest.raises(NonRetryableError) as exc_info:
            handle_s3_upload_failure(error, "bundle-123", attempt=1, max_attempts=3)
        
        assert exc_info.value.error_code == "S3_UPLOAD_FAILED"


class TestContentValidationErrorHandling:
    """Test content validation error handling."""
    
    def test_validation_with_mcp_fallback(self):
        """Test content validation with MCP Server fallback."""
        from src.services.curriculum_validator import CurriculumValidator
        from src.models.validation import ContentValidationRequest
        
        validator = CurriculumValidator()
        
        # Mock MCP Server to fail
        with patch.object(validator, 'mcp_server') as mock_mcp:
            mock_mcp.validate_content_alignment.side_effect = Exception("MCP unavailable")
            
            request = ContentValidationRequest(
                content_id="test-content",
                content_type="lesson",
                content="Test content",
                target_standards=["MATH-6-001"],
                grade=6,
                subject="Mathematics",
            )
            
            # Should handle error gracefully
            result = validator.validate_content(request)
            
            # Should still return a result (with fallback)
            assert result is not None
            assert result.content_id == "test-content"


class TestBedrockAgentErrorHandling:
    """Test Bedrock Agent error handling."""
    
    def test_lesson_generation_with_retry(self):
        """Test lesson generation with retry on timeout."""
        from src.services.bedrock_agent import BedrockAgentService
        from botocore.exceptions import ReadTimeoutError
        
        service = BedrockAgentService()
        
        # Mock the action group invocation to fail twice then succeed
        call_count = 0
        def mock_invoke(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                # Raise a retryable error (ReadTimeoutError)
                raise ReadTimeoutError(endpoint_url="test", operation_name="test")
            return '{"lesson_id": "test-lesson", "title": "Test", "subject": "Mathematics", "topic": "Test", "difficulty": "easy", "estimated_minutes": 30, "curriculum_standards": ["MATH-6-001"], "sections": []}'
        
        with patch.object(service, '_invoke_action_group', side_effect=mock_invoke):
            # Should succeed after retries
            lesson = service.generate_lesson(
                topic="Test Topic",
                subject="Mathematics",
                grade=6,
                difficulty="easy",
                student_context={},
                curriculum_standards=["MATH-6-001"],
            )
            
            assert lesson.lesson_id == "test-lesson"
            assert call_count == 3  # Should have retried twice


def test_exponential_backoff_timing():
    """Test exponential backoff timing."""
    import time
    from src.utils.error_handling import exponential_backoff_retry, RetryableError
    
    @exponential_backoff_retry(max_attempts=3, initial_delay=0.1, exponential_base=2.0)
    def failing_function():
        raise RetryableError("Test error", "TEST_ERROR")
    
    start_time = time.time()
    
    with pytest.raises(RetryableError):
        failing_function()
    
    elapsed_time = time.time() - start_time
    
    # Should take at least 0.1 + 0.2 = 0.3 seconds
    # (with some tolerance for execution time)
    assert elapsed_time >= 0.25


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
