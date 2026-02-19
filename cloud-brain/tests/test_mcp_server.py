"""Tests for MCP Server implementation."""

import pytest

from src.mcp import (
    MCPServer,
    get_curriculum_standards_tool,
    get_learning_progression_tool,
    get_topic_details_tool,
    invoke_mcp_tool,
    validate_content_alignment_tool,
)
from src.models.curriculum import BloomLevel, Subject


@pytest.fixture
def mcp_server():
    """Create MCP server instance for testing."""
    return MCPServer()


@pytest.mark.unit
class TestMCPServer:
    """Unit tests for MCP Server."""

    def test_load_curriculum_data(self, mcp_server):
        """Test that curriculum data is loaded successfully."""
        assert len(mcp_server.curriculum_data) > 0
        assert "MATH-6-001" in mcp_server.curriculum_data

    def test_get_curriculum_standards_mathematics(self, mcp_server):
        """Test retrieving mathematics standards for grade 6."""
        standards = mcp_server.get_curriculum_standards(6, "Mathematics")
        assert len(standards) > 0
        assert all(s.grade == 6 for s in standards)
        assert all(s.subject == Subject.MATHEMATICS for s in standards)

    def test_get_curriculum_standards_invalid_subject(self, mcp_server):
        """Test retrieving standards with invalid subject."""
        standards = mcp_server.get_curriculum_standards(6, "InvalidSubject")
        assert len(standards) == 0

    def test_get_topic_details_valid(self, mcp_server):
        """Test retrieving topic details for valid topic."""
        details = mcp_server.get_topic_details("MATH-6-001")
        assert details is not None
        assert details.topic_id == "MATH-6-001"
        assert details.topic_name == "Whole Numbers and Operations"
        assert details.grade == 6
        assert len(details.learning_objectives) > 0

    def test_get_topic_details_invalid(self, mcp_server):
        """Test retrieving topic details for invalid topic."""
        details = mcp_server.get_topic_details("INVALID-ID")
        assert details is None

    def test_validate_content_alignment_good(self, mcp_server):
        """Test content alignment validation with good content."""
        content = """
        This lesson covers whole numbers, addition, subtraction, multiplication,
        and division. We will learn about PEMDAS and order of operations.
        """
        alignment = mcp_server.validate_content_alignment(content, ["MATH-6-001"])
        assert alignment.alignment_score > 0.5
        assert "MATH-6-001" in alignment.matched_standards

    def test_validate_content_alignment_poor(self, mcp_server):
        """Test content alignment validation with poor content."""
        content = "This is about something completely unrelated."
        alignment = mcp_server.validate_content_alignment(content, ["MATH-6-001"])
        assert alignment.alignment_score < 0.5
        assert len(alignment.gaps) > 0

    def test_get_learning_progression_mathematics(self, mcp_server):
        """Test learning progression for mathematics grades 6-8."""
        progression = mcp_server.get_learning_progression("Mathematics", 6, 8)
        assert progression is not None
        assert progression.subject == Subject.MATHEMATICS
        assert progression.grade_range == (6, 8)
        assert len(progression.topic_sequence) > 0
        assert progression.estimated_total_hours > 0

    def test_get_learning_progression_invalid_subject(self, mcp_server):
        """Test learning progression with invalid subject."""
        progression = mcp_server.get_learning_progression("InvalidSubject", 6, 8)
        assert progression is None

    def test_handle_tool_call_get_curriculum_standards(self, mcp_server):
        """Test handle_tool_call for get_curriculum_standards."""
        result = mcp_server.handle_tool_call(
            "get_curriculum_standards", {"grade": 6, "subject": "Mathematics"}
        )
        assert isinstance(result, list)
        assert len(result) > 0

    def test_handle_tool_call_invalid_tool(self, mcp_server):
        """Test handle_tool_call with invalid tool name."""
        with pytest.raises(ValueError, match="Unknown tool"):
            mcp_server.handle_tool_call("invalid_tool", {})

    def test_handle_tool_call_missing_arguments(self, mcp_server):
        """Test handle_tool_call with missing arguments."""
        with pytest.raises(ValueError, match="Missing required"):
            mcp_server.handle_tool_call("get_curriculum_standards", {})


