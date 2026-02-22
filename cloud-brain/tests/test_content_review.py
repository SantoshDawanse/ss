"""Tests for content review service."""

import pytest
from datetime import datetime
from unittest.mock import Mock

from src.models.content_review import ContentApproval, ContentReviewItem, ContentReviewQueue
from src.repositories.content_review_repository import ContentReviewRepository
from src.services.content_review import ContentReviewService


@pytest.fixture
def mock_repository():
    """Create a mock content review repository."""
    return Mock(spec=ContentReviewRepository)


@pytest.fixture
def review_service(mock_repository):
    """Create a content review service with mock repository."""
    return ContentReviewService(mock_repository)


def test_submit_for_review(review_service, mock_repository):
    """Test submitting content for educator review."""
    # Arrange
    content_id = "lesson_123"
    content_type = "lesson"
    subject = "Mathematics"
    topic = "Algebra"
    grade = 8
    content_preview = {
        "title": "Introduction to Algebra",
        "summary": "Learn basic algebraic concepts",
    }
    
    mock_repository.save_review_item.return_value = True
    
    # Act
    review_item = review_service.submit_for_review(
        content_id=content_id,
        content_type=content_type,
        subject=subject,
        topic=topic,
        grade=grade,
        content_preview=content_preview,
    )
    
    # Assert
    assert review_item.content_id == content_id
    assert review_item.content_type == content_type
    assert review_item.subject == subject
    assert review_item.topic == topic
    assert review_item.grade == grade
    assert review_item.status == "pending"
    mock_repository.save_review_item.assert_called_once()


def test_get_review_queue(review_service, mock_repository):
    """Test getting review queue for an educator."""
    # Arrange
    educator_id = "educator_1"
    mock_items = [
        ContentReviewItem(
            review_id="review_1",
            content_id="lesson_1",
            content_type="lesson",
            subject="Mathematics",
            topic="Algebra",
            grade=8,
            content_preview={"title": "Lesson 1"},
            generated_at=datetime.utcnow(),
            status="pending",
        ),
        ContentReviewItem(
            review_id="review_2",
            content_id="quiz_1",
            content_type="quiz",
            subject="Science",
            topic="Cells",
            grade=7,
            content_preview={"title": "Quiz 1"},
            generated_at=datetime.utcnow(),
            status="pending",
        ),
    ]
    mock_repository.get_pending_reviews.return_value = mock_items
    
    # Act
    queue = review_service.get_review_queue(educator_id)
    
    # Assert
    assert isinstance(queue, ContentReviewQueue)
    assert queue.educator_id == educator_id
    assert len(queue.pending_items) == 2
    assert queue.total_pending == 2
    mock_repository.get_pending_reviews.assert_called_once()


def test_get_review_queue_with_filters(review_service, mock_repository):
    """Test getting review queue with subject and grade filters."""
    # Arrange
    educator_id = "educator_1"
    subject = "Mathematics"
    grade = 8
    mock_repository.get_pending_reviews.return_value = []
    
    # Act
    queue = review_service.get_review_queue(educator_id, subject=subject, grade=grade)
    
    # Assert
    mock_repository.get_pending_reviews.assert_called_once_with(subject, grade, 50)


def test_approve_content(review_service, mock_repository):
    """Test approving content."""
    # Arrange
    review_id = "review_1"
    educator_id = "educator_1"
    feedback = "Looks good!"
    mock_repository.update_review_status.return_value = True
    
    # Act
    success = review_service.approve_content(review_id, educator_id, feedback)
    
    # Assert
    assert success is True
    mock_repository.update_review_status.assert_called_once_with(
        review_id=review_id,
        status="approved",
        educator_id=educator_id,
        feedback=feedback,
    )


def test_reject_content(review_service, mock_repository):
    """Test rejecting content."""
    # Arrange
    review_id = "review_1"
    educator_id = "educator_1"
    rejection_reason = "Content not age-appropriate"
    feedback = "Please regenerate with simpler language"
    mock_repository.update_review_status.return_value = True
    
    # Act
    success = review_service.reject_content(review_id, educator_id, rejection_reason, feedback)
    
    # Assert
    assert success is True
    mock_repository.update_review_status.assert_called_once_with(
        review_id=review_id,
        status="rejected",
        educator_id=educator_id,
        feedback=feedback,
        rejection_reason=rejection_reason,
    )


def test_get_review_item(review_service, mock_repository):
    """Test getting a specific review item."""
    # Arrange
    review_id = "review_1"
    mock_item = ContentReviewItem(
        review_id=review_id,
        content_id="lesson_1",
        content_type="lesson",
        subject="Mathematics",
        topic="Algebra",
        grade=8,
        content_preview={"title": "Lesson 1"},
        generated_at=datetime.utcnow(),
        status="pending",
    )
    mock_repository.get_review_item.return_value = mock_item
    
    # Act
    item = review_service.get_review_item(review_id)
    
    # Assert
    assert item is not None
    assert item.review_id == review_id
    mock_repository.get_review_item.assert_called_once_with(review_id)


def test_process_approval_approved(review_service, mock_repository):
    """Test processing an approval decision (approved)."""
    # Arrange
    approval = ContentApproval(
        review_id="review_1",
        educator_id="educator_1",
        approved=True,
        feedback="Great content!",
    )
    mock_repository.update_review_status.return_value = True
    
    # Act
    success = review_service.process_approval(approval)
    
    # Assert
    assert success is True
    mock_repository.update_review_status.assert_called_once()
    call_args = mock_repository.update_review_status.call_args
    assert call_args.kwargs["status"] == "approved"


def test_process_approval_rejected(review_service, mock_repository):
    """Test processing an approval decision (rejected)."""
    # Arrange
    approval = ContentApproval(
        review_id="review_1",
        educator_id="educator_1",
        approved=False,
        rejection_reason="Incorrect information",
        feedback="Please verify facts",
    )
    mock_repository.update_review_status.return_value = True
    
    # Act
    success = review_service.process_approval(approval)
    
    # Assert
    assert success is True
    mock_repository.update_review_status.assert_called_once()
    call_args = mock_repository.update_review_status.call_args
    assert call_args.kwargs["status"] == "rejected"
    assert call_args.kwargs["rejection_reason"] == "Incorrect information"


def test_approve_content_failure(review_service, mock_repository):
    """Test handling approval failure."""
    # Arrange
    review_id = "review_1"
    educator_id = "educator_1"
    mock_repository.update_review_status.return_value = False
    
    # Act
    success = review_service.approve_content(review_id, educator_id)
    
    # Assert
    assert success is False


def test_reject_content_failure(review_service, mock_repository):
    """Test handling rejection failure."""
    # Arrange
    review_id = "review_1"
    educator_id = "educator_1"
    rejection_reason = "Test reason"
    mock_repository.update_review_status.return_value = False
    
    # Act
    success = review_service.reject_content(review_id, educator_id, rejection_reason)
    
    # Assert
    assert success is False
