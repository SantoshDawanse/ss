"""Student models for Cloud Brain API."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class Student(BaseModel):
    """Student record."""

    student_id: str = Field(..., description="UUID v4 identifier")
    student_name: str = Field(..., max_length=100, description="Student name")
    registration_timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="When student registered"
    )
    last_sync_time: Optional[datetime] = Field(
        None,
        description="Last successful sync timestamp"
    )
    total_lessons_completed: int = Field(
        default=0,
        description="Total lessons completed"
    )
    total_quizzes_completed: int = Field(
        default=0,
        description="Total quizzes completed"
    )


class StudentRegistrationRequest(BaseModel):
    """Request for student registration."""

    student_id: str = Field(..., description="UUID v4 identifier")
    student_name: str = Field(..., max_length=100, description="Student name")


class StudentRegistrationResponse(BaseModel):
    """Response for student registration."""

    student_id: str = Field(..., description="UUID v4 identifier")
    student_name: str = Field(..., description="Student name")
    registration_timestamp: datetime = Field(..., description="When student registered")
    status: str = Field(..., description="Registration status: 'registered' or 'already_registered'")
