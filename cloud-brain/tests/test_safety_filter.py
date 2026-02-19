"""Unit tests for Safety Filter service."""

import pytest

from src.models.validation import ValidationCheckType, ValidationStatus
from src.services.safety_filter import SafetyFilter


@pytest.fixture
def safety_filter():
    """Create a safety filter instance without AWS dependencies."""
    return SafetyFilter(
        guardrail_id=None,  # Disable Bedrock Guardrails for unit tests
        audit_table_name=None,  # Disable audit logging for unit tests
    )


def test_filter_content_passes_safe_content(safety_filter):
    """Test that safe educational content passes filtering."""
    result = safety_filter.filter_content(
        content="This lesson teaches addition and subtraction of whole numbers.",
        content_id="test-001",
        content_type="lesson",
        use_guardrails=False,
    )
    
    assert result.status == ValidationStatus.PASSED
    assert len(result.failed_checks) == 0
    assert len(result.issues) == 0


def test_filter_content_detects_violence(safety_filter):
    """Test that violent content is detected and blocked."""
    result = safety_filter.filter_content(
        content="This lesson teaches how to kill and attack enemies with weapons.",
        content_id="test-002",
        content_type="lesson",
        use_guardrails=False,
    )
    
    assert result.status in [ValidationStatus.FAILED, ValidationStatus.NEEDS_REGENERATION]
    assert ValidationCheckType.SAFETY_FILTER in result.failed_checks
    assert any(issue.severity == "critical" for issue in result.issues)
    assert any("violence" in issue.message.lower() for issue in result.issues)


def test_filter_content_detects_adult_content(safety_filter):
    """Test that adult content is detected and blocked."""
    result = safety_filter.filter_content(
        content="This lesson contains explicit adult content and sexual material.",
        content_id="test-003",
        content_type="lesson",
        use_guardrails=False,
    )
    
    assert result.status in [ValidationStatus.FAILED, ValidationStatus.NEEDS_REGENERATION]
    assert ValidationCheckType.SAFETY_FILTER in result.failed_checks
    assert any("adult_content" in issue.message.lower() for issue in result.issues)


def test_filter_content_detects_substance_abuse(safety_filter):
    """Test that substance abuse content is detected."""
    result = safety_filter.filter_content(
        content="This lesson discusses alcohol consumption and drug use among teenagers.",
        content_id="test-004",
        content_type="lesson",
        use_guardrails=False,
    )
    
    assert result.status in [ValidationStatus.FAILED, ValidationStatus.NEEDS_REGENERATION]
    assert ValidationCheckType.SAFETY_FILTER in result.failed_checks
    assert any("substance" in issue.message.lower() for issue in result.issues)


def test_filter_content_detects_gambling(safety_filter):
    """Test that gambling content is detected."""
    result = safety_filter.filter_content(
        content="Learn about casino games and how to bet on poker.",
        content_id="test-005",
        content_type="lesson",
        use_guardrails=False,
    )
    
    assert result.status in [ValidationStatus.FAILED, ValidationStatus.NEEDS_REGENERATION]
    assert ValidationCheckType.SAFETY_FILTER in result.failed_checks
    assert any("gambling" in issue.message.lower() for issue in result.issues)


def test_filter_content_detects_hate_speech(safety_filter):
    """Test that hate speech is detected."""
    result = safety_filter.filter_content(
        content="This content promotes hate and discrimination against certain groups.",
        content_id="test-006",
        content_type="lesson",
        use_guardrails=False,
    )
    
    assert result.status in [ValidationStatus.FAILED, ValidationStatus.NEEDS_REGENERATION]
    assert ValidationCheckType.SAFETY_FILTER in result.failed_checks


