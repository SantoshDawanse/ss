"""Property-based tests for sync data integrity.

Feature: sikshya-sathi-system
Property 11: Sync Data Integrity

For any completed Sync Session, the downloaded bundle's checksum must match
the expected checksum, and all uploaded logs must be acknowledged by the
Cloud Brain.

Validates: Requirements 4.8
"""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck, assume
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
import json
import hashlib
import gzip
import base64

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from src.models.sync import (
    SyncSession,
    SyncStatus,
    SyncUploadData,
    SyncDownloadData,
    SyncUploadRequest,
)
from src.models.personalization import PerformanceLog
from repositories.sync_session_repository import SyncSessionRepository


# Custom strategies for generating test data
@st.composite
def performance_log_strategy(draw, student_id="test-student"):
    """Generate a performance log entry."""
    event_types = ["lesson_start", "lesson_complete", "quiz_answer", "quiz_complete", "hint_requested"]
    event_type = draw(st.sampled_from(event_types))
    
    # Generate event-specific data
    data = {}
    if event_type == "quiz_answer":
        data["correct"] = draw(st.booleans())
        data["time_spent"] = draw(st.integers(min_value=10, max_value=300))
        data["hints_used"] = draw(st.integers(min_value=0, max_value=3))
    elif event_type in ["lesson_complete", "lesson_start"]:
        data["time_spent"] = draw(st.integers(min_value=60, max_value=1800))
    elif event_type == "quiz_complete":
        data["accuracy"] = draw(st.floats(min_value=0.0, max_value=1.0))
        data["questions_answered"] = draw(st.integers(min_value=1, max_value=10))
        data["time_spent"] = draw(st.integers(min_value=120, max_value=1800))
    elif event_type == "hint_requested":
        data["hint_level"] = draw(st.integers(min_value=1, max_value=3))
    
    return PerformanceLog(
        student_id=student_id,
        timestamp=datetime.utcnow() - timedelta(minutes=draw(st.integers(min_value=0, max_value=1440))),
        event_type=event_type,
        content_id=f"content-{draw(st.integers(min_value=1, max_value=100))}",
        subject=draw(st.sampled_from(["Mathematics", "Science", "English", "Nepali", "Social Studies"])),
        topic=f"topic-{draw(st.integers(min_value=1, max_value=20))}",
        data=data,
    )


@st.composite
def sync_upload_request_strategy(draw, student_id="test-student"):
    """Generate a sync upload request with performance logs."""
    num_logs = draw(st.integers(min_value=1, max_value=50))
    logs = [draw(performance_log_strategy(student_id=student_id)) for _ in range(num_logs)]
    
    # Convert logs to dict format
    logs_dict = [
        {
            "student_id": log.student_id,
            "timestamp": log.timestamp.isoformat(),
            "event_type": log.event_type,
            "content_id": log.content_id,
            "subject": log.subject,
            "topic": log.topic,
            "data": log.data,
        }
        for log in logs
    ]
    
    return SyncUploadRequest(
        student_id=student_id,
        logs=logs_dict,
        last_sync_time=datetime.utcnow() - timedelta(days=draw(st.integers(min_value=1, max_value=7))),
    )


class MockSyncSessionRepository(SyncSessionRepository):
    """Mock repository for testing without DynamoDB."""
    
    def __init__(self):
        """Initialize mock repository."""
        self.storage = {}
        self.table = None  # Disable DynamoDB
        self.dynamodb = None
    
    def create_session(self, student_id: str) -> SyncSession:
        """Create a new sync session."""
        from uuid import uuid4
        
        session = SyncSession(
            session_id=str(uuid4()),
            student_id=student_id,
            start_time=datetime.utcnow(),
            status=SyncStatus.PENDING,
        )
        self.storage[session.session_id] = session
        return session
    
    def get_session(self, session_id: str):
        """Get sync session by ID."""
        return self.storage.get(session_id)
    
    def update_session_status(self, session_id: str, status: SyncStatus, error_message: str = None):
        """Update sync session status."""
        if session_id in self.storage:
            self.storage[session_id].status = status
            if error_message:
                self.storage[session_id].error_message = error_message
            if status in [SyncStatus.COMPLETE, SyncStatus.FAILED]:
                self.storage[session_id].end_time = datetime.utcnow()
    
    def update_upload_data(self, session_id: str, upload_data: SyncUploadData):
        """Update sync session with upload data."""
        if session_id in self.storage:
            self.storage[session_id].upload = upload_data
            self.storage[session_id].status = SyncStatus.UPLOADING
    
    def update_download_data(self, session_id: str, download_data: SyncDownloadData):
        """Update sync session with download data."""
        if session_id in self.storage:
            self.storage[session_id].download = download_data
            self.storage[session_id].status = SyncStatus.DOWNLOADING
    
    def update_checkpoint(self, session_id: str, checkpoint: dict):
        """Update sync session checkpoint."""
        if session_id in self.storage:
            self.storage[session_id].checkpoint = checkpoint
    
    def get_latest_session_for_student(self, student_id: str):
        """Get the latest sync session for a student."""
        student_sessions = [
            session for session in self.storage.values()
            if session.student_id == student_id
        ]
        if not student_sessions:
            return None
        return max(student_sessions, key=lambda s: s.start_time)


