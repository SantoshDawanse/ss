"""Curriculum data models for Nepal K-12 standards."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class BloomLevel(str, Enum):
    """Bloom's taxonomy cognitive levels."""

    REMEMBER = "remember"
    UNDERSTAND = "understand"
    APPLY = "apply"
    ANALYZE = "analyze"
    EVALUATE = "evaluate"
    CREATE = "create"


class Subject(str, Enum):
    """Supported subjects for Nepal K-12 curriculum."""

    MATHEMATICS = "Mathematics"
    SCIENCE = "Science"
    NEPALI = "Nepali"
    ENGLISH = "English"
    SOCIAL_STUDIES = "Social Studies"


class CurriculumStandard(BaseModel):
    """Nepal K-12 curriculum standard model."""

    id: str = Field(..., description="Unique identifier for the standard")
    grade: int = Field(..., ge=6, le=8, description="Grade level (6-8 for MVP)")
    subject: Subject = Field(..., description="Subject area")
    topic: str = Field(..., description="Topic name")
    learning_objectives: list[str] = Field(
        ..., description="List of learning objectives"
    )
    prerequisites: list[str] = Field(
        default_factory=list, description="List of prerequisite topic IDs"
    )
    bloom_level: BloomLevel = Field(..., description="Bloom's taxonomy level")
    estimated_hours: float = Field(
        ..., gt=0, description="Estimated hours to complete"
    )
    keywords: list[str] = Field(
        default_factory=list, description="Keywords for content alignment"
    )
    description: Optional[str] = Field(
        None, description="Detailed description of the standard"
    )

    class Config:
        """Pydantic configuration."""

        use_enum_values = True


class TopicDetails(BaseModel):
    """Detailed information about a curriculum topic."""

    topic_id: str = Field(..., description="Topic identifier")
    topic_name: str = Field(..., description="Topic name")
    grade: int = Field(..., ge=6, le=8, description="Grade level")
    subject: Subject = Field(..., description="Subject area")
    prerequisites: list[str] = Field(
        default_factory=list, description="Prerequisite topic IDs"
    )
    learning_objectives: list[str] = Field(..., description="Learning objectives")
    assessment_criteria: list[str] = Field(
        ..., description="Criteria for assessing mastery"
    )
    bloom_level: BloomLevel = Field(..., description="Cognitive level")
    estimated_hours: float = Field(..., gt=0, description="Estimated hours")
    subtopics: list[str] = Field(
        default_factory=list, description="List of subtopics"
    )
    resources: list[str] = Field(
        default_factory=list, description="Recommended resources"
    )

    class Config:
        """Pydantic configuration."""

        use_enum_values = True


class ContentAlignment(BaseModel):
    """Content alignment validation result."""

    aligned: bool = Field(..., description="Whether content is aligned")
    alignment_score: float = Field(
        ..., ge=0, le=1, description="Alignment score (0-1)"
    )
    matched_standards: list[str] = Field(
        ..., description="List of matched standard IDs"
    )
    gaps: list[str] = Field(
        default_factory=list, description="Identified gaps in alignment"
    )
    recommendations: list[str] = Field(
        default_factory=list, description="Recommendations for improvement"
    )
    validated_at: datetime = Field(
        default_factory=datetime.utcnow, description="Validation timestamp"
    )


class LearningProgression(BaseModel):
    """Learning progression for a subject across grades."""

    subject: Subject = Field(..., description="Subject area")
    grade_range: tuple[int, int] = Field(..., description="Grade range (start, end)")
    topic_sequence: list[str] = Field(..., description="Ordered list of topic IDs")
    dependencies: dict[str, list[str]] = Field(
        ..., description="Topic dependencies map (topic_id -> prerequisite_ids)"
    )
    difficulty_progression: list[str] = Field(
        ..., description="Topics ordered by difficulty"
    )
    estimated_total_hours: float = Field(
        ..., gt=0, description="Total estimated hours for progression"
    )

    class Config:
        """Pydantic configuration."""

        use_enum_values = True