def test_filter_content_detects_political_sensitivity(safety_filter):
    """Test that politically sensitive content is flagged."""
    result = safety_filter.filter_content(
        content="This lesson discusses political party conflicts and election controversies.",
        content_id="test-007",
        content_type="lesson",
        use_guardrails=False,
    )
    
    assert ValidationCheckType.CULTURAL_APPROPRIATENESS in result.failed_checks
    cultural_issues = [
        issue for issue in result.issues
        if issue.check_type == ValidationCheckType.CULTURAL_APPROPRIATENESS
    ]
    assert len(cultural_issues) > 0
    assert any("political" in issue.message.lower() for issue in cultural_issues)


def test_filter_content_detects_religious_sensitivity(safety_filter):
    """Test that religiously sensitive content is flagged."""
    result = safety_filter.filter_content(
        content="This lesson discusses religious conflict and Hindu Muslim tensions.",
        content_id="test-008",
        content_type="lesson",
        use_guardrails=False,
    )
    
    assert ValidationCheckType.CULTURAL_APPROPRIATENESS in result.failed_checks
    cultural_issues = [
        issue for issue in result.issues
        if issue.check_type == ValidationCheckType.CULTURAL_APPROPRIATENESS
    ]
    assert len(cultural_issues) > 0
    assert any("religious" in issue.message.lower() for issue in cultural_issues)


def test_filter_content_detects_caste_sensitivity(safety_filter):
    """Test that caste-related sensitive content is flagged."""
    result = safety_filter.filter_content(
        content="This lesson discusses the caste system and untouchable discrimination.",
        content_id="test-009",
        content_type="lesson",
        use_guardrails=False,
    )
    
    assert ValidationCheckType.CULTURAL_APPROPRIATENESS in result.failed_checks
    cultural_issues = [
        issue for issue in result.issues
        if issue.check_type == ValidationCheckType.CULTURAL_APPROPRIATENESS
    ]
    assert len(cultural_issues) > 0
    assert any("caste" in issue.message.lower() for issue in cultural_issues)


def test_filter_content_detects_ethnic_sensitivity(safety_filter):
    """Test that ethnically sensitive content is flagged."""
    result = safety_filter.filter_content(
        content="This lesson discusses ethnic conflict and ethnic superiority claims.",
        content_id="test-010",
        content_type="lesson",
        use_guardrails=False,
    )
    
    assert ValidationCheckType.CULTURAL_APPROPRIATENESS in result.failed_checks
    cultural_issues = [
        issue for issue in result.issues
        if issue.check_type == ValidationCheckType.CULTURAL_APPROPRIATENESS
    ]
    assert len(cultural_issues) > 0
    assert any("ethnic" in issue.message.lower() for issue in cultural_issues)


def test_filter_content_with_multiple_issues(safety_filter):
    """Test that content with multiple issues is properly flagged."""
    result = safety_filter.filter_content(
        content="This lesson teaches violence, discusses alcohol, and promotes gambling.",
        content_id="test-011",
        content_type="lesson",
        use_guardrails=False,
    )
    
    assert result.status in [ValidationStatus.FAILED, ValidationStatus.NEEDS_REGENERATION]
    assert len(result.issues) >= 2  # Should have multiple issues
    assert any(issue.severity in ["high", "critical"] for issue in result.issues)


def test_log_validation_result_without_audit_table(safety_filter):
    """Test that logging without audit table configured returns None."""
    result = safety_filter.filter_content(
        content="Safe content",
        content_id="test-012",
        content_type="lesson",
        use_guardrails=False,
    )
    
    log_id = safety_filter.log_validation_result(result)
    assert log_id is None  # No audit table configured


def test_get_audit_logs_without_audit_table(safety_filter):
    """Test that getting logs without audit table returns empty list."""
    logs = safety_filter.get_audit_logs()
    assert logs == []


def test_filter_content_handles_empty_content(safety_filter):
    """Test that empty content is handled gracefully."""
    result = safety_filter.filter_content(
        content="",
        content_id="test-013",
        content_type="lesson",
        use_guardrails=False,
    )
    
    # Empty content should pass (no issues found)
    assert result.status == ValidationStatus.PASSED
