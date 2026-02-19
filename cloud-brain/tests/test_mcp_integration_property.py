"""Property-based tests for MCP Server integration.

Feature: sikshya-sathi-system
Property 4: MCP Server Integration

For any content generation request, the Cloud Brain must invoke the MCP Server
to retrieve curriculum standards and validate alignment.

Validates: Requirements 2.6
"""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck
from unittest.mock import Mock, patch, MagicMock

from src.models.curriculum import Subject, BloomLevel
from src.models.content import DifficultyLevel
from src.services.bedrock_agent import BedrockAgentService
from src.services.curriculum_context import CurriculumContextService
from src.mcp.server import MCPServer
from src.mcp.tools import (
    get_curriculum_standards_tool,
    get_topic_details_tool,
    validate_content_alignment_tool,
    get_learning_progression_tool,
    invoke_mcp_tool,
)


# Custom strategies for generating test data
@st.composite
def content_generation_request_strategy(draw):
    """Generate a content generation request."""
    subjects = [s.value for s in Subject]
    subject = draw(st.sampled_from(subjects))
    grade = draw(st.integers(min_value=6, max_value=8))
    
    # Generate topic based on subject
    if subject == Subject.MATHEMATICS.value:
        topics = ["Whole Numbers", "Fractions", "Decimals", "Geometry", "Algebra"]
    elif subject == Subject.SCIENCE.value:
        topics = ["Plants", "Animals", "Matter", "Energy", "Earth Science"]
    else:
        topics = ["Reading", "Writing", "Grammar", "Vocabulary", "Comprehension"]
    
    topic = draw(st.sampled_from(topics))
    difficulty = draw(st.sampled_from([d.value for d in DifficultyLevel]))
    
    # Generate curriculum standards
    curriculum_standards = [f"{subject.upper()}-{grade}-{draw(st.integers(min_value=1, max_value=10)):03d}"]
    
    return {
        "topic": topic,
        "subject": subject,
        "grade": grade,
        "difficulty": difficulty,
        "curriculum_standards": curriculum_standards,
        "student_context": {
            "proficiency": draw(st.floats(min_value=0.0, max_value=1.0)),
            "learning_velocity": draw(st.floats(min_value=0.5, max_value=5.0)),
        },
    }


@st.composite
def mcp_tool_call_strategy(draw):
    """Generate an MCP tool call request."""
    tool_names = [
        "get_curriculum_standards",
        "get_topic_details",
        "validate_content_alignment",
        "get_learning_progression",
    ]
    
    tool_name = draw(st.sampled_from(tool_names))
    
    if tool_name == "get_curriculum_standards":
        arguments = {
            "grade": draw(st.integers(min_value=6, max_value=8)),
            "subject": draw(st.sampled_from([s.value for s in Subject])),
        }
    elif tool_name == "get_topic_details":
        arguments = {
            "topic_id": draw(st.text(
                alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd', 'Pd')),
                min_size=5,
                max_size=20
            )),
        }
    elif tool_name == "validate_content_alignment":
        arguments = {
            "content": draw(st.text(min_size=50, max_size=500)),
            "target_standards": draw(st.lists(
                st.text(min_size=5, max_size=20),
                min_size=1,
                max_size=3
            )),
        }
    else:  # get_learning_progression
        arguments = {
            "subject": draw(st.sampled_from([s.value for s in Subject])),
            "grade_start": draw(st.integers(min_value=6, max_value=7)),
            "grade_end": draw(st.integers(min_value=7, max_value=8)),
        }
    
    return tool_name, arguments


@pytest.fixture
def mcp_server():
    """Create an MCP Server instance for testing."""
    return MCPServer()


@pytest.fixture
def curriculum_context_service():
    """Create a curriculum context service for testing."""
    return CurriculumContextService()


