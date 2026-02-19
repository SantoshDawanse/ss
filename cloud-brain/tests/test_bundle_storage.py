"""Unit tests for S3 bundle storage service."""

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError

from src.services.bundle_storage import BundleStorage


@pytest.fixture
def mock_s3_client():
    """Create mock S3 client."""
    return MagicMock()


@pytest.fixture
def storage(mock_s3_client):
    """Create bundle storage instance with mock client."""
    return BundleStorage(
        bucket_name="test-bucket", region="us-east-1", s3_client=mock_s3_client
    )


def test_upload_bundle_success(storage, mock_s3_client):
    """Test successful bundle upload to S3."""
    bundle_id = "bundle-123"
    student_id = "student-456"
    data = b"compressed bundle data"

    s3_key = storage.upload_bundle(bundle_id, student_id, data)

    # Verify S3 key format
    assert s3_key == f"students/{student_id}/bundles/{bundle_id}.bundle"

    # Verify put_object was called
    mock_s3_client.put_object.assert_called_once()
    call_args = mock_s3_client.put_object.call_args[1]
    assert call_args["Bucket"] == "test-bucket"
    assert call_args["Key"] == s3_key
    assert call_args["Body"] == data
    assert call_args["ServerSideEncryption"] == "AES256"


def test_upload_bundle_with_metadata(storage, mock_s3_client):
    """Test bundle upload with custom metadata."""
    bundle_id = "bundle-123"
    student_id = "student-456"
    data = b"compressed bundle data"
    metadata = {"checksum": "abc123", "size": "1024"}

    storage.upload_bundle(bundle_id, student_id, data, metadata)

    # Verify metadata was included
    call_args = mock_s3_client.put_object.call_args[1]
    assert "checksum" in call_args["Metadata"]
    assert "bundle-id" in call_args["Metadata"]
    assert call_args["Metadata"]["bundle-id"] == bundle_id


def test_upload_bundle_failure(storage, mock_s3_client):
    """Test bundle upload failure handling."""
    mock_s3_client.put_object.side_effect = ClientError(
        {"Error": {"Code": "500", "Message": "Internal Error"}}, "PutObject"
    )

    with pytest.raises(Exception, match="S3 upload failed"):
        storage.upload_bundle("bundle-123", "student-456", b"data")


def test_generate_presigned_url_success(storage, mock_s3_client):
    """Test presigned URL generation."""
    s3_key = "students/student-456/bundles/bundle-123.bundle"
    expected_url = "https://test-bucket.s3.amazonaws.com/presigned-url"

    mock_s3_client.generate_presigned_url.return_value = expected_url

    url = storage.generate_presigned_url(s3_key, expiration=3600)

    assert url == expected_url
    mock_s3_client.generate_presigned_url.assert_called_once_with(
        "get_object",
        Params={"Bucket": "test-bucket", "Key": s3_key},
        ExpiresIn=3600,
    )


def test_generate_presigned_url_custom_expiration(storage, mock_s3_client):
    """Test presigned URL with custom expiration."""
    s3_key = "students/student-456/bundles/bundle-123.bundle"
    mock_s3_client.generate_presigned_url.return_value = "https://example.com/url"

    storage.generate_presigned_url(s3_key, expiration=7200)

    call_args = mock_s3_client.generate_presigned_url.call_args[1]
    assert call_args["ExpiresIn"] == 7200


def test_generate_presigned_url_failure(storage, mock_s3_client):
    """Test presigned URL generation failure."""
    mock_s3_client.generate_presigned_url.side_effect = ClientError(
        {"Error": {"Code": "403", "Message": "Forbidden"}}, "GeneratePresignedUrl"
    )

    with pytest.raises(Exception, match="Presigned URL generation failed"):
        storage.generate_presigned_url("test-key")


def test_download_bundle_success(storage, mock_s3_client):
    """Test successful bundle download."""
    s3_key = "students/student-456/bundles/bundle-123.bundle"
    expected_data = b"compressed bundle data"

    mock_response = {"Body": MagicMock()}
    mock_response["Body"].read.return_value = expected_data
    mock_s3_client.get_object.return_value = mock_response

    data = storage.download_bundle(s3_key)

    assert data == expected_data
    mock_s3_client.get_object.assert_called_once_with(
        Bucket="test-bucket", Key=s3_key
    )


def test_download_bundle_failure(storage, mock_s3_client):
    """Test bundle download failure."""
    mock_s3_client.get_object.side_effect = ClientError(
        {"Error": {"Code": "404", "Message": "Not Found"}}, "GetObject"
    )

    with pytest.raises(Exception, match="S3 download failed"):
        storage.download_bundle("nonexistent-key")


def test_delete_bundle_success(storage, mock_s3_client):
    """Test successful bundle deletion."""
    s3_key = "students/student-456/bundles/bundle-123.bundle"

    storage.delete_bundle(s3_key)

    mock_s3_client.delete_object.assert_called_once_with(
        Bucket="test-bucket", Key=s3_key
    )


