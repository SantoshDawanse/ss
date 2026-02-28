"""CloudWatch monitoring utilities for Cloud Brain."""

import time
from datetime import datetime
from enum import Enum
from typing import Any, Optional

import boto3
from aws_lambda_powertools import Logger

logger = Logger()


class MetricName(str, Enum):
    """CloudWatch metric names."""
    
    CONTENT_GENERATION_LATENCY = "ContentGenerationLatency"
    CONTENT_GENERATION_SUCCESS_RATE = "ContentGenerationSuccessRate"
    VALIDATION_SUCCESS_RATE = "ValidationSuccessRate"
    VALIDATION_PASS_RATE = "ValidationPassRate"
    MCP_SERVER_AVAILABILITY = "MCPServerAvailability"
    MCP_SERVER_ERROR_COUNT = "MCPServerErrorCount"
    BUNDLE_GENERATION_LATENCY = "BundleGenerationLatency"
    BUNDLE_GENERATION_SUCCESS_RATE = "BundleGenerationSuccessRate"
    SYNC_COMPLETION_RATE = "SyncCompletionRate"
    KNOWLEDGE_MODEL_UPDATE_LATENCY = "KnowledgeModelUpdateLatency"
    AVERAGE_GENERATION_TIME = "AverageGenerationTime"


class MetricUnit(str, Enum):
    """CloudWatch metric units."""
    
    MILLISECONDS = "Milliseconds"
    SECONDS = "Seconds"
    COUNT = "Count"
    PERCENT = "Percent"
    BYTES = "Bytes"


