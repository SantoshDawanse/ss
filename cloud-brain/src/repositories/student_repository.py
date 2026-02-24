"""Repository for student data."""

import os
from datetime import datetime
from typing import Optional, List

import boto3
from botocore.exceptions import ClientError

from src.models.student import Student


class StudentRepository:
    """Repository for managing students in DynamoDB."""

    def __init__(self):
        """Initialize repository."""
        self.dynamodb = boto3.resource("dynamodb")
        self.table_name = os.environ.get("STUDENTS_TABLE", "sikshya-sathi-students-dev")
        self.table = self.dynamodb.Table(self.table_name)

    def create_student(self, student_id: str, student_name: str) -> Student:
        """
        Create new student record (idempotent).
        
        If a student with the same studentId already exists, returns the existing record.

        Args:
            student_id: UUID v4 identifier
            student_name: Student name

        Returns:
            Created or existing student record
            
        Raises:
            ClientError: If DynamoDB operation fails
        """
        # Check if student already exists (idempotent operation)
        existing_student = self.get_student(student_id)
        if existing_student:
            return existing_student

        # Create new student
        student = Student(
            student_id=student_id,
            student_name=student_name,
            registration_timestamp=datetime.utcnow(),
            last_sync_time=None,
            total_lessons_completed=0,
            total_quizzes_completed=0,
        )

        item = {
            "studentId": student.student_id,
            "studentName": student.student_name,
            "registrationTimestamp": student.registration_timestamp.isoformat(),
            "totalLessonsCompleted": student.total_lessons_completed,
            "totalQuizzesCompleted": student.total_quizzes_completed,
        }

        try:
            self.table.put_item(Item=item)
            return student
        except ClientError as e:
            # Re-raise with more context
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            raise ClientError(
                {
                    "Error": {
                        "Code": error_code,
                        "Message": f"Failed to create student: {str(e)}"
                    }
                },
                "put_item"
            ) from e

    def get_student(self, student_id: str) -> Optional[Student]:
        """
        Retrieve student by ID.

        Args:
            student_id: Student identifier

        Returns:
            Student or None if not found
            
        Raises:
            ClientError: If DynamoDB operation fails (except NotFound)
        """
        try:
            response = self.table.get_item(Key={"studentId": student_id})
            item = response.get("Item")

            if not item:
                return None

            return self._item_to_student(item)

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            # Return None for not found, raise for other errors
            if error_code == "ResourceNotFoundException":
                return None
            raise

    def list_students(self, limit: int = 100) -> List[Student]:
        """
        List all students (for educator dashboard).

        Args:
            limit: Maximum number of students to return (default: 100)

        Returns:
            List of students
            
        Raises:
            ClientError: If DynamoDB operation fails
        """
        try:
            response = self.table.scan(Limit=limit)
            items = response.get("Items", [])

            students = [self._item_to_student(item) for item in items]
            return students

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            raise ClientError(
                {
                    "Error": {
                        "Code": error_code,
                        "Message": f"Failed to list students: {str(e)}"
                    }
                },
                "scan"
            ) from e

    def student_exists(self, student_id: str) -> bool:
        """
        Check if student exists.

        Args:
            student_id: Student identifier

        Returns:
            True if student exists, False otherwise
            
        Raises:
            ClientError: If DynamoDB operation fails
        """
        try:
            response = self.table.get_item(
                Key={"studentId": student_id},
                ProjectionExpression="studentId"  # Only fetch the key
            )
            return "Item" in response
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            if error_code == "ResourceNotFoundException":
                return False
            raise

    def _item_to_student(self, item: dict) -> Student:
        """
        Convert DynamoDB item to Student.

        Args:
            item: DynamoDB item

        Returns:
            Student object
        """
        return Student(
            student_id=item["studentId"],
            student_name=item["studentName"],
            registration_timestamp=datetime.fromisoformat(item["registrationTimestamp"]),
            last_sync_time=datetime.fromisoformat(item["lastSyncTime"])
            if "lastSyncTime" in item
            else None,
            total_lessons_completed=item.get("totalLessonsCompleted", 0),
            total_quizzes_completed=item.get("totalQuizzesCompleted", 0),
        )