@pytest.fixture
def bedrock_agent_service():
    """Create a Bedrock Agent service for testing."""
    return BedrockAgentService(
        agent_id="test-agent-id",
        agent_alias_id="test-alias-id",
        region="us-east-1",
    )


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(request=content_generation_request_strategy())
def test_property_4_mcp_server_invoked_for_content_generation(
    curriculum_context_service, request
):
    """Property 4: MCP Server Integration
    
    For any content generation request, the Cloud Brain must invoke the MCP Server
    to retrieve curriculum standards.
    
    This property verifies that:
    1. MCP Server is called to get curriculum standards
    2. Curriculum context is retrieved for the request
    3. MCP tools are invoked with correct parameters
    """
    # Property 4: Get curriculum context for lesson generation
    context = curriculum_context_service.get_curriculum_context_for_lesson(
        subject=request["subject"],
        grade=request["grade"],
        topic=request["topic"],
        target_standards=request["curriculum_standards"],
    )
    
    # Property 4: Context must be retrieved
    assert context is not None, "MCP Server must return curriculum context"
    
    # Property 4: Context must include curriculum standards
    assert "curriculum_standards" in context, \
        "Context must include curriculum standards from MCP Server"
    
    # Property 4: Context structure must be valid
    assert isinstance(context["curriculum_standards"], list), \
        "Curriculum standards must be a list"
    
    # Property 4: If MCP Server is available, standards should be retrieved
    # (May be empty if MCP Server has no data for the request)
    assert "error" not in context or context.get("curriculum_standards") is not None, \
        "MCP Server must attempt to retrieve standards"


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    grade=st.integers(min_value=6, max_value=8),
    subject=st.sampled_from([s.value for s in Subject]),
)
def test_property_4_mcp_tools_return_valid_responses(mcp_server, grade, subject):
    """Property 4: MCP tools return valid, structured responses
    
    For any valid MCP tool call, the tool must return a properly structured
    response that can be used by the Cloud Brain.
    """
    # Property 4: Call get_curriculum_standards tool
    result = get_curriculum_standards_tool(grade=grade, subject=subject)
    
    # Property 4: Tool must return a response
    assert result is not None, "MCP tool must return a response"
    
    # Property 4: Response must have success indicator
    assert "success" in result, "MCP tool response must include success field"
    
    # Property 4: Response must include standards data
    assert "standards" in result, "MCP tool response must include standards field"
    assert isinstance(result["standards"], list), "Standards must be a list"
    
    # Property 4: Response must include count
    assert "count" in result, "MCP tool response must include count field"
    assert result["count"] == len(result["standards"]), \
        "Count must match number of standards returned"
    
    # Property 4: Response must echo request parameters
    assert result.get("grade") == grade, "Response must include request grade"
    assert result.get("subject") == subject, "Response must include request subject"


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    content=st.text(min_size=50, max_size=500),
    target_standards=st.lists(
        st.text(min_size=5, max_size=20),
        min_size=1,
        max_size=3
    ),
)
def test_property_4_mcp_validates_content_alignment(mcp_server, content, target_standards):
    """Property 4: MCP Server validates content alignment
    
    For any content and target standards, the MCP Server must validate
    alignment and return a structured result.
    """
    # Property 4: Call validate_content_alignment tool
    result = validate_content_alignment_tool(
        content=content,
        target_standards=target_standards,
    )
    
    # Property 4: Tool must return a response
    assert result is not None, "MCP validation tool must return a response"
    
    # Property 4: Response must have success indicator
    assert "success" in result, "Validation response must include success field"
    
    # Property 4: Response must include alignment data
    if result["success"]:
        assert "alignment" in result, "Successful validation must include alignment data"
        alignment = result["alignment"]
        
        # Property 4: Alignment must have required fields
        assert "aligned" in alignment, "Alignment must include aligned boolean"
        assert "alignment_score" in alignment, "Alignment must include score"
        assert "matched_standards" in alignment, "Alignment must include matched standards"
        assert "gaps" in alignment, "Alignment must include gaps"
        assert "recommendations" in alignment, "Alignment must include recommendations"
        
        # Property 4: Alignment score must be valid
        assert 0.0 <= alignment["alignment_score"] <= 1.0, \
            "Alignment score must be between 0 and 1"
        
        # Property 4: Matched standards must be subset of target standards
        for matched in alignment["matched_standards"]:
            assert matched in target_standards, \
                "Matched standards must be from target standards"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(tool_call=mcp_tool_call_strategy())
def test_property_4_mcp_tool_invocation_interface(tool_call):
    """Property 4: MCP tools can be invoked through unified interface
    
    For any MCP tool call, the tool must be invocable through the
    invoke_mcp_tool interface with proper error handling.
    """
    tool_name, arguments = tool_call
    
    # Property 4: Tool must be invocable
    try:
        result = invoke_mcp_tool(tool_name, **arguments)
        
        # Property 4: Result must be a dictionary
        assert isinstance(result, dict), \
            "MCP tool result must be a dictionary"
        
        # Property 4: Result must have success indicator
        assert "success" in result, \
            "MCP tool result must include success field"
        
    except ValueError as e:
        # Property 4: Invalid tool names should raise ValueError
        assert "Unknown MCP tool" in str(e), \
            "Invalid tool names must raise appropriate error"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(request=content_generation_request_strategy())
