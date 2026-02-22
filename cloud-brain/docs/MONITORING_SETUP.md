# Cloud Brain Monitoring Setup

This document describes the monitoring and observability setup for the Sikshya-Sathi Cloud Brain.

## Overview

The Cloud Brain monitoring system uses AWS CloudWatch for:
- **Logs**: Structured logging from all Lambda functions
- **Metrics**: Custom metrics for performance and success rates
- **Alarms**: Automated alerts for critical errors and performance degradation

## CloudWatch Logs

### Log Groups

All Lambda functions have dedicated CloudWatch Log Groups with retention policies:

- `/aws/lambda/sikshya-sathi-content-gen-{env}` - Content generation handler
- `/aws/lambda/sikshya-sathi-sync-upload-{env}` - Sync upload handler
- `/aws/lambda/sikshya-sathi-sync-download-{env}` - Sync download handler

**Retention:**
- Production: 30 days
- Development/Staging: 7 days

### Structured Logging

All handlers use AWS Lambda Powertools for structured logging:

```python
from aws_lambda_powertools import Logger

logger = Logger()

@logger.inject_lambda_context
def handler(event, context):
    logger.info("Processing request", extra={"student_id": student_id})
```

**Log Levels:**
- Production: INFO
- Development: DEBUG

## CloudWatch Metrics

### Custom Metrics Namespace

All custom metrics are published to: `SikshyaSathi/CloudBrain`

### Metrics

#### 1. Content Generation Latency
- **Metric Name**: `ContentGenerationLatency`
- **Unit**: Milliseconds
- **Dimensions**: 
  - `ContentType`: lesson, quiz, hints, revision_plan, study_track
  - `Subject`: Mathematics, Science, Nepali, English, Social Studies
- **Description**: Time taken to generate content using Bedrock Agent
- **Target**: p95 < 60 seconds

#### 2. Validation Success Rate
- **Metric Name**: `ValidationSuccessRate`
- **Unit**: Percent
- **Dimensions**:
  - `ContentType`: lesson, quiz
  - `Subject`: Mathematics, Science, Nepali, English, Social Studies
- **Description**: Percentage of content that passes curriculum validation
- **Target**: > 95%

#### 3. Sync Completion Rate
- **Metric Name**: `SyncCompletionRate`
- **Unit**: Percent
- **Dimensions**:
  - `SyncType`: upload, download
- **Description**: Percentage of sync operations that complete successfully
- **Target**: > 90%

#### 4. Bundle Generation Latency
- **Metric Name**: `BundleGenerationLatency`
- **Unit**: Milliseconds
- **Dimensions**:
  - `StudentId`: (for debugging specific student issues)
- **Description**: Time taken to generate a complete learning bundle
- **Target**: < 30 seconds

#### 5. Knowledge Model Update Latency
- **Metric Name**: `KnowledgeModelUpdateLatency`
- **Unit**: Milliseconds
- **Dimensions**: None
- **Description**: Time taken to update student knowledge model
- **Target**: < 5 seconds

## CloudWatch Alarms

### Critical Alarms

All alarms send notifications to SNS topic: `sikshya-sathi-alarms-{env}`

#### 1. Content Generation Latency Alarm
- **Condition**: p95 > 60 seconds for 2 consecutive 5-minute periods
- **Action**: SNS notification
- **Severity**: High

#### 2. Validation Success Rate Alarm
- **Condition**: Average < 95% for 2 consecutive 5-minute periods
- **Action**: SNS notification
- **Severity**: High

#### 3. Sync Completion Rate Alarm
- **Condition**: Average < 90% for 2 consecutive 5-minute periods
- **Action**: SNS notification
- **Severity**: High

#### 4. Lambda Error Alarms
- **Content Generation Errors**: > 5 errors in 5 minutes
- **Sync Upload Errors**: > 5 errors in 5 minutes
- **Sync Download Errors**: > 5 errors in 5 minutes
- **Action**: SNS notification
- **Severity**: Critical

## Using the Monitoring Service

### In Lambda Handlers

