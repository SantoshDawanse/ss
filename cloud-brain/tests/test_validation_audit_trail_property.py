"""Property-based tests for validation audit trail.

Feature: sikshya-sathi-system
Property 15: Validation Audit Trail

For any content validation attempt, the system must create an audit log entry
recording the validation result, timestamp, and any issues found.

Validates: Requirements 6.8
"""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck
from unittest.mock import MagicMock, patch

from src.models.curriculum import Subject
from src.models.validation import (
    ContentValidationRequest,
    ValidationCheckType,
    ValidationStatus,
)
from src.services.content_validator import ContentValidator


# Custom strategies for generating test data
@st.composite
def content_validation_request_strategy(draw):
    """Generate content validation requests for testing."""
    subjects = [
        Subject.MATHEMATICS.value,
        Subject.SCIENCE.value,
        Subject.ENGLISH.value,
        Subject.NEPALI.value,
        Subject.SOCIAL_STUDIES.value,
    ]
    
    subject = draw(st.sampled_from(subjects))
    grade = draw(st.integers(min_value=6, max_value=8))
    content_type = draw(st.sampled_from(["lesson", "quiz", "hint"]))
    
    # Generate varied content
    content = draw(st.text(
        alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd', 'Zs', 'Po')),
        min_size=50,
        max_size=500
    ))
    
    return ContentValidationRequest(
        content_id=draw(st.text(
            alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')),
            min_size=5,
            max_size=20
        )),
        content_type=content_type,
        content=f"Educational content about {subject}. {content}",
        target_standards=[f"{subject.upper()}-{grade}-001"],
        grade=grade,
        subject=subject,
    )


@pytest.fixture
def mock_audit_table():
    """Create a mock DynamoDB audit table."""
    mock_table = MagicMock()
    mock_table.put_item = MagicMock(return_value={})
    mock_table.query = MagicMock(return_value={"Items": []})
    mock_table.scan = MagicMock(return_value={"Items": []})
    return mock_table


