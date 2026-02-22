# Dashboard Implementation

## Overview

This document describes the implementation of monitoring dashboards for the Sikshya-Sathi system, fulfilling task 21.3 and validating Requirement 12.9.

## Dashboards Implemented

### 1. CloudWatch Dashboard for Cloud Brain Metrics

**Purpose**: Provide real-time operational visibility into Cloud Brain performance and health.

**Location**: 
- CDK Infrastructure: `cloud-brain/infrastructure/dashboards/cloudwatch_dashboard.py`
- Deployment Script: `cloud-brain/infrastructure/dashboards/deploy_dashboard.py`

**Metrics Displayed**:

#### Content Generation Metrics
- **Content Generation Latency**: p50, p95, p99 percentiles
  - Target: p95 < 60 seconds
  - Helps identify performance bottlenecks in Bedrock Agent
  
- **Content Generation by Type**: Count of lessons, quizzes, hints generated
  - Tracks content generation volume
  - Helps with capacity planning

#### Validation Metrics
- **Validation Success Rate**: Overall validation success percentage
  - Target: > 95%
  - Indicates content quality and curriculum alignment
  
- **Validation Success by Content Type**: Success rate for lessons vs quizzes
  - Identifies which content types need improvement
  - Helps tune validation rules

#### Sync Metrics
- **Sync Completion Rate**: Upload and download success rates
  - Target: > 90%
  - Critical for offline-first architecture
  
- **Bundle Generation Latency**: Time to create learning bundles
  - Target: < 30 seconds
  - Impacts student sync experience

#### Lambda Metrics
- **Lambda Errors by Function**: Error counts for each Lambda function
  - Content generation, sync upload, sync download
  - Alerts on critical failures
  
- **Lambda Invocations**: Request volume per function
  - Tracks system usage
  - Helps with scaling decisions

#### Knowledge Model Metrics
- **Knowledge Model Update Latency**: Time to update student models
  - Target: < 5 seconds
  - Impacts personalization responsiveness

#### System Health
- **System Health Summary**: Single-value metrics for quick health check
  - Validation success rate (last hour)
  - Sync success rate (last hour)

**Deployment**:

Using CDK (Infrastructure as Code):
```bash
cd cloud-brain/infrastructure
cdk deploy --all
```

Using Python script (Direct API):
```bash
cd cloud-brain/infrastructure/dashboards
python deploy_dashboard.py
```

**Access**:
- Dashboard Name: `SikshyaSathi-CloudBrain-Metrics`
- AWS Console: CloudWatch → Dashboards → SikshyaSathi-CloudBrain-Metrics
- Direct URL: `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=SikshyaSathi-CloudBrain-Metrics`

### 2. Educator Dashboard for Student Analytics

**Purpose**: Provide educators with comprehensive visibility into student progress, class performance, and curriculum coverage.

**Location**: `cloud-brain/web-dashboard/src/components/EducatorDashboard.tsx`

**Features**:

#### Summary Cards
- **Total Students**: Count of all students in educator's classes
- **Active Students**: Students with activity in last 7 days
- **Average Accuracy**: Class-wide quiz accuracy
- **Struggling Students**: Count of students needing support (< 40% proficiency)

#### Student Progress Tab
Displays individual student progress across subjects:
- Student name and subject
- Lessons completed
- Quizzes completed
- Average accuracy
- Topics mastered count
- Status indicator (Excellent / Good / Needs Support)

**Use Cases**:
- Identify students who need additional support
- Track individual learning progress
- Monitor engagement and completion rates

#### Class Performance Tab
Displays aggregate class-level metrics:
- Completion rate progress bar
- Average accuracy progress bar
- Top performers list (> 80% proficiency)
- Struggling students list (< 40% proficiency)

**Use Cases**:
- Compare class performance across subjects
- Identify high and low performers
- Track overall class progress

#### Curriculum Coverage Tab
Displays curriculum coverage by subject:
- Coverage progress bar (percentage)
- Total topics in curriculum
- Topics covered count
- Topics mastered count
- Visual breakdown by subject

**Use Cases**:
- Ensure comprehensive curriculum coverage
- Identify gaps in learning
- Plan future lessons based on coverage

**Technology Stack**:
- **Frontend**: React 18 with TypeScript
- **UI Framework**: Material-UI (MUI) v5
- **Icons**: Material Icons
- **Build Tool**: Vite
- **State Management**: React Hooks (useState, useEffect)

**API Integration**:
The dashboard fetches data from the Cloud Brain API:
- Endpoint: `GET /api/educator/dashboard`
- Authentication: JWT Bearer token
- Response: Complete dashboard data (student progress, class reports, coverage reports)

**Backend Services** (Already Implemented):
- `src/services/educator_dashboard.py`: Dashboard data generation
- `src/handlers/educator_handler.py`: API endpoints
- `src/models/educator.py`: Data models

**Setup and Development**:

Install dependencies:
```bash
cd cloud-brain/web-dashboard
npm install
```

Run development server:
```bash
npm run dev
```

Build for production:
```bash
npm run build
```

**Deployment**:
The web dashboard can be deployed to:
- AWS S3 + CloudFront (static hosting)
- AWS Amplify (continuous deployment)
- Any static hosting service

## Integration with Monitoring Services

### Cloud Brain Monitoring Integration

The CloudWatch dashboard displays metrics published by the `MonitoringService`:

```python
from src.utils.monitoring import get_monitoring_service, MetricName

monitoring = get_monitoring_service()

# Metrics are automatically published to CloudWatch
monitoring.record_latency(
    MetricName.CONTENT_GENERATION_LATENCY,
    start_time=start_time,
    dimensions={"ContentType": "lesson", "Subject": "Mathematics"}
)
```

