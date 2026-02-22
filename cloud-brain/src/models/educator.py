"""Educator and administrator models."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class StudentProgress(BaseModel):
    """Student progress summary."""

    student_id: str = Field(..., description="Student identifier")
    student_name: str = Field(..., description="Student name")
    subject: str = Field(..., description="Subject area")
    lessons_completed: int = Field(default=0, ge=0, description="Number of lessons completed")
    quizzes_completed: int = Field(default=0, ge=0, description="Number of quizzes completed")
    average_accuracy: float = Field(default=0.0, ge=0, le=1, description="Average quiz accuracy")
    total_time_spent: int = Field(default=0, ge=0, description="Total time spent in minutes")
    current_streak: int = Field(default=0, ge=0, description="Current daily streak")
    topics_in_progress: List[str] = Field(default_factory=list, description="Topics currently being studied")
    topics_mastered: List[str] = Field(default_factory=list, description="Topics mastered")
    last_active: Optional[datetime] = Field(None, description="Last activity timestamp")


class ClassPerformanceReport(BaseModel):
    """Class-level performance report."""

    class_id: str = Field(..., description="Class identifier")
    class_name: str = Field(..., description="Class name")
    subject: str = Field(..., description="Subject area")
    total_students: int = Field(..., ge=0, description="Total number of students")
    active_students: int = Field(..., ge=0, description="Number of active students")
    average_completion_rate: float = Field(..., ge=0, le=1, description="Average lesson completion rate")
    average_accuracy: float = Field(..., ge=0, le=1, description="Average quiz accuracy")
    struggling_students: List[str] = Field(default_factory=list, description="Student IDs needing support")
    top_performers: List[str] = Field(default_factory=list, description="Top performing student IDs")
    generated_at: datetime = Field(default_factory=datetime.utcnow, description="Report generation timestamp")


class CurriculumCoverageReport(BaseModel):
    """Curriculum coverage report."""

    class_id: Optional[str] = Field(None, description="Class identifier (None for individual student)")
    student_id: Optional[str] = Field(None, description="Student identifier (None for class)")
    subject: str = Field(..., description="Subject area")
    total_topics: int = Field(..., ge=0, description="Total topics in curriculum")
    topics_covered: int = Field(..., ge=0, description="Number of topics covered")
    topics_mastered: int = Field(..., ge=0, description="Number of topics mastered")
    coverage_percentage: float = Field(..., ge=0, le=100, description="Coverage percentage")
    topic_details: List[dict] = Field(default_factory=list, description="Detailed topic coverage")
    generated_at: datetime = Field(default_factory=datetime.utcnow, description="Report generation timestamp")


class DashboardData(BaseModel):
    """Complete dashboard data for an educator."""

    educator_id: str = Field(..., description="Educator identifier")
    class_ids: List[str] = Field(..., description="Class identifiers")
    student_progress: List[StudentProgress] = Field(default_factory=list, description="Student progress data")
    class_reports: List[ClassPerformanceReport] = Field(default_factory=list, description="Class performance reports")
    coverage_reports: List[CurriculumCoverageReport] = Field(default_factory=list, description="Curriculum coverage reports")
    generated_at: datetime = Field(default_factory=datetime.utcnow, description="Dashboard generation timestamp")
