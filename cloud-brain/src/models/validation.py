"""Validation models for content quality and safety checks."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ValidationStatus(str, Enum):
    """Validation result status."""

    PASSED = "passed"
    FAILED = "failed"
    NEEDS_REGENERATION = "needs_regeneration"


class ValidationCheckType(str, Enum):
    """Types of validation checks."""

    CURRICULUM_ALIGNMENT = "curriculum_alignment"
    AGE_APPROPRIATENESS = "age_appropriateness"
    LANGUAGE_APPROPRIATENESS = "language_appropriateness"
    SAFETY_FILTER = "safety_filter"
    CULTURAL_APPROPRIATENESS = "cultural_appropriateness"


class ValidationIssue(BaseModel):
    """Individual validation issue found in content."""

    check_type: ValidationCheckType = Field(..., description="Type of validation check")
    severity: str = Field(..., description="Issue severity: low, medium, high, critical")
    message: str = Field(..., description="Human-readable issue description")
    location: Optional[str] = Field(None, description="Location in content where issue was found")
    suggestion: Optional[str] = Field(None, description="Suggestion for fixing the issue")


class ValidationResult(BaseModel):
    """Result of content validation."""

    content_id: str = Field(..., description="Unique identifier for the content")
    content_type: str = Field(..., description="Type of content: lesson, quiz, hint")
    status: ValidationStatus = Field(..., description="Overall validation status")
    passed_checks: list[ValidationCheckType] = Field(
        default_factory=list, description="List of checks that passed"
    )
    failed_checks: list[ValidationCheckType] = Field(
        default_factory=list, description="List of checks that failed"
    )
    issues: list[ValidationIssue] = Field(
        default_factory=list, description="List of validation issues found"
    )
    alignment_score: Optional[float] = Field(
        None, ge=0, le=1, description="Curriculum alignment score (0-1)"
    )
    validated_at: datetime = Field(
        default_factory=datetime.utcnow, description="Validation timestamp"
    )
    validator_version: str = Field(
        default="1.0.0", description="Version of validator used"
    )


class ContentValidationRequest(BaseModel):
    """Request for content validation."""

    content_id: str = Field(..., description="Unique identifier for the content")
    content_type: str = Field(..., description="Type of content: lesson, quiz, hint")
    content: str = Field(..., description="Content to validate")
    target_standards: list[str] = Field(
        ..., description="Target curriculum standard IDs"
    )
    grade: int = Field(..., ge=6, le=8, description="Target grade level")
    subject: str = Field(..., description="Subject area")
    metadata: dict = Field(
        default_factory=dict, description="Additional metadata for validation"
    )


class ValidationAuditLog(BaseModel):
    """Audit log entry for validation events."""

    log_id: str = Field(..., description="Unique log identifier")
    content_id: str = Field(..., description="Content identifier")
    content_type: str = Field(..., description="Type of content")
    validation_result: ValidationResult = Field(..., description="Validation result")
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="Log timestamp"
    )
    regeneration_count: int = Field(
        default=0, description="Number of regeneration attempts"
    )
    final_status: ValidationStatus = Field(
        ..., description="Final status after all attempts"
    )