@pytest.fixture
def content_validator_with_audit(mock_audit_table):
    """Create a content validator with audit logging enabled."""
    with patch('src.services.safety_filter.boto3') as mock_boto3:
        # Mock DynamoDB resource
        mock_dynamodb = MagicMock()
        mock_dynamodb.Table.return_value = mock_audit_table
        mock_boto3.resource.return_value = mock_dynamodb
        
        # Mock Bedrock runtime (not used in tests)
        mock_boto3.client.return_value = None
        
        validator = ContentValidator(
            alignment_threshold=0.7,
            max_regeneration_attempts=3,
            guardrail_id=None,  # Disable Bedrock Guardrails for tests
            audit_table_name="test-audit-table",
        )
        
        # Inject the mock table
        validator.safety_filter.audit_table = mock_audit_table
        
        yield validator, mock_audit_table


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(request=content_validation_request_strategy())
def test_property_15_audit_log_created_for_all_validations(
    content_validator_with_audit, request
):
    """Property 15: Audit log must be created for every validation attempt
    
    For any content validation attempt, the system must create an audit log
    entry recording the validation result.
    
    This verifies that all validation attempts are logged for audit purposes.
    """
    validator, mock_audit_table = content_validator_with_audit
    
    # Validate the content
    result = validator.validate_content(request, use_guardrails=False)
    
    # Property 15: Audit log must be created
    assert mock_audit_table.put_item.called, \
        "Audit log must be created for validation attempt"
    
    # Property 15: Audit log must be called at least once
    assert mock_audit_table.put_item.call_count >= 1, \
        "Audit log must be created at least once"
    
    # Get the audit log item
    call_args = mock_audit_table.put_item.call_args
    audit_item = call_args.kwargs.get("Item") or call_args.args[0].get("Item")
    
    # Property 15: Audit log must contain required fields
    assert "log_id" in audit_item, "Audit log must have log_id"
    assert "content_id" in audit_item, "Audit log must have content_id"
    assert "content_type" in audit_item, "Audit log must have content_type"
    assert "timestamp" in audit_item, "Audit log must have timestamp"
    assert "validation_status" in audit_item, "Audit log must have validation_status"
    assert "final_status" in audit_item, "Audit log must have final_status"
    
    # Property 15: Audit log must match validation request
    assert audit_item["content_id"] == request.content_id, \
        "Audit log content_id must match request"
    assert audit_item["content_type"] == request.content_type, \
        "Audit log content_type must match request"


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(request=content_validation_request_strategy())
def test_property_15_audit_log_contains_validation_result(
    content_validator_with_audit, request
):
    """Property 15: Audit log must contain complete validation result
    
    For any validation attempt, the audit log must record the validation
    status, passed checks, failed checks, and issues found.
    """
    validator, mock_audit_table = content_validator_with_audit
    
    # Validate the content
    result = validator.validate_content(request, use_guardrails=False)
    
    # Get the audit log item
    call_args = mock_audit_table.put_item.call_args
    audit_item = call_args.kwargs.get("Item") or call_args.args[0].get("Item")
    
    # Property 15: Audit log must contain validation status
    assert audit_item["validation_status"] == result.status.value, \
        "Audit log must record validation status"
    
    # Property 15: Audit log must contain passed checks
    assert "passed_checks" in audit_item, \
        "Audit log must record passed checks"
    assert isinstance(audit_item["passed_checks"], list), \
        "Passed checks must be a list"
    
    # Property 15: Audit log must contain failed checks
    assert "failed_checks" in audit_item, \
        "Audit log must record failed checks"
    assert isinstance(audit_item["failed_checks"], list), \
        "Failed checks must be a list"
    
    # Property 15: Audit log must contain issues count
    assert "issues_count" in audit_item, \
        "Audit log must record issues count"
    assert audit_item["issues_count"] == len(result.issues), \
        "Issues count must match validation result"
    
    # Property 15: Audit log must contain issues details
    assert "issues" in audit_item, \
        "Audit log must record issues details"
    assert isinstance(audit_item["issues"], list), \
        "Issues must be a list"


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(request=content_validation_request_strategy())
def test_property_15_audit_log_has_timestamp(
    content_validator_with_audit, request
):
    """Property 15: Audit log must have timestamp
    
    For any validation attempt, the audit log must record the timestamp
    when the validation occurred.
    """
    validator, mock_audit_table = content_validator_with_audit
    
    # Validate the content
    result = validator.validate_content(request, use_guardrails=False)
    
    # Get the audit log item
    call_args = mock_audit_table.put_item.call_args
    audit_item = call_args.kwargs.get("Item") or call_args.args[0].get("Item")
    
    # Property 15: Audit log must have timestamp
    assert "timestamp" in audit_item, \
        "Audit log must have timestamp"
    
    # Property 15: Timestamp must be a valid ISO format string
    timestamp = audit_item["timestamp"]
    assert isinstance(timestamp, str), \
        "Timestamp must be a string"
    
    # Verify timestamp format (ISO 8601)
    from datetime import datetime
    try:
        parsed_timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        assert parsed_timestamp is not None, \
            "Timestamp must be parseable"
    except ValueError:
        pytest.fail("Timestamp must be in valid ISO format")


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(request=content_validation_request_strategy())
def test_property_15_audit_log_records_issues(
    content_validator_with_audit, request
):
    """Property 15: Audit log must record all validation issues
    
    For any validation that finds issues, the audit log must record
    the issue details including check type, severity, and message.
    """
    validator, mock_audit_table = content_validator_with_audit
    
    # Validate the content
    result = validator.validate_content(request, use_guardrails=False)
    
    # Get the audit log item
    call_args = mock_audit_table.put_item.call_args
    audit_item = call_args.kwargs.get("Item") or call_args.args[0].get("Item")
    
    # Property 15: If validation has issues, audit log must record them
    if len(result.issues) > 0:
        assert len(audit_item["issues"]) > 0, \
            "Audit log must record issues when validation finds them"
        
        # Property 15: Each issue must have required fields
        for issue in audit_item["issues"]:
            assert "check_type" in issue, \
                "Issue must have check_type"
            assert "severity" in issue, \
                "Issue must have severity"
            assert "message" in issue, \
                "Issue must have message"
            
            # Property 15: Severity must be valid
            assert issue["severity"] in ["low", "medium", "high", "critical"], \
                f"Issue severity must be valid, got {issue['severity']}"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    request=content_validation_request_strategy(),
    regeneration_attempts=st.integers(min_value=0, max_value=3)
)
def test_property_15_audit_log_tracks_regeneration_attempts(
    content_validator_with_audit, request, regeneration_attempts
):
    """Property 15: Audit log must track regeneration attempts
    
    For any validation with regeneration, the audit log must record
    the number of regeneration attempts and final status.
    """
    validator, mock_audit_table = content_validator_with_audit
    
    # Mock regeneration callback
    def mock_regeneration(req, issues):
        return f"Regenerated content: {req.content}"
    
    # Validate with regeneration
    result, attempts = validator.validate_with_regeneration(
        request,
        mock_regeneration,
        use_guardrails=False,
    )
    
    # Property 15: Audit log must be created for regeneration workflow
    assert mock_audit_table.put_item.called, \
        "Audit log must be created for validation with regeneration"
    
    # Get the last audit log item (final result)
    last_call_args = mock_audit_table.put_item.call_args
    audit_item = last_call_args.kwargs.get("Item") or last_call_args.args[0].get("Item")
    
    # Property 15: Audit log must record regeneration count
    assert "regeneration_count" in audit_item, \
        "Audit log must record regeneration count"
    assert audit_item["regeneration_count"] == attempts, \
        "Regeneration count must match actual attempts"
    
    # Property 15: Audit log must record final status
    assert "final_status" in audit_item, \
        "Audit log must record final status"
    assert audit_item["final_status"] in ["passed", "failed", "needs_regeneration"], \
        "Final status must be valid"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(request=content_validation_request_strategy())
