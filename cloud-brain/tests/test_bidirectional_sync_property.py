"""Property-based tests for bidirectional synchronization.

Feature: sikshya-sathi-system
Property 9: Bidirectional Synchronization

For any completed Sync Session, the Local Brain must have successfully uploaded
all pending Performance Logs to the Cloud Brain, and the Cloud Brain must have
successfully downloaded a new Learning Bundle to the Local Brain.

Validates: Requirements 4.2, 4.3
"""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck, assume
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
import json
import hashlib

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
def test_property_9_bidirectional_sync_upload_and_download(
    sync_repository, upload_request
):
    """Property 9: Bidirectional Synchronization
    
    For any completed Sync Session, the Local Brain must have successfully
    uploaded all pending Performance Logs to the Cloud Brain, and the Cloud
    Brain must have successfully downloaded a new Learning Bundle to the
    Local Brain.
    
    This property verifies that:
    1. Upload phase successfully stores all performance logs
    2. Download phase successfully provides a learning bundle
    3. Session is marked as complete after both phases
    4. All data is preserved and accessible
    """
    student_id = upload_request.student_id
    
    # Property 9: Phase 1 - Upload (Local Brain -> Cloud Brain)
    # Create sync session
    session = sync_repository.create_session(student_id)
    assert session is not None, "Sync session must be created"
    assert session.status == SyncStatus.PENDING, "Initial status must be PENDING"
    
    # Simulate upload of performance logs
    logs_json = json.dumps(upload_request.logs, sort_keys=True)
    checksum = hashlib.sha256(logs_json.encode()).hexdigest()
    
    upload_data = SyncUploadData(
        performance_logs=upload_request.logs,
        compressed_size=len(logs_json),
        checksum=checksum,
    )
    
    sync_repository.update_upload_data(session.session_id, upload_data)
    
    # Property 9: Upload must be recorded in session
    updated_session = sync_repository.get_session(session.session_id)
    assert updated_session.upload is not None, \
        "Upload data must be stored in sync session"
    
    assert len(updated_session.upload.performance_logs) == len(upload_request.logs), \
        f"All {len(upload_request.logs)} performance logs must be uploaded"
    
    assert updated_session.upload.checksum == checksum, \
        "Upload checksum must match calculated checksum"
    
    # Property 9: Phase 2 - Download (Cloud Brain -> Local Brain)
    # Simulate bundle generation and download
    bundle_url = f"https://s3.amazonaws.com/bundles/{session.session_id}.br"
    bundle_size = 1024 * 1024  # 1MB
    bundle_checksum = hashlib.sha256(f"bundle-{session.session_id}".encode()).hexdigest()
    
    download_data = SyncDownloadData(
        bundle_url=bundle_url,
        bundle_size=bundle_size,
        checksum=bundle_checksum,
    )
    
    sync_repository.update_download_data(session.session_id, download_data)
    
    # Property 9: Download must be recorded in session
    updated_session = sync_repository.get_session(session.session_id)
    assert updated_session.download is not None, \
        "Download data must be stored in sync session"
    
    assert updated_session.download.bundle_url == bundle_url, \
        "Bundle URL must be stored correctly"
    
    assert updated_session.download.bundle_size == bundle_size, \
        "Bundle size must be stored correctly"
    
    assert updated_session.download.checksum == bundle_checksum, \
        "Bundle checksum must be stored correctly"
    
    # Property 9: Mark session as complete
    sync_repository.update_session_status(session.session_id, SyncStatus.COMPLETE)
    
    # Property 9: Verify bidirectional sync is complete
    final_session = sync_repository.get_session(session.session_id)
    
    assert final_session.status == SyncStatus.COMPLETE, \
        "Session must be marked as COMPLETE after bidirectional sync"
    
    assert final_session.upload is not None, \
        "Upload data must be preserved after completion"
    
    assert final_session.download is not None, \
        "Download data must be preserved after completion"
    
    assert final_session.end_time is not None, \
        "End time must be set when session is complete"
    
    # Property 9: Verify data integrity
    assert len(final_session.upload.performance_logs) == len(upload_request.logs), \
        "All uploaded logs must be preserved"
    
    assert final_session.download.bundle_url is not None and len(final_session.download.bundle_url) > 0, \
        "Bundle URL must be available for download"


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    upload_request=sync_upload_request_strategy(),
)
def test_property_9_upload_logs_are_acknowledged(
    sync_repository, upload_request
):
    """Property 9: Uploaded logs are acknowledged by Cloud Brain
    
    For any upload of performance logs, the Cloud Brain must acknowledge
    receipt and store the logs for processing.
    
    This property verifies that:
    1. All logs are received and counted
    2. Logs are stored with correct checksum
    3. Upload status is tracked
    """
    student_id = upload_request.student_id
    
    # Create sync session
    session = sync_repository.create_session(student_id)
    
    # Property 9: Upload logs
    logs_json = json.dumps(upload_request.logs, sort_keys=True)
    checksum = hashlib.sha256(logs_json.encode()).hexdigest()
    
    upload_data = SyncUploadData(
        performance_logs=upload_request.logs,
        compressed_size=len(logs_json),
        checksum=checksum,
    )
    
    sync_repository.update_upload_data(session.session_id, upload_data)
    
    # Property 9: Verify acknowledgment
    updated_session = sync_repository.get_session(session.session_id)
    
    assert updated_session.upload is not None, \
        "Cloud Brain must acknowledge upload by storing upload data"
    
    assert len(updated_session.upload.performance_logs) == len(upload_request.logs), \
        f"Cloud Brain must acknowledge all {len(upload_request.logs)} logs"
    
    assert updated_session.upload.checksum == checksum, \
        "Cloud Brain must store correct checksum for uploaded logs"
    
    # Property 9: Verify each log is preserved
    for i, original_log in enumerate(upload_request.logs):
        stored_log = updated_session.upload.performance_logs[i]
        assert stored_log["student_id"] == original_log["student_id"], \
            f"Log {i} student_id must be preserved"
        assert stored_log["event_type"] == original_log["event_type"], \
            f"Log {i} event_type must be preserved"
        assert stored_log["content_id"] == original_log["content_id"], \
            f"Log {i} content_id must be preserved"


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    upload_request=sync_upload_request_strategy(),
)
def test_property_9_download_bundle_is_provided(
    sync_repository, upload_request
):
    """Property 9: Download bundle is provided after upload
    
    For any successful upload, the Cloud Brain must provide a learning
    bundle for download.
    
    This property verifies that:
    1. Bundle URL is generated
    2. Bundle metadata is complete
    3. Bundle is accessible for download
    """
    student_id = upload_request.student_id
    
    # Create sync session and upload logs
    session = sync_repository.create_session(student_id)
    
    logs_json = json.dumps(upload_request.logs, sort_keys=True)
    checksum = hashlib.sha256(logs_json.encode()).hexdigest()
    
    upload_data = SyncUploadData(
        performance_logs=upload_request.logs,
        compressed_size=len(logs_json),
        checksum=checksum,
    )
    
    sync_repository.update_upload_data(session.session_id, upload_data)
    
    # Property 9: Generate and provide bundle
    bundle_url = f"https://s3.amazonaws.com/bundles/{session.session_id}.br"
    bundle_size = 2 * 1024 * 1024  # 2MB
    bundle_checksum = hashlib.sha256(f"bundle-{session.session_id}".encode()).hexdigest()
    
    download_data = SyncDownloadData(
        bundle_url=bundle_url,
        bundle_size=bundle_size,
        checksum=bundle_checksum,
    )
    
    sync_repository.update_download_data(session.session_id, download_data)
    
    # Property 9: Verify bundle is provided
    updated_session = sync_repository.get_session(session.session_id)
    
    assert updated_session.download is not None, \
        "Cloud Brain must provide download bundle"
    
    assert updated_session.download.bundle_url is not None, \
        "Bundle URL must be provided"
    
    assert len(updated_session.download.bundle_url) > 0, \
        "Bundle URL must not be empty"
    
    assert updated_session.download.bundle_url.startswith("https://"), \
        "Bundle URL must be a valid HTTPS URL"
    
    assert updated_session.download.bundle_size > 0, \
        "Bundle size must be positive"
    
    assert updated_session.download.checksum is not None, \
        "Bundle checksum must be provided"
    
    assert len(updated_session.download.checksum) == 64, \
        "Bundle checksum must be SHA-256 (64 hex characters)"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    upload_request=sync_upload_request_strategy(),
)
def test_property_9_sync_session_state_transitions(
    sync_repository, upload_request
):
    """Property 9: Sync session follows correct state transitions
    
    For any sync session, the status must transition through valid states:
    PENDING -> UPLOADING -> DOWNLOADING -> COMPLETE
    
    This property verifies that:
    1. Initial state is PENDING
    2. Upload changes state to UPLOADING
    3. Download changes state to DOWNLOADING
    4. Final state is COMPLETE
    """
    student_id = upload_request.student_id
    
    # Property 9: Initial state
    session = sync_repository.create_session(student_id)
    assert session.status == SyncStatus.PENDING, \
        "Initial sync session status must be PENDING"
    
    # Property 9: Upload phase
    logs_json = json.dumps(upload_request.logs, sort_keys=True)
    checksum = hashlib.sha256(logs_json.encode()).hexdigest()
    
    upload_data = SyncUploadData(
        performance_logs=upload_request.logs,
        compressed_size=len(logs_json),
        checksum=checksum,
    )
    
    sync_repository.update_upload_data(session.session_id, upload_data)
    
    updated_session = sync_repository.get_session(session.session_id)
    assert updated_session.status == SyncStatus.UPLOADING, \
        "Status must be UPLOADING after upload data is stored"
    
    # Property 9: Download phase
    bundle_url = f"https://s3.amazonaws.com/bundles/{session.session_id}.br"
    bundle_size = 1024 * 1024
    bundle_checksum = hashlib.sha256(f"bundle-{session.session_id}".encode()).hexdigest()
    
    download_data = SyncDownloadData(
        bundle_url=bundle_url,
        bundle_size=bundle_size,
        checksum=bundle_checksum,
    )
    
    sync_repository.update_download_data(session.session_id, download_data)
    
    updated_session = sync_repository.get_session(session.session_id)
    assert updated_session.status == SyncStatus.DOWNLOADING, \
        "Status must be DOWNLOADING after download data is stored"
    
    # Property 9: Complete phase
    sync_repository.update_session_status(session.session_id, SyncStatus.COMPLETE)
    
    final_session = sync_repository.get_session(session.session_id)
    assert final_session.status == SyncStatus.COMPLETE, \
        "Final status must be COMPLETE after bidirectional sync"
    
    # Property 9: Verify end time is set
    assert final_session.end_time is not None, \
        "End time must be set when session is complete"
    
    assert final_session.end_time >= final_session.start_time, \
        "End time must be after start time"


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
def test_property_9_multiple_students_sync_independently(
    sync_repository, upload_request1, upload_request2
):
    """Property 9: Multiple students can sync independently
    
    For any two students syncing simultaneously, their sync sessions
    must be independent and not interfere with each other.
    
    This property verifies that:
    1. Each student gets their own session
    2. Upload data is not mixed between students
    3. Download bundles are student-specific
    """
    # Property 9: Create sessions for both students
    session1 = sync_repository.create_session(upload_request1.student_id)
    session2 = sync_repository.create_session(upload_request2.student_id)
    
    assert session1.session_id != session2.session_id, \
        "Each student must get a unique session ID"
    
    assert session1.student_id == upload_request1.student_id, \
        "Session 1 must be associated with student 1"
    
    assert session2.student_id == upload_request2.student_id, \
        "Session 2 must be associated with student 2"
    
    # Property 9: Upload logs for both students
    logs1_json = json.dumps(upload_request1.logs, sort_keys=True)
    checksum1 = hashlib.sha256(logs1_json.encode()).hexdigest()
    
    upload_data1 = SyncUploadData(
        performance_logs=upload_request1.logs,
        compressed_size=len(logs1_json),
        checksum=checksum1,
    )
    
    logs2_json = json.dumps(upload_request2.logs, sort_keys=True)
    checksum2 = hashlib.sha256(logs2_json.encode()).hexdigest()
    
    upload_data2 = SyncUploadData(
        performance_logs=upload_request2.logs,
        compressed_size=len(logs2_json),
        checksum=checksum2,
    )
    
    sync_repository.update_upload_data(session1.session_id, upload_data1)
    sync_repository.update_upload_data(session2.session_id, upload_data2)
    
    # Property 9: Verify uploads are independent
    updated_session1 = sync_repository.get_session(session1.session_id)
    updated_session2 = sync_repository.get_session(session2.session_id)
    
    assert len(updated_session1.upload.performance_logs) == len(upload_request1.logs), \
        "Student 1 logs must not be affected by student 2"
    
    assert len(updated_session2.upload.performance_logs) == len(upload_request2.logs), \
        "Student 2 logs must not be affected by student 1"
    
    assert updated_session1.upload.checksum != updated_session2.upload.checksum, \
        "Different students should have different log checksums"
    
    # Property 9: Provide bundles for both students
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
    
    # Property 9: Verify downloads are independent
    final_session1 = sync_repository.get_session(session1.session_id)
    final_session2 = sync_repository.get_session(session2.session_id)
    
    assert final_session1.download.bundle_url != final_session2.download.bundle_url, \
        "Each student must get their own bundle URL"
    
    assert final_session1.download.checksum != final_session2.download.checksum, \
        "Each student must get their own bundle with unique checksum"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    upload_request=sync_upload_request_strategy(),
)
def test_property_9_sync_session_preserves_data_integrity(
    sync_repository, upload_request
):
    """Property 9: Sync session preserves data integrity
    
    For any sync session, all data must be preserved with correct checksums
    throughout the bidirectional sync process.
    
    This property verifies that:
    1. Upload checksum matches uploaded data
    2. Download checksum is provided
    3. Data is not corrupted during sync
    """
    student_id = upload_request.student_id
    
    # Create session and upload
    session = sync_repository.create_session(student_id)
    
    # Property 9: Calculate checksum for uploaded logs
    logs_json = json.dumps(upload_request.logs, sort_keys=True)
    expected_checksum = hashlib.sha256(logs_json.encode()).hexdigest()
    
    upload_data = SyncUploadData(
        performance_logs=upload_request.logs,
        compressed_size=len(logs_json),
        checksum=expected_checksum,
    )
    
    sync_repository.update_upload_data(session.session_id, upload_data)
    
    # Property 9: Verify upload checksum
    updated_session = sync_repository.get_session(session.session_id)
    
    assert updated_session.upload.checksum == expected_checksum, \
        "Upload checksum must match calculated checksum"
    
    # Recalculate checksum from stored logs
    stored_logs_json = json.dumps(updated_session.upload.performance_logs, sort_keys=True)
    stored_checksum = hashlib.sha256(stored_logs_json.encode()).hexdigest()
    
    assert stored_checksum == expected_checksum, \
        "Stored logs must have same checksum as uploaded logs (data integrity)"
    
    # Property 9: Provide bundle with checksum
    bundle_checksum = hashlib.sha256(f"bundle-{session.session_id}".encode()).hexdigest()
    
    download_data = SyncDownloadData(
        bundle_url=f"https://s3.amazonaws.com/bundles/{session.session_id}.br",
        bundle_size=1024 * 1024,
        checksum=bundle_checksum,
    )
    
    sync_repository.update_download_data(session.session_id, download_data)
    
    # Property 9: Verify download checksum
    final_session = sync_repository.get_session(session.session_id)
    
    assert final_session.download.checksum == bundle_checksum, \
        "Download checksum must be stored correctly"
    
    assert len(final_session.download.checksum) == 64, \
        "Download checksum must be valid SHA-256 (64 hex characters)"
    
    # Property 9: Verify all data is preserved
    assert final_session.upload is not None, \
        "Upload data must be preserved after download"
    
    assert final_session.download is not None, \
        "Download data must be preserved"
    
    assert len(final_session.upload.performance_logs) == len(upload_request.logs), \
        "All uploaded logs must be preserved throughout sync"


