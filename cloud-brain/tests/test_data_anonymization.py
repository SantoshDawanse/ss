"""Unit tests for data anonymization service."""

import pytest
from datetime import datetime

from src.services.data_anonymization import DataAnonymizationService
from src.models.personalization import (
    PerformanceLog,
    KnowledgeModel,
    SubjectKnowledge,
    TopicKnowledge,
    MasteryLevel
)


class TestDataAnonymizationService:
    """Test suite for DataAnonymizationService."""

    def setup_method(self):
        """Set up test fixtures."""
        self.service = DataAnonymizationService(salt="test-salt")
        
    def test_anonymize_student_id_is_consistent(self):
        """Test that same student ID always produces same anonymized ID."""
        student_id = "student123"
        
        result1 = self.service.anonymize_student_id(student_id)
        result2 = self.service.anonymize_student_id(student_id)
        
        assert result1 == result2
        assert len(result1) == 16  # Truncated SHA256
        assert result1 != student_id  # Should be different from original
        
    def test_anonymize_student_id_different_for_different_students(self):
        """Test that different student IDs produce different anonymized IDs."""
        student_id1 = "student123"
        student_id2 = "student456"
        
        result1 = self.service.anonymize_student_id(student_id1)
        result2 = self.service.anonymize_student_id(student_id2)
        
        assert result1 != result2
        
    def test_remove_pii_from_text_removes_email(self):
        """Test that email addresses are removed from text."""
        text = "Contact me at john.doe@example.com for more info"
        
        result = self.service.remove_pii_from_text(text)
        
        assert "[EMAIL]" in result
        assert "john.doe@example.com" not in result
        
    def test_remove_pii_from_text_removes_phone(self):
        """Test that phone numbers are removed from text."""
        text = "Call me at 555-123-4567 or +1-555-987-6543"
        
        result = self.service.remove_pii_from_text(text)
        
        assert "[PHONE]" in result
        assert "555-123-4567" not in result
        assert "+1-555-987-6543" not in result
        
    def test_remove_pii_from_text_removes_names(self):
        """Test that potential names are removed from text."""
        text = "Student John Smith completed the assignment"
        
        result = self.service.remove_pii_from_text(text)
        
        assert "[NAME]" in result
        assert "John Smith" not in result
        
    def test_remove_pii_from_text_handles_empty_string(self):
        """Test that empty strings are handled gracefully."""
        result = self.service.remove_pii_from_text("")
        
        assert result == ""
        
    def test_remove_pii_from_text_handles_none(self):
        """Test that None values are handled gracefully."""
        result = self.service.remove_pii_from_text(None)
        
        assert result is None
        
    def test_anonymize_performance_log(self):
        """Test anonymization of a performance log."""
        log = PerformanceLog(
            student_id="student123",
            timestamp=datetime(2024, 1, 1, 12, 0, 0),
            event_type="quiz_answer",
            content_id="quiz_001",
            subject="Mathematics",
            topic="Algebra",
            data={
                "answer": "x = 5",
                "correct": True,
                "time_spent": 120
            }
        )
        
        result = self.service.anonymize_performance_log(log)
        
        assert "anonymized_student_id" in result
        assert result["anonymized_student_id"] != "student123"
        assert "student_id" not in result
        assert result["event_type"] == "quiz_answer"
        assert result["subject"] == "Mathematics"
        assert result["topic"] == "Algebra"
        assert result["data"]["correct"] is True
        assert result["data"]["time_spent"] == 120
        
    def test_anonymize_performance_log_removes_pii_from_data(self):
        """Test that PII in log data is removed."""
        log = PerformanceLog(
            student_id="student123",
            timestamp=datetime(2024, 1, 1, 12, 0, 0),
            event_type="lesson_complete",
            content_id="lesson_001",
            subject="English",
            topic="Writing",
            data={
                "notes": "Contact teacher at teacher@school.com",
                "time_spent": 300
            }
        )
        
        result = self.service.anonymize_performance_log(log)
        
        assert "[EMAIL]" in result["data"]["notes"]
        assert "teacher@school.com" not in result["data"]["notes"]
        
    def test_anonymize_performance_logs_batch(self):
        """Test anonymization of multiple logs."""
        logs = [
            PerformanceLog(
                student_id="student123",
                timestamp=datetime(2024, 1, 1, 12, 0, 0),
                event_type="quiz_answer",
                content_id="quiz_001",
                subject="Mathematics",
                topic="Algebra",
                data={"correct": True}
            ),
            PerformanceLog(
                student_id="student123",
                timestamp=datetime(2024, 1, 1, 12, 5, 0),
                event_type="quiz_complete",
                content_id="quiz_001",
                subject="Mathematics",
                topic="Algebra",
                data={"score": 0.9}
            )
        ]
        
        results = self.service.anonymize_performance_logs(logs)
        
        assert len(results) == 2
        assert all("anonymized_student_id" in r for r in results)
        assert results[0]["anonymized_student_id"] == results[1]["anonymized_student_id"]
        
    def test_anonymize_knowledge_model(self):
        """Test anonymization of a knowledge model."""
        model = KnowledgeModel(
            student_id="student123",
            last_updated=datetime(2024, 1, 1, 12, 0, 0),
            subjects={
                "Mathematics": SubjectKnowledge(
                    topics={
                        "algebra": TopicKnowledge(
                            proficiency=0.8,
                            attempts=5,
                            last_practiced=datetime(2024, 1, 1, 12, 0, 0),
                            mastery_level=MasteryLevel.PROFICIENT,
                            cognitive_level=3
                        )
                    },
                    overall_proficiency=0.8,
                    learning_velocity=2.5
                )
            }
        )
        
        result = self.service.anonymize_knowledge_model(model)
        
        assert "anonymized_student_id" in result
        assert result["anonymized_student_id"] != "student123"
        assert "student_id" not in result
        assert "Mathematics" in result["subjects"]
        assert result["subjects"]["Mathematics"]["overall_proficiency"] == 0.8
        assert result["subjects"]["Mathematics"]["learning_velocity"] == 2.5
        assert "algebra" in result["subjects"]["Mathematics"]["topics"]
        assert result["subjects"]["Mathematics"]["topics"]["algebra"]["proficiency"] == 0.8
        
    def test_sanitize_log_message(self):
        """Test sanitization of log messages."""
        message = "User john.doe@example.com logged in from 555-123-4567"
        
        result = self.service.sanitize_log_message(message)
        
        assert "[EMAIL]" in result
        assert "[PHONE]" in result
        assert "john.doe@example.com" not in result
        assert "555-123-4567" not in result