def test_property_15_audit_log_includes_alignment_score(
    content_validator_with_audit, request
):
    """Property 15: Audit log must include curriculum alignment score
    
    For any validation that calculates alignment score, the audit log
    must record the score for tracking content quality.
    """
    validator, mock_audit_table = content_validator_with_audit
    
    # Validate the content
    result = validator.validate_content(request, use_guardrails=False)
    
    # Get the audit log item
    call_args = mock_audit_table.put_item.call_args
    audit_item = call_args.kwargs.get("Item") or call_args.args[0].get("Item")
    
    # Property 15: Audit log must have alignment_score field
    assert "alignment_score" in audit_item, \
        "Audit log must have alignment_score field"
    
    # Property 15: If alignment score exists, it must match result
    if result.alignment_score is not None:
        assert audit_item["alignment_score"] == result.alignment_score, \
            "Audit log alignment score must match validation result"
        
        # Property 15: Alignment score must be in valid range
        assert 0.0 <= audit_item["alignment_score"] <= 1.0, \
            "Alignment score must be between 0 and 1"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    request1=content_validation_request_strategy(),
    request2=content_validation_request_strategy()
)
def test_property_15_audit_logs_have_unique_ids(
    content_validator_with_audit, request1, request2
):
    """Property 15: Each audit log must have a unique identifier
    
    For any two validation attempts, the audit logs must have different
    log IDs to ensure uniqueness and traceability.
    """
    validator, mock_audit_table = content_validator_with_audit
    
    # Validate first content
    result1 = validator.validate_content(request1, use_guardrails=False)
    
    # Get first audit log
    first_call_args = mock_audit_table.put_item.call_args
    first_audit_item = first_call_args.kwargs.get("Item") or first_call_args.args[0].get("Item")
    first_log_id = first_audit_item["log_id"]
    
    # Validate second content
    result2 = validator.validate_content(request2, use_guardrails=False)
    
    # Get second audit log
    second_call_args = mock_audit_table.put_item.call_args
    second_audit_item = second_call_args.kwargs.get("Item") or second_call_args.args[0].get("Item")
    second_log_id = second_audit_item["log_id"]
    
    # Property 15: Log IDs must be unique
    assert first_log_id != second_log_id, \
        "Each audit log must have a unique log_id"
    
    # Property 15: Log IDs must be non-empty strings
    assert isinstance(first_log_id, str) and len(first_log_id) > 0, \
        "Log ID must be a non-empty string"
    assert isinstance(second_log_id, str) and len(second_log_id) > 0, \
        "Log ID must be a non-empty string"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(request=content_validation_request_strategy())
