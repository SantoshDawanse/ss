"""Tests for educator dashboard service."""

import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, MagicMock

from src.models.educator import (
    ClassPerformanceReport,
    CurriculumCoverageReport,
    DashboardData,
    StudentProgress,
)
from src.models.personalization import (
    KnowledgeModel,
    MasteryLevel,
    SubjectKnowledge,
    TopicKnowledge,
)
from src.repositories.knowledge_model_repository import KnowledgeModelRepository
from src.services.educator_dashboard import EducatorDashboardService


@pytest.fixture
def mock_repository():
    """Create a mock knowledge model repository."""
    return Mock(spec=KnowledgeModelRepository)


@pytest.fixture
def dashboard_service(mock_repository):
    """Create an educator dashboard service with mock repository."""
    return EducatorDashboardService(mock_repository)


@pytest.fixture
def sample_knowledge_model():
    """Create a sample knowledge model for testing."""
    return KnowledgeModel(
        student_id="student_1",
        last_updated=datetime.utcnow(),
        subjects={
            "Mathematics": SubjectKnowledge(
                topics={
                    "algebra_basics": TopicKnowledge(
                        proficiency=0.7,
                        attempts=5,
                        last_practiced=datetime.utcnow(),
                        mastery_level=MasteryLevel.PROFICIENT,
                        cognitive_level=3,
                    ),
                    "geometry_shapes": TopicKnowledge(
                        proficiency=0.4,
                        attempts=3,
                        last_practiced=datetime.utcnow() - timedelta(days=2),
                        mastery_level=MasteryLevel.DEVELOPING,
                        cognitive_level=2,
                    ),
                },
                overall_proficiency=0.55,
                learning_velocity=1.2,
            )
        },
    )


def test_get_student_progress(dashboard_service, mock_repository, sample_knowledge_model):
    """Test getting student progress summary."""
    # Arrange
    mock_repository.get_knowledge_model.return_value = sample_knowledge_model
    
    # Act
    progress_list = dashboard_service.get_student_progress("student_1")
    
    # Assert
    assert len(progress_list) == 1
    progress = progress_list[0]
    assert progress.student_id == "student_1"
    assert progress.subject == "Mathematics"
    assert progress.average_accuracy == 0.55
    assert len(progress.topics_mastered) == 1
    assert "algebra_basics" in progress.topics_mastered
    assert len(progress.topics_in_progress) == 1
    assert "geometry_shapes" in progress.topics_in_progress


def test_get_student_progress_no_model(dashboard_service, mock_repository):
    """Test getting student progress when no knowledge model exists."""
    # Arrange
    mock_repository.get_knowledge_model.return_value = None
    
    # Act
    progress_list = dashboard_service.get_student_progress("student_1")
    
    # Assert
    assert len(progress_list) == 0


def test_generate_class_performance_report(dashboard_service, mock_repository, sample_knowledge_model):
    """Test generating class performance report."""
    # Arrange
    student_ids = ["student_1", "student_2"]
    
    # Create models for two students
    model1 = sample_knowledge_model
    model2 = KnowledgeModel(
        student_id="student_2",
        last_updated=datetime.utcnow(),
        subjects={
            "Mathematics": SubjectKnowledge(
                topics={
                    "algebra_basics": TopicKnowledge(
                        proficiency=0.9,
                        attempts=8,
                        last_practiced=datetime.utcnow(),
                        mastery_level=MasteryLevel.ADVANCED,
                        cognitive_level=5,
                    ),
                },
                overall_proficiency=0.9,
                learning_velocity=2.0,
            )
        },
    )
    
    mock_repository.get_knowledge_model.side_effect = [model1, model2]
    
    # Act
    report = dashboard_service.generate_class_performance_report(
        "class_1", "Class A", student_ids, "Mathematics"
    )
    
    # Assert
    assert report is not None
    assert report.class_id == "class_1"
    assert report.class_name == "Class A"
    assert report.subject == "Mathematics"
    assert report.total_students == 2
    assert report.active_students == 2
    assert 0.0 <= report.average_accuracy <= 1.0
    assert len(report.top_performers) >= 1  # student_2 should be top performer


def test_generate_class_performance_report_no_students(dashboard_service):
    """Test generating class report with no students."""
    # Act
    report = dashboard_service.generate_class_performance_report(
        "class_1", "Class A", []
    )
    
    # Assert
    assert report is None


