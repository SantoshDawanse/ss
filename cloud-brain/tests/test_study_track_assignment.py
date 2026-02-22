"""Tests for study track assignment service."""

import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock

from src.models.study_track import StudyTrackAssignment, StudyTrackCustomization
from src.repositories.study_track_repository import StudyTrackRepository
from src.services.study_track_assignment import StudyTrackAssignmentService


@pytest.fixture
def mock_repository():
    """Create a mock study track repository."""
    return Mock(spec=StudyTrackRepository)


@pytest.fixture
def assignment_service(mock_repository):
    """Create a study track assignment service with mock repository."""
    return StudyTrackAssignmentService(mock_repository)


def test_assign_topics(assignment_service, mock_repository):
    """Test assigning topics to a student."""
    # Arrange
    educator_id = "educator_1"
    student_id = "student_1"
    subject = "Mathematics"
    topics = ["algebra_basics", "geometry_shapes"]
    
    mock_repository.save_assignment.return_value = True
    
    # Act
    assignment = assignment_service.assign_topics(
        educator_id=educator_id,
        student_id=student_id,
        subject=subject,
        topics=topics,
        priority="high",
        notes="Focus on these topics",
    )
    
    # Assert
    assert assignment.educator_id == educator_id
    assert assignment.student_id == student_id
    assert assignment.subject == subject
    assert assignment.topics == topics
    assert assignment.priority == "high"
    assert assignment.notes == "Focus on these topics"
    assert assignment.status == "pending"
    mock_repository.save_assignment.assert_called_once()


def test_customize_study_track(assignment_service, mock_repository):
    """Test creating a customized study track."""
    # Arrange
    educator_id = "educator_1"
    student_id = "student_1"
    subject = "Mathematics"
    topics = ["algebra_basics", "equations", "graphs"]
    
    mock_repository.save_customization.return_value = True
    
    # Act
    customization = assignment_service.customize_study_track(
        educator_id=educator_id,
        student_id=student_id,
        subject=subject,
        topics=topics,
        difficulty_override="medium",
        pacing_multiplier=1.5,
        focus_areas=["algebra_basics"],
        skip_topics=["statistics"],
    )
    
    # Assert
    assert customization.student_id == student_id
    assert customization.subject == subject
    assert customization.topics == topics
    assert customization.difficulty_override == "medium"
    assert customization.pacing_multiplier == 1.5
    assert "algebra_basics" in customization.focus_areas
    assert "statistics" in customization.skip_topics
    assert customization.created_by == educator_id
    assert not customization.applied_to_bundle
    mock_repository.save_customization.assert_called_once()


def test_get_pending_assignments(assignment_service, mock_repository):
    """Test getting pending assignments for a student."""
    # Arrange
    student_id = "student_1"
    mock_assignments = [
        StudyTrackAssignment(
            assignment_id="assign_1",
            educator_id="educator_1",
            student_id=student_id,
            subject="Mathematics",
            topics=["algebra_basics"],
            status="pending",
        ),
        StudyTrackAssignment(
            assignment_id="assign_2",
            educator_id="educator_1",
            student_id=student_id,
            subject="Science",
            topics=["cells"],
            status="pending",
        ),
    ]
    mock_repository.get_pending_assignments.return_value = mock_assignments
    
    # Act
    assignments = assignment_service.get_pending_assignments(student_id)
    
    # Assert
    assert len(assignments) == 2
    assert all(a.student_id == student_id for a in assignments)
    assert all(a.status == "pending" for a in assignments)
    mock_repository.get_pending_assignments.assert_called_once_with(student_id)


def test_apply_assignments_to_bundle(assignment_service, mock_repository):
    """Test applying pending assignments to a learning bundle."""
    # Arrange
    student_id = "student_1"
    subject = "Mathematics"
    bundle_id = "bundle_123"
    
    mock_assignments = [
        StudyTrackAssignment(
            assignment_id="assign_1",
            educator_id="educator_1",
            student_id=student_id,
            subject=subject,
            topics=["algebra_basics", "geometry_shapes"],
            status="pending",
        ),
        StudyTrackAssignment(
            assignment_id="assign_2",
            educator_id="educator_1",
            student_id=student_id,
            subject=subject,
            topics=["equations"],
            status="pending",
        ),
    ]
    mock_repository.get_pending_assignments.return_value = mock_assignments
    mock_repository.update_assignment_status.return_value = True
    
    # Act
    topics = assignment_service.apply_assignments_to_bundle(student_id, subject, bundle_id)
    
    # Assert
    assert len(topics) == 3  # algebra_basics, geometry_shapes, equations
    assert "algebra_basics" in topics
    assert "geometry_shapes" in topics
    assert "equations" in topics
    # Verify assignments were marked as active
    assert mock_repository.update_assignment_status.call_count == 2