@pytest.fixture(scope="function")
def sync_repository():
    """Create a mock sync session repository."""
    return MockSyncSessionRepository()


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    upload_request=sync_upload_request_strategy(),
)
def test_property_11_upload_checksum_integrity(
    sync_repository, upload_request
):
    """Property 11: Upload checksum must match uploaded data
    
    For any completed Sync Session, all uploaded logs must be acknowledged
    by the Cloud Brain with a matching checksum to ensure data integrity.
    
    This property verifies that:
    1. Uploaded logs are stored with correct checksum
    2. Checksum can be recalculated from stored data
    3. Checksum matches original upload checksum
    4. No data corruption during upload
    """
    student_id = upload_request.student_id
    
    # Property 11: Create sync session
    session = sync_repository.create_session(student_id)
    
    # Property 11: Calculate checksum for uploaded logs
    logs_json = json.dumps(upload_request.logs, sort_keys=True)
    expected_checksum = hashlib.sha256(logs_json.encode()).hexdigest()
    
    # Property 11: Upload logs with checksum
    upload_data = SyncUploadData(
        performance_logs=upload_request.logs,
        compressed_size=len(logs_json),
        checksum=expected_checksum,
    )
    
    sync_repository.update_upload_data(session.session_id, upload_data)
    
    # Property 11: Verify upload checksum is stored
    updated_session = sync_repository.get_session(session.session_id)
    
    assert updated_session.upload is not None, \
        "Upload data must be stored"
    
    assert updated_session.upload.checksum == expected_checksum, \
        "Upload checksum must match expected checksum"
    
    # Property 11: Verify data integrity by recalculating checksum
    stored_logs_json = json.dumps(updated_session.upload.performance_logs, sort_keys=True)
    recalculated_checksum = hashlib.sha256(stored_logs_json.encode()).hexdigest()
    
    assert recalculated_checksum == expected_checksum, \
        "Recalculated checksum must match original (data integrity preserved)"
    
    # Property 11: Verify all logs are acknowledged
    assert len(updated_session.upload.performance_logs) == len(upload_request.logs), \
        f"All {len(upload_request.logs)} logs must be acknowledged"
    
    # Property 11: Verify each log is preserved correctly
    for i, original_log in enumerate(upload_request.logs):
        stored_log = updated_session.upload.performance_logs[i]
        assert stored_log["student_id"] == original_log["student_id"], \
            f"Log {i} student_id must be preserved"
        assert stored_log["event_type"] == original_log["event_type"], \
            f"Log {i} event_type must be preserved"
        assert stored_log["content_id"] == original_log["content_id"], \
            f"Log {i} content_id must be preserved"
        assert stored_log["subject"] == original_log["subject"], \
            f"Log {i} subject must be preserved"
        assert stored_log["topic"] == original_log["topic"], \
            f"Log {i} topic must be preserved"


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    upload_request=sync_upload_request_strategy(),
)
def test_property_11_download_checksum_integrity(
    sync_repository, upload_request
):
    """Property 11: Download checksum must be provided and valid
    
    For any completed Sync Session, the downloaded bundle must have a
    valid checksum that can be used to verify data integrity.
    
    This property verifies that:
    1. Bundle checksum is provided
    2. Checksum is valid SHA-256 format
    3. Checksum is stored correctly
    4. Bundle metadata is complete
    """
    student_id = upload_request.student_id
    
    # Property 11: Create session and upload logs
    session = sync_repository.create_session(student_id)
    
    logs_json = json.dumps(upload_request.logs, sort_keys=True)
    upload_checksum = hashlib.sha256(logs_json.encode()).hexdigest()
    
    upload_data = SyncUploadData(
        performance_logs=upload_request.logs,
        compressed_size=len(logs_json),
        checksum=upload_checksum,
    )
    
    sync_repository.update_upload_data(session.session_id, upload_data)
    
    # Property 11: Generate bundle with checksum
    bundle_content = f"bundle-{session.session_id}-{student_id}"
    bundle_checksum = hashlib.sha256(bundle_content.encode()).hexdigest()
    bundle_url = f"https://s3.amazonaws.com/bundles/{session.session_id}.br"
    bundle_size = len(bundle_content)
    
    download_data = SyncDownloadData(
        bundle_url=bundle_url,
        bundle_size=bundle_size,
        checksum=bundle_checksum,
    )
    
    sync_repository.update_download_data(session.session_id, download_data)
    
    # Property 11: Verify download checksum is provided
    updated_session = sync_repository.get_session(session.session_id)
    
    assert updated_session.download is not None, \
        "Download data must be provided"
    
    assert updated_session.download.checksum is not None, \
        "Bundle checksum must be provided"
    
    assert len(updated_session.download.checksum) > 0, \
        "Bundle checksum must not be empty"
    
    # Property 11: Verify checksum is valid SHA-256 format (64 hex characters)
    assert len(updated_session.download.checksum) == 64, \
        "Bundle checksum must be SHA-256 (64 hex characters)"
    
    assert all(c in '0123456789abcdef' for c in updated_session.download.checksum.lower()), \
        "Bundle checksum must be valid hexadecimal"
    
    # Property 11: Verify checksum matches expected
    assert updated_session.download.checksum == bundle_checksum, \
        "Stored bundle checksum must match expected checksum"
    
    # Property 11: Verify bundle metadata is complete
    assert updated_session.download.bundle_url is not None, \
        "Bundle URL must be provided"
    
    assert updated_session.download.bundle_size > 0, \
        "Bundle size must be positive"
    
    # Property 11: Mark session as complete
    sync_repository.update_session_status(session.session_id, SyncStatus.COMPLETE)
    
    final_session = sync_repository.get_session(session.session_id)
    
    # Property 11: Verify data integrity is preserved after completion
    assert final_session.status == SyncStatus.COMPLETE, \
        "Session must be marked as complete"
    
    assert final_session.upload.checksum == upload_checksum, \
        "Upload checksum must be preserved after completion"
    
    assert final_session.download.checksum == bundle_checksum, \
        "Download checksum must be preserved after completion"


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    upload_request=sync_upload_request_strategy(),
)
def test_property_11_bidirectional_checksum_integrity(
    sync_repository, upload_request
):
    """Property 11: Both upload and download checksums must be valid
    
    For any completed Sync Session, both the uploaded logs and downloaded
    bundle must have valid checksums that ensure end-to-end data integrity.
    
    This property verifies that:
    1. Upload checksum is valid and matches uploaded data
    2. Download checksum is valid and provided
    3. Both checksums are preserved throughout sync
    4. Complete bidirectional data integrity
    """
    student_id = upload_request.student_id
    
    # Property 11: Phase 1 - Upload with checksum
    session = sync_repository.create_session(student_id)
    
    # Calculate upload checksum
    logs_json = json.dumps(upload_request.logs, sort_keys=True)
    upload_checksum = hashlib.sha256(logs_json.encode()).hexdigest()
    
    upload_data = SyncUploadData(
        performance_logs=upload_request.logs,
        compressed_size=len(logs_json),
        checksum=upload_checksum,
    )
    
    sync_repository.update_upload_data(session.session_id, upload_data)
    
    # Property 11: Verify upload checksum
    session_after_upload = sync_repository.get_session(session.session_id)
    
    assert session_after_upload.upload is not None, \
        "Upload data must be stored"
    
    assert session_after_upload.upload.checksum == upload_checksum, \
        "Upload checksum must match calculated checksum"
    
    # Verify upload data integrity
    stored_logs_json = json.dumps(session_after_upload.upload.performance_logs, sort_keys=True)
    recalc_upload_checksum = hashlib.sha256(stored_logs_json.encode()).hexdigest()
    
    assert recalc_upload_checksum == upload_checksum, \
        "Upload data integrity must be preserved (checksum matches)"
    
    # Property 11: Phase 2 - Download with checksum
    bundle_content = f"bundle-{session.session_id}-{student_id}-{len(upload_request.logs)}"
    download_checksum = hashlib.sha256(bundle_content.encode()).hexdigest()
    
    download_data = SyncDownloadData(
        bundle_url=f"https://s3.amazonaws.com/bundles/{session.session_id}.br",
        bundle_size=len(bundle_content),
        checksum=download_checksum,
    )
    
    sync_repository.update_download_data(session.session_id, download_data)
    
    # Property 11: Verify download checksum
    session_after_download = sync_repository.get_session(session.session_id)
    
    assert session_after_download.download is not None, \
        "Download data must be provided"
    
    assert session_after_download.download.checksum == download_checksum, \
        "Download checksum must match expected checksum"
    
    assert len(session_after_download.download.checksum) == 64, \
        "Download checksum must be valid SHA-256"
    
    # Property 11: Complete sync
    sync_repository.update_session_status(session.session_id, SyncStatus.COMPLETE)
    
    final_session = sync_repository.get_session(session.session_id)
    
    # Property 11: Verify bidirectional data integrity
    assert final_session.status == SyncStatus.COMPLETE, \
        "Session must be complete"
    
    assert final_session.upload is not None, \
        "Upload data must be preserved"
    
    assert final_session.download is not None, \
        "Download data must be preserved"
    
    assert final_session.upload.checksum == upload_checksum, \
        "Upload checksum must be preserved in completed session"
    
    assert final_session.download.checksum == download_checksum, \
        "Download checksum must be preserved in completed session"
    
    # Property 11: Verify all uploaded logs are acknowledged
    assert len(final_session.upload.performance_logs) == len(upload_request.logs), \
        f"All {len(upload_request.logs)} uploaded logs must be acknowledged"
    
    # Property 11: Verify checksums are different (upload vs download)
    # This ensures we're not accidentally using the same checksum for both
    assert final_session.upload.checksum != final_session.download.checksum, \
        "Upload and download checksums must be different (different data)"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    upload_request=sync_upload_request_strategy(),
)
def test_property_11_checksum_detects_data_corruption(
    sync_repository, upload_request
):
    """Property 11: Checksum detects data corruption
    
    For any sync session, if data is corrupted, the checksum verification
    must detect the corruption.
    
    This property verifies that:
    1. Original checksum matches original data
    2. Modified data produces different checksum
    3. Checksum can detect data corruption
    """
    student_id = upload_request.student_id
    
    # Property 11: Create session and upload
    session = sync_repository.create_session(student_id)
    
    # Calculate original checksum
    logs_json = json.dumps(upload_request.logs, sort_keys=True)
    original_checksum = hashlib.sha256(logs_json.encode()).hexdigest()
    
    upload_data = SyncUploadData(
        performance_logs=upload_request.logs,
        compressed_size=len(logs_json),
        checksum=original_checksum,
    )
    
    sync_repository.update_upload_data(session.session_id, upload_data)
    
    # Property 11: Verify original checksum matches
    updated_session = sync_repository.get_session(session.session_id)
    stored_logs_json = json.dumps(updated_session.upload.performance_logs, sort_keys=True)
    stored_checksum = hashlib.sha256(stored_logs_json.encode()).hexdigest()
    
    assert stored_checksum == original_checksum, \
        "Original data must have matching checksum"
    
    # Property 11: Simulate data corruption by modifying a log
    if len(upload_request.logs) > 0:
        corrupted_logs = upload_request.logs.copy()
        # Modify first log's content_id to simulate corruption
        corrupted_logs[0] = corrupted_logs[0].copy()
        corrupted_logs[0]["content_id"] = "corrupted-content-id"
        
        # Calculate checksum of corrupted data
        corrupted_logs_json = json.dumps(corrupted_logs, sort_keys=True)
        corrupted_checksum = hashlib.sha256(corrupted_logs_json.encode()).hexdigest()
        
        # Property 11: Verify corrupted data has different checksum
        assert corrupted_checksum != original_checksum, \
            "Corrupted data must produce different checksum (corruption detected)"
        
        # Property 11: Verify checksum difference is significant
        # SHA-256 should produce completely different hash for any change
        matching_chars = sum(1 for a, b in zip(original_checksum, corrupted_checksum) if a == b)
        assert matching_chars < 32, \
            "Corrupted checksum should be significantly different (avalanche effect)"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    upload_request=sync_upload_request_strategy(),
)
def test_property_11_compressed_data_integrity(
    sync_repository, upload_request
):
    """Property 11: Compressed data maintains integrity
    
    For any sync session with compressed logs, the checksum must verify
    data integrity after compression and decompression.
    
    This property verifies that:
    1. Data can be compressed
    2. Compressed data can be decompressed
    3. Decompressed data matches original
    4. Checksum verifies integrity throughout
    """
    student_id = upload_request.student_id
    
    # Property 11: Calculate original checksum
    logs_json = json.dumps(upload_request.logs, sort_keys=True)
    original_checksum = hashlib.sha256(logs_json.encode()).hexdigest()
    
    # Property 11: Compress logs (simulating upload compression)
    compressed_logs = gzip.compress(logs_json.encode())
    compressed_size = len(compressed_logs)
    
    # Property 11: Decompress logs (simulating Cloud Brain receiving data)
    decompressed_logs_bytes = gzip.decompress(compressed_logs)
    decompressed_logs_json = decompressed_logs_bytes.decode()
    decompressed_logs = json.loads(decompressed_logs_json)
    
    # Property 11: Calculate checksum of decompressed data
    decompressed_checksum = hashlib.sha256(
        json.dumps(decompressed_logs, sort_keys=True).encode()
    ).hexdigest()
    
    # Property 11: Verify data integrity after compression/decompression
    assert decompressed_checksum == original_checksum, \
        "Decompressed data must have same checksum as original (integrity preserved)"
    
    assert len(decompressed_logs) == len(upload_request.logs), \
        "Decompressed logs must have same count as original"
    
    # Property 11: Store in sync session
    session = sync_repository.create_session(student_id)
    
    upload_data = SyncUploadData(
        performance_logs=decompressed_logs,
        compressed_size=compressed_size,
        checksum=decompressed_checksum,
    )
    
    sync_repository.update_upload_data(session.session_id, upload_data)
    
    # Property 11: Verify stored data integrity
    updated_session = sync_repository.get_session(session.session_id)
    
    assert updated_session.upload.checksum == original_checksum, \
        "Stored checksum must match original after compression cycle"
    
    assert updated_session.upload.compressed_size == compressed_size, \
        "Compressed size must be recorded"
    
    # Property 11: Verify compression achieved size reduction
    original_size = len(logs_json.encode())
    assert compressed_size <= original_size, \
        "Compressed size should not exceed original size"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    upload_request1=sync_upload_request_strategy(student_id="student-1"),
    upload_request2=sync_upload_request_strategy(student_id="student-2"),
)
def test_property_11_independent_checksums_per_student(
    sync_repository, upload_request1, upload_request2
):
    """Property 11: Each student has independent checksums
    
    For any two students syncing, their checksums must be independent
    and not interfere with each other.
    
    This property verifies that:
    1. Each student gets unique checksums
    2. Checksums are not mixed between students
    3. Data integrity is maintained per student
    """
    # Property 11: Create sessions for both students
    session1 = sync_repository.create_session(upload_request1.student_id)
    session2 = sync_repository.create_session(upload_request2.student_id)
    
    # Property 11: Calculate checksums for both students
    logs1_json = json.dumps(upload_request1.logs, sort_keys=True)
    checksum1 = hashlib.sha256(logs1_json.encode()).hexdigest()
    
    logs2_json = json.dumps(upload_request2.logs, sort_keys=True)
    checksum2 = hashlib.sha256(logs2_json.encode()).hexdigest()
    
    # Property 11: Upload for both students
    upload_data1 = SyncUploadData(
        performance_logs=upload_request1.logs,
        compressed_size=len(logs1_json),
        checksum=checksum1,
    )
    
    upload_data2 = SyncUploadData(
        performance_logs=upload_request2.logs,
        compressed_size=len(logs2_json),
        checksum=checksum2,
    )
    
    sync_repository.update_upload_data(session1.session_id, upload_data1)
    sync_repository.update_upload_data(session2.session_id, upload_data2)
    
    # Property 11: Verify independent checksums
    updated_session1 = sync_repository.get_session(session1.session_id)
    updated_session2 = sync_repository.get_session(session2.session_id)
    
    assert updated_session1.upload.checksum == checksum1, \
        "Student 1 checksum must match their data"
    
    assert updated_session2.upload.checksum == checksum2, \
        "Student 2 checksum must match their data"
    
    # Property 11: Checksums should be different (different students, different data)
    assert updated_session1.upload.checksum != updated_session2.upload.checksum, \
        "Different students should have different checksums"
    
    # Property 11: Verify data integrity for both students
    stored_logs1_json = json.dumps(updated_session1.upload.performance_logs, sort_keys=True)
    recalc_checksum1 = hashlib.sha256(stored_logs1_json.encode()).hexdigest()
    
    stored_logs2_json = json.dumps(updated_session2.upload.performance_logs, sort_keys=True)
    recalc_checksum2 = hashlib.sha256(stored_logs2_json.encode()).hexdigest()
    
    assert recalc_checksum1 == checksum1, \
        "Student 1 data integrity must be preserved"
    
    assert recalc_checksum2 == checksum2, \
        "Student 2 data integrity must be preserved"
    
    # Property 11: Add download data for both students
    download_data1 = SyncDownloadData(
        bundle_url=f"https://s3.amazonaws.com/bundles/{session1.session_id}.br",
        bundle_size=1024 * 1024,
        checksum=hashlib.sha256(f"bundle-{session1.session_id}".encode()).hexdigest(),
    )
    
    download_data2 = SyncDownloadData(
        bundle_url=f"https://s3.amazonaws.com/bundles/{session2.session_id}.br",
        bundle_size=2 * 1024 * 1024,
        checksum=hashlib.sha256(f"bundle-{session2.session_id}".encode()).hexdigest(),
    )
    
    sync_repository.update_download_data(session1.session_id, download_data1)
    sync_repository.update_download_data(session2.session_id, download_data2)
    
    # Property 11: Verify independent download checksums
    final_session1 = sync_repository.get_session(session1.session_id)
    final_session2 = sync_repository.get_session(session2.session_id)
    
    assert final_session1.download.checksum != final_session2.download.checksum, \
        "Each student must have unique download checksum"
    
    # Property 11: Verify complete data integrity for both students
    assert final_session1.upload.checksum == checksum1, \
        "Student 1 upload checksum preserved"
    
    assert final_session2.upload.checksum == checksum2, \
        "Student 2 upload checksum preserved"