def test_delete_bundle_failure(storage, mock_s3_client):
    """Test bundle deletion failure."""
    mock_s3_client.delete_object.side_effect = ClientError(
        {"Error": {"Code": "500", "Message": "Internal Error"}}, "DeleteObject"
    )

    with pytest.raises(Exception, match="S3 deletion failed"):
        storage.delete_bundle("test-key")


def test_list_student_bundles_success(storage, mock_s3_client):
    """Test listing student bundles."""
    student_id = "student-456"
    mock_response = {
        "Contents": [
            {
                "Key": f"students/{student_id}/bundles/bundle-1.bundle",
                "Size": 1024,
                "LastModified": datetime(2024, 1, 1),
                "ETag": "etag1",
            },
            {
                "Key": f"students/{student_id}/bundles/bundle-2.bundle",
                "Size": 2048,
                "LastModified": datetime(2024, 1, 2),
                "ETag": "etag2",
            },
        ]
    }
    mock_s3_client.list_objects_v2.return_value = mock_response

    bundles = storage.list_student_bundles(student_id)

    assert len(bundles) == 2
    assert bundles[0]["key"] == f"students/{student_id}/bundles/bundle-1.bundle"
    assert bundles[0]["size"] == 1024
    assert bundles[1]["key"] == f"students/{student_id}/bundles/bundle-2.bundle"

    mock_s3_client.list_objects_v2.assert_called_once_with(
        Bucket="test-bucket", Prefix=f"students/{student_id}/bundles/"
    )


def test_list_student_bundles_empty(storage, mock_s3_client):
    """Test listing bundles when none exist."""
    mock_s3_client.list_objects_v2.return_value = {}

    bundles = storage.list_student_bundles("student-456")

    assert len(bundles) == 0


def test_list_student_bundles_failure(storage, mock_s3_client):
    """Test bundle listing failure."""
    mock_s3_client.list_objects_v2.side_effect = ClientError(
        {"Error": {"Code": "500", "Message": "Internal Error"}}, "ListObjectsV2"
    )

    with pytest.raises(Exception, match="S3 listing failed"):
        storage.list_student_bundles("student-456")


def test_setup_lifecycle_policy_success(storage, mock_s3_client):
    """Test lifecycle policy setup."""
    storage.setup_lifecycle_policy(days_to_expire=90)

    mock_s3_client.put_bucket_lifecycle_configuration.assert_called_once()
    call_args = mock_s3_client.put_bucket_lifecycle_configuration.call_args[1]
    assert call_args["Bucket"] == "test-bucket"
    assert "LifecycleConfiguration" in call_args

    lifecycle_config = call_args["LifecycleConfiguration"]
    assert len(lifecycle_config["Rules"]) == 1
    assert lifecycle_config["Rules"][0]["Expiration"]["Days"] == 90


def test_setup_lifecycle_policy_custom_days(storage, mock_s3_client):
    """Test lifecycle policy with custom expiration."""
    storage.setup_lifecycle_policy(days_to_expire=30)

    call_args = mock_s3_client.put_bucket_lifecycle_configuration.call_args[1]
    lifecycle_config = call_args["LifecycleConfiguration"]
    assert lifecycle_config["Rules"][0]["Expiration"]["Days"] == 30


def test_setup_lifecycle_policy_failure(storage, mock_s3_client):
    """Test lifecycle policy setup failure."""
    mock_s3_client.put_bucket_lifecycle_configuration.side_effect = ClientError(
        {"Error": {"Code": "403", "Message": "Forbidden"}},
        "PutBucketLifecycleConfiguration",
    )

    with pytest.raises(Exception, match="Lifecycle policy setup failed"):
        storage.setup_lifecycle_policy()


def test_get_bundle_metadata_success(storage, mock_s3_client):
    """Test getting bundle metadata."""
    s3_key = "students/student-456/bundles/bundle-123.bundle"
    mock_response = {
        "ContentLength": 1024,
        "LastModified": datetime(2024, 1, 1),
        "ETag": "etag123",
        "Metadata": {"bundle-id": "bundle-123", "checksum": "abc123"},
    }
    mock_s3_client.head_object.return_value = mock_response

    metadata = storage.get_bundle_metadata(s3_key)

    assert metadata["size"] == 1024
    assert metadata["etag"] == "etag123"
    assert metadata["metadata"]["bundle-id"] == "bundle-123"

    mock_s3_client.head_object.assert_called_once_with(
        Bucket="test-bucket", Key=s3_key
    )


def test_get_bundle_metadata_failure(storage, mock_s3_client):
    """Test metadata retrieval failure."""
    mock_s3_client.head_object.side_effect = ClientError(
        {"Error": {"Code": "404", "Message": "Not Found"}}, "HeadObject"
    )

    with pytest.raises(Exception, match="Metadata retrieval failed"):
        storage.get_bundle_metadata("nonexistent-key")
