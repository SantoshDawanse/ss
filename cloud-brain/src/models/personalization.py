"""Personalization models for student knowledge tracking."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class MasteryLevel(str, Enum):
    """Student mastery levels."""

    NOVICE = "novice"
    DEVELOPING = "developing"
    PROFICIENT = "proficient"
    ADVANCED = "advanced"


class TopicKnowledge(BaseModel):
    """Knowledge state for a specific topic."""

    proficiency: float = Field(..., ge=0, le=1, description="Proficiency score (0-1)")
    attempts: int = Field(default=0, ge=0, description="Number of attempts")
    last_practiced: Optional[datetime] = Field(None, description="Last practice timestamp")
    mastery_level: MasteryLevel = Field(..., description="Current mastery level")
    cognitive_level: int = Field(..., ge=1, le=6, description="Bloom's taxonomy level (1-6)")


class SubjectKnowledge(BaseModel):
    """Knowledge state for a subject."""

    topics: dict[str, TopicKnowledge] = Field(
        default_factory=dict, description="Map of topic ID to knowledge"
    )
    overall_proficiency: float = Field(
        default=0.0, ge=0, le=1, description="Overall subject proficiency"
    )
    learning_velocity: float = Field(
        default=0.0, ge=0, description="Topics mastered per week"
    )


class KnowledgeModel(BaseModel):
    """Complete student knowledge model."""

    student_id: str = Field(..., description="Student identifier")
    last_updated: datetime = Field(
        default_factory=datetime.utcnow, description="Last update timestamp"
    )
    subjects: dict[str, SubjectKnowledge] = Field(
        default_factory=dict, description="Map of subject to knowledge"
    )


class PerformanceLog(BaseModel):
    """Student performance log entry."""

    student_id: str = Field(..., description="Student identifier")
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="Event timestamp"
    )
    event_type: str = Field(
        ...,
        description="Event type: lesson_start, lesson_complete, quiz_start, quiz_answer, quiz_complete, hint_requested",
    )
    content_id: str = Field(..., description="Content identifier")
    subject: str = Field(..., description="Subject area")
    topic: str = Field(..., description="Topic name")
    data: dict = Field(default_factory=dict, description="Event-specific data")


class ContentGenerationRequest(BaseModel):
    """Request for content generation."""

    student_id: str = Field(..., description="Student identifier")
    performance_logs: list[PerformanceLog] = Field(
        default_factory=list, description="Recent performance logs"
    )
    current_knowledge_model: KnowledgeModel = Field(
        ..., description="Current knowledge model"
    )
    bundle_duration: int = Field(..., gt=0, description="Bundle duration in weeks")
    subjects: list[str] = Field(..., description="Subjects to include")
