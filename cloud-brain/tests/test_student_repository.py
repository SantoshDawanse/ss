"""Unit tests for student repository."""

from datetime import datetime
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

from src.repositories.student_repository import StudentRepository


@pytest.fixture
def mock_dynamodb():
    """Create mock DynamoDB resource."""
    mock_resource = MagicMock()
    mock_table = MagicMock()
    mock_resource.Table.return_value = mock_table
    return mock_resource, mock_table


@pytest.fixture
def repository(mock_dynamodb, monkeypatch):
    """Create repository instance with mock DynamoDB."""
    mock_resource, _ = mock_dynamodb
    
    # Mock boto3.resource to return our mock
    def mock_boto3_resource(service_name):
        return mock_resource
    
    monkeypatch.setattr("boto3.resource", mock_boto3_resource)
    monkeypatch.setenv("STUDENTS_TABLE", "test-students-table")
    
    return StudentRepository()


def test_create_student_success(repository, mock_dynamodb):
    """Test successful student creation."""
    _, mock_table = mock_dynamodb
    
    # Mock get_item to return no existing student
    mock_table.get_item.return_value = {}
    
    student_id = "550e8400-e29b-41d4-a716-446655440000"
    student_name = "Rajesh Kumar"
    
    student = repository.create_student(student_id, student_name)
    
    # Verify put_item was called
    mock_table.put_item.assert_called_once()
    call_args = mock_table.put_item.call_args[1]
    item = call_args["Item"]
    
    assert item["studentId"] == student_id
    assert item["studentName"] == student_name
    assert item["totalLessonsCompleted"] == 0
    assert item["totalQuizzesCompleted"] == 0
    assert "registrationTimestamp" in item
    
    # Verify returned student object
    assert student.student_id == student_id
    assert student.student_name == student_name
    assert student.total_lessons_completed == 0
    assert student.total_quizzes_completed == 0


def test_create_student_idempotent(repository, mock_dynamodb):
    """Test student creation is idempotent (returns existing student)."""
    _, mock_table = mock_dynamodb
    
    student_id = "550e8400-e29b-41d4-a716-446655440000"
    existing_timestamp = datetime.utcnow().isoformat()
    
    # Mock get_item to return existing student
    mock_table.get_item.return_value = {
        "Item": {
            "studentId": student_id,
            "studentName": "Existing Student",
            "registrationTimestamp": existing_timestamp,
            "totalLessonsCompleted": 5,
            "totalQuizzesCompleted": 3,
        }
    }
    
    student = repository.create_student(student_id, "New Name")
    
    # Verify put_item was NOT called (idempotent)
    mock_table.put_item.assert_not_called()
    
    # Verify returned existing student
    assert student.student_id == student_id
    assert student.student_name == "Existing Student"
    assert student.total_lessons_completed == 5
    assert student.total_quizzes_completed == 3


def test_get_student_success(repository, mock_dynamodb):
    """Test successful student retrieval."""
    _, mock_table = mock_dynamodb
    
    student_id = "550e8400-e29b-41d4-a716-446655440000"
    timestamp = datetime.utcnow().isoformat()
    
    expected_item = {
        "studentId": student_id,
        "studentName": "Rajesh Kumar",
        "registrationTimestamp": timestamp,
        "totalLessonsCompleted": 10,
        "totalQuizzesCompleted": 5,
    }
    mock_table.get_item.return_value = {"Item": expected_item}
    
    student = repository.get_student(student_id)
    
    assert student is not None
    assert student.student_id == student_id
    assert student.student_name == "Rajesh Kumar"
    assert student.total_lessons_completed == 10
    assert student.total_quizzes_completed == 5
    mock_table.get_item.assert_called_once_with(Key={"studentId": student_id})


def test_get_student_not_found(repository, mock_dynamodb):
    """Test student retrieval when not found."""
    _, mock_table = mock_dynamodb
    mock_table.get_item.return_value = {}
    
    student = repository.get_student("nonexistent-id")
    
    assert student is None


