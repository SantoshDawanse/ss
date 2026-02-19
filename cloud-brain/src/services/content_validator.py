"""Content Validator orchestrator combining curriculum and safety validation."""

import logging
from typing import Optional

from src.models.validation import (
    ContentValidationRequest,
    ValidationResult,
    ValidationStatus,
)
from src.services.curriculum_validator import CurriculumValidator
from src.services.safety_filter import SafetyFilter

logger = logging.getLogger(__name__)


class ContentValidator:
    """Orchestrates complete content validation pipeline.
    
    This service combines:
    1. Curriculum validation (alignment, age-appropriateness, language)
    2. Safety filtering (inappropriate content, cultural sensitivity)
    3. Audit logging
    4. Regeneration logic
    """

    def __init__(
        self,
        alignment_threshold: float = 0.7,
        max_regeneration_attempts: int = 3,
        guardrail_id: Optional[str] = None,
        guardrail_version: Optional[str] = None,
        audit_table_name: Optional[str] = None,
    ):
        """Initialize the content validator.
        
        Args:
            alignment_threshold: Minimum curriculum alignment score (0-1)
            max_regeneration_attempts: Maximum content regeneration attempts
            guardrail_id: AWS Bedrock Guardrail ID (optional)
            guardrail_version: Guardrail version (optional)
            audit_table_name: DynamoDB table for audit logs (optional)
        """
        self.max_regeneration_attempts = max_regeneration_attempts
        
        # Initialize validators
        self.curriculum_validator = CurriculumValidator(
            alignment_threshold=alignment_threshold
        )
        self.safety_filter = SafetyFilter(
            guardrail_id=guardrail_id,
            guardrail_version=guardrail_version,
            audit_table_name=audit_table_name,
        )

    def validate_content(
        self,
        request: ContentValidationRequest,
        use_guardrails: bool = True,
    ) -> ValidationResult:
        """Validate content through complete pipeline.
        
        Args:
            request: Content validation request
            use_guardrails: Whether to use Bedrock Guardrails
            
        Returns:
            Combined validation result
        """
        logger.info(
            f"Starting validation for {request.content_id} "
            f"(type: {request.content_type})"
        )
        
        # Step 1: Curriculum validation
        curriculum_result = self.curriculum_validator.validate_content(request)
        
        # Step 2: Safety filtering
        safety_result = self.safety_filter.filter_content(
            content=request.content,
            content_id=request.content_id,
            content_type=request.content_type,
            use_guardrails=use_guardrails,
        )
        
        # Step 3: Combine results
        combined_result = self._combine_results(
            curriculum_result, safety_result
        )
        
        # Step 4: Log to audit table
        self.safety_filter.log_validation_result(
            validation_result=combined_result,
            regeneration_count=0,
            final_status=combined_result.status,
        )
        
        logger.info(
            f"Validation complete for {request.content_id}: "
            f"status={combined_result.status}"
        )
        
        return combined_result

    def validate_with_regeneration(
        self,
        request: ContentValidationRequest,
        regeneration_callback,
        use_guardrails: bool = True,
    ) -> tuple[ValidationResult, int]:
        """Validate content with automatic regeneration on failure.
        
        Args:
            request: Content validation request
            regeneration_callback: Function to call for content regeneration
                                  Should accept (request, issues) and return new content
            use_guardrails: Whether to use Bedrock Guardrails
            
        Returns:
            Tuple of (final validation result, regeneration attempts)
        """
        attempts = 0
        current_content = request.content
        
        while attempts <= self.max_regeneration_attempts:
            # Create request with current content
            current_request = ContentValidationRequest(
                content_id=request.content_id,
                content_type=request.content_type,
                content=current_content,
                target_standards=request.target_standards,
                grade=request.grade,
                subject=request.subject,
                metadata=request.metadata,
            )
            
            # Validate
            result = self.validate_content(current_request, use_guardrails)
            
            # Check if passed or max attempts reached
            if result.status == ValidationStatus.PASSED:
                logger.info(
                    f"Content {request.content_id} passed validation "
                    f"after {attempts} regeneration(s)"
                )
                
                # Log final result
                self.safety_filter.log_validation_result(
                    validation_result=result,
                    regeneration_count=attempts,
                    final_status=ValidationStatus.PASSED,
                )
                
                return result, attempts
            
            if attempts >= self.max_regeneration_attempts:
                logger.warning(
                    f"Content {request.content_id} failed validation "
                    f"after {attempts} attempts"
                )
                
                # Log final failure
                self.safety_filter.log_validation_result(
                    validation_result=result,
                    regeneration_count=attempts,
                    final_status=ValidationStatus.FAILED,
                )
                
                return result, attempts
            
            # Regenerate content
            if result.status == ValidationStatus.NEEDS_REGENERATION:
                logger.info(
                    f"Regenerating content {request.content_id} "
                    f"(attempt {attempts + 1}/{self.max_regeneration_attempts})"
                )
                
                try:
                    current_content = regeneration_callback(current_request, result.issues)
                    attempts += 1
                except Exception as e:
                    logger.error(f"Content regeneration failed: {e}")
                    
                    # Log regeneration failure
                    self.safety_filter.log_validation_result(
                        validation_result=result,
                        regeneration_count=attempts,
                        final_status=ValidationStatus.FAILED,
                    )
                    
                    return result, attempts
            else:
                # Non-critical failures don't trigger regeneration
                logger.info(
                    f"Content {request.content_id} has non-critical issues, "
                    "not regenerating"
                )
                
                self.safety_filter.log_validation_result(
                    validation_result=result,
                    regeneration_count=attempts,
                    final_status=result.status,
                )
                
                return result, attempts
        
        # Should not reach here, but return last result
        return result, attempts

    def _combine_results(
        self,
        curriculum_result: ValidationResult,
        safety_result: ValidationResult,
    ) -> ValidationResult:
        """Combine curriculum and safety validation results.
        
        Args:
            curriculum_result: Curriculum validation result
            safety_result: Safety validation result
            
        Returns:
            Combined validation result
        """
        # Merge passed and failed checks
        passed_checks = list(set(
            curriculum_result.passed_checks + safety_result.passed_checks
        ))
        failed_checks = list(set(
            curriculum_result.failed_checks + safety_result.failed_checks
        ))
        
        # Merge issues
        issues = curriculum_result.issues + safety_result.issues
        
        # Determine combined status (most restrictive wins)
        if (
            curriculum_result.status == ValidationStatus.NEEDS_REGENERATION
            or safety_result.status == ValidationStatus.NEEDS_REGENERATION
        ):
            status = ValidationStatus.NEEDS_REGENERATION
        elif (
            curriculum_result.status == ValidationStatus.FAILED
            or safety_result.status == ValidationStatus.FAILED
        ):
            status = ValidationStatus.FAILED
        else:
            status = ValidationStatus.PASSED
        
        return ValidationResult(
            content_id=curriculum_result.content_id,
            content_type=curriculum_result.content_type,
            status=status,
            passed_checks=passed_checks,
            failed_checks=failed_checks,
            issues=issues,
            alignment_score=curriculum_result.alignment_score,
        )

    def should_regenerate(self, result: ValidationResult) -> bool:
        """Determine if content should be regenerated.
        
        Args:
            result: Validation result
            
        Returns:
            True if content should be regenerated
        """
        return result.status == ValidationStatus.NEEDS_REGENERATION
