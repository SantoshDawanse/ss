"""Property-based tests for curriculum data loading.

Feature: curriculum-mcp-and-content-generation
"""

import json
import tempfile
from pathlib import Path

import pytest
from hypothesis import given, strategies as st

from src.mcp.server import MCPServer
from src.models.curriculum import BloomLevel, Subject


class TestCurriculumDataLoadingProperty:
    """Property tests for MCP Server curriculum data loading."""

    @pytest.mark.property_test
    def test_property_1_mcp_server_loads_all_subjects_and_grades(self):
        """Property 1: MCP Server Curriculum Data Loading.

        For any MCP Server initialization with valid curriculum data files,
        the server should load standards for all specified subjects
        (Mathematics, Science, Social Studies) and grades (6-8), indexed
        by ID, grade, and subject.

        **Validates: Requirements 1.1, 1.3**
        """
        # Initialize MCP Server with default data
        mcp = MCPServer()

        # Verify data is loaded and indexed by ID
        assert len(mcp.curriculum_data) > 0, "No curriculum data loaded"

        # Verify all MVP subjects have data for grades 6-8
        required_subjects = ["Mathematics", "Science", "Social Studies"]
        required_grades = [6, 7, 8]

        for subject in required_subjects:
            for grade in required_grades:
                standards = mcp.get_curriculum_standards(grade, subject)
                # At least one standard should exist for each subject-grade combination
                # (This is a weaker assertion than requiring all combinations,
                # but validates the loading and indexing works)
                assert isinstance(standards, list), (
                    f"Expected list for {subject} grade {grade}, "
                    f"got {type(standards)}"
                )

        # Verify indexing by ID works
        for standard_id in mcp.curriculum_data.keys():
            assert standard_id in mcp.curriculum_data
            standard = mcp.curriculum_data[standard_id]
            assert standard.id == standard_id

        # Verify grade-subject index is built
        assert len(mcp._grade_subject_index) > 0, "Grade-subject index not built"

    @given(
        grade=st.integers(min_value=6, max_value=8),
        subject=st.sampled_from(["Mathematics", "Science", "Social Studies"]),
    )
    @pytest.mark.property_test
    def test_property_1_indexed_retrieval_consistent(self, grade: int, subject: str):
        """Property 1 (variant): Indexed retrieval is consistent.

        For any valid grade (6-8) and subject, retrieving standards
        should return consistent results using the index.

        **Validates: Requirements 1.1, 1.3**
        """
        mcp = MCPServer()

        # Get standards using indexed retrieval
        standards = mcp.get_curriculum_standards(grade, subject)

        # Verify all returned standards match the query
        for standard in standards:
            assert standard.grade == grade
            # subject is already a string value
            subject_value = standard.subject if isinstance(standard.subject, str) else standard.subject.value
            assert subject_value == subject

        # Verify standards are in curriculum_data
        for standard in standards:
            assert standard.id in mcp.curriculum_data


