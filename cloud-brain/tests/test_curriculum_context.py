"""Unit tests for curriculum context service."""

from unittest.mock import MagicMock, patch

import pytest

from src.models.curriculum import (
    BloomLevel,
    ContentAlignment,
    CurriculumStandard,
    LearningProgression,
    Subject,
    TopicDetails,
)
from src.services.curriculum_context import CurriculumContextService


class TestCurriculumContextService:
    """Test suite for curriculum context service."""

    @pytest.fixture
    def service(self):
        """Create service instance."""
        return CurriculumContextService()

    @pytest.fixture
    def mock_standards(self):
        """Create mock curriculum standards."""
        return [
            CurriculumStandard(
                id="MATH-6-NUM-1",
                grade=6,
                subject=Subject.MATHEMATICS,
                topic="Fractions",
                learning_objectives=[
                    "Understand fraction concepts",
                    "Add and subtract fractions",
                ],
                prerequisites=["Basic arithmetic"],
                bloom_level=BloomLevel.UNDERSTAND,
                estimated_hours=10,
                keywords=["fraction", "numerator", "denominator"],
            )
        ]

    def test_get_curriculum_context_for_lesson(self, service, mock_standards):
        """Test getting curriculum context for lesson generation."""
        with patch.object(service.mcp_server, "get_curriculum_standards") as mock_get_standards:
            mock_get_standards.return_value = mock_standards

            context = service.get_curriculum_context_for_lesson(
                subject="Mathematics",
                grade=6,
                topic="Fractions",
                target_standards=["MATH-6-NUM-1"],
            )

            assert "curriculum_standards" in context
            assert len(context["curriculum_standards"]) == 1
            assert context["curriculum_standards"][0]["id"] == "MATH-6-NUM-1"
            assert context["curriculum_standards"][0]["topic"] == "Fractions"

    def test_get_curriculum_context_for_lesson_with_topic_details(self, service, mock_standards):
        """Test getting curriculum context with topic details."""
        topic_details = TopicDetails(
            topic_id="MATH-6-NUM-1",
            topic_name="Fractions",
            grade=6,
            subject=Subject.MATHEMATICS,
            prerequisites=["Basic arithmetic"],
            learning_objectives=["Understand fraction concepts"],
            assessment_criteria=["Can add fractions"],
            bloom_level=BloomLevel.UNDERSTAND,
            estimated_hours=10,
            subtopics=["Adding fractions", "Subtracting fractions"],
            resources=[],
        )

        with patch.object(service.mcp_server, "get_curriculum_standards") as mock_get_standards, \
             patch.object(service.mcp_server, "get_topic_details") as mock_get_details:
            
            mock_get_standards.return_value = mock_standards
            mock_get_details.return_value = topic_details

            context = service.get_curriculum_context_for_lesson(
                subject="Mathematics",
                grade=6,
                topic="Fractions",
                target_standards=["MATH-6-NUM-1"],
            )

            assert context["topic_details"] is not None
            assert context["topic_details"]["prerequisites"] == ["Basic arithmetic"]

    def test_get_curriculum_context_for_lesson_with_progression(self, service, mock_standards):
        """Test getting curriculum context with learning progression."""
        progression = LearningProgression(
            subject=Subject.MATHEMATICS,
            grade_range=(5, 7),
            topic_sequence=["MATH-5-NUM-1", "MATH-6-NUM-1"],
            dependencies={"MATH-6-NUM-1": ["MATH-5-NUM-1"]},
            difficulty_progression=["MATH-5-NUM-1", "MATH-6-NUM-1"],
            estimated_total_hours=20,
        )

        with patch.object(service.mcp_server, "get_curriculum_standards") as mock_get_standards, \
             patch.object(service.mcp_server, "get_learning_progression") as mock_get_progression:
            
            mock_get_standards.return_value = mock_standards
            mock_get_progression.return_value = progression

            context = service.get_curriculum_context_for_lesson(
                subject="Mathematics",
                grade=6,
                topic="Fractions",
                target_standards=["MATH-6-NUM-1"],
            )

            assert context["learning_progression"] is not None
            assert "MATH-6-NUM-1" in context["learning_progression"]["dependencies"]

    def test_get_curriculum_context_for_quiz(self, service, mock_standards):
        """Test getting curriculum context for quiz generation."""
        with patch.object(service.mcp_server, "get_curriculum_standards") as mock_get_standards:
            mock_get_standards.return_value = mock_standards

            context = service.get_curriculum_context_for_quiz(
                subject="Mathematics",
                grade=6,
                topic="Fractions",
                learning_objectives=["Understand fraction concepts"],
            )

            assert "curriculum_standards" in context
            assert "assessment_guidance" in context
            assert len(context["curriculum_standards"]) == 1

    def test_inject_curriculum_context_into_prompt(self, service):
        """Test injecting curriculum context into prompt."""
        base_prompt = "Generate a lesson about fractions."

        curriculum_context = {
            "curriculum_standards": [
                {
                    "id": "MATH-6-NUM-1",
                    "topic": "Fractions",
                    "learning_objectives": ["Understand fractions"],
                    "bloom_level": "understand",
                }
            ],
            "topic_details": {
                "prerequisites": ["Basic arithmetic"],
                "key_concepts": ["Numerator", "Denominator"],
                "common_misconceptions": ["Fractions are always less than 1"],
            },
        }

        enhanced_prompt = service.inject_curriculum_context_into_prompt(
            base_prompt, curriculum_context
        )

        assert "Generate a lesson about fractions." in enhanced_prompt
        assert "Curriculum Context" in enhanced_prompt
        assert "MATH-6-NUM-1" in enhanced_prompt
        assert "Prerequisites" in enhanced_prompt
        assert "Key Concepts" in enhanced_prompt

    def test_validate_content_alignment(self, service):
        """Test validating content alignment."""
        alignment_result = ContentAlignment(
            aligned=True,
            alignment_score=0.85,
            matched_standards=["MATH-6-NUM-1"],
            gaps=[],
            recommendations=["Good alignment"],
        )

        with patch.object(service.mcp_server, "validate_content_alignment") as mock_validate:
            mock_validate.return_value = alignment_result

            result = service.validate_content_alignment(
                content="This lesson covers fractions...",
                target_standards=["MATH-6-NUM-1"],
            )

            assert result["aligned"] is True
            assert result["alignment_score"] == 0.85
            assert len(result["gaps"]) == 0

    def test_get_curriculum_context_handles_errors(self, service):
        """Test that curriculum context handles MCP Server errors gracefully."""
        with patch.object(service.mcp_server, "get_curriculum_standards") as mock_get_standards:
            mock_get_standards.side_effect = Exception("MCP Server unavailable")

            context = service.get_curriculum_context_for_lesson(
                subject="Mathematics",
                grade=6,
                topic="Fractions",
                target_standards=["MATH-6-NUM-1"],
            )

            assert "error" in context
            assert context["curriculum_standards"] == []

    def test_assessment_guidance_for_mathematics(self, service, mock_standards):
        """Test assessment guidance for mathematics."""
        guidance = service._get_assessment_guidance(
            subject="Mathematics",
            grade=6,
            standards=mock_standards,
        )

        assert "question_types" in guidance
        assert "multiple choice" in guidance["question_types"]
        assert "bloom_distribution" in guidance

    def test_assessment_guidance_for_science(self, service):
        """Test assessment guidance for science."""
        standards = [
            CurriculumStandard(
                id="SCI-6-PHY-1",
                grade=6,
                subject=Subject.SCIENCE,
                topic="Forces",
                learning_objectives=["Understand forces"],
                prerequisites=[],
                bloom_level=BloomLevel.APPLY,
                estimated_hours=8,
                keywords=["force", "motion"],
            )
        ]

        guidance = service._get_assessment_guidance(
            subject="Science",
            grade=6,
            standards=standards,
        )

        assert "question_types" in guidance
        assert "conceptual" in guidance["question_types"]