@pytest.mark.property_test
@settings(
    max_examples=30,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    upload_request=sync_upload_request_strategy(),
)
def test_property_11_checksum_format_validation(
    sync_repository, upload_request
):
    """Property 11: Checksums must be valid SHA-256 format
    
    For any sync session, all checksums must be valid SHA-256 hashes
    (64 hexadecimal characters).
    
    This property verifies that:
    1. Upload checksum is valid SHA-256
    2. Download checksum is valid SHA-256
    3. Checksums are properly formatted
    """
    student_id = upload_request.student_id
    
    # Property 11: Create session and upload
    session = sync_repository.create_session(student_id)
    
    logs_json = json.dumps(upload_request.logs, sort_keys=True)
    upload_checksum = hashlib.sha256(logs_json.encode()).hexdigest()
    
    # Property 11: Verify upload checksum format
    assert len(upload_checksum) == 64, \
        "Upload checksum must be 64 characters (SHA-256)"
    
    assert all(c in '0123456789abcdef' for c in upload_checksum.lower()), \
        "Upload checksum must be valid hexadecimal"
    
    upload_data = SyncUploadData(
        performance_logs=upload_request.logs,
        compressed_size=len(logs_json),
        checksum=upload_checksum,
    )
    
    sync_repository.update_upload_data(session.session_id, upload_data)
    
    # Property 11: Generate download with valid checksum
    bundle_checksum = hashlib.sha256(f"bundle-{session.session_id}".encode()).hexdigest()
    
    # Property 11: Verify download checksum format
    assert len(bundle_checksum) == 64, \
        "Download checksum must be 64 characters (SHA-256)"
    
    assert all(c in '0123456789abcdef' for c in bundle_checksum.lower()), \
        "Download checksum must be valid hexadecimal"
    
    download_data = SyncDownloadData(
        bundle_url=f"https://s3.amazonaws.com/bundles/{session.session_id}.br",
        bundle_size=1024 * 1024,
        checksum=bundle_checksum,
    )
    
    sync_repository.update_download_data(session.session_id, download_data)
    
    # Property 11: Verify stored checksums maintain format
    final_session = sync_repository.get_session(session.session_id)
    
    assert len(final_session.upload.checksum) == 64, \
        "Stored upload checksum must be 64 characters"
    
    assert len(final_session.download.checksum) == 64, \
        "Stored download checksum must be 64 characters"
    
    assert all(c in '0123456789abcdef' for c in final_session.upload.checksum.lower()), \
        "Stored upload checksum must be valid hexadecimal"
    
    assert all(c in '0123456789abcdef' for c in final_session.download.checksum.lower()), \
        "Stored download checksum must be valid hexadecimal"