def test_get_student_with_last_sync_time(repository, mock_dynamodb):
    """Test student retrieval with optional last_sync_time."""
    _, mock_table = mock_dynamodb
    
    student_id = "550e8400-e29b-41d4-a716-446655440000"
    reg_timestamp = datetime.utcnow().isoformat()
    sync_timestamp = datetime.utcnow().isoformat()
    
    expected_item = {
        "studentId": student_id,
        "studentName": "Rajesh Kumar",
        "registrationTimestamp": reg_timestamp,
        "lastSyncTime": sync_timestamp,
        "totalLessonsCompleted": 10,
        "totalQuizzesCompleted": 5,
    }
    mock_table.get_item.return_value = {"Item": expected_item}
    
    student = repository.get_student(student_id)
    
    assert student is not None
    assert student.last_sync_time is not None


def test_list_students_success(repository, mock_dynamodb):
    """Test successful students list retrieval."""
    _, mock_table = mock_dynamodb
    
    timestamp = datetime.utcnow().isoformat()
    mock_items = [
        {
            "studentId": "student-1",
            "studentName": "Student One",
            "registrationTimestamp": timestamp,
            "totalLessonsCompleted": 5,
            "totalQuizzesCompleted": 3,
        },
        {
            "studentId": "student-2",
            "studentName": "Student Two",
            "registrationTimestamp": timestamp,
            "totalLessonsCompleted": 8,
            "totalQuizzesCompleted": 4,
        },
    ]
    mock_table.scan.return_value = {"Items": mock_items}
    
    students = repository.list_students(limit=100)
    
    assert len(students) == 2
    assert students[0].student_id == "student-1"
    assert students[1].student_id == "student-2"
    mock_table.scan.assert_called_once_with(Limit=100)


def test_list_students_empty(repository, mock_dynamodb):
    """Test students list when no students exist."""
    _, mock_table = mock_dynamodb
    mock_table.scan.return_value = {"Items": []}
    
    students = repository.list_students()
    
    assert len(students) == 0


def test_student_exists_true(repository, mock_dynamodb):
    """Test student_exists returns True when student exists."""
    _, mock_table = mock_dynamodb
    
    mock_table.get_item.return_value = {
        "Item": {"studentId": "student-1"}
    }
    
    exists = repository.student_exists("student-1")
    
    assert exists is True
    call_args = mock_table.get_item.call_args[1]
    assert call_args["ProjectionExpression"] == "studentId"


def test_student_exists_false(repository, mock_dynamodb):
    """Test student_exists returns False when student doesn't exist."""
    _, mock_table = mock_dynamodb
    mock_table.get_item.return_value = {}
    
    exists = repository.student_exists("nonexistent")
    
    assert exists is False


def test_create_student_dynamodb_error(repository, mock_dynamodb):
    """Test student creation with DynamoDB error."""
    _, mock_table = mock_dynamodb
    
    # Mock get_item to return no existing student
    mock_table.get_item.return_value = {}
    
    # Mock put_item to raise error
    mock_table.put_item.side_effect = ClientError(
        {"Error": {"Code": "ServiceUnavailable", "Message": "Service unavailable"}},
        "put_item"
    )
    
    with pytest.raises(ClientError) as exc_info:
        repository.create_student("student-1", "Test Student")
    
    assert "Failed to create student" in str(exc_info.value)


def test_list_students_dynamodb_error(repository, mock_dynamodb):
    """Test list students with DynamoDB error."""
    _, mock_table = mock_dynamodb
    
    mock_table.scan.side_effect = ClientError(
        {"Error": {"Code": "ServiceUnavailable", "Message": "Service unavailable"}},
        "scan"
    )
    
    with pytest.raises(ClientError) as exc_info:
        repository.list_students()
    
    assert "Failed to list students" in str(exc_info.value)


def test_student_exists_resource_not_found(repository, mock_dynamodb):
    """Test student_exists handles ResourceNotFoundException."""
    _, mock_table = mock_dynamodb
    
    mock_table.get_item.side_effect = ClientError(
        {"Error": {"Code": "ResourceNotFoundException", "Message": "Table not found"}},
        "get_item"
    )
    
    exists = repository.student_exists("student-1")
    
    assert exists is False