def test_generate_curriculum_coverage_report_individual(
    dashboard_service, mock_repository, sample_knowledge_model
):
    """Test generating curriculum coverage report for individual student."""
    # Arrange
    mock_repository.get_knowledge_model.return_value = sample_knowledge_model
    
    # Act
    report = dashboard_service.generate_curriculum_coverage_report(
        subject="Mathematics",
        student_id="student_1",
    )
    
    # Assert
    assert report is not None
    assert report.student_id == "student_1"
    assert report.subject == "Mathematics"
    assert report.total_topics > 0
    assert report.topics_covered == 2  # algebra_basics and geometry_shapes
    assert report.topics_mastered == 1  # algebra_basics
    assert 0.0 <= report.coverage_percentage <= 100.0
    assert len(report.topic_details) == report.total_topics


def test_generate_curriculum_coverage_report_class(
    dashboard_service, mock_repository, sample_knowledge_model
):
    """Test generating curriculum coverage report for a class."""
    # Arrange
    student_ids = ["student_1", "student_2"]
    mock_repository.get_knowledge_model.return_value = sample_knowledge_model
    
    # Act
    report = dashboard_service.generate_curriculum_coverage_report(
        subject="Mathematics",
        class_id="class_1",
        student_ids=student_ids,
    )
    
    # Assert
    assert report is not None
    assert report.class_id == "class_1"
    assert report.subject == "Mathematics"
    assert report.total_topics > 0
    assert report.topics_covered >= 0
    assert 0.0 <= report.coverage_percentage <= 100.0


def test_get_dashboard_data(dashboard_service, mock_repository, sample_knowledge_model):
    """Test getting complete dashboard data."""
    # Arrange
    educator_id = "educator_1"
    class_ids = ["class_1"]
    student_ids = ["student_1"]
    mock_repository.get_knowledge_model.return_value = sample_knowledge_model
    
    # Act
    dashboard_data = dashboard_service.get_dashboard_data(educator_id, class_ids, student_ids)
    
    # Assert
    assert isinstance(dashboard_data, DashboardData)
    assert dashboard_data.educator_id == educator_id
    assert dashboard_data.class_ids == class_ids
    assert len(dashboard_data.student_progress) > 0
    assert len(dashboard_data.class_reports) > 0
    assert len(dashboard_data.coverage_reports) > 0


def test_identify_struggling_students(dashboard_service, mock_repository):
    """Test that struggling students are correctly identified in class report."""
    # Arrange
    struggling_model = KnowledgeModel(
        student_id="struggling_student",
        last_updated=datetime.utcnow(),
        subjects={
            "Mathematics": SubjectKnowledge(
                topics={
                    "algebra_basics": TopicKnowledge(
                        proficiency=0.2,
                        attempts=5,
                        last_practiced=datetime.utcnow(),
                        mastery_level=MasteryLevel.NOVICE,
                        cognitive_level=1,
                    ),
                },
                overall_proficiency=0.2,
                learning_velocity=0.3,
            )
        },
    )
    
    mock_repository.get_knowledge_model.return_value = struggling_model
    
    # Act
    report = dashboard_service.generate_class_performance_report(
        "class_1", "Class A", ["struggling_student"], "Mathematics"
    )
    
    # Assert
    assert report is not None
    assert "struggling_student" in report.struggling_students


def test_identify_top_performers(dashboard_service, mock_repository):
    """Test that top performers are correctly identified in class report."""
    # Arrange
    top_performer_model = KnowledgeModel(
        student_id="top_student",
        last_updated=datetime.utcnow(),
        subjects={
            "Mathematics": SubjectKnowledge(
                topics={
                    "algebra_basics": TopicKnowledge(
                        proficiency=0.95,
                        attempts=10,
                        last_practiced=datetime.utcnow(),
                        mastery_level=MasteryLevel.ADVANCED,
                        cognitive_level=6,
                    ),
                },
                overall_proficiency=0.95,
                learning_velocity=3.0,
            )
        },
    )
    
    mock_repository.get_knowledge_model.return_value = top_performer_model
    
    # Act
    report = dashboard_service.generate_class_performance_report(
        "class_1", "Class A", ["top_student"], "Mathematics"
    )
    
    # Assert
    assert report is not None
    assert "top_student" in report.top_performers