All Lambda functions use the monitoring service to publish metrics, which are then visualized in the CloudWatch dashboard.

### Educator Dashboard Integration

The educator dashboard fetches data from the educator dashboard service:

```python
# In educator_handler.py
from src.services.educator_dashboard import EducatorDashboardService

dashboard_service = EducatorDashboardService(knowledge_repository)
dashboard_data = dashboard_service.get_dashboard_data(
    educator_id=educator_id,
    class_ids=class_ids,
    student_ids=student_ids
)
```

The service aggregates data from:
- Student knowledge models (DynamoDB)
- Performance logs (DynamoDB)
- Curriculum data (MCP Server)

## Requirements Validation

This implementation validates the following requirements:

### Requirement 12.9: Educator Dashboards
✓ **CloudWatch Dashboard**: Provides system-level analytics for administrators
  - Content generation metrics
  - Validation success rates
  - Sync performance
  - Lambda health and errors

✓ **Educator Dashboard**: Provides class-level analytics for educators
  - Student progress tracking
  - Class performance reports
  - Curriculum coverage visualization
  - Identification of struggling students

### Additional Requirements Supported

**Requirement 12.1**: Student Learning Improvement
- Dashboard tracks progress over time
- Identifies students needing intervention

**Requirement 12.2**: Daily Active Usage
- Active students metric in summary cards
- Last active timestamp in student progress

**Requirement 12.3**: Quiz Completion and Accuracy
- Quizzes completed count
- Average accuracy metrics
- Accuracy trends by student

**Requirement 12.4**: Content Coverage
- Curriculum coverage reports
- Topics covered vs total topics
- Subject-level coverage breakdown

**Requirement 12.5**: Sync Success Rates
- CloudWatch dashboard shows sync completion rate
- Upload and download metrics separated

**Requirement 12.10**: Struggling Student Identification
- Struggling students list in class performance
- Status indicators in student progress
- Automatic flagging based on proficiency thresholds

## Dashboard Access and Permissions

### CloudWatch Dashboard
**Required IAM Permissions**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:GetDashboard",
        "cloudwatch:ListDashboards",
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:GetMetricData"
      ],
      "Resource": "*"
    }
  ]
}
```

**Access Roles**:
- System Administrators: Full access
- DevOps Engineers: Full access
- Educators: Read-only access (optional)

### Educator Dashboard
**Authentication**: JWT-based authentication
**Authorization**: Role-based access control (RBAC)

**Access Roles**:
- Educators: Access to their assigned classes only
- School Administrators: Access to all classes in their school
- System Administrators: Full access to all data

## Monitoring Best Practices

### CloudWatch Dashboard
1. **Set up alarms** for critical metrics (validation success < 95%, sync failure > 10%)
2. **Review metrics daily** to identify trends and issues
3. **Use percentiles** (p95, p99) instead of averages for latency metrics
4. **Monitor error rates** to catch issues before they impact students
5. **Track costs** using CloudWatch metrics and billing alarms

### Educator Dashboard
1. **Check daily** for struggling students needing support
2. **Review class performance** weekly to identify trends
3. **Monitor curriculum coverage** to ensure comprehensive learning
4. **Use top performers** as peer mentors for struggling students
5. **Export data** for deeper analysis and reporting

## Future Enhancements

### CloudWatch Dashboard
1. **Anomaly Detection**: Use CloudWatch Anomaly Detection for automatic threshold adjustment
2. **X-Ray Integration**: Add distributed tracing for end-to-end request tracking
3. **Cost Metrics**: Track Bedrock token usage and AWS costs
4. **Custom Insights**: Pre-built CloudWatch Insights queries for troubleshooting
5. **Mobile Alerts**: SNS notifications for critical issues

### Educator Dashboard
1. **Real-time Updates**: WebSocket integration for live data updates
2. **Export Functionality**: Download reports as PDF or CSV
3. **Trend Analysis**: Historical charts showing progress over time
4. **Predictive Analytics**: ML-powered predictions for student outcomes
5. **Mobile App**: Native mobile interface for on-the-go access
6. **Collaborative Features**: Share insights with other educators
7. **Custom Reports**: Build custom reports with drag-and-drop interface

## Troubleshooting

### CloudWatch Dashboard Issues

**Problem**: No metrics appearing in dashboard
- **Solution**: Verify Lambda functions are publishing metrics using MonitoringService
- **Check**: CloudWatch Logs for metric publishing errors
- **Verify**: IAM permissions for `cloudwatch:PutMetricData`

**Problem**: Dashboard shows "Insufficient Data"
- **Solution**: Wait for metrics to be published (5-minute intervals)
- **Check**: Lambda functions have been invoked recently
- **Verify**: Metric namespace and dimensions are correct

### Educator Dashboard Issues

**Problem**: Dashboard shows "Failed to fetch dashboard data"
- **Solution**: Verify API endpoint is accessible
- **Check**: Authentication token is valid
- **Verify**: CORS settings allow frontend domain

**Problem**: Empty or incomplete data
- **Solution**: Verify students have performance data in DynamoDB
- **Check**: Knowledge models exist for students
- **Verify**: Educator has correct class assignments

## Conclusion

The dashboard implementation provides comprehensive monitoring and analytics for both system operations (CloudWatch) and educational outcomes (Educator Dashboard). These dashboards enable data-driven decision making, early intervention for struggling students, and continuous system improvement.

**Key Achievements**:
- ✓ Real-time operational metrics for Cloud Brain
- ✓ Comprehensive student analytics for educators
- ✓ Identification of struggling students and top performers
- ✓ Curriculum coverage tracking
- ✓ System health monitoring
- ✓ Scalable and maintainable architecture

**Requirements Validated**: 12.9 (Educator Dashboards)
