"""Content generation service with validation and regeneration logic."""

import logging
import time
from typing import Optional

from src.models.content import Lesson, Quiz
from src.models.validation import ValidationStatus
from src.services.bedrock_agent import BedrockAgentService
from src.services.curriculum_validator import CurriculumValidatorService
from src.utils.error_handling import (
    RetryableError,
    NonRetryableError,
    handle_validation_error,
)
from src.utils.audit_logging import get_audit_logger
from src.utils.monitoring import get_monitoring_service

logger = logging.getLogger(__name__)
audit_logger = get_audit_logger()
monitoring_service = get_monitoring_service()


class ContentGenerationService:
    """
    Service for generating content with validation and regeneration.
    
    Implements the following error handling:
    - Bedrock Agent timeout: Retry with exponential backoff (max 3 attempts)
    - Invalid content generated: Trigger Curriculum Validator, regenerate if fails
    - MCP Server unavailable: Use cached curriculum data, flag for manual review
    - Validation failures: Log error, regenerate with adjusted prompts
    """
    
    MAX_REGENERATION_ATTEMPTS = 3
    
    def __init__(
        self,
        bedrock_service: Optional[BedrockAgentService] = None,
        validator_service: Optional[CurriculumValidatorService] = None,
    ):
        """
        Initialize content generation service.
        
        Args:
            bedrock_service: Bedrock Agent service instance
            validator_service: Curriculum validator service instance
        """
        self.bedrock_service = bedrock_service or BedrockAgentService()
        self.validator_service = validator_service or CurriculumValidatorService()
    
    def generate_validated_lesson(
        self,
        topic: str,
        subject: str,
        grade: int,
        difficulty: str,
        student_context: dict,
        curriculum_standards: list[str],
        student_id: Optional[str] = None,
    ) -> Lesson:
        """
        Generate a lesson with validation and regeneration.
        
        Args:
            topic: Topic name
            subject: Subject area
            grade: Grade level
            difficulty: Difficulty level
            student_context: Student learning context
            curriculum_standards: Target curriculum standard IDs
            student_id: Optional student identifier for audit logging
            
        Returns:
            Validated lesson
            
        Raises:
            NonRetryableError: If regeneration fails after max attempts
        """
        # Track generation time
        start_time = time.time()
        success = False
        
        try:
            # Log content generation request
            if student_id:
                audit_logger.log_content_generation_request(
                    student_id=student_id,
                    subject=subject,
                    topic=topic,
                    content_type="lesson",
                    difficulty=difficulty,
                    curriculum_standards=curriculum_standards,
                )
            
            attempt = 0
            last_error = None
            
            while attempt < self.MAX_REGENERATION_ATTEMPTS:
                attempt += 1
                
                try:
                    logger.info(
                        f"Generating lesson (attempt {attempt}/{self.MAX_REGENERATION_ATTEMPTS}): "
                        f"{topic}, {subject}, grade {grade}"
                    )
                    
                    # Generate lesson using Bedrock Agent (with built-in retry)
                    lesson = self.bedrock_service.generate_lesson(
                        topic=topic,
                        subject=subject,
                        grade=grade,
                        difficulty=difficulty,
                        student_context=student_context,
                        curriculum_standards=curriculum_standards,
                    )
                    
                    # Validate generated lesson
                    validation_result = self.validator_service.validate_lesson(
                        lesson=lesson,
                        grade=grade,
                        target_standards=curriculum_standards,
                    )
                    
                    # Log validation result
                    logger.info(
                        f"Lesson validation result: {validation_result.status}, "
                        f"passed checks: {len(validation_result.passed_checks)}, "
                        f"failed checks: {len(validation_result.failed_checks)}"
                    )
                    
                    # Log validation result to audit log
                    if student_id:
                        audit_logger.log_validation_result(
                            content_id=lesson.lesson_id,
                            content_type="lesson",
                            validation_status=validation_result.status.value,
                            alignment_score=validation_result.alignment_score,
                            passed_checks=validation_result.passed_checks,
                            failed_checks=validation_result.failed_checks,
                            student_id=student_id,
                        )
                    
                    # Emit validation metrics
                    monitoring_service.emit_validation_metrics(
                        passed=(validation_result.status == ValidationStatus.PASSED),
                        content_type="lesson",
                        alignment_score=validation_result.alignment_score,
                    )
                    
                    # Check if validation passed
                    if validation_result.status == ValidationStatus.PASSED:
                        logger.info(f"Lesson generated and validated successfully on attempt {attempt}")
                        success = True
                        return lesson
                    
                    # Check if regeneration is needed
                    if self.validator_service.validator.should_regenerate(validation_result):
                        logger.warning(
                            f"Lesson validation failed on attempt {attempt}. "
                            f"Issues: {[issue.message for issue in validation_result.issues]}"
                        )
                        
                        # Log content rejection
                        if student_id:
                            audit_logger.log_content_rejection(
                                content_id=lesson.lesson_id,
                                content_type="lesson",
                                rejection_reasons=[issue.message for issue in validation_result.issues],
                                regeneration_attempt=attempt,
                                max_attempts=self.MAX_REGENERATION_ATTEMPTS,
                                student_id=student_id,
                            )
                        
                        # Adjust prompts based on validation issues
                        student_context = self._adjust_context_for_issues(
                            student_context,
                            validation_result.issues,
                        )
                        
                        last_error = handle_validation_error(
                            Exception(f"Validation failed: {validation_result.issues}"),
                            attempt,
                        )
                        
                        # Continue to next attempt
                        continue
                    else:
                        # Validation failed but doesn't require regeneration
                        logger.warning(
                            f"Lesson validation failed but accepted: {validation_result.status}"
                        )
                        success = True
                        return lesson
                        
                except RetryableError as e:
                    logger.error(f"Retryable error on attempt {attempt}: {e}")
                    last_error = e
                    # Continue to next attempt
                    continue
                    
                except NonRetryableError as e:
                    logger.error(f"Non-retryable error: {e}")
                    raise
            
            # Max attempts reached
            error_msg = (
                f"Failed to generate valid lesson after {self.MAX_REGENERATION_ATTEMPTS} attempts. "
                f"Last error: {last_error}"
            )
            logger.error(error_msg)
            raise NonRetryableError(
                error_msg,
                "CONTENT_REGENERATION_FAILED",
                details={"attempts": self.MAX_REGENERATION_ATTEMPTS},
            )
        
        finally:
            # Emit content generation metrics
            latency_ms = (time.time() - start_time) * 1000
            monitoring_service.emit_content_generation_metrics(
                latency_ms=latency_ms,
                success=success,
                content_type="lesson",
                subject=subject,
            )
    
    def generate_validated_quiz(
        self,
        topic: str,
        subject: str,
        grade: int,
        difficulty: str,
        question_count: int,
        learning_objectives: list[str],
        student_id: Optional[str] = None,
    ) -> Quiz:
        """
        Generate a quiz with validation and regeneration.
        
        Args:
            topic: Topic name
            subject: Subject area
            grade: Grade level
            difficulty: Difficulty level
            question_count: Number of questions
            learning_objectives: Target learning objectives
            student_id: Optional student identifier for audit logging
            
        Returns:
            Validated quiz
            
        Raises:
            NonRetryableError: If regeneration fails after max attempts
        """
        # Track generation time
        start_time = time.time()
        success = False
        
        try:
            # Log content generation request
            if student_id:
                audit_logger.log_content_generation_request(
                    student_id=student_id,
                    subject=subject,
                    topic=topic,
                    content_type="quiz",
                    difficulty=difficulty,
                    curriculum_standards=learning_objectives,
                )
            
            attempt = 0
            last_error = None
            
            while attempt < self.MAX_REGENERATION_ATTEMPTS:
                attempt += 1
                
                try:
                    logger.info(
                        f"Generating quiz (attempt {attempt}/{self.MAX_REGENERATION_ATTEMPTS}): "
                        f"{topic}, {subject}, grade {grade}"
                    )
                    
                    # Generate quiz using Bedrock Agent (with built-in retry)
                    quiz = self.bedrock_service.generate_quiz(
                        topic=topic,
                        subject=subject,
                        grade=grade,
                        difficulty=difficulty,
                        question_count=question_count,
                        learning_objectives=learning_objectives,
                    )
                    
                    # Validate generated quiz
                    validation_result = self.validator_service.validate_quiz(
                        quiz=quiz,
                        grade=grade,
                        target_standards=learning_objectives,
                    )
                    
                    # Log validation result
                    logger.info(
                        f"Quiz validation result: {validation_result.status}, "
                        f"passed checks: {len(validation_result.passed_checks)}, "
                        f"failed checks: {len(validation_result.failed_checks)}"
                    )
                    
                    # Log validation result to audit log
                    if student_id:
                        audit_logger.log_validation_result(
                            content_id=quiz.quiz_id,
                            content_type="quiz",
                            validation_status=validation_result.status.value,
                            alignment_score=validation_result.alignment_score,
                            passed_checks=validation_result.passed_checks,
                            failed_checks=validation_result.failed_checks,
                            student_id=student_id,
                        )
                    
                    # Emit validation metrics
                    monitoring_service.emit_validation_metrics(
                        passed=(validation_result.status == ValidationStatus.PASSED),
                        content_type="quiz",
                        alignment_score=validation_result.alignment_score,
                    )
                    
                    # Check if validation passed
                    if validation_result.status == ValidationStatus.PASSED:
                        logger.info(f"Quiz generated and validated successfully on attempt {attempt}")
                        success = True
                        return quiz
                    
                    # Check if regeneration is needed
                    if self.validator_service.validator.should_regenerate(validation_result):
                        logger.warning(
                            f"Quiz validation failed on attempt {attempt}. "
                            f"Issues: {[issue.message for issue in validation_result.issues]}"
                        )
                        
                        # Log content rejection
                        if student_id:
                            audit_logger.log_content_rejection(
                                content_id=quiz.quiz_id,
                                content_type="quiz",
                                rejection_reasons=[issue.message for issue in validation_result.issues],
                                regeneration_attempt=attempt,
                                max_attempts=self.MAX_REGENERATION_ATTEMPTS,
                                student_id=student_id,
                            )
                        
                        last_error = handle_validation_error(
                            Exception(f"Validation failed: {validation_result.issues}"),
                            attempt,
                        )
                        
                        # Continue to next attempt
                        continue
                    else:
                        # Validation failed but doesn't require regeneration
                        logger.warning(
                            f"Quiz validation failed but accepted: {validation_result.status}"
                        )
                        success = True
                        return quiz
                        
                except RetryableError as e:
                    logger.error(f"Retryable error on attempt {attempt}: {e}")
                    last_error = e
                    # Continue to next attempt
                    continue
                    
                except NonRetryableError as e:
                    logger.error(f"Non-retryable error: {e}")
                    raise
            
            # Max attempts reached
            error_msg = (
                f"Failed to generate valid quiz after {self.MAX_REGENERATION_ATTEMPTS} attempts. "
                f"Last error: {last_error}"
            )
            logger.error(error_msg)
            raise NonRetryableError(
                error_msg,
                "CONTENT_REGENERATION_FAILED",
                details={"attempts": self.MAX_REGENERATION_ATTEMPTS},
            )
        
        finally:
            # Emit content generation metrics
            latency_ms = (time.time() - start_time) * 1000
            monitoring_service.emit_content_generation_metrics(
                latency_ms=latency_ms,
                success=success,
                content_type="quiz",
                subject=subject,
            )
    
    def _adjust_context_for_issues(
        self,
        context: dict,
        issues: list,
    ) -> dict:
        """
        Adjust student context based on validation issues.
        
        Args:
            context: Original student context
            issues: List of validation issues
            
        Returns:
            Adjusted context with guidance for regeneration
        """
        adjusted_context = context.copy()
        
        # Add validation feedback to context
        adjusted_context["validation_feedback"] = [
            {
                "check": issue.check_type,
                "message": issue.message,
                "suggestion": issue.suggestion,
            }
            for issue in issues
        ]
        
        # Add specific adjustments based on issue types
        for issue in issues:
            if "complexity" in issue.message.lower():
                adjusted_context["simplify_language"] = True
            if "curriculum" in issue.message.lower():
                adjusted_context["emphasize_curriculum_alignment"] = True
            if "cultural" in issue.message.lower():
                adjusted_context["use_nepal_context"] = True
        
        return adjusted_context
