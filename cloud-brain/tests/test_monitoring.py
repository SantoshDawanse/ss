"""Unit tests for monitoring service."""

import time
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from src.utils.monitoring import (
    LatencyTimer,
    MetricName,
    MetricUnit,
    MonitoringService,
    get_monitoring_service,
)


class TestMonitoringService:
    """Test MonitoringService class."""

    @patch("src.utils.monitoring.boto3")
    def test_put_metric_basic(self, mock_boto3):
        """Test putting a basic metric."""
        mock_cloudwatch = MagicMock()
        mock_boto3.client.return_value = mock_cloudwatch

        service = MonitoringService()
        service.put_metric(
            metric_name=MetricName.CONTENT_GENERATION_LATENCY,
            value=1500.0,
            unit=MetricUnit.MILLISECONDS,
        )

        # Verify CloudWatch API was called
        mock_cloudwatch.put_metric_data.assert_called_once()
        call_args = mock_cloudwatch.put_metric_data.call_args

        assert call_args[1]["Namespace"] == "SikshyaSathi/CloudBrain"
        metric_data = call_args[1]["MetricData"][0]
        assert metric_data["MetricName"] == "ContentGenerationLatency"
        assert metric_data["Value"] == 1500.0
        assert metric_data["Unit"] == "Milliseconds"

    @patch("src.utils.monitoring.boto3")
    def test_put_metric_with_dimensions(self, mock_boto3):
        """Test putting a metric with dimensions."""
        mock_cloudwatch = MagicMock()
        mock_boto3.client.return_value = mock_cloudwatch

        service = MonitoringService()
        service.put_metric(
            metric_name=MetricName.VALIDATION_SUCCESS_RATE,
            value=95.0,
            unit=MetricUnit.PERCENT,
            dimensions={"ContentType": "lesson", "Subject": "Mathematics"},
        )

        # Verify dimensions were included
        call_args = mock_cloudwatch.put_metric_data.call_args
        metric_data = call_args[1]["MetricData"][0]
        
        assert "Dimensions" in metric_data
        dimensions = {d["Name"]: d["Value"] for d in metric_data["Dimensions"]}
        assert dimensions["ContentType"] == "lesson"
        assert dimensions["Subject"] == "Mathematics"

    @patch("src.utils.monitoring.boto3")
    def test_record_latency(self, mock_boto3):
        """Test recording latency from start time."""
        mock_cloudwatch = MagicMock()
        mock_boto3.client.return_value = mock_cloudwatch

        service = MonitoringService()
        start_time = time.time() - 1.5  # 1.5 seconds ago

        service.record_latency(
            metric_name=MetricName.BUNDLE_GENERATION_LATENCY,
            start_time=start_time,
        )

        # Verify latency was calculated and recorded
        call_args = mock_cloudwatch.put_metric_data.call_args
        metric_data = call_args[1]["MetricData"][0]
        
        assert metric_data["MetricName"] == "BundleGenerationLatency"
        assert metric_data["Unit"] == "Milliseconds"
        # Should be approximately 1500ms (allow some tolerance)
        assert 1400 <= metric_data["Value"] <= 1600

    @patch("src.utils.monitoring.boto3")
    def test_record_success_true(self, mock_boto3):
        """Test recording success as 100%."""
        mock_cloudwatch = MagicMock()
        mock_boto3.client.return_value = mock_cloudwatch

        service = MonitoringService()
        service.record_success(
            metric_name=MetricName.VALIDATION_SUCCESS_RATE,
            success=True,
        )

        call_args = mock_cloudwatch.put_metric_data.call_args
        metric_data = call_args[1]["MetricData"][0]
        
        assert metric_data["Value"] == 100.0
        assert metric_data["Unit"] == "Percent"

    @patch("src.utils.monitoring.boto3")
    def test_record_success_false(self, mock_boto3):
        """Test recording failure as 0%."""
        mock_cloudwatch = MagicMock()
        mock_boto3.client.return_value = mock_cloudwatch

        service = MonitoringService()
        service.record_success(
            metric_name=MetricName.SYNC_COMPLETION_RATE,
            success=False,
        )

        call_args = mock_cloudwatch.put_metric_data.call_args
        metric_data = call_args[1]["MetricData"][0]
        
        assert metric_data["Value"] == 0.0
        assert metric_data["Unit"] == "Percent"

    @patch("src.utils.monitoring.boto3")
    def test_record_count(self, mock_boto3):
        """Test recording a count metric."""
        mock_cloudwatch = MagicMock()
        mock_boto3.client.return_value = mock_cloudwatch

        service = MonitoringService()
        service.record_count(
            metric_name=MetricName.CONTENT_GENERATION_LATENCY,  # Using as example
            count=42,
        )

        call_args = mock_cloudwatch.put_metric_data.call_args
        metric_data = call_args[1]["MetricData"][0]
        
        assert metric_data["Value"] == 42.0
        assert metric_data["Unit"] == "Count"

    @patch("src.utils.monitoring.boto3")
    def test_put_metric_error_handling(self, mock_boto3):
        """Test that metric errors don't raise exceptions."""
        mock_cloudwatch = MagicMock()
        mock_cloudwatch.put_metric_data.side_effect = Exception("CloudWatch error")
        mock_boto3.client.return_value = mock_cloudwatch

        service = MonitoringService()
        
        # Should not raise exception
        service.put_metric(
            metric_name=MetricName.CONTENT_GENERATION_LATENCY,
            value=1000.0,
        )

    @patch("src.utils.monitoring.boto3")
    def test_custom_namespace(self, mock_boto3):
        """Test using a custom namespace."""
        mock_cloudwatch = MagicMock()
        mock_boto3.client.return_value = mock_cloudwatch

        service = MonitoringService(namespace="CustomNamespace")
        service.put_metric(
            metric_name=MetricName.CONTENT_GENERATION_LATENCY,
            value=1000.0,
        )

        call_args = mock_cloudwatch.put_metric_data.call_args
        assert call_args[1]["Namespace"] == "CustomNamespace"


