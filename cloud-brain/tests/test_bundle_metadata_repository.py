"""Unit tests for bundle metadata repository."""

from datetime import datetime, timedelta
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

from src.repositories.bundle_metadata_repository import BundleMetadataRepository


@pytest.fixture
def mock_dynamodb():
    """Create mock DynamoDB resource."""
    mock_resource = MagicMock()
    mock_table = MagicMock()
    mock_resource.Table.return_value = mock_table
    return mock_resource, mock_table


@pytest.fixture
def repository(mock_dynamodb):
    """Create repository instance with mock DynamoDB."""
    mock_resource, _ = mock_dynamodb
    return BundleMetadataRepository(
        table_name="test-table", region="us-east-1", dynamodb_resource=mock_resource
    )


def test_create_bundle_metadata_success(repository, mock_dynamodb):
    """Test successful bundle metadata creation."""
    _, mock_table = mock_dynamodb

    bundle_id = "bundle-123"
    student_id = "student-456"
    s3_key = "students/student-456/bundles/bundle-123.bundle"
    valid_from = datetime.utcnow()
    valid_until = valid_from + timedelta(weeks=2)

    metadata = repository.create_bundle_metadata(
        bundle_id=bundle_id,
        student_id=student_id,
        s3_key=s3_key,
        total_size=1024,
        checksum="abc123",
        valid_from=valid_from,
        valid_until=valid_until,
        subjects=["Mathematics", "Science"],
    )

    # Verify put_item was called
    mock_table.put_item.assert_called_once()
    call_args = mock_table.put_item.call_args[1]
    item = call_args["Item"]

    assert item["bundle_id"] == bundle_id
    assert item["student_id"] == student_id
    assert item["s3_key"] == s3_key
    assert item["total_size"] == 1024
    assert item["checksum"] == "abc123"
    assert item["status"] == "active"
    assert "Mathematics" in item["subjects"]


def test_create_bundle_metadata_with_additional(repository, mock_dynamodb):
    """Test bundle metadata creation with additional fields."""
    _, mock_table = mock_dynamodb

    additional = {"duration_weeks": 2, "content_version": "1.0"}

    metadata = repository.create_bundle_metadata(
        bundle_id="bundle-123",
        student_id="student-456",
        s3_key="test-key",
        total_size=1024,
        checksum="abc123",
        valid_from=datetime.utcnow(),
        valid_until=datetime.utcnow() + timedelta(weeks=2),
        subjects=["Mathematics"],
        additional_metadata=additional,
    )

    call_args = mock_table.put_item.call_args[1]
    item = call_args["Item"]

    assert item["duration_weeks"] == 2
    assert item["content_version"] == "1.0"


def test_create_bundle_metadata_failure(repository, mock_dynamodb):
    """Test bundle metadata creation failure."""
    _, mock_table = mock_dynamodb
    mock_table.put_item.side_effect = ClientError(
        {"Error": {"Code": "500", "Message": "Internal Error"}}, "PutItem"
    )

    with pytest.raises(Exception, match="DynamoDB put_item failed"):
        repository.create_bundle_metadata(
            bundle_id="bundle-123",
            student_id="student-456",
            s3_key="test-key",
            total_size=1024,
            checksum="abc123",
            valid_from=datetime.utcnow(),
            valid_until=datetime.utcnow() + timedelta(weeks=2),
            subjects=["Mathematics"],
        )


def test_get_bundle_metadata_success(repository, mock_dynamodb):
    """Test successful bundle metadata retrieval."""
    _, mock_table = mock_dynamodb

    expected_item = {
        "bundle_id": "bundle-123",
        "student_id": "student-456",
        "s3_key": "test-key",
        "total_size": 1024,
        "checksum": "abc123",
        "status": "active",
    }
    mock_table.get_item.return_value = {"Item": expected_item}

    metadata = repository.get_bundle_metadata("bundle-123")

    assert metadata == expected_item
    mock_table.get_item.assert_called_once_with(Key={"bundle_id": "bundle-123"})


def test_get_bundle_metadata_not_found(repository, mock_dynamodb):
    """Test bundle metadata retrieval when not found."""
    _, mock_table = mock_dynamodb
    mock_table.get_item.return_value = {}

    metadata = repository.get_bundle_metadata("nonexistent")

    assert metadata is None


def test_get_bundle_metadata_failure(repository, mock_dynamodb):
    """Test bundle metadata retrieval failure."""
    _, mock_table = mock_dynamodb
    mock_table.get_item.side_effect = ClientError(
        {"Error": {"Code": "500", "Message": "Internal Error"}}, "GetItem"
    )

    with pytest.raises(Exception, match="DynamoDB get_item failed"):
        repository.get_bundle_metadata("bundle-123")


def test_get_active_bundles_by_student_success(repository, mock_dynamodb):
    """Test querying active bundles for a student."""
    _, mock_table = mock_dynamodb

    mock_items = [
        {"bundle_id": "bundle-1", "student_id": "student-456", "status": "active"},
        {"bundle_id": "bundle-2", "student_id": "student-456", "status": "active"},
    ]
    mock_table.query.return_value = {"Items": mock_items}

    bundles = repository.get_active_bundles_by_student("student-456")

    assert len(bundles) == 2
    assert bundles[0]["bundle_id"] == "bundle-1"

    mock_table.query.assert_called_once()
    call_args = mock_table.query.call_args[1]
    assert call_args["IndexName"] == "StudentIdIndex"


def test_get_active_bundles_by_student_empty(repository, mock_dynamodb):
    """Test querying active bundles when none exist."""
    _, mock_table = mock_dynamodb
    mock_table.query.return_value = {"Items": []}

    bundles = repository.get_active_bundles_by_student("student-456")

    assert len(bundles) == 0


