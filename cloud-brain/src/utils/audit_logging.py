"""Audit logging utilities for content generation and validation."""

import json
from datetime import datetime
from enum import Enum
from typing import Any, Optional

import boto3
from aws_lambda_powertools import Logger

logger = Logger()


class AuditEventType(str, Enum):
    """Types of audit events."""
    
    CONTENT_GENERATION_REQUEST = "ContentGenerationRequest"
    CONTENT_VALIDATION_RESULT = "ContentValidationResult"
    CONTENT_REJECTION = "ContentRejection"
    BUNDLE_GENERATION = "BundleGeneration"
    MCP_SERVER_ERROR = "MCPServerError"


class AuditLogger:
    """Service for structured audit logging to CloudWatch Logs."""
    
    def __init__(
        self,
        log_group_name: str = "/aws/lambda/content-generator",
        retention_days: int = 90,
    ):
        """
        Initialize audit logger.
        
        Args:
            log_group_name: CloudWatch Logs group name
            retention_days: Log retention period in days (default: 90)
        """
        self.log_group_name = log_group_name
        self.retention_days = retention_days
        self.logs_client = boto3.client("logs")
        
        # Ensure log group exists with correct retention
        self._ensure_log_group()
    
    def _ensure_log_group(self) -> None:
        """Ensure CloudWatch Logs group exists with correct retention."""
        try:
            # Check if log group exists
            response = self.logs_client.describe_log_groups(
                logGroupNamePrefix=self.log_group_name,
                limit=1,
            )
            
            if not response.get("logGroups"):
                # Create log group
                self.logs_client.create_log_group(
                    logGroupName=self.log_group_name,
                )
                logger.info(f"Created log group: {self.log_group_name}")
            
            # Set retention policy
            self.logs_client.put_retention_policy(
                logGroupName=self.log_group_name,
                retentionInDays=self.retention_days,
            )
            logger.debug(
                f"Set retention policy: {self.retention_days} days for {self.log_group_name}"
            )
            
        except Exception as e:
            # Don't fail if log group management fails
            logger.warning(f"Failed to ensure log group: {e}")
    
    def log_audit_event(
        self,
        event_type: AuditEventType,
        event_data: dict[str, Any],
        student_id: Optional[str] = None,
    ) -> None:
        """
        Log a structured audit event.
        
        Args:
            event_type: Type of audit event
            event_data: Event-specific data
            student_id: Optional student identifier (anonymized in logs)
        """
        try:
            # Create structured log entry
            audit_entry = {
                "timestamp": datetime.utcnow().isoformat(),
                "event_type": event_type.value,
                "student_id": self._anonymize_student_id(student_id) if student_id else None,
                **event_data,
            }
            
            # Log to CloudWatch using Lambda Powertools Logger
            logger.info(
                f"AUDIT: {event_type.value}",
                extra={"audit_event": audit_entry},
            )
            
        except Exception as e:
            # Don't fail the operation if audit logging fails
            logger.warning(f"Failed to log audit event {event_type.value}: {e}")
    
    def log_content_generation_request(
        self,
        student_id: str,
        subject: str,
        topic: str,
        content_type: str,  # "lesson" or "quiz"
        difficulty: str,
        curriculum_standards: list[str],
    ) -> None:
        """
        Log a content generation request.
        
        Validates: Requirements 15.1
        
        Args:
            student_id: Student identifier
            subject: Subject area
            topic: Topic name
            content_type: Type of content (lesson or quiz)
            difficulty: Difficulty level
            curriculum_standards: Target curriculum standard IDs
        """
        self.log_audit_event(
            event_type=AuditEventType.CONTENT_GENERATION_REQUEST,
            event_data={
                "subject": subject,
                "topic": topic,
                "content_type": content_type,
                "difficulty": difficulty,
                "curriculum_standards": curriculum_standards,
            },
            student_id=student_id,
        )
    
    def log_validation_result(
        self,
        content_id: str,
        content_type: str,
        validation_status: str,
        alignment_score: float,
        passed_checks: list[str],
        failed_checks: list[str],
        student_id: Optional[str] = None,
    ) -> None:
        """
        Log content validation results.
        
        Validates: Requirements 15.2
        
        Args:
            content_id: Content identifier
            content_type: Type of content (lesson or quiz)
            validation_status: Validation status (passed, failed, needs_regeneration)
            alignment_score: Curriculum alignment score (0-1)
            passed_checks: List of passed validation checks
            failed_checks: List of failed validation checks
            student_id: Optional student identifier
        """
        self.log_audit_event(
            event_type=AuditEventType.CONTENT_VALIDATION_RESULT,
            event_data={
                "content_id": content_id,
                "content_type": content_type,
                "validation_status": validation_status,
                "alignment_score": alignment_score,
                "passed_checks": passed_checks,
                "failed_checks": failed_checks,
                "passed_count": len(passed_checks),
                "failed_count": len(failed_checks),
            },
            student_id=student_id,
        )
    
    def log_content_rejection(
        self,
        content_id: str,
        content_type: str,
        rejection_reasons: list[str],
        regeneration_attempt: int,
        max_attempts: int,
        student_id: Optional[str] = None,
    ) -> None:
        """
        Log content rejection and regeneration attempts.
        
        Validates: Requirements 15.3
        
        Args:
            content_id: Content identifier
            content_type: Type of content (lesson or quiz)
            rejection_reasons: List of rejection reasons
            regeneration_attempt: Current regeneration attempt number
            max_attempts: Maximum regeneration attempts allowed
            student_id: Optional student identifier
        """
        self.log_audit_event(
            event_type=AuditEventType.CONTENT_REJECTION,
            event_data={
                "content_id": content_id,
                "content_type": content_type,
                "rejection_reasons": rejection_reasons,
                "regeneration_attempt": regeneration_attempt,
                "max_attempts": max_attempts,
                "will_retry": regeneration_attempt < max_attempts,
            },
            student_id=student_id,
        )
    
    def log_bundle_generation(
        self,
        bundle_id: str,
        student_id: str,
        size_bytes: int,
        content_count: int,
        subjects: list[str],
        generation_duration_ms: float,
        success: bool,
        error_message: Optional[str] = None,
    ) -> None:
        """
        Log bundle generation events.
        
        Validates: Requirements 15.4
        
        Args:
            bundle_id: Bundle identifier
            student_id: Student identifier
            size_bytes: Bundle size in bytes
            content_count: Number of content items in bundle
            subjects: List of subjects included
            generation_duration_ms: Generation duration in milliseconds
            success: Whether generation succeeded
            error_message: Optional error message if failed
        """
        self.log_audit_event(
            event_type=AuditEventType.BUNDLE_GENERATION,
            event_data={
                "bundle_id": bundle_id,
                "size_bytes": size_bytes,
                "size_mb": round(size_bytes / 1_000_000, 2),
                "content_count": content_count,
                "subjects": subjects,
                "subject_count": len(subjects),
                "generation_duration_ms": generation_duration_ms,
                "success": success,
                "error_message": error_message,
            },
            student_id=student_id,
        )
    
    def log_mcp_server_error(
        self,
        error_type: str,
        error_message: str,
        tool_name: Optional[str] = None,
        retry_attempt: Optional[int] = None,
        max_retries: Optional[int] = None,
    ) -> None:
        """
        Log MCP Server errors.
        
        Args:
            error_type: Type of error (unavailable, invalid_data, timeout)
            error_message: Error message
            tool_name: Optional MCP tool name
            retry_attempt: Optional retry attempt number
            max_retries: Optional maximum retries
        """
        self.log_audit_event(
            event_type=AuditEventType.MCP_SERVER_ERROR,
            event_data={
                "error_type": error_type,
                "error_message": error_message,
                "tool_name": tool_name,
                "retry_attempt": retry_attempt,
                "max_retries": max_retries,
                "will_retry": retry_attempt < max_retries if retry_attempt and max_retries else False,
            },
        )
    
    def _anonymize_student_id(self, student_id: str) -> str:
        """
        Anonymize student ID for privacy.
        
        Args:
            student_id: Original student ID
            
        Returns:
            Anonymized student ID (hashed)
        """
        import hashlib
        
        # Hash student ID for privacy
        hashed = hashlib.sha256(student_id.encode()).hexdigest()
        
        # Return first 16 characters of hash
        return f"student_{hashed[:16]}"


# Global audit logger instance
_audit_logger: Optional[AuditLogger] = None


def get_audit_logger(
    log_group_name: str = "/aws/lambda/content-generator",
    retention_days: int = 90,
) -> AuditLogger:
    """
    Get or create global audit logger instance.
    
    Args:
        log_group_name: CloudWatch Logs group name
        retention_days: Log retention period in days
        
    Returns:
        AuditLogger instance
    """
    global _audit_logger
    if _audit_logger is None:
        _audit_logger = AuditLogger(
            log_group_name=log_group_name,
            retention_days=retention_days,
        )
    return _audit_logger