def test_apply_assignments_removes_duplicates(assignment_service, mock_repository):
    """Test that duplicate topics are removed when applying assignments."""
    # Arrange
    student_id = "student_1"
    subject = "Mathematics"
    bundle_id = "bundle_123"
    
    mock_assignments = [
        StudyTrackAssignment(
            assignment_id="assign_1",
            educator_id="educator_1",
            student_id=student_id,
            subject=subject,
            topics=["algebra_basics", "geometry_shapes"],
            status="pending",
        ),
        StudyTrackAssignment(
            assignment_id="assign_2",
            educator_id="educator_1",
            student_id=student_id,
            subject=subject,
            topics=["algebra_basics", "equations"],  # algebra_basics is duplicate
            status="pending",
        ),
    ]
    mock_repository.get_pending_assignments.return_value = mock_assignments
    mock_repository.update_assignment_status.return_value = True
    
    # Act
    topics = assignment_service.apply_assignments_to_bundle(student_id, subject, bundle_id)
    
    # Assert
    assert len(topics) == 3  # algebra_basics, geometry_shapes, equations (no duplicates)
    assert topics.count("algebra_basics") == 1


def test_apply_customization_to_bundle(assignment_service, mock_repository):
    """Test applying study track customization to a bundle."""
    # Arrange
    student_id = "student_1"
    subject = "Mathematics"
    bundle_id = "bundle_123"
    
    mock_customization = StudyTrackCustomization(
        track_id="track_1",
        student_id=student_id,
        subject=subject,
        topics=["algebra_basics", "equations"],
        created_by="educator_1",
        applied_to_bundle=False,
    )
    mock_repository.get_customization.return_value = mock_customization
    mock_repository.save_customization.return_value = True
    
    # Act
    customization = assignment_service.apply_customization_to_bundle(
        student_id, subject, bundle_id
    )
    
    # Assert
    assert customization is not None
    assert customization.track_id == "track_1"
    assert customization.applied_to_bundle  # Should be marked as applied
    mock_repository.save_customization.assert_called_once()


def test_apply_customization_already_applied(assignment_service, mock_repository):
    """Test that already applied customizations are not reapplied."""
    # Arrange
    student_id = "student_1"
    subject = "Mathematics"
    bundle_id = "bundle_123"
    
    mock_customization = StudyTrackCustomization(
        track_id="track_1",
        student_id=student_id,
        subject=subject,
        topics=["algebra_basics"],
        created_by="educator_1",
        applied_to_bundle=True,  # Already applied
    )
    mock_repository.get_customization.return_value = mock_customization
    
    # Act
    customization = assignment_service.apply_customization_to_bundle(
        student_id, subject, bundle_id
    )
    
    # Assert
    assert customization is None  # Should not return already applied customization
    mock_repository.save_customization.assert_not_called()


def test_complete_assignment(assignment_service, mock_repository):
    """Test marking an assignment as completed."""
    # Arrange
    assignment_id = "assign_1"
    mock_repository.update_assignment_status.return_value = True
    
    # Act
    result = assignment_service.complete_assignment(assignment_id)
    
    # Assert
    assert result is True
    mock_repository.update_assignment_status.assert_called_once_with(assignment_id, "completed")


def test_get_assignment(assignment_service, mock_repository):
    """Test getting a specific assignment by ID."""
    # Arrange
    assignment_id = "assign_1"
    mock_assignment = StudyTrackAssignment(
        assignment_id=assignment_id,
        educator_id="educator_1",
        student_id="student_1",
        subject="Mathematics",
        topics=["algebra_basics"],
        status="pending",
    )
    mock_repository.get_assignment.return_value = mock_assignment
    
    # Act
    assignment = assignment_service.get_assignment(assignment_id)
    
    # Assert
    assert assignment is not None
    assert assignment.assignment_id == assignment_id
    mock_repository.get_assignment.assert_called_once_with(assignment_id)


def test_get_active_customization(assignment_service, mock_repository):
    """Test getting active customization for a student."""
    # Arrange
    student_id = "student_1"
    subject = "Mathematics"
    mock_customization = StudyTrackCustomization(
        track_id="track_1",
        student_id=student_id,
        subject=subject,
        topics=["algebra_basics"],
        created_by="educator_1",
        applied_to_bundle=False,
    )
    mock_repository.get_customization.return_value = mock_customization
    
    # Act
    customization = assignment_service.get_active_customization(student_id, subject)
    
    # Assert
    assert customization is not None
    assert customization.student_id == student_id
    assert customization.subject == subject
    mock_repository.get_customization.assert_called_once_with(student_id, subject)
