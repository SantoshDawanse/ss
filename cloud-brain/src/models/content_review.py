"""Content review models for educator approval."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class ContentReviewItem(BaseModel):
    """Content item pending educator review."""

    review_id: str = Field(..., description="Review item identifier")
    content_id: str = Field(..., description="Content identifier")
    content_type: str = Field(..., description="Content type: lesson, quiz, hint")
    subject: str = Field(..., description="Subject area")
    topic: str = Field(..., description="Topic name")
    grade: int = Field(..., ge=1, le=12, description="Grade level")
    content_preview: dict = Field(..., description="Preview of content for review")
    generated_at: datetime = Field(..., description="Content generation timestamp")
    status: str = Field(default="pending", description="Status: pending, approved, rejected")
    reviewed_by: Optional[str] = Field(None, description="Educator ID who reviewed")
    reviewed_at: Optional[datetime] = Field(None, description="Review timestamp")
    feedback: Optional[str] = Field(None, description="Educator feedback")
    rejection_reason: Optional[str] = Field(None, description="Reason for rejection")


class ContentApproval(BaseModel):
    """Content approval decision."""

    review_id: str = Field(..., description="Review item identifier")
    educator_id: str = Field(..., description="Educator identifier")
    approved: bool = Field(..., description="Whether content is approved")
    feedback: Optional[str] = Field(None, description="Educator feedback")
    rejection_reason: Optional[str] = Field(None, description="Reason for rejection if not approved")
    reviewed_at: datetime = Field(default_factory=datetime.utcnow, description="Review timestamp")


class ContentReviewQueue(BaseModel):
    """Queue of content items pending review."""

    educator_id: str = Field(..., description="Educator identifier")
    pending_items: List[ContentReviewItem] = Field(default_factory=list, description="Pending review items")
    total_pending: int = Field(default=0, ge=0, description="Total pending items")
    generated_at: datetime = Field(default_factory=datetime.utcnow, description="Queue generation timestamp")
