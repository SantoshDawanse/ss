"""Unit tests for content handler (Bedrock Agent action groups)."""

import json
from unittest.mock import MagicMock, patch

import pytest

from src.handlers.content_handler import (
    generate,
    generate_hints_handler,
    generate_lesson_handler,
    generate_quiz_handler,
    generate_revision_plan_handler,
    generate_study_track_handler,
)
from src.models.personalization import KnowledgeModel, SubjectKnowledge


class TestContentHandler:
    """Test suite for content handler."""

    def test_generate_routes_to_lesson_handler(self):
        """Test that generate routes to lesson handler."""
        event = {
            "actionGroup": "ContentGeneration",
            "function": "GenerateLesson",
            "parameters": [
                {"name": "topic", "value": "Fractions"},
                {"name": "subject", "value": "Mathematics"},
                {"name": "grade", "value": "6"},
                {"name": "difficulty", "value": "easy"},
                {"name": "student_context", "value": '{"proficiency": 0.6}'},
                {"name": "curriculum_standards", "value": '["MATH-6-NUM-1"]'},
            ],
        }

        with patch("src.handlers.content_handler.curriculum_validator") as mock_validator, \
             patch("src.handlers.content_handler.safety_filter") as mock_safety:
            
            mock_validator.validate_lesson.return_value = MagicMock(status="passed")
            mock_safety.filter_content.return_value = MagicMock(is_safe=True)

            result = generate(event, MagicMock())

            assert result["messageVersion"] == "1.0"
            assert result["response"]["function"] == "GenerateLesson"
            assert "functionResponse" in result["response"]

    def test_generate_routes_to_quiz_handler(self):
        """Test that generate routes to quiz handler."""
        event = {
            "actionGroup": "ContentGeneration",
            "function": "GenerateQuiz",
            "parameters": [
                {"name": "topic", "value": "Fractions"},
                {"name": "subject", "value": "Mathematics"},
                {"name": "grade", "value": "6"},
                {"name": "difficulty", "value": "medium"},
                {"name": "question_count", "value": "5"},
                {"name": "learning_objectives", "value": '["MATH-6-NUM-1"]'},
            ],
        }

        with patch("src.handlers.content_handler.curriculum_validator") as mock_validator, \
             patch("src.handlers.content_handler.safety_filter") as mock_safety:
            
            mock_validator.validate_quiz.return_value = MagicMock(status="passed")
            mock_safety.filter_content.return_value = MagicMock(is_safe=True)

            result = generate(event, MagicMock())

            assert result["messageVersion"] == "1.0"
            assert result["response"]["function"] == "GenerateQuiz"

    def test_generate_routes_to_hints_handler(self):
        """Test that generate routes to hints handler."""
        event = {
            "actionGroup": "ContentGeneration",
            "function": "GenerateHints",
            "parameters": [
                {"name": "question", "value": "What is 1/2 + 1/4?"},
                {"name": "correct_answer", "value": "3/4"},
                {"name": "student_error_patterns", "value": "[]"},
            ],
        }

        with patch("src.handlers.content_handler.safety_filter") as mock_safety:
            mock_safety.filter_content.return_value = MagicMock(is_safe=True)

            result = generate(event, MagicMock())

            assert result["messageVersion"] == "1.0"
            assert result["response"]["function"] == "GenerateHints"

    def test_generate_lesson_handler_creates_valid_lesson(self):
        """Test that lesson handler creates valid lesson structure."""
        params = {
            "topic": "Fractions",
            "subject": "Mathematics",
            "grade": "6",
            "difficulty": "easy",
            "student_context": '{"proficiency": 0.6}',
            "curriculum_standards": '["MATH-6-NUM-1"]',
        }

        with patch("src.handlers.content_handler.curriculum_validator") as mock_validator, \
             patch("src.handlers.content_handler.safety_filter") as mock_safety:
            
            mock_validator.validate_lesson.return_value = MagicMock(status="passed")
            mock_safety.filter_content.return_value = MagicMock(is_safe=True)

            result = generate_lesson_handler(params)

            assert "lesson_id" in result
            assert result["subject"] == "Mathematics"
            assert result["topic"] == "Fractions"
            assert result["difficulty"] == "easy"
            assert len(result["sections"]) == 3
            assert result["sections"][0]["type"] == "explanation"

    def test_generate_quiz_handler_creates_valid_quiz(self):
        """Test that quiz handler creates valid quiz structure."""
        params = {
            "topic": "Fractions",
            "subject": "Mathematics",
            "grade": "6",
            "difficulty": "medium",
            "question_count": "5",
            "learning_objectives": '["MATH-6-NUM-1"]',
        }

        with patch("src.handlers.content_handler.curriculum_validator") as mock_validator, \
             patch("src.handlers.content_handler.safety_filter") as mock_safety:
            
            mock_validator.validate_quiz.return_value = MagicMock(status="passed")
            mock_safety.filter_content.return_value = MagicMock(is_safe=True)

            result = generate_quiz_handler(params)

            assert "quiz_id" in result
            assert result["subject"] == "Mathematics"
            assert result["topic"] == "Fractions"
            assert result["difficulty"] == "medium"
            assert len(result["questions"]) == 5
            assert result["questions"][0]["type"] == "multiple_choice"

    def test_generate_hints_handler_creates_three_levels(self):
        """Test that hints handler creates 3 progressive hints."""
        params = {
            "question": "What is 1/2 + 1/4?",
            "correct_answer": "3/4",
            "student_error_patterns": "[]",
        }

        with patch("src.handlers.content_handler.safety_filter") as mock_safety:
            mock_safety.filter_content.return_value = MagicMock(is_safe=True)

            result = generate_hints_handler(params)

            assert len(result) == 3
            assert result[0]["level"] == 1
            assert result[1]["level"] == 2
            assert result[2]["level"] == 3
            assert all("hint_id" in hint for hint in result)

    def test_generate_revision_plan_handler_creates_valid_plan(self):
        """Test that revision plan handler creates valid plan."""
        params = {
            "student_id": "student-123",
            "knowledge_gaps": '["fractions", "decimals"]',
            "time_available": "10",
            "subject": "Mathematics",
        }

        result = generate_revision_plan_handler(params)

        assert "plan_id" in result
        assert result["subject"] == "Mathematics"
        assert len(result["topics"]) == 2
        assert "fractions" in result["topics"]
        assert "decimals" in result["topics"]
        assert result["estimated_hours"] == 10

    def test_generate_study_track_handler_creates_valid_track(self):
        """Test that study track handler creates valid track."""
        knowledge_model = KnowledgeModel(
            student_id="student-123",
            subjects={
                "Mathematics": SubjectKnowledge(
                    overall_proficiency=0.7,
                    learning_velocity=1.5,
                )
            },
        )

        params = {
            "student_id": "student-123",
            "knowledge_model": knowledge_model.model_dump_json(),
            "learning_velocity": "1.5",
            "curriculum_scope": '["fractions", "decimals", "percentages"]',
            "weeks": "3",
        }

        result = generate_study_track_handler(params)

        assert "track_id" in result
        assert len(result["weeks"]) > 0
        assert result["weeks"][0]["week_number"] == 1
        assert len(result["weeks"][0]["topics"]) > 0

    def test_generate_handles_unknown_action(self):
        """Test that generate handles unknown action gracefully."""
        event = {
            "actionGroup": "ContentGeneration",
            "function": "UnknownAction",
            "parameters": [],
        }

        result = generate(event, MagicMock())

        assert result["messageVersion"] == "1.0"
        response_body = json.loads(
            result["response"]["functionResponse"]["responseBody"]["TEXT"]["body"]
        )
        assert "error" in response_body

    def test_generate_lesson_fails_safety_filter(self):
        """Test that lesson generation fails when safety filter detects issues."""
        params = {
            "topic": "Inappropriate Topic",
            "subject": "Mathematics",
            "grade": "6",
            "difficulty": "easy",
            "student_context": '{"proficiency": 0.6}',
            "curriculum_standards": '["MATH-6-NUM-1"]',
        }

        with patch("src.handlers.content_handler.curriculum_validator") as mock_validator, \
             patch("src.handlers.content_handler.safety_filter") as mock_safety:
            
            mock_validator.validate_lesson.return_value = MagicMock(status="passed")
            mock_safety.filter_content.return_value = MagicMock(
                is_safe=False,
                violations=["inappropriate content"]
            )

            with pytest.raises(ValueError, match="inappropriate content"):
                generate_lesson_handler(params)

    def test_generate_quiz_fails_safety_filter(self):
        """Test that quiz generation fails when safety filter detects issues."""
        params = {
            "topic": "Test Topic",
            "subject": "Mathematics",
            "grade": "6",
            "difficulty": "medium",
            "question_count": "5",
            "learning_objectives": '["MATH-6-NUM-1"]',
        }

        with patch("src.handlers.content_handler.curriculum_validator") as mock_validator, \
             patch("src.handlers.content_handler.safety_filter") as mock_safety:
            
            mock_validator.validate_quiz.return_value = MagicMock(status="passed")
            mock_safety.filter_content.return_value = MagicMock(
                is_safe=False,
                violations=["harmful content"]
            )

            with pytest.raises(ValueError, match="inappropriate content"):
                generate_quiz_handler(params)