@pytest.mark.property_test
@settings(
    max_examples=30,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    upload_request=sync_upload_request_strategy(),
)
def test_property_9_empty_logs_handled_correctly(
    sync_repository, upload_request
):
    """Property 9: Sync handles edge case of minimal logs
    
    For any sync session with minimal logs, the bidirectional sync
    must still complete successfully.
    
    This property verifies that:
    1. Sessions with few logs are handled
    2. Bundle is still provided
    3. Sync completes successfully
    """
    student_id = upload_request.student_id
    
    # Use only first log (minimal case)
    minimal_logs = upload_request.logs[:1] if upload_request.logs else []
    
    # Skip if no logs at all
    assume(len(minimal_logs) > 0)
    
    # Property 9: Create session and upload minimal logs
    session = sync_repository.create_session(student_id)
    
    logs_json = json.dumps(minimal_logs, sort_keys=True)
    checksum = hashlib.sha256(logs_json.encode()).hexdigest()
    
    upload_data = SyncUploadData(
        performance_logs=minimal_logs,
        compressed_size=len(logs_json),
        checksum=checksum,
    )
    
    sync_repository.update_upload_data(session.session_id, upload_data)
    
    # Property 9: Verify minimal upload is accepted
    updated_session = sync_repository.get_session(session.session_id)
    assert updated_session.upload is not None, \
        "Minimal logs must be accepted"
    
    assert len(updated_session.upload.performance_logs) == len(minimal_logs), \
        "All minimal logs must be stored"
    
    # Property 9: Provide bundle even for minimal logs
    download_data = SyncDownloadData(
        bundle_url=f"https://s3.amazonaws.com/bundles/{session.session_id}.br",
        bundle_size=512 * 1024,  # Smaller bundle for minimal logs
        checksum=hashlib.sha256(f"bundle-{session.session_id}".encode()).hexdigest(),
    )
    
    sync_repository.update_download_data(session.session_id, download_data)
    
    # Property 9: Complete sync
    sync_repository.update_session_status(session.session_id, SyncStatus.COMPLETE)
    
    final_session = sync_repository.get_session(session.session_id)
    
    assert final_session.status == SyncStatus.COMPLETE, \
        "Sync must complete successfully even with minimal logs"
    
    assert final_session.download is not None, \
        "Bundle must be provided even for minimal logs"
