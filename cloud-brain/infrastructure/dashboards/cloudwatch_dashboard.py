"""CloudWatch Dashboard for Cloud Brain monitoring."""

from aws_cdk import (
    aws_cloudwatch as cloudwatch,
    Duration,
)
from constructs import Construct


class CloudBrainDashboard(Construct):
    """CloudWatch Dashboard for Cloud Brain operational metrics."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        namespace: str = "SikshyaSathi/CloudBrain",
        **kwargs,
    ):
        """
        Initialize CloudWatch Dashboard.
        
        Args:
            scope: CDK scope
            construct_id: Construct identifier
            namespace: CloudWatch metrics namespace
        """
        super().__init__(scope, construct_id, **kwargs)

        # Create dashboard
        dashboard = cloudwatch.Dashboard(
            self,
            "CloudBrainDashboard",
            dashboard_name="SikshyaSathi-CloudBrain-Metrics",
        )

        # Row 1: Content Generation Metrics
        dashboard.add_widgets(
            cloudwatch.GraphWidget(
                title="Content Generation Latency (p50, p95, p99)",
                left=[
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="ContentGenerationLatency",
                        statistic="p50",
                        label="p50",
                        period=Duration.minutes(5),
                    ),
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="ContentGenerationLatency",
                        statistic="p95",
                        label="p95",
                        period=Duration.minutes(5),
                    ),
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="ContentGenerationLatency",
                        statistic="p99",
                        label="p99",
                        period=Duration.minutes(5),
                    ),
                ],
                width=12,
            ),
            cloudwatch.GraphWidget(
                title="Content Generation by Type",
                left=[
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="ContentGenerationLatency",
                        statistic="SampleCount",
                        dimensions_map={"ContentType": "lesson"},
                        label="Lessons",
                        period=Duration.minutes(5),
                    ),
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="ContentGenerationLatency",
                        statistic="SampleCount",
                        dimensions_map={"ContentType": "quiz"},
                        label="Quizzes",
                        period=Duration.minutes(5),
                    ),
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="ContentGenerationLatency",
                        statistic="SampleCount",
                        dimensions_map={"ContentType": "hints"},
                        label="Hints",
                        period=Duration.minutes(5),
                    ),
                ],
                width=12,
            ),
        )

        # Row 2: Validation Metrics
        dashboard.add_widgets(
            cloudwatch.GraphWidget(
                title="Validation Success Rate",
                left=[
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="ValidationSuccessRate",
                        statistic="Average",
                        label="Success Rate",
                        period=Duration.minutes(5),
                    ),
                ],
                left_y_axis=cloudwatch.YAxisProps(
                    min=0,
                    max=100,
                    label="Percentage",
                ),
                width=12,
            ),
            cloudwatch.GraphWidget(
                title="Validation Success by Content Type",
                left=[
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="ValidationSuccessRate",
                        statistic="Average",
                        dimensions_map={"ContentType": "lesson"},
                        label="Lessons",
                        period=Duration.minutes(5),
                    ),
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="ValidationSuccessRate",
                        statistic="Average",
                        dimensions_map={"ContentType": "quiz"},
                        label="Quizzes",
                        period=Duration.minutes(5),
                    ),
                ],
                left_y_axis=cloudwatch.YAxisProps(
                    min=0,
                    max=100,
                    label="Percentage",
                ),
                width=12,
            ),
        )

        # Row 3: Sync Metrics
        dashboard.add_widgets(
            cloudwatch.GraphWidget(
                title="Sync Completion Rate",
                left=[
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="SyncCompletionRate",
                        statistic="Average",
                        dimensions_map={"SyncType": "upload"},
                        label="Upload",
                        period=Duration.minutes(5),
                    ),
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="SyncCompletionRate",
                        statistic="Average",
                        dimensions_map={"SyncType": "download"},
                        label="Download",
                        period=Duration.minutes(5),
                    ),
                ],
                left_y_axis=cloudwatch.YAxisProps(
                    min=0,
                    max=100,
                    label="Percentage",
                ),
                width=12,
            ),
            cloudwatch.GraphWidget(
                title="Bundle Generation Latency",
                left=[
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="BundleGenerationLatency",
                        statistic="Average",
                        label="Average",
                        period=Duration.minutes(5),
                    ),
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="BundleGenerationLatency",
                        statistic="p95",
                        label="p95",
                        period=Duration.minutes(5),
                    ),
                ],
                width=12,
            ),
        )

        # Row 4: Lambda Errors
        dashboard.add_widgets(
            cloudwatch.GraphWidget(
                title="Lambda Errors by Function",
                left=[
                    cloudwatch.Metric(
                        namespace="AWS/Lambda",
                        metric_name="Errors",
                        dimensions_map={"FunctionName": "sikshya-sathi-content-gen"},
                        statistic="Sum",
                        label="Content Gen",
                        period=Duration.minutes(5),
                    ),
                    cloudwatch.Metric(
                        namespace="AWS/Lambda",
                        metric_name="Errors",
                        dimensions_map={"FunctionName": "sikshya-sathi-sync-upload"},
                        statistic="Sum",
                        label="Sync Upload",
                        period=Duration.minutes(5),
                    ),
                    cloudwatch.Metric(
                        namespace="AWS/Lambda",
                        metric_name="Errors",
                        dimensions_map={"FunctionName": "sikshya-sathi-sync-download"},
                        statistic="Sum",
                        label="Sync Download",
                        period=Duration.minutes(5),
                    ),
                ],
                width=12,
            ),
            cloudwatch.GraphWidget(
                title="Lambda Invocations",
                left=[
                    cloudwatch.Metric(
                        namespace="AWS/Lambda",
                        metric_name="Invocations",
                        dimensions_map={"FunctionName": "sikshya-sathi-content-gen"},
                        statistic="Sum",
                        label="Content Gen",
                        period=Duration.minutes(5),
                    ),
                    cloudwatch.Metric(
                        namespace="AWS/Lambda",
                        metric_name="Invocations",
                        dimensions_map={"FunctionName": "sikshya-sathi-sync-upload"},
                        statistic="Sum",
                        label="Sync Upload",
                        period=Duration.minutes(5),
                    ),
                    cloudwatch.Metric(
                        namespace="AWS/Lambda",
                        metric_name="Invocations",
                        dimensions_map={"FunctionName": "sikshya-sathi-sync-download"},
                        statistic="Sum",
                        label="Sync Download",
                        period=Duration.minutes(5),
                    ),
                ],
                width=12,
            ),
        )

        # Row 5: Knowledge Model Updates
        dashboard.add_widgets(
            cloudwatch.GraphWidget(
                title="Knowledge Model Update Latency",
                left=[
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="KnowledgeModelUpdateLatency",
                        statistic="Average",
                        label="Average",
                        period=Duration.minutes(5),
                    ),
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="KnowledgeModelUpdateLatency",
                        statistic="p95",
                        label="p95",
                        period=Duration.minutes(5),
                    ),
                ],
                width=12,
            ),
            cloudwatch.SingleValueWidget(
                title="System Health",
                metrics=[
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="ValidationSuccessRate",
                        statistic="Average",
                        label="Validation Success",
                        period=Duration.hours(1),
                    ),
                    cloudwatch.Metric(
                        namespace=namespace,
                        metric_name="SyncCompletionRate",
                        statistic="Average",
                        label="Sync Success",
                        period=Duration.hours(1),
                    ),
                ],
                width=12,
            ),
        )

        self.dashboard = dashboard
