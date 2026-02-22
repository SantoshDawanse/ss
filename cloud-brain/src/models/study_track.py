"""Study track models for educator assignments."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class StudyTrackAssignment(BaseModel):
    """Study track assignment from educator to student."""

    assignment_id: str = Field(..., description="Assignment identifier")
    educator_id: str = Field(..., description="Educator who created the assignment")
    student_id: str = Field(..., description="Student identifier")
    subject: str = Field(..., description="Subject area")
    topics: List[str] = Field(..., description="List of topic IDs to assign")
    custom_track: Optional[dict] = Field(None, description="Custom study track configuration")
    priority: str = Field(default="normal", description="Priority: low, normal, high")
    due_date: Optional[datetime] = Field(None, description="Optional due date")
    notes: Optional[str] = Field(None, description="Educator notes")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Creation timestamp")
    status: str = Field(default="pending", description="Status: pending, active, completed")


class StudyTrackCustomization(BaseModel):
    """Custom study track configuration."""

    track_id: str = Field(..., description="Track identifier")
    student_id: str = Field(..., description="Student identifier")
    subject: str = Field(..., description="Subject area")
    topics: List[str] = Field(..., description="Ordered list of topic IDs")
    difficulty_override: Optional[str] = Field(None, description="Override difficulty: easy, medium, hard")
    pacing_multiplier: float = Field(default=1.0, ge=0.5, le=2.0, description="Pacing adjustment")
    focus_areas: List[str] = Field(default_factory=list, description="Areas requiring extra focus")
    skip_topics: List[str] = Field(default_factory=list, description="Topics to skip")
    created_by: str = Field(..., description="Educator ID who created customization")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Creation timestamp")
    applied_to_bundle: bool = Field(default=False, description="Whether applied to next bundle")


class AssignmentPropagation(BaseModel):
    """Record of assignment propagation to learning bundle."""

    assignment_id: str = Field(..., description="Assignment identifier")
    student_id: str = Field(..., description="Student identifier")
    bundle_id: str = Field(..., description="Bundle identifier where assignment was applied")
    propagated_at: datetime = Field(default_factory=datetime.utcnow, description="Propagation timestamp")
    topics_included: List[str] = Field(..., description="Topics included in bundle")