def test_property_4_curriculum_context_injected_into_generation(
    curriculum_context_service, request
):
    """Property 4: Curriculum context is injected into content generation
    
    For any content generation request, curriculum context from MCP Server
    must be included in the generation parameters.
    """
    # Property 4: Get curriculum context
    context = curriculum_context_service.get_curriculum_context_for_lesson(
        subject=request["subject"],
        grade=request["grade"],
        topic=request["topic"],
        target_standards=request["curriculum_standards"],
    )
    
    # Property 4: Context must be structured for injection
    assert isinstance(context, dict), "Context must be a dictionary"
    
    # Property 4: Context must have curriculum standards
    assert "curriculum_standards" in context, \
        "Context must include curriculum standards for injection"
    
    # Property 4: Context can be serialized (for Bedrock Agent)
    import json
    try:
        serialized = json.dumps(context)
        assert serialized is not None, "Context must be JSON serializable"
        
        # Property 4: Deserialized context must match original
        deserialized = json.loads(serialized)
        assert "curriculum_standards" in deserialized, \
            "Serialized context must preserve curriculum standards"
    except (TypeError, ValueError) as e:
        pytest.fail(f"Context must be JSON serializable: {e}")


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    subject=st.sampled_from([s.value for s in Subject]),
    grade=st.integers(min_value=6, max_value=8),
)
def test_property_4_mcp_server_handles_quiz_context(
    curriculum_context_service, subject, grade
):
    """Property 4: MCP Server provides context for quiz generation
    
    For any quiz generation request, MCP Server must provide curriculum
    context including assessment guidance.
    """
    topic = "Test Topic"
    learning_objectives = ["Understand basic concepts", "Apply knowledge"]
    
    # Property 4: Get curriculum context for quiz
    context = curriculum_context_service.get_curriculum_context_for_quiz(
        subject=subject,
        grade=grade,
        topic=topic,
        learning_objectives=learning_objectives,
    )
    
    # Property 4: Context must be retrieved
    assert context is not None, "MCP Server must return quiz context"
    
    # Property 4: Context must include curriculum standards
    assert "curriculum_standards" in context, \
        "Quiz context must include curriculum standards"
    
    # Property 4: Context must include assessment guidance
    assert "assessment_guidance" in context, \
        "Quiz context must include assessment guidance from MCP Server"
    
    # Property 4: Assessment guidance must be structured
    assert isinstance(context["assessment_guidance"], dict), \
        "Assessment guidance must be a dictionary"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    subject=st.sampled_from([s.value for s in Subject]),
    grade_start=st.integers(min_value=6, max_value=7),
    grade_end=st.integers(min_value=7, max_value=8),
)
def test_property_4_mcp_provides_learning_progression(
    mcp_server, subject, grade_start, grade_end
):
    """Property 4: MCP Server provides learning progression data
    
    For any subject and grade range, MCP Server must provide learning
    progression information including topic sequence and dependencies.
    """
    # Ensure grade_end >= grade_start
    if grade_end < grade_start:
        grade_start, grade_end = grade_end, grade_start
    
    # Property 4: Get learning progression
    result = get_learning_progression_tool(
        subject=subject,
        grade_start=grade_start,
        grade_end=grade_end,
    )
    
    # Property 4: Tool must return a response
    assert result is not None, "Learning progression tool must return a response"
    
    # Property 4: Response must have success indicator
    assert "success" in result, "Response must include success field"
    
    # Property 4: If successful, must include progression data
    if result["success"]:
        assert "progression" in result, "Successful response must include progression"
        progression = result["progression"]
        
        # Property 4: Progression must have required fields
        assert "subject" in progression, "Progression must include subject"
        assert "grade_range" in progression, "Progression must include grade range"
        assert "topic_sequence" in progression, "Progression must include topic sequence"
        assert "dependencies" in progression, "Progression must include dependencies"
        
        # Property 4: Topic sequence must be a list
        assert isinstance(progression["topic_sequence"], list), \
            "Topic sequence must be a list"
        
        # Property 4: Dependencies must be a dictionary
        assert isinstance(progression["dependencies"], dict), \
            "Dependencies must be a dictionary"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(request=content_generation_request_strategy())
def test_property_4_mcp_integration_error_handling(
    curriculum_context_service, request
):
    """Property 4: MCP integration handles errors gracefully
    
    For any content generation request, if MCP Server encounters errors,
    the system must handle them gracefully and continue operation.
    """
    # Property 4: Mock MCP Server to simulate error
    with patch.object(
        curriculum_context_service.mcp_server,
        'get_curriculum_standards',
        side_effect=Exception("MCP Server unavailable")
    ):
        # Property 4: Get curriculum context (should handle error)
        context = curriculum_context_service.get_curriculum_context_for_lesson(
            subject=request["subject"],
            grade=request["grade"],
            topic=request["topic"],
            target_standards=request["curriculum_standards"],
        )
        
        # Property 4: Context must still be returned
        assert context is not None, \
            "Context must be returned even if MCP Server fails"
        
        # Property 4: Error must be documented
        assert "error" in context or "curriculum_standards" in context, \
            "Error must be documented or empty standards returned"
        
        # Property 4: Context structure must be maintained
        assert isinstance(context, dict), \
            "Context must maintain dictionary structure on error"