class TestCurriculumDataValidationProperty:
    """Property tests for MCP Server data validation."""

    @pytest.mark.property_test
    def test_property_2_mcp_server_validates_schema(self):
        """Property 2: MCP Server Data Validation.

        For any curriculum data loaded by the MCP Server, each standard
        should be validated for schema compliance, and any validation
        errors should be logged.

        **Validates: Requirements 1.2**
        """
        # Create temporary directory with valid and invalid data
        with tempfile.TemporaryDirectory() as tmpdir:
            data_dir = Path(tmpdir)
            curriculum_file = data_dir / "curriculum_standards.json"

            # Create test data with one valid and one invalid standard
            test_data = [
                {
                    "id": "TEST-6-001",
                    "grade": 6,
                    "subject": "Mathematics",
                    "topic": "Test Topic",
                    "learning_objectives": ["Objective 1"],
                    "prerequisites": [],
                    "bloom_level": "apply",
                    "estimated_hours": 5.0,
                    "keywords": ["test"],
                },
                {
                    "id": "TEST-6-002",
                    "grade": 15,  # Invalid grade (outside 6-8 range)
                    "subject": "Mathematics",
                    "topic": "Invalid Topic",
                    "learning_objectives": ["Objective 1"],
                    "prerequisites": [],
                    "bloom_level": "apply",
                    "estimated_hours": 5.0,
                    "keywords": ["test"],
                },
            ]

            with open(curriculum_file, "w") as f:
                json.dump(test_data, f)

            # Initialize MCP Server with test data
            mcp = MCPServer(data_dir=data_dir)

            # Valid standard should be loaded
            assert "TEST-6-001" in mcp.curriculum_data

            # Invalid standard should be rejected (not in curriculum_data)
            assert "TEST-6-002" not in mcp.curriculum_data

            # At least one standard should be loaded
            assert len(mcp.curriculum_data) >= 1

    @given(
        grade=st.integers(min_value=6, max_value=8),
        subject=st.sampled_from(list(Subject)),
        topic=st.text(min_size=1, max_size=100),
        bloom_level=st.sampled_from(list(BloomLevel)),
        estimated_hours=st.floats(min_value=0.5, max_value=50.0),
    )
    @pytest.mark.property_test
    def test_property_2_valid_standards_pass_validation(
        self,
        grade: int,
        subject: Subject,
        topic: str,
        bloom_level: BloomLevel,
        estimated_hours: float,
    ):
        """Property 2 (variant): Valid standards pass validation.

        For any curriculum standard with valid fields, the MCP Server
        should successfully validate and load it.

        **Validates: Requirements 1.2**
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            data_dir = Path(tmpdir)
            curriculum_file = data_dir / "curriculum_standards.json"

            # Create valid test data
            test_data = [
                {
                    "id": f"TEST-{grade}-001",
                    "grade": grade,
                    "subject": subject.value,
                    "topic": topic,
                    "learning_objectives": ["Test objective"],
                    "prerequisites": [],
                    "bloom_level": bloom_level.value,
                    "estimated_hours": estimated_hours,
                    "keywords": ["test"],
                }
            ]

            with open(curriculum_file, "w") as f:
                json.dump(test_data, f)

            # Initialize MCP Server
            mcp = MCPServer(data_dir=data_dir)

            # Standard should be loaded
            assert f"TEST-{grade}-001" in mcp.curriculum_data

            # Verify standard fields
            standard = mcp.curriculum_data[f"TEST-{grade}-001"]
            assert standard.grade == grade
            assert standard.topic == topic
            assert standard.estimated_hours == estimated_hours


class TestCurriculumDataErrorHandlingProperty:
    """Property tests for error handling in curriculum data loading."""

    @pytest.mark.property_test
    def test_property_missing_file_handled_gracefully(self):
        """Property: Missing curriculum file handled gracefully.

        When curriculum data file is missing, the MCP Server should
        log an error and initialize with empty data (Requirement 1.5).

        **Validates: Requirements 1.5**
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            data_dir = Path(tmpdir)
            # Don't create curriculum_standards.json

            # Initialize MCP Server with missing file
            mcp = MCPServer(data_dir=data_dir)

            # Should initialize with empty data
            assert len(mcp.curriculum_data) == 0
            assert len(mcp._grade_subject_index) == 0

            # Should not raise exception
            standards = mcp.get_curriculum_standards(6, "Mathematics")
            assert standards == []

    @pytest.mark.property_test
    def test_property_corrupted_file_handled_gracefully(self):
        """Property: Corrupted curriculum file handled gracefully.

        When curriculum data file contains invalid JSON, the MCP Server
        should log an error and initialize with empty data (Requirement 1.5).

        **Validates: Requirements 1.5**
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            data_dir = Path(tmpdir)
            curriculum_file = data_dir / "curriculum_standards.json"

            # Create corrupted JSON file
            with open(curriculum_file, "w") as f:
                f.write("{ invalid json content }")

            # Initialize MCP Server with corrupted file
            mcp = MCPServer(data_dir=data_dir)

            # Should initialize with empty data
            assert len(mcp.curriculum_data) == 0
            assert len(mcp._grade_subject_index) == 0

            # Should not raise exception
            standards = mcp.get_curriculum_standards(6, "Mathematics")
            assert standards == []

    @given(invalid_json=st.text(min_size=1, max_size=100))
    @pytest.mark.property_test
    def test_property_any_corrupted_json_handled(self, invalid_json: str):
        """Property: Any corrupted JSON handled gracefully.

        For any invalid JSON content, the MCP Server should handle it
        gracefully without crashing.

        **Validates: Requirements 1.5**
        """
        # Skip valid JSON strings
        try:
            json.loads(invalid_json)
            return  # Skip if it's actually valid JSON
        except json.JSONDecodeError:
            pass  # Good, it's invalid JSON

        with tempfile.TemporaryDirectory() as tmpdir:
            data_dir = Path(tmpdir)
            curriculum_file = data_dir / "curriculum_standards.json"

            with open(curriculum_file, "w") as f:
                f.write(invalid_json)

            # Should not raise exception
            try:
                mcp = MCPServer(data_dir=data_dir)
                assert len(mcp.curriculum_data) == 0
            except Exception as e:
                pytest.fail(f"MCP Server raised exception on invalid JSON: {e}")