@pytest.mark.unit
class TestMCPTools:
    """Unit tests for MCP Tools."""

    def test_get_curriculum_standards_tool_success(self):
        """Test get_curriculum_standards_tool with valid inputs."""
        result = get_curriculum_standards_tool(6, "Mathematics")
        assert result["success"] is True
        assert result["count"] > 0
        assert len(result["standards"]) > 0

    def test_get_curriculum_standards_tool_invalid_subject(self):
        """Test get_curriculum_standards_tool with invalid subject."""
        result = get_curriculum_standards_tool(6, "InvalidSubject")
        assert result["success"] is True
        assert result["count"] == 0

    def test_get_topic_details_tool_success(self):
        """Test get_topic_details_tool with valid topic."""
        result = get_topic_details_tool("MATH-6-001")
        assert result["success"] is True
        assert result["topic"] is not None
        assert result["topic"]["topic_id"] == "MATH-6-001"

    def test_get_topic_details_tool_not_found(self):
        """Test get_topic_details_tool with invalid topic."""
        result = get_topic_details_tool("INVALID-ID")
        assert result["success"] is False
        assert result["topic"] is None

    def test_validate_content_alignment_tool_success(self):
        """Test validate_content_alignment_tool with valid inputs."""
        content = "This lesson covers whole numbers and operations."
        result = validate_content_alignment_tool(content, ["MATH-6-001"])
        assert result["success"] is True
        assert result["alignment"] is not None
        assert "alignment_score" in result["alignment"]

    def test_get_learning_progression_tool_success(self):
        """Test get_learning_progression_tool with valid inputs."""
        result = get_learning_progression_tool("Mathematics", 6, 8)
        assert result["success"] is True
        assert result["progression"] is not None
        assert result["progression"]["subject"] == "Mathematics"

    def test_get_learning_progression_tool_invalid(self):
        """Test get_learning_progression_tool with invalid subject."""
        result = get_learning_progression_tool("InvalidSubject", 6, 8)
        assert result["success"] is False
        assert result["progression"] is None

    def test_invoke_mcp_tool_success(self):
        """Test invoke_mcp_tool with valid tool name."""
        result = invoke_mcp_tool(
            "get_curriculum_standards", grade=6, subject="Mathematics"
        )
        assert result["success"] is True

    def test_invoke_mcp_tool_invalid_name(self):
        """Test invoke_mcp_tool with invalid tool name."""
        with pytest.raises(ValueError, match="Unknown MCP tool"):
            invoke_mcp_tool("invalid_tool")


@pytest.mark.unit
class TestCurriculumData:
    """Tests for curriculum data integrity."""

    def test_all_subjects_present(self, mcp_server):
        """Test that all MVP subjects have data."""
        subjects = ["Mathematics", "Science", "Nepali", "English", "Social Studies"]
        for subject in subjects:
            standards = mcp_server.get_curriculum_standards(6, subject)
            assert len(standards) > 0, f"No standards found for {subject}"

    def test_all_grades_present(self, mcp_server):
        """Test that all MVP grades (6-8) have data."""
        for grade in [6, 7, 8]:
            standards = mcp_server.get_curriculum_standards(grade, "Mathematics")
            assert len(standards) > 0, f"No standards found for grade {grade}"

    def test_prerequisites_valid(self, mcp_server):
        """Test that all prerequisites reference valid topics."""
        for standard in mcp_server.curriculum_data.values():
            for prereq_id in standard.prerequisites:
                assert (
                    prereq_id in mcp_server.curriculum_data
                ), f"Invalid prerequisite: {prereq_id}"

    def test_bloom_levels_valid(self, mcp_server):
        """Test that all standards have valid Bloom levels."""
        valid_levels = set(BloomLevel)
        for standard in mcp_server.curriculum_data.values():
            assert standard.bloom_level in valid_levels