```python
from src.utils.monitoring import (
    get_monitoring_service,
    LatencyTimer,
    MetricName,
)

# Get monitoring service instance
monitoring = get_monitoring_service()

# Record latency with context manager
with LatencyTimer(
    monitoring,
    MetricName.CONTENT_GENERATION_LATENCY,
    dimensions={"ContentType": "lesson", "Subject": "Mathematics"},
):
    # Your code here
    result = generate_content()

# Record success/failure
monitoring.record_success(
    MetricName.VALIDATION_SUCCESS_RATE,
    success=validation_passed,
    dimensions={"ContentType": "lesson"},
)

# Record count
monitoring.record_count(
    MetricName.CONTENT_GENERATION_LATENCY,
    count=num_items,
)
```

### Manual Latency Recording

```python
import time

start_time = time.time()
# Your code here
monitoring.record_latency(
    MetricName.BUNDLE_GENERATION_LATENCY,
    start_time=start_time,
    dimensions={"StudentId": student_id},
)
```

## Deployment

### Infrastructure as Code

Monitoring resources are defined in CDK:

```python
# cloud-brain/infrastructure/stacks/cloud_brain_stack.py

# Log groups with retention
log_group = logs.LogGroup(
    self,
    "ContentGenerationLogGroup",
    log_group_name=f"/aws/lambda/sikshya-sathi-content-gen-{env}",
    retention=logs.RetentionDays.ONE_MONTH,
)

# CloudWatch alarms
alarm = cloudwatch.Alarm(
    self,
    "ContentGenerationLatencyAlarm",
    metric=cloudwatch.Metric(
        namespace="SikshyaSathi/CloudBrain",
        metric_name="ContentGenerationLatency",
        statistic="p95",
    ),
    threshold=60000,
    evaluation_periods=2,
)
```

### Deploy Monitoring

```bash
cd cloud-brain/infrastructure
cdk deploy --all
```

## Viewing Metrics

### CloudWatch Console

1. Navigate to CloudWatch → Metrics
2. Select namespace: `SikshyaSathi/CloudBrain`
3. Choose metric and dimensions
4. Create graphs and dashboards

### AWS CLI

```bash
# Get metric statistics
aws cloudwatch get-metric-statistics \
  --namespace SikshyaSathi/CloudBrain \
  --metric-name ContentGenerationLatency \
  --dimensions Name=ContentType,Value=lesson \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 300 \
  --statistics Average,Maximum,p95
```

## Troubleshooting

### No Metrics Appearing

1. Check Lambda IAM role has `cloudwatch:PutMetricData` permission
2. Verify environment variables are set:
   - `POWERTOOLS_METRICS_NAMESPACE=SikshyaSathi/CloudBrain`
3. Check CloudWatch Logs for errors

### Alarm Not Triggering

1. Verify alarm is in "OK" state (not "INSUFFICIENT_DATA")
2. Check metric is being published regularly
3. Verify SNS topic subscription is confirmed

### High Latency

1. Check CloudWatch Logs for errors
2. Review Bedrock Agent performance
3. Check DynamoDB throttling metrics
4. Review Lambda memory and timeout settings

## Best Practices

1. **Always use dimensions** to segment metrics by content type, subject, etc.
2. **Don't fail operations** if metrics fail - monitoring should be non-blocking
3. **Use structured logging** with context for easier debugging
4. **Set appropriate alarm thresholds** based on actual performance data
5. **Review metrics regularly** to identify trends and optimize performance

## Requirements Validation

This monitoring setup validates the following requirements:

- **Requirement 12.1-12.10**: Success metrics and monitoring
  - Tracks content generation latency
  - Tracks validation success rate
  - Tracks sync completion rate
  - Provides dashboards for analytics
  - Monitors system health and performance

## Future Enhancements

1. **CloudWatch Dashboard**: Create pre-built dashboard for common metrics
2. **X-Ray Tracing**: Add distributed tracing for end-to-end request tracking
3. **Custom Metrics**: Add metrics for Bedrock token usage, cost tracking
4. **Log Insights Queries**: Pre-built queries for common troubleshooting scenarios
5. **Anomaly Detection**: Use CloudWatch Anomaly Detection for automatic threshold adjustment
