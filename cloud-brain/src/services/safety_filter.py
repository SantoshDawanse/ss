"""Safety Filter service for content filtering and guardrails."""

import json
import logging
import uuid
from datetime import datetime
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from src.models.validation import (
    ValidationAuditLog,
    ValidationCheckType,
    ValidationIssue,
    ValidationResult,
    ValidationStatus,
)

logger = logging.getLogger(__name__)


class SafetyFilter:
    """Safety filter service integrating with AWS Bedrock Guardrails.
    
    This service provides:
    1. Integration with Bedrock Guardrails for content filtering
    2. Inappropriate content detection
    3. Cultural appropriateness validation for Nepal context
    4. Audit logging for validation results
    """

    def __init__(
        self,
        guardrail_id: Optional[str] = None,
        guardrail_version: Optional[str] = None,
        audit_table_name: Optional[str] = None,
    ):
        """Initialize the safety filter.
        
        Args:
            guardrail_id: AWS Bedrock Guardrail ID (optional for testing)
            guardrail_version: Guardrail version (optional)
            audit_table_name: DynamoDB table name for audit logs (optional)
        """
        self.guardrail_id = guardrail_id
        self.guardrail_version = guardrail_version or "DRAFT"
        self.audit_table_name = audit_table_name
        
        # Initialize AWS clients
        try:
            self.bedrock_runtime = boto3.client("bedrock-runtime")
            if audit_table_name:
                self.dynamodb = boto3.resource("dynamodb")
                self.audit_table = self.dynamodb.Table(audit_table_name)
            else:
                self.dynamodb = None
                self.audit_table = None
        except Exception as e:
            logger.warning(f"Failed to initialize AWS clients: {e}")
            self.bedrock_runtime = None
            self.dynamodb = None
            self.audit_table = None
        
        # Nepal-specific inappropriate content patterns
        self.inappropriate_patterns = {
            "violence": [
                "kill", "murder", "assault", "attack", "fight", "war",
                "weapon", "gun", "knife", "bomb", "explosive"
            ],
            "adult_content": [
                "sex", "sexual", "porn", "adult", "explicit", "mature",
                "nude", "naked"
            ],
            "substance": [
                "alcohol", "beer", "wine", "drunk", "drug", "marijuana",
                "cocaine", "heroin", "smoking", "cigarette", "tobacco"
            ],
            "gambling": [
                "casino", "gambling", "bet", "lottery", "poker"
            ],
            "hate_speech": [
                "hate", "racist", "discrimination", "prejudice"
            ],
        }
        
        # Nepal cultural sensitivity patterns
        self.cultural_sensitivity_patterns = {
            "political": [
                "political party", "election", "government corruption",
                "protest", "revolution"
            ],
            "religious": [
                "religious conflict", "hindu muslim", "christian conversion",
                "religious superiority"
            ],
            "caste": [
                "caste system", "untouchable", "dalit discrimination",
                "brahmin superiority", "caste hierarchy"
            ],
            "ethnic": [
                "ethnic conflict", "madhesi", "pahadi", "ethnic superiority"
            ],
        }

    def filter_content(
        self,
        content: str,
        content_id: str,
        content_type: str,
        use_guardrails: bool = True,
    ) -> ValidationResult:
        """Filter content through safety checks.
        
        Args:
            content: Content to filter
            content_id: Unique content identifier
            content_type: Type of content (lesson, quiz, hint)
            use_guardrails: Whether to use Bedrock Guardrails (requires AWS setup)
            
        Returns:
            ValidationResult with safety check results
        """
        logger.info(f"Filtering content {content_id} (type: {content_type})")
        
        issues: list[ValidationIssue] = []
        passed_checks: list[ValidationCheckType] = []
        failed_checks: list[ValidationCheckType] = []
        
        # 1. Bedrock Guardrails check (if enabled and configured)
        if use_guardrails and self.guardrail_id and self.bedrock_runtime:
            guardrail_result = self._check_bedrock_guardrails(content)
            if guardrail_result["passed"]:
                passed_checks.append(ValidationCheckType.SAFETY_FILTER)
            else:
                failed_checks.append(ValidationCheckType.SAFETY_FILTER)
                issues.extend(guardrail_result["issues"])
        else:
            # Fallback to pattern-based filtering
            pattern_result = self._check_inappropriate_patterns(content)
            if pattern_result["passed"]:
                passed_checks.append(ValidationCheckType.SAFETY_FILTER)
            else:
                failed_checks.append(ValidationCheckType.SAFETY_FILTER)
                issues.extend(pattern_result["issues"])
        
        # 2. Cultural sensitivity check
        cultural_result = self._check_cultural_sensitivity(content)
        if cultural_result["passed"]:
            passed_checks.append(ValidationCheckType.CULTURAL_APPROPRIATENESS)
        else:
            failed_checks.append(ValidationCheckType.CULTURAL_APPROPRIATENESS)
            issues.extend(cultural_result["issues"])
        
        # Determine overall status
        critical_issues = [i for i in issues if i.severity == "critical"]
        if len(failed_checks) == 0:
            status = ValidationStatus.PASSED
        elif critical_issues:
            status = ValidationStatus.NEEDS_REGENERATION
        else:
            status = ValidationStatus.FAILED
        
        result = ValidationResult(
            content_id=content_id,
            content_type=content_type,
            status=status,
            passed_checks=passed_checks,
            failed_checks=failed_checks,
            issues=issues,
        )
        
        logger.info(
            f"Safety filtering complete for {content_id}: "
            f"status={status}, issues={len(issues)}"
        )
        
        return result

    def _check_bedrock_guardrails(self, content: str) -> dict:
        """Check content using AWS Bedrock Guardrails.
        
        Args:
            content: Content to check
            
        Returns:
            Dict with passed status and issues
        """
        try:
            # Call Bedrock Guardrails API
            response = self.bedrock_runtime.apply_guardrail(
                guardrailIdentifier=self.guardrail_id,
                guardrailVersion=self.guardrail_version,
                source="INPUT",
                content=[{"text": {"text": content}}],
            )
            
            # Parse guardrail response
            action = response.get("action")
            assessments = response.get("assessments", [])
            
            issues = []
            
            if action == "GUARDRAIL_INTERVENED":
                # Guardrail blocked the content
                for assessment in assessments:
                    for topic_policy in assessment.get("topicPolicy", {}).get("topics", []):
                        issues.append(
                            ValidationIssue(
                                check_type=ValidationCheckType.SAFETY_FILTER,
                                severity="critical",
                                message=f"Guardrail blocked: {topic_policy.get('name')}",
                                suggestion="Remove or rephrase inappropriate content",
                            )
                        )
                    
                    for content_policy in assessment.get("contentPolicy", {}).get("filters", []):
                        issues.append(
                            ValidationIssue(
                                check_type=ValidationCheckType.SAFETY_FILTER,
                                severity="critical",
                                message=f"Content policy violation: {content_policy.get('type')}",
                                suggestion="Remove inappropriate content",
                            )
                        )
                    
                    for word_policy in assessment.get("wordPolicy", {}).get("customWords", []):
                        issues.append(
                            ValidationIssue(
                                check_type=ValidationCheckType.SAFETY_FILTER,
                                severity="high",
                                message=f"Blocked word detected: {word_policy.get('match')}",
                                suggestion="Replace blocked words",
                            )
                        )
            
            return {
                "passed": action != "GUARDRAIL_INTERVENED",
                "issues": issues,
            }
            
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            logger.error(f"Bedrock Guardrails check failed: {error_code} - {e}")
            
            # Fallback to pattern-based check on error
            return self._check_inappropriate_patterns(content)
            
        except Exception as e:
            logger.error(f"Unexpected error in Bedrock Guardrails check: {e}")
            return self._check_inappropriate_patterns(content)

    def _check_inappropriate_patterns(self, content: str) -> dict:
        """Check content for inappropriate patterns (fallback method).
        
        Args:
            content: Content to check
            
        Returns:
            Dict with passed status and issues
        """
        issues = []
        content_lower = content.lower()
        
        # Check each category of inappropriate content
        for category, patterns in self.inappropriate_patterns.items():
            found_patterns = [p for p in patterns if p in content_lower]
            
            if found_patterns:
                severity = "critical" if category in ["violence", "adult_content"] else "high"
                issues.append(
                    ValidationIssue(
                        check_type=ValidationCheckType.SAFETY_FILTER,
                        severity=severity,
                        message=f"Inappropriate {category} content detected: "
                                f"{', '.join(found_patterns[:3])}",
                        suggestion=f"Remove {category}-related content",
                    )
                )
        
        return {
            "passed": len(issues) == 0,
            "issues": issues,
        }

    def _check_cultural_sensitivity(self, content: str) -> dict:
        """Check content for cultural sensitivity issues specific to Nepal.
        
        Args:
            content: Content to check
            
        Returns:
            Dict with passed status and issues
        """
        issues = []
        content_lower = content.lower()
        
        # Check each category of culturally sensitive content
        for category, patterns in self.cultural_sensitivity_patterns.items():
            found_patterns = [p for p in patterns if p in content_lower]
            
            if found_patterns:
                issues.append(
                    ValidationIssue(
                        check_type=ValidationCheckType.CULTURAL_APPROPRIATENESS,
                        severity="high",
                        message=f"Culturally sensitive {category} content detected: "
                                f"{', '.join(found_patterns[:2])}",
                        suggestion=f"Avoid {category}-related sensitive topics in educational content",
                    )
                )
        
        return {
            "passed": len(issues) == 0,
            "issues": issues,
        }

    def log_validation_result(
        self,
        validation_result: ValidationResult,
        regeneration_count: int = 0,
        final_status: Optional[ValidationStatus] = None,
    ) -> Optional[str]:
        """Log validation result to audit table.
        
        Args:
            validation_result: Validation result to log
            regeneration_count: Number of regeneration attempts
            final_status: Final status after all attempts (defaults to current status)
            
        Returns:
            Log ID if successful, None otherwise
        """
        if not self.audit_table:
            logger.warning("Audit table not configured, skipping audit log")
            return None
        
        try:
            log_id = str(uuid.uuid4())
            audit_log = ValidationAuditLog(
                log_id=log_id,
                content_id=validation_result.content_id,
                content_type=validation_result.content_type,
                validation_result=validation_result,
                timestamp=datetime.utcnow(),
                regeneration_count=regeneration_count,
                final_status=final_status or validation_result.status,
            )
            
            # Convert to DynamoDB item
            item = {
                "log_id": audit_log.log_id,
                "content_id": audit_log.content_id,
                "content_type": audit_log.content_type,
                "timestamp": audit_log.timestamp.isoformat(),
                "regeneration_count": audit_log.regeneration_count,
                "final_status": audit_log.final_status.value,
                "validation_status": validation_result.status.value,
                "passed_checks": [c.value for c in validation_result.passed_checks],
                "failed_checks": [c.value for c in validation_result.failed_checks],
                "issues_count": len(validation_result.issues),
                "issues": [
                    {
                        "check_type": issue.check_type.value,
                        "severity": issue.severity,
                        "message": issue.message,
                    }
                    for issue in validation_result.issues
                ],
                "alignment_score": validation_result.alignment_score,
            }
            
            self.audit_table.put_item(Item=item)
            logger.info(f"Audit log created: {log_id}")
            
            return log_id
            
        except Exception as e:
            logger.error(f"Failed to create audit log: {e}")
            return None

    def get_audit_logs(
        self,
        content_id: Optional[str] = None,
        limit: int = 100,
    ) -> list[dict]:
        """Retrieve audit logs from DynamoDB.
        
        Args:
            content_id: Filter by content ID (optional)
            limit: Maximum number of logs to retrieve
            
        Returns:
            List of audit log items
        """
        if not self.audit_table:
            logger.warning("Audit table not configured")
            return []
        
        try:
            if content_id:
                # Query by content_id (requires GSI)
                response = self.audit_table.query(
                    IndexName="content_id-index",
                    KeyConditionExpression="content_id = :cid",
                    ExpressionAttributeValues={":cid": content_id},
                    Limit=limit,
                )
            else:
                # Scan all logs (use with caution in production)
                response = self.audit_table.scan(Limit=limit)
            
            return response.get("Items", [])
            
        except Exception as e:
            logger.error(f"Failed to retrieve audit logs: {e}")
            return []