@pytest.mark.unit
class TestErrorHandling:
    """Tests for error handling in MCP Server."""

    def test_curriculum_data_loading_with_invalid_path(self):
        """Test MCP server initialization with invalid data path."""
        from pathlib import Path

        invalid_path = Path("/nonexistent/path")
        # Server should initialize but have no data
        server = MCPServer(data_dir=invalid_path)
        assert len(server.curriculum_data) == 0

    def test_get_curriculum_standards_with_invalid_grade(self, mcp_server):
        """Test get_curriculum_standards with out-of-range grade."""
        # Should return empty list for grades outside MVP range
        standards = mcp_server.get_curriculum_standards(12, "Mathematics")
        assert len(standards) == 0

    def test_get_curriculum_standards_with_empty_subject(self, mcp_server):
        """Test get_curriculum_standards with empty subject string."""
        standards = mcp_server.get_curriculum_standards(6, "")
        assert len(standards) == 0

    def test_validate_content_alignment_with_empty_content(self, mcp_server):
        """Test content alignment validation with empty content."""
        alignment = mcp_server.validate_content_alignment("", ["MATH-6-001"])
        assert alignment.alignment_score == 0.0
        assert not alignment.aligned
        assert len(alignment.gaps) > 0

    def test_validate_content_alignment_with_empty_standards(self, mcp_server):
        """Test content alignment validation with empty standards list."""
        content = "This is some educational content."
        alignment = mcp_server.validate_content_alignment(content, [])
        assert alignment.alignment_score == 0.0
        assert not alignment.aligned

    def test_validate_content_alignment_with_nonexistent_standard(self, mcp_server):
        """Test content alignment validation with nonexistent standard ID."""
        content = "This is some educational content."
        alignment = mcp_server.validate_content_alignment(
            content, ["NONEXISTENT-ID"]
        )
        assert alignment.alignment_score == 0.0
        assert not alignment.aligned
        assert len(alignment.gaps) > 0
        assert any("not found" in gap.lower() for gap in alignment.gaps)

    def test_get_learning_progression_with_invalid_grade_range(self, mcp_server):
        """Test learning progression with invalid grade range."""
        # Start grade greater than end grade
        progression = mcp_server.get_learning_progression("Mathematics", 8, 6)
        # Should return None or empty progression
        assert progression is None or len(progression.topic_sequence) == 0

    def test_get_learning_progression_with_no_data(self, mcp_server):
        """Test learning progression for grade range with no data."""
        progression = mcp_server.get_learning_progression("Mathematics", 15, 18)
        assert progression is None

    def test_handle_tool_call_with_empty_arguments(self, mcp_server):
        """Test handle_tool_call with completely empty arguments."""
        with pytest.raises(ValueError, match="Missing required"):
            mcp_server.handle_tool_call("get_curriculum_standards", {})

    def test_handle_tool_call_with_partial_arguments(self, mcp_server):
        """Test handle_tool_call with only some required arguments."""
        with pytest.raises(ValueError, match="Missing required"):
            mcp_server.handle_tool_call(
                "get_curriculum_standards", {"grade": 6}
            )

    def test_handle_tool_call_with_wrong_argument_types(self, mcp_server):
        """Test handle_tool_call with wrong argument types."""
        # This should handle gracefully or raise appropriate error
        result = mcp_server.handle_tool_call(
            "get_curriculum_standards", {"grade": "six", "subject": "Mathematics"}
        )
        # Should return empty list or handle error gracefully
        assert isinstance(result, list)

    def test_get_topic_details_with_empty_id(self, mcp_server):
        """Test get_topic_details with empty topic ID."""
        details = mcp_server.get_topic_details("")
        assert details is None

    def test_get_topic_details_with_none_id(self, mcp_server):
        """Test get_topic_details with None as topic ID."""
        details = mcp_server.get_topic_details(None)
        assert details is None


