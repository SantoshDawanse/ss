"""Script to deploy CloudWatch dashboard for Cloud Brain monitoring."""

import boto3
import json
from datetime import datetime


def create_cloudwatch_dashboard():
    """Create CloudWatch dashboard for Cloud Brain metrics."""
    
    cloudwatch = boto3.client('cloudwatch')
    
    # Dashboard configuration
    dashboard_name = "SikshyaSathi-CloudBrain-Metrics"
    namespace = "SikshyaSathi/CloudBrain"
    
    # Dashboard body (JSON format)
    dashboard_body = {
        "widgets": [
            # Row 1: Content Generation Latency
            {
                "type": "metric",
                "x": 0,
                "y": 0,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        [namespace, "ContentGenerationLatency", {"stat": "p50", "label": "p50"}],
                        ["...", {"stat": "p95", "label": "p95"}],
                        ["...", {"stat": "p99", "label": "p99"}]
                    ],
                    "view": "timeSeries",
                    "stacked": False,
                    "region": "us-east-1",
                    "title": "Content Generation Latency (p50, p95, p99)",
                    "period": 300,
                    "yAxis": {
                        "left": {
                            "label": "Milliseconds"
                        }
                    }
                }
            },
            # Content Generation by Type
            {
                "type": "metric",
                "x": 12,
                "y": 0,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        [namespace, "ContentGenerationLatency", {"stat": "SampleCount", "label": "Lessons"}, {"ContentType": "lesson"}],
                        ["...", {"stat": "SampleCount", "label": "Quizzes"}, {"ContentType": "quiz"}],
                        ["...", {"stat": "SampleCount", "label": "Hints"}, {"ContentType": "hints"}]
                    ],
                    "view": "timeSeries",
                    "stacked": False,
                    "region": "us-east-1",
                    "title": "Content Generation by Type",
                    "period": 300,
                    "yAxis": {
                        "left": {
                            "label": "Count"
                        }
                    }
                }
            },
            # Row 2: Validation Success Rate
            {
                "type": "metric",
                "x": 0,
                "y": 6,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        [namespace, "ValidationSuccessRate", {"stat": "Average", "label": "Success Rate"}]
                    ],
                    "view": "timeSeries",
                    "stacked": False,
                    "region": "us-east-1",
                    "title": "Validation Success Rate",
                    "period": 300,
                    "yAxis": {
                        "left": {
                            "min": 0,
                            "max": 100,
                            "label": "Percentage"
                        }
                    }
                }
            },
            # Validation by Content Type
            {
                "type": "metric",
                "x": 12,
                "y": 6,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        [namespace, "ValidationSuccessRate", {"stat": "Average", "label": "Lessons"}, {"ContentType": "lesson"}],
                        ["...", {"stat": "Average", "label": "Quizzes"}, {"ContentType": "quiz"}]
                    ],
                    "view": "timeSeries",
                    "stacked": False,
                    "region": "us-east-1",
                    "title": "Validation Success by Content Type",
                    "period": 300,
                    "yAxis": {
                        "left": {
                            "min": 0,
                            "max": 100,
                            "label": "Percentage"
                        }
                    }
                }
            },
            # Row 3: Sync Completion Rate
            {
                "type": "metric",
                "x": 0,
                "y": 12,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        [namespace, "SyncCompletionRate", {"stat": "Average", "label": "Upload"}, {"SyncType": "upload"}],
                        ["...", {"stat": "Average", "label": "Download"}, {"SyncType": "download"}]
                    ],
                    "view": "timeSeries",
                    "stacked": False,
                    "region": "us-east-1",
                    "title": "Sync Completion Rate",
                    "period": 300,
                    "yAxis": {
                        "left": {
                            "min": 0,
                            "max": 100,
                            "label": "Percentage"
                        }
                    }
                }
            },
            # Bundle Generation Latency
            {
                "type": "metric",
                "x": 12,
                "y": 12,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        [namespace, "BundleGenerationLatency", {"stat": "Average", "label": "Average"}],
                        ["...", {"stat": "p95", "label": "p95"}]
                    ],
                    "view": "timeSeries",
                    "stacked": False,
                    "region": "us-east-1",
                    "title": "Bundle Generation Latency",
                    "period": 300,
                    "yAxis": {
                        "left": {
                            "label": "Milliseconds"
                        }
                    }
                }
            },
            # Row 4: Lambda Errors
            {
                "type": "metric",
                "x": 0,
                "y": 18,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        ["AWS/Lambda", "Errors", {"stat": "Sum", "label": "Content Gen"}, {"FunctionName": "sikshya-sathi-content-gen"}],
                        ["...", {"stat": "Sum", "label": "Sync Upload"}, {"FunctionName": "sikshya-sathi-sync-upload"}],
                        ["...", {"stat": "Sum", "label": "Sync Download"}, {"FunctionName": "sikshya-sathi-sync-download"}]
                    ],
                    "view": "timeSeries",
                    "stacked": False,
                    "region": "us-east-1",
                    "title": "Lambda Errors by Function",
                    "period": 300,
                    "yAxis": {
                        "left": {
                            "label": "Count"
                        }
                    }
                }
            },
            # Lambda Invocations
            {
                "type": "metric",
                "x": 12,
                "y": 18,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        ["AWS/Lambda", "Invocations", {"stat": "Sum", "label": "Content Gen"}, {"FunctionName": "sikshya-sathi-content-gen"}],
                        ["...", {"stat": "Sum", "label": "Sync Upload"}, {"FunctionName": "sikshya-sathi-sync-upload"}],
                        ["...", {"stat": "Sum", "label": "Sync Download"}, {"FunctionName": "sikshya-sathi-sync-download"}]
                    ],
                    "view": "timeSeries",
                    "stacked": False,
                    "region": "us-east-1",
                    "title": "Lambda Invocations",
                    "period": 300,
                    "yAxis": {
                        "left": {
                            "label": "Count"
                        }
                    }
                }
            },
            # Row 5: Knowledge Model Updates
            {
                "type": "metric",
                "x": 0,
                "y": 24,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        [namespace, "KnowledgeModelUpdateLatency", {"stat": "Average", "label": "Average"}],
                        ["...", {"stat": "p95", "label": "p95"}]
                    ],
                    "view": "timeSeries",
                    "stacked": False,
                    "region": "us-east-1",
                    "title": "Knowledge Model Update Latency",
                    "period": 300,
                    "yAxis": {
                        "left": {
                            "label": "Milliseconds"
                        }
                    }
                }
            },
            # System Health Summary
            {
                "type": "metric",
                "x": 12,
                "y": 24,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        [namespace, "ValidationSuccessRate", {"stat": "Average", "label": "Validation Success"}],
                        [namespace, "SyncCompletionRate", {"stat": "Average", "label": "Sync Success"}]
                    ],
                    "view": "singleValue",
                    "region": "us-east-1",
                    "title": "System Health (Last Hour)",
                    "period": 3600
                }
            }
        ]
    }
    
    try:
        # Create or update dashboard
        response = cloudwatch.put_dashboard(
            DashboardName=dashboard_name,
            DashboardBody=json.dumps(dashboard_body)
        )
        
        print(f"✓ CloudWatch dashboard '{dashboard_name}' created successfully!")
        print(f"  Dashboard ARN: {response.get('DashboardValidationMessages', 'N/A')}")
        print(f"\nView dashboard at:")
        print(f"  https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name={dashboard_name}")
        
        return True
        
    except Exception as e:
        print(f"✗ Failed to create dashboard: {e}")
        return False


if __name__ == "__main__":
    print("Creating CloudWatch Dashboard for Sikshya-Sathi Cloud Brain...")
    print("=" * 70)
    success = create_cloudwatch_dashboard()
    
    if success:
        print("\n" + "=" * 70)
        print("Dashboard deployment complete!")
        print("\nThe dashboard includes:")
        print("  • Content generation latency (p50, p95, p99)")
        print("  • Validation success rate")
        print("  • Sync completion rate")
        print("  • Bundle generation latency")
        print("  • Lambda errors and invocations")
        print("  • Knowledge model update latency")
        print("  • System health summary")
    else:
        print("\nDashboard deployment failed. Please check AWS credentials and permissions.")
