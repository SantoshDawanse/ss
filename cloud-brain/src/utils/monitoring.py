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
    VALIDATION_SUCCESS_RATE = "ValidationSuccessRate"
    SYNC_COMPLETION_RATE = "SyncCompletionRate"
    BUNDLE_GENERATION_LATENCY = "BundleGenerationLatency"
    KNOWLEDGE_MODEL_UPDATE_LATENCY = "KnowledgeModelUpdateLatency"


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