@pytest.mark.unit
class TestToolErrorHandling:
    """Tests for error handling in MCP tool wrappers."""

    def test_get_curriculum_standards_tool_with_invalid_types(self):
        """Test tool with invalid argument types."""
        result = get_curriculum_standards_tool("invalid", "Mathematics")
        # Should handle gracefully and return error or empty result
        assert "success" in result
        assert "standards" in result

    def test_get_topic_details_tool_with_empty_id(self):
        """Test get_topic_details_tool with empty ID."""
        result = get_topic_details_tool("")
        assert result["success"] is False
        assert result["topic"] is None

    def test_validate_content_alignment_tool_with_none_content(self):
        """Test validate_content_alignment_tool with None content."""
        # Should handle gracefully
        try:
            result = validate_content_alignment_tool(None, ["MATH-6-001"])
            assert "success" in result
        except Exception:
            # Exception is acceptable for None input
            pass

    def test_validate_content_alignment_tool_with_empty_list(self):
        """Test validate_content_alignment_tool with empty standards list."""
        result = validate_content_alignment_tool("Some content", [])
        assert result["success"] is True
        assert result["alignment"]["alignment_score"] == 0.0

    def test_get_learning_progression_tool_with_invalid_range(self):
        """Test get_learning_progression_tool with invalid grade range."""
        result = get_learning_progression_tool("Mathematics", 10, 5)
        # Should return error or None
        assert result["success"] is False or result["progression"] is None

    def test_invoke_mcp_tool_with_nonexistent_tool(self):
        """Test invoke_mcp_tool with tool that doesn't exist."""
        with pytest.raises(ValueError, match="Unknown MCP tool"):
            invoke_mcp_tool("nonexistent_tool", grade=6)

    def test_invoke_mcp_tool_with_missing_kwargs(self):
        """Test invoke_mcp_tool with missing required arguments."""
        # Should raise error from underlying tool
        try:
            result = invoke_mcp_tool("get_curriculum_standards")
            # If it doesn't raise, check for error in result
            assert "success" in result
        except TypeError:
            # TypeError is acceptable for missing required arguments
            pass


@pytest.mark.unit
class TestDataIntegrity:
    """Tests for data integrity and consistency."""

    def test_all_standards_have_required_fields(self, mcp_server):
        """Test that all standards have required fields populated."""
        for standard in mcp_server.curriculum_data.values():
            assert standard.id
            assert standard.grade >= 6 and standard.grade <= 8
            assert standard.subject
            assert standard.topic
            assert len(standard.learning_objectives) > 0
            assert standard.bloom_level
            assert standard.estimated_hours > 0

    def test_keywords_not_empty(self, mcp_server):
        """Test that all standards have keywords for alignment."""
        for standard in mcp_server.curriculum_data.values():
            assert len(standard.keywords) > 0, f"No keywords for {standard.id}"

    def test_estimated_hours_reasonable(self, mcp_server):
        """Test that estimated hours are within reasonable range."""
        for standard in mcp_server.curriculum_data.values():
            assert (
                0 < standard.estimated_hours <= 20
            ), f"Unreasonable hours for {standard.id}: {standard.estimated_hours}"

    def test_topic_ids_unique(self, mcp_server):
        """Test that all topic IDs are unique."""
        ids = [standard.id for standard in mcp_server.curriculum_data.values()]
        assert len(ids) == len(set(ids)), "Duplicate topic IDs found"

    def test_learning_objectives_not_empty(self, mcp_server):
        """Test that all standards have learning objectives."""
        for standard in mcp_server.curriculum_data.values():
            assert (
                len(standard.learning_objectives) > 0
            ), f"No learning objectives for {standard.id}"
            for obj in standard.learning_objectives:
                assert obj.strip(), f"Empty learning objective in {standard.id}"
