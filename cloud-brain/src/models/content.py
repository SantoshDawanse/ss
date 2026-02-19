"""Content models for lessons, quizzes, and learning materials."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class DifficultyLevel(str, Enum):
    """Content difficulty levels."""

    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class BloomLevel(str, Enum):
    """Bloom's taxonomy cognitive levels."""

    REMEMBER = "remember"
    UNDERSTAND = "understand"
    APPLY = "apply"
    ANALYZE = "analyze"
    EVALUATE = "evaluate"
    CREATE = "create"


class LessonSectionType(str, Enum):
    """Types of lesson sections."""

    EXPLANATION = "explanation"
    EXAMPLE = "example"
    PRACTICE = "practice"


class QuestionType(str, Enum):
    """Types of quiz questions."""

    MULTIPLE_CHOICE = "multiple_choice"
    TRUE_FALSE = "true_false"
    SHORT_ANSWER = "short_answer"


class LessonSection(BaseModel):
    """Section within a lesson."""

    type: LessonSectionType = Field(..., description="Section type")
    content: str = Field(..., description="Section content in Markdown")
    media: Optional[list[dict]] = Field(None, description="Media attachments")


class Lesson(BaseModel):
    """Educational lesson content."""

    lesson_id: str = Field(..., description="Unique lesson identifier")
    subject: str = Field(..., description="Subject area")
    topic: str = Field(..., description="Topic name")
    title: str = Field(..., description="Lesson title")
    difficulty: DifficultyLevel = Field(..., description="Difficulty level")
    estimated_minutes: int = Field(..., gt=0, description="Estimated completion time")
    curriculum_standards: list[str] = Field(..., description="Curriculum standard IDs")
    sections: list[LessonSection] = Field(..., description="Lesson sections")


class Question(BaseModel):
    """Quiz question."""

    question_id: str = Field(..., description="Unique question identifier")
    type: QuestionType = Field(..., description="Question type")
    question: str = Field(..., description="Question text")
    options: Optional[list[str]] = Field(None, description="Answer options for multiple choice")
    correct_answer: str = Field(..., description="Correct answer")
    explanation: str = Field(..., description="Explanation of correct answer")
    curriculum_standard: str = Field(..., description="Curriculum standard ID")
    bloom_level: BloomLevel = Field(..., description="Bloom's taxonomy level")


class Quiz(BaseModel):
    """Educational quiz."""

    quiz_id: str = Field(..., description="Unique quiz identifier")
    subject: str = Field(..., description="Subject area")
    topic: str = Field(..., description="Topic name")
    title: str = Field(..., description="Quiz title")
    difficulty: DifficultyLevel = Field(..., description="Difficulty level")
    time_limit: Optional[int] = Field(None, description="Time limit in minutes")
    questions: list[Question] = Field(..., description="Quiz questions")


class Hint(BaseModel):
    """Progressive hint for quiz question."""

    hint_id: str = Field(..., description="Unique hint identifier")
    level: int = Field(..., ge=1, le=3, description="Hint level (1=general, 3=specific)")
    text: str = Field(..., description="Hint text")


class RevisionPlan(BaseModel):
    """Personalized revision plan."""

    plan_id: str = Field(..., description="Unique plan identifier")
    subject: str = Field(..., description="Subject area")
    topics: list[str] = Field(..., description="Topics to revise")
    priority_order: list[str] = Field(..., description="Topic IDs in priority order")
    estimated_hours: int = Field(..., gt=0, description="Total estimated hours")
    content_references: dict[str, list[str]] = Field(
        ..., description="Map of topic to content IDs"
    )


class WeekPlan(BaseModel):
    """Weekly study plan."""

    week_number: int = Field(..., ge=1, description="Week number")
    topics: list[str] = Field(..., description="Topics for the week")
    lessons: list[str] = Field(..., description="Lesson IDs")
    quizzes: list[str] = Field(..., description="Quiz IDs")
    estimated_hours: int = Field(..., gt=0, description="Estimated hours for the week")


class StudyTrack(BaseModel):
    """Multi-week personalized study track."""

    track_id: str = Field(..., description="Unique track identifier")
    subject: str = Field(..., description="Subject area")
    weeks: list[WeekPlan] = Field(..., description="Weekly plans")


class SubjectContent(BaseModel):
    """Content for a single subject."""

    subject: str = Field(..., description="Subject area")
    lessons: list[Lesson] = Field(default_factory=list, description="Lessons")
    quizzes: list[Quiz] = Field(default_factory=list, description="Quizzes")
    hints: dict[str, list[Hint]] = Field(
        default_factory=dict, description="Map of question ID to hints"
    )
    revision_plan: Optional[RevisionPlan] = Field(None, description="Revision plan")
    study_track: Optional[StudyTrack] = Field(None, description="Study track")


class LearningBundle(BaseModel):
    """Complete learning bundle for synchronization."""

    bundle_id: str = Field(..., description="Unique bundle identifier")
    student_id: str = Field(..., description="Student identifier")
    valid_from: datetime = Field(..., description="Bundle validity start")
    valid_until: datetime = Field(..., description="Bundle validity end")
    subjects: list[SubjectContent] = Field(..., description="Subject content")
    total_size: int = Field(..., gt=0, description="Total size in bytes")
    checksum: str = Field(..., description="Bundle checksum")
    presigned_url: Optional[str] = Field(None, description="S3 presigned URL for download")