def test_get_active_bundles_by_student_failure(repository, mock_dynamodb):
    """Test active bundles query failure."""
    _, mock_table = mock_dynamodb
    mock_table.query.side_effect = ClientError(
        {"Error": {"Code": "500", "Message": "Internal Error"}}, "Query"
    )

    with pytest.raises(Exception, match="DynamoDB query failed"):
        repository.get_active_bundles_by_student("student-456")


def test_get_all_bundles_by_student_success(repository, mock_dynamodb):
    """Test querying all bundles for a student."""
    _, mock_table = mock_dynamodb

    mock_items = [
        {"bundle_id": "bundle-1", "status": "active"},
        {"bundle_id": "bundle-2", "status": "archived"},
    ]
    mock_table.query.return_value = {"Items": mock_items}

    bundles = repository.get_all_bundles_by_student("student-456")

    assert len(bundles) == 2


def test_update_bundle_status_success(repository, mock_dynamodb):
    """Test successful bundle status update."""
    _, mock_table = mock_dynamodb

    updated_item = {
        "bundle_id": "bundle-123",
        "status": "archived",
        "updated_at": datetime.utcnow().isoformat(),
    }
    mock_table.update_item.return_value = {"Attributes": updated_item}

    result = repository.update_bundle_status("bundle-123", "archived")

    assert result["status"] == "archived"
    mock_table.update_item.assert_called_once()


def test_update_bundle_status_failure(repository, mock_dynamodb):
    """Test bundle status update failure."""
    _, mock_table = mock_dynamodb
    mock_table.update_item.side_effect = ClientError(
        {"Error": {"Code": "500", "Message": "Internal Error"}}, "UpdateItem"
    )

    with pytest.raises(Exception, match="DynamoDB update_item failed"):
        repository.update_bundle_status("bundle-123", "archived")


def test_delete_bundle_metadata_success(repository, mock_dynamodb):
    """Test successful bundle metadata deletion."""
    _, mock_table = mock_dynamodb

    repository.delete_bundle_metadata("bundle-123")

    mock_table.delete_item.assert_called_once_with(Key={"bundle_id": "bundle-123"})


def test_delete_bundle_metadata_failure(repository, mock_dynamodb):
    """Test bundle metadata deletion failure."""
    _, mock_table = mock_dynamodb
    mock_table.delete_item.side_effect = ClientError(
        {"Error": {"Code": "500", "Message": "Internal Error"}}, "DeleteItem"
    )

    with pytest.raises(Exception, match="DynamoDB delete_item failed"):
        repository.delete_bundle_metadata("bundle-123")


def test_get_expired_bundles_success(repository, mock_dynamodb):
    """Test scanning for expired bundles."""
    _, mock_table = mock_dynamodb

    current_time = datetime.utcnow()
    mock_items = [
        {
            "bundle_id": "bundle-1",
            "valid_until": (current_time - timedelta(days=1)).isoformat(),
            "status": "active",
        },
        {
            "bundle_id": "bundle-2",
            "valid_until": (current_time - timedelta(days=2)).isoformat(),
            "status": "active",
        },
    ]
    mock_table.scan.return_value = {"Items": mock_items}

    expired = repository.get_expired_bundles(current_time)

    assert len(expired) == 2
    mock_table.scan.assert_called_once()


def test_get_expired_bundles_none(repository, mock_dynamodb):
    """Test scanning when no expired bundles exist."""
    _, mock_table = mock_dynamodb
    mock_table.scan.return_value = {"Items": []}

    expired = repository.get_expired_bundles()

    assert len(expired) == 0


def test_get_expired_bundles_failure(repository, mock_dynamodb):
    """Test expired bundles scan failure."""
    _, mock_table = mock_dynamodb
    mock_table.scan.side_effect = ClientError(
        {"Error": {"Code": "500", "Message": "Internal Error"}}, "Scan"
    )

    with pytest.raises(Exception, match="DynamoDB scan failed"):
        repository.get_expired_bundles()


def test_batch_update_bundle_status_success(repository, mock_dynamodb):
    """Test batch status update."""
    _, mock_table = mock_dynamodb

    mock_table.update_item.return_value = {
        "Attributes": {"status": "archived", "updated_at": datetime.utcnow().isoformat()}
    }

    bundle_ids = ["bundle-1", "bundle-2", "bundle-3"]
    count = repository.batch_update_bundle_status(bundle_ids, "archived")

    assert count == 3
    assert mock_table.update_item.call_count == 3


def test_get_bundle_statistics_success(repository, mock_dynamodb):
    """Test bundle statistics calculation."""
    _, mock_table = mock_dynamodb

    mock_items = [
        {
            "bundle_id": "bundle-1",
            "status": "active",
            "total_size": 1024,
            "subjects": ["Mathematics", "Science"],
        },
        {
            "bundle_id": "bundle-2",
            "status": "archived",
            "total_size": 2048,
            "subjects": ["English"],
        },
        {
            "bundle_id": "bundle-3",
            "status": "active",
            "total_size": 512,
            "subjects": ["Mathematics"],
        },
    ]
    mock_table.query.return_value = {"Items": mock_items}

    stats = repository.get_bundle_statistics("student-456")

    assert stats["total_bundles"] == 3
    assert stats["active_bundles"] == 2
    assert stats["total_size"] == 3584  # 1024 + 2048 + 512
    assert "Mathematics" in stats["subjects"]
    assert "Science" in stats["subjects"]
    assert "English" in stats["subjects"]
