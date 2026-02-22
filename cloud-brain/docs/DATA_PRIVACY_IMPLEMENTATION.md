# Data Privacy Implementation

This document describes the implementation of data privacy features for the Sikshya-Sathi system, addressing requirements 9.2, 9.7, and 9.8.

## Overview

The data privacy implementation consists of three main services:

1. **DataAnonymizationService** - Anonymizes student data before analytics processing
2. **DataExportService** - Exports student learning data in human-readable formats
3. **DataDeletionService** - Deletes student learning history with cascading deletes

## Services

### 1. DataAnonymizationService

**Purpose**: Anonymize student data before analytics processing and remove PII from logs.

**Key Features**:
- One-way hashing of student IDs using SHA256
- PII removal from text (emails, phone numbers, names)
- Anonymization of performance logs
- Anonymization of knowledge models
- Log message sanitization

**Usage Example**:
```python
from src.services.data_anonymization import DataAnonymizationService

# Initialize service
anonymizer = DataAnonymizationService(salt="secure-salt")

# Anonymize student ID
anonymized_id = anonymizer.anonymize_student_id("student123")

# Anonymize performance logs for analytics
anonymized_logs = anonymizer.anonymize_performance_logs(performance_logs)

# Anonymize knowledge model
anonymized_model = anonymizer.anonymize_knowledge_model(knowledge_model)

# Sanitize log messages
clean_message = anonymizer.sanitize_log_message("User john@example.com logged in")
```

**Compliance**: Addresses Requirement 9.2 - Anonymize student data before analytics processing.

### 2. DataExportService

**Purpose**: Provide data export functionality for students and parents.

**Key Features**:
- Export performance logs to CSV
- Export knowledge models to CSV
- Generate comprehensive student summaries (CSV)
- Generate human-readable text reports
- Support for multiple export formats

**Usage Example**:
```python
from src.services.data_export import DataExportService

# Initialize service
exporter = DataExportService()

# Export student data in CSV format
csv_export = exporter.export_student_data(
    student_id="student123",
    logs=performance_logs,
    format="csv"
)
# Returns: {
#   "format": "csv",
#   "files": {
#     "summary.csv": "...",
#     "knowledge_model.csv": "...",
#     "performance_logs.csv": "..."
#   },
#   "export_date": "2024-01-01T12:00:00"
# }

# Export student data in text format
text_export = exporter.export_student_data(
    student_id="student123",
    logs=performance_logs,
    format="text"
)
# Returns: {
#   "format": "text",
#   "content": "STUDENT LEARNING REPORT\n...",
#   "export_date": "2024-01-01T12:00:00"
# }
```

**Export Formats**:
- **CSV**: Multiple files (summary, knowledge model, performance logs)
- **Text**: Single human-readable report with all sections

**Compliance**: Addresses Requirement 9.7 - Provide data export functionality for students and parents.

### 3. DataDeletionService

**Purpose**: Allow students to delete their learning history with cascading deletes.

**Key Features**:
- Delete student knowledge models from DynamoDB
- Delete learning bundles from S3 and metadata from DynamoDB
- Delete sync sessions from DynamoDB
- Cascading deletes across all related data
- Verification of deletion completeness

**Usage Example**:
```python
from src.services.data_deletion import DataDeletionService

# Initialize service
deleter = DataDeletionService(
    students_table_name="sikshya-sathi-students-dev",
    bundles_table_name="sikshya-sathi-bundles-dev",
    sync_sessions_table_name="sikshya-sathi-sync-sessions-dev",
    s3_bucket_name="sikshya-sathi-bundles-dev"
)

# Delete all student data (cascading)
result = deleter.delete_student_learning_history("student123")
# Returns: {
#   "student_id": "student123",
#   "knowledge_model_deleted": True,
#   "bundles": {
#     "total_bundles": 5,
#     "s3_deleted": 5,
#     "metadata_deleted": 5,
#     "errors": []
#   },
#   "sync_sessions": {
#     "total_sessions": 10,
#     "deleted": 10,
#     "errors": []
#   },
#   "success": True,
#   "errors": []
# }

# Verify deletion
verification = deleter.verify_deletion("student123")
# Returns: {
#   "knowledge_model_exists": False,
#   "bundles_exist": False,
#   "sync_sessions_exist": False
# }
```

**Cascading Delete Order**:
1. Knowledge model (DynamoDB)
2. Learning bundles (S3 + DynamoDB metadata)
3. Sync sessions (DynamoDB)

**Compliance**: Addresses Requirement 9.8 - Allow students to delete their learning history.

## Data Flow

### Anonymization Flow
```
Raw Student Data
    ↓
DataAnonymizationService
    ↓
Anonymized Data (for analytics)
```

### Export Flow
```
Student Request
    ↓
DataExportService
    ↓
Retrieve Knowledge Model + Performance Logs
    ↓
Generate CSV/Text Report
    ↓
Return to Student/Parent
```

### Deletion Flow
```
Student Deletion Request
    ↓
DataDeletionService
    ↓
Delete Knowledge Model (DynamoDB)
    ↓
Delete Bundles (S3 + DynamoDB)
    ↓
Delete Sync Sessions (DynamoDB)
    ↓
Verify Deletion
    ↓
Return Confirmation
```

## Testing

All services have comprehensive unit tests:

- **test_data_anonymization.py**: 12 tests covering anonymization logic
- **test_data_export.py**: 15 tests covering export formats
- **test_data_deletion.py**: 19 tests covering cascading deletes

Run tests:
```bash
python3 -m pytest tests/test_data_anonymization.py tests/test_data_export.py tests/test_data_deletion.py -v
```

## Security Considerations

### Anonymization
- Uses SHA256 hashing with salt for student ID anonymization
- One-way hashing ensures original IDs cannot be recovered
- PII patterns are removed using regex (emails, phones, names)
- Salt should be stored securely and rotated periodically

### Export
- Exports should be authenticated (verify student/parent identity)
- Exports should be delivered over secure channels (HTTPS)
- Export data should be encrypted in transit
- Consider rate limiting to prevent abuse

### Deletion
- Deletion should require strong authentication
- Consider implementing a confirmation step (e.g., email verification)
- Deletion is permanent and cannot be undone
- Consider implementing a grace period before permanent deletion
- Audit all deletion requests for compliance

## Integration with Cloud Brain

These services can be integrated into the Cloud Brain API handlers:

```python
# In sync_handler.py or new privacy_handler.py

from src.services import DataAnonymizationService, DataExportService, DataDeletionService

# Anonymize logs before analytics
anonymizer = DataAnonymizationService()
anonymized_logs = anonymizer.anonymize_performance_logs(logs)
# Send to analytics service

# Export student data
exporter = DataExportService()
export_data = exporter.export_student_data(student_id, logs, format="csv")
# Return to API caller

# Delete student data
deleter = DataDeletionService()
result = deleter.delete_student_learning_history(student_id)
# Return confirmation to API caller
```

## Future Enhancements

1. **PDF Export**: Add PDF generation for more professional reports
2. **Scheduled Exports**: Allow students to schedule periodic exports
3. **Partial Deletion**: Allow deletion of specific date ranges
4. **Anonymization Levels**: Support different levels of anonymization
5. **Audit Trail**: Maintain audit logs of all privacy operations
6. **GDPR Compliance**: Add additional features for GDPR compliance
7. **Data Portability**: Support export in machine-readable formats (JSON)

## References

- Requirement 9.2: Anonymize student data before analytics processing
- Requirement 9.7: Provide data export functionality for students and parents
- Requirement 9.8: Allow students to delete their learning history
- Design Document: Data Privacy and Security section