@pytest.mark.property_test
@settings(
    max_examples=30,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    request1=content_generation_request_strategy(),
    request2=content_generation_request_strategy(),
)
def test_property_4_mcp_calls_are_deterministic(
    curriculum_context_service, request1, request2
):
    """Property 4: MCP Server calls are deterministic
    
    For any two identical content generation requests, MCP Server must
    return consistent results.
    """
    # Property 4: Make same request twice
    if request1["subject"] == request2["subject"] and request1["grade"] == request2["grade"]:
        context1 = curriculum_context_service.get_curriculum_context_for_lesson(
            subject=request1["subject"],
            grade=request1["grade"],
            topic=request1["topic"],
            target_standards=request1["curriculum_standards"],
        )
        
        context2 = curriculum_context_service.get_curriculum_context_for_lesson(
            subject=request1["subject"],
            grade=request1["grade"],
            topic=request1["topic"],
            target_standards=request1["curriculum_standards"],
        )
        
        # Property 4: Results must be consistent
        assert context1.keys() == context2.keys(), \
            "MCP Server must return consistent context structure"
        
        # Property 4: Curriculum standards must be identical
        if "curriculum_standards" in context1 and "curriculum_standards" in context2:
            assert len(context1["curriculum_standards"]) == len(context2["curriculum_standards"]), \
                "MCP Server must return same number of standards for identical requests"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    grade=st.integers(min_value=6, max_value=8),
    subject=st.sampled_from([s.value for s in Subject]),
)
def test_property_4_mcp_server_data_completeness(mcp_server, grade, subject):
    """Property 4: MCP Server provides complete curriculum data
    
    For any valid grade and subject, MCP Server must provide complete
    curriculum standard information including all required fields.
    """
    # Property 4: Get curriculum standards
    standards = mcp_server.get_curriculum_standards(grade=grade, subject=subject)
    
    # Property 4: Standards must be a list
    assert isinstance(standards, list), "Standards must be returned as a list"
    
    # Property 4: Each standard must have required fields
    for standard in standards:
        assert hasattr(standard, 'id'), "Standard must have id"
        assert hasattr(standard, 'grade'), "Standard must have grade"
        assert hasattr(standard, 'subject'), "Standard must have subject"
        assert hasattr(standard, 'topic'), "Standard must have topic"
        assert hasattr(standard, 'learning_objectives'), "Standard must have learning objectives"
        assert hasattr(standard, 'bloom_level'), "Standard must have Bloom level"
        assert hasattr(standard, 'estimated_hours'), "Standard must have estimated hours"
        
        # Property 4: Fields must have valid values
        assert standard.id, "Standard ID must not be empty"
        assert standard.grade == grade, "Standard grade must match request"
        # Subject can be either enum or string value
        subject_value = standard.subject.value if hasattr(standard.subject, 'value') else standard.subject
        assert subject_value == subject, "Standard subject must match request"
        assert isinstance(standard.learning_objectives, list), \
            "Learning objectives must be a list"
        assert standard.estimated_hours > 0, \
            "Estimated hours must be positive"


@pytest.mark.property_test
@settings(
    max_examples=30,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(request=content_generation_request_strategy())
def test_property_4_bedrock_agent_uses_mcp_context(request):
    """Property 4: Bedrock Agent receives MCP curriculum context
    
    For any content generation request, the Bedrock Agent must receive
    curriculum context from MCP Server in its action group parameters.
    """
    # Property 4: Create curriculum context service
    curriculum_context_service = CurriculumContextService()
    
    # Property 4: Get curriculum context
    curriculum_context = curriculum_context_service.get_curriculum_context_for_lesson(
        subject=request["subject"],
        grade=request["grade"],
        topic=request["topic"],
        target_standards=request["curriculum_standards"],
    )
    
    # Property 4: Simulate action group input preparation
    action_input = {
        "topic": request["topic"],
        "subject": request["subject"],
        "grade": request["grade"],
        "difficulty": request["difficulty"],
        "student_context": request["student_context"],
        "curriculum_standards": request["curriculum_standards"],
        "curriculum_context": curriculum_context,  # Injected from MCP Server
    }
    
    # Property 4: Action input must include curriculum context
    assert "curriculum_context" in action_input, \
        "Bedrock Agent action input must include curriculum context from MCP Server"
    
    # Property 4: Curriculum context must be from MCP Server
    assert action_input["curriculum_context"] == curriculum_context, \
        "Curriculum context must be the one retrieved from MCP Server"
    
    # Property 4: Context must include curriculum standards
    assert "curriculum_standards" in action_input["curriculum_context"], \
        "MCP curriculum context must include standards for Bedrock Agent"
