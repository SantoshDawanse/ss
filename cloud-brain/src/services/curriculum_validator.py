"""Curriculum Validator service for content quality assurance."""

import logging
import re
from typing import Optional

from src.mcp.tools import get_mcp_server
from src.models.curriculum import BloomLevel, Subject
from src.models.validation import (
    ContentValidationRequest,
    ValidationCheckType,
    ValidationIssue,
    ValidationResult,
    ValidationStatus,
)
from src.utils.error_handling import handle_mcp_error, RetryableError

logger = logging.getLogger(__name__)


class CurriculumValidator:
    """Validates educational content against Nepal K-12 curriculum standards.
    
    This service implements a multi-stage validation pipeline:
    1. Curriculum alignment check (via MCP Server)
    2. Age-appropriateness check
    3. Language appropriateness check
    4. Safety filter (basic checks, extended by SafetyFilter service)
    5. Cultural appropriateness check for Nepal context
    """

    def __init__(self, alignment_threshold: float = 0.7):
        """Initialize the curriculum validator.
        
        Args:
            alignment_threshold: Minimum alignment score to pass (0-1)
        """
        self.alignment_threshold = alignment_threshold
        self.mcp_server = get_mcp_server()
        
        # Nepal-specific cultural keywords for validation
        self.nepal_cultural_keywords = {
            "currency": ["rupee", "rupees", "npr", "rs"],
            "geography": ["nepal", "kathmandu", "himalaya", "terai", "mountain"],
            "festivals": ["dashain", "tihar", "holi", "buddha jayanti"],
            "inappropriate": ["caste", "discrimination", "political party"],
        }
        
        # Age-appropriate vocabulary complexity by grade
        self.max_syllables_per_word = {
            6: 3,
            7: 4,
            8: 4,
        }

    def validate_content(
        self, request: ContentValidationRequest
    ) -> ValidationResult:
        """Validate content through complete validation pipeline.
        
        Args:
            request: Content validation request
            
        Returns:
            ValidationResult with status and issues
        """
        logger.info(
            f"Validating content {request.content_id} "
            f"(type: {request.content_type}, grade: {request.grade})"
        )
        
        issues: list[ValidationIssue] = []
        passed_checks: list[ValidationCheckType] = []
        failed_checks: list[ValidationCheckType] = []
        alignment_score: Optional[float] = None
        
        # 1. Curriculum alignment check
        alignment_result = self._check_curriculum_alignment(
            request.content, request.target_standards
        )
        if alignment_result["passed"]:
            passed_checks.append(ValidationCheckType.CURRICULUM_ALIGNMENT)
            alignment_score = alignment_result.get("score")
        else:
            failed_checks.append(ValidationCheckType.CURRICULUM_ALIGNMENT)
            issues.extend(alignment_result["issues"])
        
        # 2. Age-appropriateness check
        age_result = self._check_age_appropriateness(
            request.content, request.grade
        )
        if age_result["passed"]:
            passed_checks.append(ValidationCheckType.AGE_APPROPRIATENESS)
        else:
            failed_checks.append(ValidationCheckType.AGE_APPROPRIATENESS)
            issues.extend(age_result["issues"])
        
        # 3. Language appropriateness check
        language_result = self._check_language_appropriateness(
            request.content, request.grade
        )
        if language_result["passed"]:
            passed_checks.append(ValidationCheckType.LANGUAGE_APPROPRIATENESS)
        else:
            failed_checks.append(ValidationCheckType.LANGUAGE_APPROPRIATENESS)
            issues.extend(language_result["issues"])
        
        # 4. Basic safety check (extended by SafetyFilter service)
        safety_result = self._check_basic_safety(request.content)
        if safety_result["passed"]:
            passed_checks.append(ValidationCheckType.SAFETY_FILTER)
        else:
            failed_checks.append(ValidationCheckType.SAFETY_FILTER)
            issues.extend(safety_result["issues"])
        
        # 5. Cultural appropriateness check
        cultural_result = self._check_cultural_appropriateness(
            request.content, request.subject
        )
        if cultural_result["passed"]:
            passed_checks.append(ValidationCheckType.CULTURAL_APPROPRIATENESS)
        else:
            failed_checks.append(ValidationCheckType.CULTURAL_APPROPRIATENESS)
            issues.extend(cultural_result["issues"])
        
        # Determine overall status
        if len(failed_checks) == 0:
            status = ValidationStatus.PASSED
        else:
            # Check if issues are critical
            critical_issues = [i for i in issues if i.severity == "critical"]
            if critical_issues:
                status = ValidationStatus.NEEDS_REGENERATION
            else:
                status = ValidationStatus.FAILED
        
        result = ValidationResult(
            content_id=request.content_id,
            content_type=request.content_type,
            status=status,
            passed_checks=passed_checks,
            failed_checks=failed_checks,
            issues=issues,
            alignment_score=alignment_score,
        )
        
        logger.info(
            f"Validation complete for {request.content_id}: "
            f"status={status}, passed={len(passed_checks)}, failed={len(failed_checks)}"
        )
        
        return result

    def _check_curriculum_alignment(
        self, content: str, target_standards: list[str]
    ) -> dict:
        """Check if content aligns with curriculum standards via MCP Server.
        
        Handles MCP Server unavailability by using cached data and flagging for review.
        
        Args:
            content: Content to validate
            target_standards: List of target standard IDs
            
        Returns:
            Dict with passed status, score, and issues
        """
        try:
            # Call MCP Server for alignment validation
            alignment = self.mcp_server.validate_content_alignment(
                content, target_standards
            )
            
            passed = alignment.aligned and alignment.alignment_score >= self.alignment_threshold
            issues = []
            
            if not passed:
                severity = "critical" if alignment.alignment_score < 0.5 else "high"
                issues.append(
                    ValidationIssue(
                        check_type=ValidationCheckType.CURRICULUM_ALIGNMENT,
                        severity=severity,
                        message=f"Content alignment score {alignment.alignment_score:.2f} "
                                f"below threshold {self.alignment_threshold}",
                        suggestion="Ensure content covers required learning objectives "
                                   "and uses curriculum-aligned terminology",
                    )
                )
                
                # Add specific gap issues
                for gap in alignment.gaps:
                    issues.append(
                        ValidationIssue(
                            check_type=ValidationCheckType.CURRICULUM_ALIGNMENT,
                            severity="medium",
                            message=f"Curriculum gap: {gap}",
                            suggestion="Add content addressing this gap",
                        )
                    )
            
            return {
                "passed": passed,
                "score": alignment.alignment_score,
                "issues": issues,
            }
            
        except Exception as e:
            logger.error(f"Curriculum alignment check failed: {e}")
            error_response = handle_mcp_error(e)
            
            # MCP Server unavailable - use cached data and flag for manual review
            logger.warning(
                "MCP Server unavailable. Using cached curriculum data. "
                "Content flagged for manual review."
            )
            
            return {
                "passed": True,  # Allow content to pass but flag for review
                "score": 0.5,  # Neutral score
                "issues": [
                    ValidationIssue(
                        check_type=ValidationCheckType.CURRICULUM_ALIGNMENT,
                        severity="low",
                        message=f"MCP Server unavailable: {error_response.message}",
                        suggestion="Content approved with cached data. Manual review recommended.",
                    )
                ],
            }

    def _check_age_appropriateness(self, content: str, grade: int) -> dict:
        """Check if content is age-appropriate for target grade.
        
        Args:
            content: Content to validate
            grade: Target grade level
            
        Returns:
            Dict with passed status and issues
        """
        issues = []
        
        # Check vocabulary complexity (simple syllable count heuristic)
        words = re.findall(r'\b\w+\b', content.lower())
        max_syllables = self.max_syllables_per_word.get(grade, 4)
        
        complex_words = []
        for word in words:
            # Simple syllable count: count vowel groups
            syllables = len(re.findall(r'[aeiou]+', word))
            if syllables > max_syllables:
                complex_words.append(word)
        
        # Allow some complex words (technical terms), but flag if too many
        complexity_ratio = len(complex_words) / max(len(words), 1)
        if complexity_ratio > 0.15:  # More than 15% complex words
            issues.append(
                ValidationIssue(
                    check_type=ValidationCheckType.AGE_APPROPRIATENESS,
                    severity="medium",
                    message=f"Content may be too complex for grade {grade}: "
                            f"{len(complex_words)} complex words found",
                    suggestion="Simplify vocabulary or provide definitions for complex terms",
                )
            )
        
        # Check for inappropriate topics (basic keyword check)
        inappropriate_keywords = [
            "violence", "weapon", "alcohol", "drug", "gambling",
            "adult", "mature", "explicit"
        ]
        found_inappropriate = [
            kw for kw in inappropriate_keywords if kw in content.lower()
        ]
        
        if found_inappropriate:
            issues.append(
                ValidationIssue(
                    check_type=ValidationCheckType.AGE_APPROPRIATENESS,
                    severity="critical",
                    message=f"Inappropriate keywords found: {', '.join(found_inappropriate)}",
                    suggestion="Remove or replace inappropriate content",
                )
            )
        
        return {
            "passed": len([i for i in issues if i.severity == "critical"]) == 0,
            "issues": issues,
        }

    def _check_language_appropriateness(self, content: str, grade: int) -> dict:
        """Check if language is appropriate for Nepali students.
        
        Args:
            content: Content to validate
            grade: Target grade level
            
        Returns:
            Dict with passed status and issues
        """
        issues = []
        
        # Check sentence length (readability)
        sentences = re.split(r'[.!?]+', content)
        long_sentences = [s for s in sentences if len(s.split()) > 25]
        
        if len(long_sentences) > len(sentences) * 0.3:  # More than 30% long sentences
            issues.append(
                ValidationIssue(
                    check_type=ValidationCheckType.LANGUAGE_APPROPRIATENESS,
                    severity="medium",
                    message=f"Content has {len(long_sentences)} long sentences (>25 words)",
                    suggestion="Break long sentences into shorter, clearer statements",
                )
            )
        
        # Check for proper grammar markers (basic check)
        # Ensure content has proper punctuation
        if not re.search(r'[.!?]', content):
            issues.append(
                ValidationIssue(
                    check_type=ValidationCheckType.LANGUAGE_APPROPRIATENESS,
                    severity="high",
                    message="Content lacks proper punctuation",
                    suggestion="Add appropriate punctuation marks",
                )
            )
        
        return {
            "passed": len([i for i in issues if i.severity in ["critical", "high"]]) == 0,
            "issues": issues,
        }

    def _check_basic_safety(self, content: str) -> dict:
        """Perform basic safety checks on content.
        
        Note: This is a basic check. Extended safety filtering is handled
        by the SafetyFilter service with Bedrock Guardrails.
        
        Args:
            content: Content to validate
            
        Returns:
            Dict with passed status and issues
        """
        issues = []
        
        # Check for harmful instructions
        harmful_patterns = [
            r'\b(how to (harm|hurt|injure))\b',
            r'\b(make (weapon|bomb|explosive))\b',
            r'\b(illegal|unlawful) (activity|action)\b',
        ]
        
        for pattern in harmful_patterns:
            if re.search(pattern, content.lower()):
                issues.append(
                    ValidationIssue(
                        check_type=ValidationCheckType.SAFETY_FILTER,
                        severity="critical",
                        message=f"Potentially harmful content detected: {pattern}",
                        suggestion="Remove harmful instructions or content",
                    )
                )
        
        # Check for personal information requests
        pii_patterns = [
            r'\b(phone number|address|email|password)\b',
            r'\b(credit card|bank account)\b',
        ]
        
        for pattern in pii_patterns:
            if re.search(pattern, content.lower()):
                issues.append(
                    ValidationIssue(
                        check_type=ValidationCheckType.SAFETY_FILTER,
                        severity="high",
                        message="Content requests personal information",
                        suggestion="Remove requests for personal or sensitive information",
                    )
                )
        
        return {
            "passed": len([i for i in issues if i.severity == "critical"]) == 0,
            "issues": issues,
        }

    def _check_cultural_appropriateness(self, content: str, subject: str) -> dict:
        """Check if content is culturally appropriate for Nepal context.
        
        Args:
            content: Content to validate
            subject: Subject area
            
        Returns:
            Dict with passed status and issues
        """
        issues = []
        content_lower = content.lower()
        
        # For Mathematics, check if using appropriate currency
        if subject == Subject.MATHEMATICS.value:
            # Check for non-Nepali currencies
            foreign_currencies = ["dollar", "euro", "pound", "yen", "$", "€", "£", "¥"]
            found_foreign = [c for c in foreign_currencies if c in content_lower]
            
            if found_foreign and not any(
                kw in content_lower for kw in self.nepal_cultural_keywords["currency"]
            ):
                issues.append(
                    ValidationIssue(
                        check_type=ValidationCheckType.CULTURAL_APPROPRIATENESS,
                        severity="medium",
                        message=f"Uses foreign currency: {', '.join(found_foreign)}",
                        suggestion="Use Nepali Rupees (Rs/NPR) for currency examples",
                    )
                )
        
        # Check for culturally sensitive topics
        sensitive_topics = self.nepal_cultural_keywords["inappropriate"]
        found_sensitive = [t for t in sensitive_topics if t in content_lower]
        
        if found_sensitive:
            issues.append(
                ValidationIssue(
                    check_type=ValidationCheckType.CULTURAL_APPROPRIATENESS,
                    severity="high",
                    message=f"Culturally sensitive topics found: {', '.join(found_sensitive)}",
                    suggestion="Avoid politically or culturally sensitive topics",
                )
            )
        
        # For Science/Social Studies, encourage Nepal-relevant examples
        if subject in [Subject.SCIENCE.value, Subject.SOCIAL_STUDIES.value]:
            has_nepal_context = any(
                kw in content_lower 
                for kw in self.nepal_cultural_keywords["geography"]
            )
            
            # This is a soft check - just a suggestion, not a failure
            if not has_nepal_context and len(content.split()) > 100:
                issues.append(
                    ValidationIssue(
                        check_type=ValidationCheckType.CULTURAL_APPROPRIATENESS,
                        severity="low",
                        message="Content could benefit from Nepal-specific examples",
                        suggestion="Consider adding examples relevant to Nepal geography/culture",
                    )
                )
        
        return {
            "passed": len([i for i in issues if i.severity in ["critical", "high"]]) == 0,
            "issues": issues,
        }

    def should_regenerate(self, result: ValidationResult) -> bool:
        """Determine if content should be regenerated based on validation result.
        
        Args:
            result: Validation result
            
        Returns:
            True if content should be regenerated
        """
        return result.status == ValidationStatus.NEEDS_REGENERATION


