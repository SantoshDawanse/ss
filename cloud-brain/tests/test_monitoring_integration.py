"""Integration tests for monitoring in handlers."""

from unittest.mock import MagicMock, patch

import pytest

from src.handlers.content_handler import generate_lesson_handler
from src.models.validation import ValidationStatus


class TestMonitoringIntegration:
    """Test monitoring integration in handlers."""

    @patch("src.handlers.content_handler.get_monitoring_service")
    @patch("src.handlers.content_handler.curriculum_validator")
    @patch("src.handlers.content_handler.safety_filter")
    def test_lesson_generation_records_metrics(
        self, mock_safety, mock_validator, mock_monitoring_service
    ):
        """Test that lesson generation records latency and validation metrics."""
        # Setup mocks
        mock_monitoring = MagicMock()
        mock_monitoring_service.return_value = mock_monitoring
        
        mock_validator.validate_lesson.return_value = MagicMock(
            status=ValidationStatus.PASSED
        )
        mock_safety.filter_content.return_value = MagicMock(
            status=ValidationStatus.PASSED
        )

        # Generate lesson
        params = {
            "topic": "Fractions",
            "subject": "Mathematics",
            "grade": "6",
            "difficulty": "easy",
            "student_context": '{"proficiency": 0.6}',
            "curriculum_standards": '["MATH-6-NUM-1"]',
        }

        result = generate_lesson_handler(params)

        # Verify lesson was created
        assert "lesson_id" in result
        assert result["subject"] == "Mathematics"

        # Verify monitoring service was called
        mock_monitoring_service.assert_called()

        # Verify latency was recorded (via LatencyTimer context manager)
        mock_monitoring.record_latency.assert_called_once()
        latency_call = mock_monitoring.record_latency.call_args
        assert latency_call[1]["dimensions"]["ContentType"] == "lesson"
        assert latency_call[1]["dimensions"]["Subject"] == "Mathematics"

        # Verify validation success was recorded
        mock_monitoring.record_success.assert_called_once()
        success_call = mock_monitoring.record_success.call_args
        assert success_call[0][1] is True  # success=True
        assert success_call[1]["dimensions"]["ContentType"] == "lesson"

    @patch("src.handlers.content_handler.get_monitoring_service")
    @patch("src.handlers.content_handler.curriculum_validator")
    @patch("src.handlers.content_handler.safety_filter")
    def test_lesson_validation_failure_records_metric(
        self, mock_safety, mock_validator, mock_monitoring_service
    ):
        """Test that validation failure is recorded in metrics."""
        # Setup mocks
        mock_monitoring = MagicMock()
        mock_monitoring_service.return_value = mock_monitoring
        
        mock_validator.validate_lesson.return_value = MagicMock(
            status=ValidationStatus.FAILED,
            issues=["Test issue"]
        )
        mock_safety.filter_content.return_value = MagicMock(
            status=ValidationStatus.PASSED
        )

        # Generate lesson
        params = {
            "topic": "Fractions",
            "subject": "Mathematics",
            "grade": "6",
            "difficulty": "easy",
            "student_context": '{}',
            "curriculum_standards": '[]',
        }

        result = generate_lesson_handler(params)

        # Verify validation failure was recorded
        mock_monitoring.record_success.assert_called_once()
        success_call = mock_monitoring.record_success.call_args
        assert success_call[0][1] is False  # success=False