def test_property_15_audit_log_persists_regardless_of_validation_outcome(
    content_validator_with_audit, request
):
    """Property 15: Audit log must be created regardless of validation outcome
    
    For any validation attempt, whether it passes or fails, an audit log
    must be created to maintain complete audit trail.
    """
    validator, mock_audit_table = content_validator_with_audit
    
    # Validate the content
    result = validator.validate_content(request, use_guardrails=False)
    
    # Property 15: Audit log must be created regardless of outcome
    assert mock_audit_table.put_item.called, \
        "Audit log must be created for all validation outcomes"
    
    # Get the audit log item
    call_args = mock_audit_table.put_item.call_args
    audit_item = call_args.kwargs.get("Item") or call_args.args[0].get("Item")
    
    # Property 15: Audit log must record the actual status
    assert audit_item["validation_status"] in ["passed", "failed", "needs_regeneration"], \
        "Audit log must record valid validation status"
    
    # Property 15: Audit log must be complete regardless of status
    required_fields = [
        "log_id", "content_id", "content_type", "timestamp",
        "validation_status", "final_status", "passed_checks",
        "failed_checks", "issues_count", "issues"
    ]
    
    for field in required_fields:
        assert field in audit_item, \
            f"Audit log must have {field} field regardless of validation outcome"


@pytest.mark.property_test
@settings(
    max_examples=30,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    content_type=st.sampled_from(["lesson", "quiz", "hint"]),
    grade=st.integers(min_value=6, max_value=8),
    subject=st.sampled_from([s.value for s in Subject])
)
def test_property_15_audit_log_consistency_across_content_types(
    content_validator_with_audit, content_type, grade, subject
):
    """Property 15: Audit log format must be consistent across content types
    
    For any content type (lesson, quiz, hint), the audit log must follow
    the same structure and contain the same required fields.
    """
    validator, mock_audit_table = content_validator_with_audit
    
    # Create request
    request = ContentValidationRequest(
        content_id=f"test-{content_type}-001",
        content_type=content_type,
        content=f"Educational content for {subject}.",
        target_standards=[f"{subject.upper()}-{grade}-001"],
        grade=grade,
        subject=subject,
    )
    
    # Validate the content
    result = validator.validate_content(request, use_guardrails=False)
    
    # Get the audit log item
    call_args = mock_audit_table.put_item.call_args
    audit_item = call_args.kwargs.get("Item") or call_args.args[0].get("Item")
    
    # Property 15: Audit log must have consistent structure
    required_fields = [
        "log_id", "content_id", "content_type", "timestamp",
        "validation_status", "final_status", "regeneration_count",
        "passed_checks", "failed_checks", "issues_count", "issues"
    ]
    
    for field in required_fields:
        assert field in audit_item, \
            f"Audit log must have {field} field for {content_type}"
    
    # Property 15: Content type must match request
    assert audit_item["content_type"] == content_type, \
        "Audit log must record correct content type"