class MonitoringService:
    """Service for CloudWatch monitoring and metrics."""
    
    def __init__(self, namespace: str = "SikshyaSathi/CloudBrain"):
        """
        Initialize monitoring service.
        
        Args:
            namespace: CloudWatch namespace for metrics
        """
        self.namespace = namespace
        self.cloudwatch = boto3.client("cloudwatch")
        
    def put_metric(
        self,
        metric_name: MetricName,
        value: float,
        unit: MetricUnit = MetricUnit.COUNT,
        dimensions: Optional[dict[str, str]] = None,
    ) -> None:
        """
        Put a metric to CloudWatch.
        
        Args:
            metric_name: Name of the metric
            value: Metric value
            unit: Metric unit
            dimensions: Optional dimensions for the metric
        """
        try:
            metric_data = {
                "MetricName": metric_name.value,
                "Value": value,
                "Unit": unit.value,
                "Timestamp": datetime.utcnow(),
            }
            
            if dimensions:
                metric_data["Dimensions"] = [
                    {"Name": k, "Value": v} for k, v in dimensions.items()
                ]
            
            self.cloudwatch.put_metric_data(
                Namespace=self.namespace,
                MetricData=[metric_data],
            )
            
            logger.debug(
                f"Put metric: {metric_name.value}={value} {unit.value}",
                extra={"dimensions": dimensions},
            )
        except Exception as e:
            # Don't fail the operation if metrics fail
            logger.warning(f"Failed to put metric {metric_name.value}: {e}")
    
    def record_latency(
        self,
        metric_name: MetricName,
        start_time: float,
        dimensions: Optional[dict[str, str]] = None,
    ) -> None:
        """
        Record latency metric from start time.
        
        Args:
            metric_name: Name of the latency metric
            start_time: Start time from time.time()
            dimensions: Optional dimensions for the metric
        """
        latency_ms = (time.time() - start_time) * 1000
        self.put_metric(
            metric_name=metric_name,
            value=latency_ms,
            unit=MetricUnit.MILLISECONDS,
            dimensions=dimensions,
        )
    
    def record_success(
        self,
        metric_name: MetricName,
        success: bool,
        dimensions: Optional[dict[str, str]] = None,
    ) -> None:
        """
        Record success/failure as a percentage metric.
        
        Args:
            metric_name: Name of the success rate metric
            success: Whether the operation succeeded
            dimensions: Optional dimensions for the metric
        """
        self.put_metric(
            metric_name=metric_name,
            value=100.0 if success else 0.0,
            unit=MetricUnit.PERCENT,
            dimensions=dimensions,
        )
    
    def record_count(
        self,
        metric_name: MetricName,
        count: int,
        dimensions: Optional[dict[str, str]] = None,
    ) -> None:
        """
        Record a count metric.
        
        Args:
            metric_name: Name of the count metric
            count: Count value
            dimensions: Optional dimensions for the metric
        """
        self.put_metric(
            metric_name=metric_name,
            value=float(count),
            unit=MetricUnit.COUNT,
            dimensions=dimensions,
        )
    
    def emit_content_generation_metrics(
        self,
        latency_ms: float,
        success: bool,
        content_type: str,  # "lesson" or "quiz"
        subject: Optional[str] = None,
    ) -> None:
        """
        Emit content generation metrics including latency and success rate.
        
        Validates: Requirements 12.6, 15.6
        
        Args:
            latency_ms: Generation latency in milliseconds
            success: Whether generation succeeded
            content_type: Type of content (lesson or quiz)
            subject: Optional subject for dimensions
        """
        dimensions = {"ContentType": content_type}
        if subject:
            dimensions["Subject"] = subject
        
        # Emit latency (for p50, p95, p99 percentiles)
        self.put_metric(
            metric_name=MetricName.CONTENT_GENERATION_LATENCY,
            value=latency_ms,
            unit=MetricUnit.MILLISECONDS,
            dimensions=dimensions,
        )
        
        # Emit success rate
        self.record_success(
            metric_name=MetricName.CONTENT_GENERATION_SUCCESS_RATE,
            success=success,
            dimensions=dimensions,
        )
        
        # Emit average generation time (same as latency but for tracking)
        self.put_metric(
            metric_name=MetricName.AVERAGE_GENERATION_TIME,
            value=latency_ms,
            unit=MetricUnit.MILLISECONDS,
            dimensions=dimensions,
        )
    
    def emit_validation_metrics(
        self,
        passed: bool,
        content_type: str,
        alignment_score: Optional[float] = None,
    ) -> None:
        """
        Emit validation pass rate metrics.
        
        Validates: Requirements 15.6
        
        Args:
            passed: Whether validation passed
            content_type: Type of content (lesson or quiz)
            alignment_score: Optional curriculum alignment score
        """
        dimensions = {"ContentType": content_type}
        
        # Emit validation pass rate
        self.record_success(
            metric_name=MetricName.VALIDATION_PASS_RATE,
            success=passed,
            dimensions=dimensions,
        )
        
        # Emit alignment score if provided
        if alignment_score is not None:
            self.put_metric(
                metric_name=MetricName.VALIDATION_SUCCESS_RATE,
                value=alignment_score * 100,  # Convert to percentage
                unit=MetricUnit.PERCENT,
                dimensions=dimensions,
            )
    
    def emit_mcp_server_availability(
        self,
        available: bool,
        tool_name: Optional[str] = None,
    ) -> None:
        """
        Emit MCP Server availability metrics.
        
        Validates: Requirements 15.6
        
        Args:
            available: Whether MCP Server is available
            tool_name: Optional MCP tool name
        """
        dimensions = {}
        if tool_name:
            dimensions["ToolName"] = tool_name
        
        # Emit availability as percentage (100% or 0%)
        self.put_metric(
            metric_name=MetricName.MCP_SERVER_AVAILABILITY,
            value=100.0 if available else 0.0,
            unit=MetricUnit.PERCENT,
            dimensions=dimensions,
        )
    
    def emit_mcp_server_error(
        self,
        error_type: str,
        tool_name: Optional[str] = None,
    ) -> None:
        """
        Emit MCP Server error count.
        
        Args:
            error_type: Type of error (unavailable, timeout, invalid_data)
            tool_name: Optional MCP tool name
        """
        dimensions = {"ErrorType": error_type}
        if tool_name:
            dimensions["ToolName"] = tool_name
        
        # Increment error count
        self.record_count(
            metric_name=MetricName.MCP_SERVER_ERROR_COUNT,
            count=1,
            dimensions=dimensions,
        )
    
    def emit_bundle_generation_metrics(
        self,
        latency_ms: float,
        success: bool,
        size_bytes: Optional[int] = None,
        content_count: Optional[int] = None,
    ) -> None:
        """
        Emit bundle generation metrics including latency and success rate.
        
        Validates: Requirements 15.6
        
        Args:
            latency_ms: Generation latency in milliseconds
            success: Whether generation succeeded
            size_bytes: Optional bundle size in bytes
            content_count: Optional number of content items
        """
        dimensions = {}
        
        # Emit latency
        self.put_metric(
            metric_name=MetricName.BUNDLE_GENERATION_LATENCY,
            value=latency_ms,
            unit=MetricUnit.MILLISECONDS,
            dimensions=dimensions,
        )
        
        # Emit success rate
        self.record_success(
            metric_name=MetricName.BUNDLE_GENERATION_SUCCESS_RATE,
            success=success,
            dimensions=dimensions,
        )
        
        # Emit size if provided
        if size_bytes is not None:
            self.put_metric(
                metric_name=MetricName("BundleSize"),
                value=float(size_bytes),
                unit=MetricUnit.BYTES,
                dimensions=dimensions,
            )
        
        # Emit content count if provided
        if content_count is not None:
            self.record_count(
                metric_name=MetricName("BundleContentCount"),
                count=content_count,
                dimensions=dimensions,
            )


class LatencyTimer:
    """Context manager for timing operations and recording latency."""
    
    def __init__(
        self,
        monitoring_service: MonitoringService,
        metric_name: MetricName,
        dimensions: Optional[dict[str, str]] = None,
    ):
        """
        Initialize latency timer.
        
        Args:
            monitoring_service: Monitoring service instance
            metric_name: Name of the latency metric
            dimensions: Optional dimensions for the metric
        """
        self.monitoring_service = monitoring_service
        self.metric_name = metric_name
        self.dimensions = dimensions
        self.start_time: Optional[float] = None
    
    def __enter__(self) -> "LatencyTimer":
        """Start timing."""
        self.start_time = time.time()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Stop timing and record metric."""
        if self.start_time:
            self.monitoring_service.record_latency(
                metric_name=self.metric_name,
                start_time=self.start_time,
                dimensions=self.dimensions,
            )


# Global monitoring service instance
_monitoring_service: Optional[MonitoringService] = None


def get_monitoring_service() -> MonitoringService:
    """
    Get or create global monitoring service instance.
    
    Returns:
        MonitoringService instance
    """
    global _monitoring_service
    if _monitoring_service is None:
        _monitoring_service = MonitoringService()
    return _monitoring_service