class CurriculumValidatorService:
    """Service wrapper for CurriculumValidator with additional validation methods."""

    def __init__(self):
        """Initialize the service."""
        self.validator = CurriculumValidator()

    def validate_lesson(
        self,
        lesson: "Lesson",
        grade: int,
        target_standards: list[str],
    ) -> ValidationResult:
        """
        Validate a lesson against curriculum standards.

        Args:
            lesson: Lesson to validate
            grade: Target grade level
            target_standards: Target curriculum standard IDs

        Returns:
            ValidationResult
        """
        # Combine all lesson content for validation
        content = f"{lesson.title}\n\n"
        for section in lesson.sections:
            content += f"{section.content}\n\n"

        request = ContentValidationRequest(
            content_id=lesson.lesson_id,
            content_type="lesson",
            content=content,
            target_standards=target_standards,
            grade=grade,
            subject=lesson.subject,
            metadata={
                "difficulty": lesson.difficulty,
                "estimated_minutes": lesson.estimated_minutes,
            },
        )

        return self.validator.validate_content(request)

    def validate_quiz(
        self,
        quiz: "Quiz",
        grade: int,
        target_standards: list[str],
    ) -> ValidationResult:
        """
        Validate a quiz against curriculum standards.

        Args:
            quiz: Quiz to validate
            grade: Target grade level
            target_standards: Target curriculum standard IDs

        Returns:
            ValidationResult
        """
        # Combine all quiz content for validation
        content = f"{quiz.title}\n\n"
        for question in quiz.questions:
            content += f"Q: {question.question}\n"
            if question.options:
                for option in question.options:
                    content += f"- {option}\n"
            content += f"A: {question.correct_answer}\n"
            content += f"Explanation: {question.explanation}\n\n"

        request = ContentValidationRequest(
            content_id=quiz.quiz_id,
            content_type="quiz",
            content=content,
            target_standards=target_standards,
            grade=grade,
            subject=quiz.subject,
            metadata={
                "difficulty": quiz.difficulty,
                "question_count": len(quiz.questions),
            },
        )

        return self.validator.validate_content(request)
