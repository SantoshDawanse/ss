"""Unit tests for data export service."""

import pytest
from datetime import datetime
from unittest.mock import Mock, MagicMock

from src.services.data_export import DataExportService
from src.models.personalization import (
    PerformanceLog,
    KnowledgeModel,
    SubjectKnowledge,
    TopicKnowledge,
    MasteryLevel
)


class TestDataExportService:
    """Test suite for DataExportService."""

    def setup_method(self):
        """Set up test fixtures."""
        # Mock the repository
        self.mock_repo = Mock()
        self.service = DataExportService(knowledge_model_repo=self.mock_repo)
        
        # Create sample data
        self.sample_logs = [
            PerformanceLog(
                student_id="student123",
                timestamp=datetime(2024, 1, 1, 12, 0, 0),
                event_type="quiz_answer",
                content_id="quiz_001",
                subject="Mathematics",
                topic="Algebra",
                data={"correct": True, "time_spent": 120, "hints_used": 0}
            ),
            PerformanceLog(
                student_id="student123",
                timestamp=datetime(2024, 1, 1, 12, 5, 0),
                event_type="quiz_answer",
                content_id="quiz_001",
                subject="Mathematics",
                topic="Algebra",
                data={"correct": False, "time_spent": 90, "hints_used": 2}
            ),
            PerformanceLog(
                student_id="student123",
                timestamp=datetime(2024, 1, 1, 12, 10, 0),
                event_type="lesson_complete",
                content_id="lesson_001",
                subject="Science",
                topic="Physics",
                data={"time_spent": 300}
            )
        ]
        
        self.sample_model = KnowledgeModel(
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
                        ),
                        "geometry": TopicKnowledge(
                            proficiency=0.6,
                            attempts=3,
                            last_practiced=datetime(2024, 1, 1, 11, 0, 0),
                            mastery_level=MasteryLevel.DEVELOPING,
                            cognitive_level=2
                        )
                    },
                    overall_proficiency=0.7,
                    learning_velocity=2.5
                ),
                "Science": SubjectKnowledge(
                    topics={
                        "physics": TopicKnowledge(
                            proficiency=0.9,
                            attempts=7,
                            last_practiced=datetime(2024, 1, 1, 12, 10, 0),
                            mastery_level=MasteryLevel.ADVANCED,
                            cognitive_level=4
                        )
                    },
                    overall_proficiency=0.9,
                    learning_velocity=3.0
                )
            }
        )
    
    def test_export_performance_logs_csv_empty(self):
        """Test exporting empty performance logs returns empty string."""
        result = self.service.export_performance_logs_csv([])
        
        assert result == ""
    
    def test_export_performance_logs_csv_contains_header(self):
        """Test that CSV export contains proper header."""
        result = self.service.export_performance_logs_csv(self.sample_logs)
        
        lines = result.strip().split("\n")
        header = lines[0]
        
        assert "Timestamp" in header
        assert "Event Type" in header
        assert "Subject" in header
        assert "Topic" in header
        assert "Content ID" in header
    
    def test_export_performance_logs_csv_contains_data(self):
        """Test that CSV export contains log data."""
        result = self.service.export_performance_logs_csv(self.sample_logs)
        
        lines = result.strip().split("\n")
        
        # Should have header + 3 data rows
        assert len(lines) == 4
        
        # Check first data row
        assert "quiz_answer" in lines[1]
        assert "Mathematics" in lines[1]
        assert "Algebra" in lines[1]
    
    def test_export_knowledge_model_csv_contains_header(self):
        """Test that knowledge model CSV contains proper header."""
        result = self.service.export_knowledge_model_csv(self.sample_model)
        
        lines = result.strip().split("\n")
        header = lines[0]
        
        assert "Subject" in header
        assert "Topic" in header
        assert "Proficiency" in header
        assert "Mastery Level" in header
    
    def test_export_knowledge_model_csv_contains_data(self):
        """Test that knowledge model CSV contains topic data."""
        result = self.service.export_knowledge_model_csv(self.sample_model)
        
        lines = result.strip().split("\n")
        
        # Should have header + 3 topic rows (2 math + 1 science)
        assert len(lines) == 4
        
        # Check data is present
        csv_content = result.lower()
        assert "mathematics" in csv_content
        assert "algebra" in csv_content
        assert "geometry" in csv_content
        assert "science" in csv_content
        assert "physics" in csv_content
    
    def test_export_student_summary_csv_contains_sections(self):
        """Test that summary CSV contains all required sections."""
        result = self.service.export_student_summary_csv(
            "student123",
            self.sample_model,
            self.sample_logs
        )
        
        assert "Student Learning Summary" in result
        assert "Student ID" in result
        assert "student123" in result
        assert "Subject Proficiency" in result
        assert "Activity Summary" in result
        assert "Quiz Performance" in result
    
    def test_export_student_summary_csv_calculates_accuracy(self):
        """Test that summary CSV correctly calculates quiz accuracy."""
        result = self.service.export_student_summary_csv(
            "student123",
            self.sample_model,
            self.sample_logs
        )
        
        # 1 correct out of 2 quiz answers = 50%
        assert "50.00%" in result or "50%" in result
    
    def test_export_student_data_text_contains_sections(self):
        """Test that text export contains all required sections."""
        result = self.service.export_student_data_text(
            "student123",
            self.sample_model,
            self.sample_logs
        )
        
        assert "STUDENT LEARNING REPORT" in result
        assert "SUBJECT PROFICIENCY" in result
        assert "ACTIVITY SUMMARY" in result
        assert "QUIZ PERFORMANCE" in result
        assert "RECENT ACTIVITY" in result
    
    def test_export_student_data_text_shows_proficiency(self):
        """Test that text export shows subject proficiency."""
        result = self.service.export_student_data_text(
            "student123",
            self.sample_model,
            self.sample_logs
        )
        
        assert "Mathematics" in result
        assert "Science" in result
        assert "70%" in result or "70.00%" in result  # Math proficiency
        assert "90%" in result or "90.00%" in result  # Science proficiency
    
    def test_export_student_data_text_shows_top_topics(self):
        """Test that text export shows top topics."""
        result = self.service.export_student_data_text(
            "student123",
            self.sample_model,
            self.sample_logs
        )
        
        assert "Top Topics" in result
        assert "algebra" in result.lower()
        assert "physics" in result.lower()
    
    def test_export_student_data_csv_format(self):
        """Test exporting student data in CSV format."""
        self.mock_repo.get_knowledge_model.return_value = self.sample_model
        
        result = self.service.export_student_data(
            "student123",
            self.sample_logs,
            format="csv"
        )
        
        assert result["format"] == "csv"
        assert "files" in result
        assert "summary.csv" in result["files"]
        assert "knowledge_model.csv" in result["files"]
        assert "performance_logs.csv" in result["files"]
        assert "export_date" in result
    
    def test_export_student_data_text_format(self):
        """Test exporting student data in text format."""
        self.mock_repo.get_knowledge_model.return_value = self.sample_model
        
        result = self.service.export_student_data(
            "student123",
            self.sample_logs,
            format="text"
        )
        
        assert result["format"] == "text"
        assert "content" in result
        assert "STUDENT LEARNING REPORT" in result["content"]
        assert "export_date" in result
    
    def test_export_student_data_invalid_format(self):
        """Test that invalid format raises ValueError."""
        self.mock_repo.get_knowledge_model.return_value = self.sample_model
        
        with pytest.raises(ValueError, match="Unsupported export format"):
            self.service.export_student_data(
                "student123",
                self.sample_logs,
                format="invalid"
            )
    
    def test_export_student_data_no_knowledge_model(self):
        """Test exporting when no knowledge model exists."""
        self.mock_repo.get_knowledge_model.return_value = None
        
        result = self.service.export_student_data(
            "student123",
            self.sample_logs,
            format="csv"
        )
        
        # Should still export with empty model
        assert result["format"] == "csv"
        assert "files" in result
    
    def test_export_performance_logs_csv_handles_missing_data_fields(self):
        """Test that CSV export handles logs with missing data fields."""
        logs = [
            PerformanceLog(
                student_id="student123",
                timestamp=datetime(2024, 1, 1, 12, 0, 0),
                event_type="lesson_start",
                content_id="lesson_001",
                subject="Mathematics",
                topic="Algebra",
                data={}  # Empty data
            )
        ]
        
        result = self.service.export_performance_logs_csv(logs)
        
        # Should not raise error and should contain the log
        assert "lesson_start" in result
        assert "Mathematics" in result
