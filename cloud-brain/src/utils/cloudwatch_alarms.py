"""CloudWatch alarms configuration for content generation monitoring."""

import logging
from typing import Optional

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class CloudWatchAlarmsService:
    """Service for configuring CloudWatch alarms."""
    
    def __init__(
        self,
        namespace: str = "SikshyaSathi/CloudBrain",
        sns_topic_arn: Optional[str] = None,
    ):
        """
        Initialize CloudWatch alarms service.
        
        Args:
            namespace: CloudWatch namespace for metrics
            sns_topic_arn: Optional SNS topic ARN for alarm notifications
        """
        self.namespace = namespace
        self.sns_topic_arn = sns_topic_arn
        self.cloudwatch = boto3.client("cloudwatch")
    
    def create_content_generation_failure_alarm(
        self,
        alarm_name: str = "ContentGenerationFailureRate",
        threshold_percent: float = 5.0,
        evaluation_periods: int = 1,
        period_seconds: int = 300,  # 5 minutes
    ) -> None:
        """
        Create alarm for content generation failures > 5% in 5 minutes.
        
        Args:
            alarm_name: Name of the alarm
            threshold_percent: Failure rate threshold (default: 5%)
            evaluation_periods: Number of periods to evaluate (default: 1)
            period_seconds: Period duration in seconds (default: 300 = 5 minutes)
        """
        try:
            alarm_actions = [self.sns_topic_arn] if self.sns_topic_arn else []
            
            self.cloudwatch.put_metric_alarm(
                AlarmName=alarm_name,
                AlarmDescription=(
                    "Triggers when content generation failure rate exceeds 5% in 5 minutes"
                ),
                ActionsEnabled=True,
                AlarmActions=alarm_actions,
                MetricName="ContentGenerationSuccessRate",
                Namespace=self.namespace,
                Statistic="Average",
                Period=period_seconds,
                EvaluationPeriods=evaluation_periods,
                Threshold=100.0 - threshold_percent,  # Success rate threshold (95%)
                ComparisonOperator="LessThanThreshold",
                TreatMissingData="notBreaching",
            )
            
            logger.info(f"Created alarm: {alarm_name}")
            
        except ClientError as e:
            logger.error(f"Failed to create alarm {alarm_name}: {e}")
            raise
    
    def create_mcp_server_error_alarm(
        self,
        alarm_name: str = "MCPServerErrorCount",
        threshold_count: int = 10,
        evaluation_periods: int = 1,
        period_seconds: int = 300,  # 5 minutes
    ) -> None:
        """
        Create alarm for MCP Server errors > 10 in 5 minutes.
        
        Args:
            alarm_name: Name of the alarm
            threshold_count: Error count threshold (default: 10)
            evaluation_periods: Number of periods to evaluate (default: 1)
            period_seconds: Period duration in seconds (default: 300 = 5 minutes)
        """
        try:
            alarm_actions = [self.sns_topic_arn] if self.sns_topic_arn else []
            
            self.cloudwatch.put_metric_alarm(
                AlarmName=alarm_name,
                AlarmDescription=(
                    "Triggers when MCP Server errors exceed 10 in 5 minutes"
                ),
                ActionsEnabled=True,
                AlarmActions=alarm_actions,
                MetricName="MCPServerErrorCount",
                Namespace=self.namespace,
                Statistic="Sum",
                Period=period_seconds,
                EvaluationPeriods=evaluation_periods,
                Threshold=float(threshold_count),
                ComparisonOperator="GreaterThanThreshold",
                TreatMissingData="notBreaching",
            )
            
            logger.info(f"Created alarm: {alarm_name}")
            
        except ClientError as e:
            logger.error(f"Failed to create alarm {alarm_name}: {e}")
            raise
    
    def create_bundle_generation_latency_alarm(
        self,
        alarm_name: str = "BundleGenerationLatency",
        threshold_ms: float = 300000.0,  # 5 minutes in milliseconds
        evaluation_periods: int = 1,
        period_seconds: int = 300,  # 5 minutes
    ) -> None:
        """
        Create alarm for bundle generation latency > 5 minutes.
        
        Args:
            alarm_name: Name of the alarm
            threshold_ms: Latency threshold in milliseconds (default: 300000 = 5 minutes)
            evaluation_periods: Number of periods to evaluate (default: 1)
            period_seconds: Period duration in seconds (default: 300 = 5 minutes)
        """
        try:
            alarm_actions = [self.sns_topic_arn] if self.sns_topic_arn else []
            
            self.cloudwatch.put_metric_alarm(
                AlarmName=alarm_name,
                AlarmDescription=(
                    "Triggers when bundle generation latency exceeds 5 minutes"
                ),
                ActionsEnabled=True,
                AlarmActions=alarm_actions,
                MetricName="BundleGenerationLatency",
                Namespace=self.namespace,
                Statistic="Average",
                Period=period_seconds,
                EvaluationPeriods=evaluation_periods,
                Threshold=threshold_ms,
                ComparisonOperator="GreaterThanThreshold",
                TreatMissingData="notBreaching",
            )
            
            logger.info(f"Created alarm: {alarm_name}")
            
        except ClientError as e:
            logger.error(f"Failed to create alarm {alarm_name}: {e}")
            raise
    
    def create_validation_rejection_rate_alarm(
        self,
        alarm_name: str = "ValidationRejectionRate",
        threshold_percent: float = 30.0,
        evaluation_periods: int = 1,
        period_seconds: int = 300,  # 5 minutes
    ) -> None:
        """
        Create alarm for validation rejection rate > 30%.
        
        Args:
            alarm_name: Name of the alarm
            threshold_percent: Rejection rate threshold (default: 30%)
            evaluation_periods: Number of periods to evaluate (default: 1)
            period_seconds: Period duration in seconds (default: 300 = 5 minutes)
        """
        try:
            alarm_actions = [self.sns_topic_arn] if self.sns_topic_arn else []
            
            self.cloudwatch.put_metric_alarm(
                AlarmName=alarm_name,
                AlarmDescription=(
                    "Triggers when validation rejection rate exceeds 30%"
                ),
                ActionsEnabled=True,
                AlarmActions=alarm_actions,
                MetricName="ValidationPassRate",
                Namespace=self.namespace,
                Statistic="Average",
                Period=period_seconds,
                EvaluationPeriods=evaluation_periods,
                Threshold=100.0 - threshold_percent,  # Pass rate threshold (70%)
                ComparisonOperator="LessThanThreshold",
                TreatMissingData="notBreaching",
            )
            
            logger.info(f"Created alarm: {alarm_name}")
            
        except ClientError as e:
            logger.error(f"Failed to create alarm {alarm_name}: {e}")
            raise
    
    def configure_all_alarms(
        self,
        sns_topic_arn: Optional[str] = None,
    ) -> None:
        """
        Configure all CloudWatch alarms for content generation monitoring.
        
        Args:
            sns_topic_arn: Optional SNS topic ARN for alarm notifications
        """
        if sns_topic_arn:
            self.sns_topic_arn = sns_topic_arn
        
        logger.info("Configuring CloudWatch alarms...")
        
        # Alarm 1: Content generation failures > 5% in 5 minutes
        self.create_content_generation_failure_alarm()
        
        # Alarm 2: MCP Server errors > 10 in 5 minutes
        self.create_mcp_server_error_alarm()
        
        # Alarm 3: Bundle generation latency > 5 minutes
        self.create_bundle_generation_latency_alarm()
        
        # Alarm 4: Validation rejection rate > 30%
        self.create_validation_rejection_rate_alarm()
        
        logger.info("All CloudWatch alarms configured successfully")
    
    def delete_alarm(self, alarm_name: str) -> None:
        """
        Delete a CloudWatch alarm.
        
        Args:
            alarm_name: Name of the alarm to delete
        """
        try:
            self.cloudwatch.delete_alarms(AlarmNames=[alarm_name])
            logger.info(f"Deleted alarm: {alarm_name}")
            
        except ClientError as e:
            logger.error(f"Failed to delete alarm {alarm_name}: {e}")
            raise
    
    def delete_all_alarms(self) -> None:
        """Delete all configured CloudWatch alarms."""
        alarm_names = [
            "ContentGenerationFailureRate",
            "MCPServerErrorCount",
            "BundleGenerationLatency",
            "ValidationRejectionRate",
        ]
        
        for alarm_name in alarm_names:
            try:
                self.delete_alarm(alarm_name)
            except Exception as e:
                logger.warning(f"Failed to delete alarm {alarm_name}: {e}")
        
        logger.info("All CloudWatch alarms deleted")


# Global alarms service instance
_alarms_service: Optional[CloudWatchAlarmsService] = None


def get_alarms_service(
    namespace: str = "SikshyaSathi/CloudBrain",
    sns_topic_arn: Optional[str] = None,
) -> CloudWatchAlarmsService:
    """
    Get or create global CloudWatch alarms service instance.
    
    Args:
        namespace: CloudWatch namespace for metrics
        sns_topic_arn: Optional SNS topic ARN for alarm notifications
        
    Returns:
        CloudWatchAlarmsService instance
    """
    global _alarms_service
    if _alarms_service is None:
        _alarms_service = CloudWatchAlarmsService(
            namespace=namespace,
            sns_topic_arn=sns_topic_arn,
        )
    return _alarms_service
