"""Service for content review and approval by educators."""

import logging
import uuid
from datetime import datetime
from typing import List, Optional

from src.models.content_review import (
    ContentApproval,
    ContentReviewItem,
    ContentReviewQueue,
)
from src.repositories.content_review_repository import ContentReviewRepository

logger = logging.getLogger(__name__)


class ContentReviewService:
    """Service for managing content review and approval."""

    def __init__(self, repository: ContentReviewRepository):
        """Initialize the content review service.
        
        Args:
            repository: Content review repository for persistence
        """
        self.repository = repository

    def submit_for_review(
        self,
        content_id: str,
        content_type: str,
        subject: str,
        topic: str,
        grade: int,
        content_preview: dict,
    ) -> ContentReviewItem:
        """Submit generated content for educator review.
        
        Args:
            content_id: Content identifier
            content_type: Type of content (lesson, quiz, hint)
            subject: Subject area
            topic: Topic name
            grade: Grade level
            content_preview: Preview of content for review
            
        Returns:
            Created ContentReviewItem
        """
        logger.info(f"Submitting content {content_id} for review")
        
        review_item = ContentReviewItem(
            review_id=str(uuid.uuid4()),
            content_id=content_id,
            content_type=content_type,
            subject=subject,
            topic=topic,
            grade=grade,
            content_preview=content_preview,
            generated_at=datetime.utcnow(),
            status="pending",
        )
        
        self.repository.save_review_item(review_item)
        logger.info(f"Created review item {review_item.review_id}")
        
        return review_item

    def get_review_queue(
        self,
        educator_id: str,
        subject: Optional[str] = None,
        grade: Optional[int] = None,
        limit: int = 50,
    ) -> ContentReviewQueue:
        """Get queue of content items pending review.
        
        Args:
            educator_id: Educator identifier
            subject: Optional subject filter
            grade: Optional grade filter
            limit: Maximum number of items to return
            
        Returns:
            ContentReviewQueue with pending items
        """
        logger.info(f"Getting review queue for educator {educator_id}")
        
        pending_items = self.repository.get_pending_reviews(subject, grade, limit)
        
        return ContentReviewQueue(
            educator_id=educator_id,
            pending_items=pending_items,
            total_pending=len(pending_items),
        )

    def approve_content(
        self, review_id: str, educator_id: str, feedback: Optional[str] = None
    ) -> bool:
        """Approve content for use in learning bundles.
        
        Args:
            review_id: Review item identifier
            educator_id: Educator identifier
            feedback: Optional feedback
            
        Returns:
            True if successful, False otherwise
        """
        logger.info(f"Educator {educator_id} approving content review {review_id}")
        
        success = self.repository.update_review_status(
            review_id=review_id,
            status="approved",
            educator_id=educator_id,
            feedback=feedback,
        )
        
        if success:
            logger.info(f"Content review {review_id} approved")
        
        return success

    def reject_content(
        self, review_id: str, educator_id: str, rejection_reason: str, feedback: Optional[str] = None
    ) -> bool:
        """Reject content and request regeneration.
        
        Args:
            review_id: Review item identifier
            educator_id: Educator identifier
            rejection_reason: Reason for rejection
            feedback: Optional additional feedback
            
        Returns:
            True if successful, False otherwise
        """
        logger.info(f"Educator {educator_id} rejecting content review {review_id}")
        
        success = self.repository.update_review_status(
            review_id=review_id,
            status="rejected",
            educator_id=educator_id,
            feedback=feedback,
            rejection_reason=rejection_reason,
        )
        
        if success:
            logger.info(f"Content review {review_id} rejected: {rejection_reason}")
        
        return success

    def get_review_item(self, review_id: str) -> Optional[ContentReviewItem]:
        """Get a specific review item by ID.
        
        Args:
            review_id: Review item identifier
            
        Returns:
            ContentReviewItem if found, None otherwise
        """
        return self.repository.get_review_item(review_id)

    def process_approval(self, approval: ContentApproval) -> bool:
        """Process a content approval decision.
        
        Args:
            approval: Content approval decision
            
        Returns:
            True if successful, False otherwise
        """
        logger.info(f"Processing approval for review {approval.review_id}")
        
        if approval.approved:
            return self.approve_content(
                review_id=approval.review_id,
                educator_id=approval.educator_id,
                feedback=approval.feedback,
            )
        else:
            return self.reject_content(
                review_id=approval.review_id,
                educator_id=approval.educator_id,
                rejection_reason=approval.rejection_reason or "No reason provided",
                feedback=approval.feedback,
            )

    def get_approved_content_ids(self, subject: str, grade: int) -> List[str]:
        """Get list of approved content IDs for a subject and grade.
        
        This can be used during bundle generation to only include approved content.
        
        Args:
            subject: Subject area
            grade: Grade level
            
        Returns:
            List of approved content IDs
        """
        # In a real implementation, this would query for approved items
        # For now, return empty list as placeholder
        logger.info(f"Getting approved content for {subject} grade {grade}")
        return []