class TestLatencyTimer:
    """Test LatencyTimer context manager."""

    @patch("src.utils.monitoring.boto3")
    def test_latency_timer_context_manager(self, mock_boto3):
        """Test LatencyTimer as context manager."""
        mock_cloudwatch = MagicMock()
        mock_boto3.client.return_value = mock_cloudwatch

        service = MonitoringService()

        with LatencyTimer(
            service,
            MetricName.CONTENT_GENERATION_LATENCY,
            dimensions={"ContentType": "lesson"},
        ):
            time.sleep(0.1)  # Simulate work

        # Verify metric was recorded
        mock_cloudwatch.put_metric_data.assert_called_once()
        call_args = mock_cloudwatch.put_metric_data.call_args
        metric_data = call_args[1]["MetricData"][0]
        
        assert metric_data["MetricName"] == "ContentGenerationLatency"
        assert metric_data["Unit"] == "Milliseconds"
        # Should be approximately 100ms (allow tolerance)
        assert 80 <= metric_data["Value"] <= 150

    @patch("src.utils.monitoring.boto3")
    def test_latency_timer_with_exception(self, mock_boto3):
        """Test LatencyTimer records metric even when exception occurs."""
        mock_cloudwatch = MagicMock()
        mock_boto3.client.return_value = mock_cloudwatch

        service = MonitoringService()

        with pytest.raises(ValueError):
            with LatencyTimer(service, MetricName.CONTENT_GENERATION_LATENCY):
                raise ValueError("Test error")

        # Metric should still be recorded
        mock_cloudwatch.put_metric_data.assert_called_once()


class TestGetMonitoringService:
    """Test get_monitoring_service function."""

    @patch("src.utils.monitoring.boto3")
    def test_get_monitoring_service_singleton(self, mock_boto3):
        """Test that get_monitoring_service returns singleton."""
        mock_cloudwatch = MagicMock()
        mock_boto3.client.return_value = mock_cloudwatch

        # Reset global instance
        import src.utils.monitoring as monitoring_module
        monitoring_module._monitoring_service = None

        service1 = get_monitoring_service()
        service2 = get_monitoring_service()

        assert service1 is service2
