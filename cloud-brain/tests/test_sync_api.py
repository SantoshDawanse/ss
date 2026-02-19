"""Unit tests for sync API handlers."""

import json
import sys
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

import pytest

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from handlers.sync_handler import upload, download, _decompress_logs, _validate_logs
from src.models.sync import SyncStatus, SyncSession, SyncUploadData
from src.models.personalization import PerformanceLog


class TestSyncUploadHandler:
    """Tests for sync upload handler."""

    @patch("handlers.sync_handler.authenticate_request")
    @patch("handlers.sync_handler.SyncSessionRepository")
    @patch("handlers.sync_handler.KnowledgeModelRepository")
    @patch("handlers.sync_handler.PersonalizationEngine")
    def test_upload_success(
        self,
        mock_personalization,
        mock_knowledge_repo_class,
        mock_sync_repo_class,
        mock_auth,
    ):
        """Test successful upload."""
        # Setup mocks
        student_id = "student123"
        mock_auth.return_value = student_id

        mock_sync_repo = Mock()
        mock_sync_repo_class.return_value = mock_sync_repo

        session = SyncSession(
            session_id="session123",
            student_id=student_id,
            start_time=datetime.utcnow(),
            status=SyncStatus.PENDING,
        )
        mock_sync_repo.create_session.return_value = session
        mock_sync_repo.get_latest_session_for_student.return_value = None

        # Create event
        logs = [
            {
                "student_id": student_id,
                "timestamp": datetime.utcnow().isoformat(),
                "event_type": "quiz_answer",
                "content_id": "quiz1",
                "subject": "Mathematics",
                "topic": "Algebra",
                "data": {"correct": True, "time_spent": 30},
            }
        ]

        event = {
            "headers": {"Authorization": "Bearer fake-token"},
            "body": json.dumps(
                {
                    "student_id": student_id,
                    "logs": logs,
                    "last_sync_time": None,
                }
            ),
        }

        context = Mock()

        # Execute
        response = upload(event, context)

        # Verify
        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["session_id"] == "session123"
        assert body["logs_received"] == 1
        assert body["bundle_ready"] is True

        # Verify repository calls
        mock_sync_repo.create_session.assert_called_once_with(student_id)
        mock_sync_repo.update_upload_data.assert_called_once()
        mock_sync_repo.update_checkpoint.assert_called()

    @patch("handlers.sync_handler.authenticate_request")
    def test_upload_authentication_failure(self, mock_auth):
        """Test upload with authentication failure."""
        from utils.auth import AuthError

        mock_auth.side_effect = AuthError("Invalid token")

        event = {
            "headers": {"Authorization": "Bearer invalid-token"},
            "body": json.dumps({"student_id": "student123", "logs": []}),
        }

        context = Mock()

        response = upload(event, context)

        assert response["statusCode"] == 401
        body = json.loads(response["body"])
        assert "error" in body

    def test_decompress_logs_plain_list(self):
        """Test decompressing logs that are already a list."""
        logs = [{"event": "test"}]
        result = _decompress_logs(logs)
        assert result == logs

    def test_validate_logs_success(self):
        """Test validating correct logs."""
        logs = [
            {
                "student_id": "student123",
                "timestamp": datetime.utcnow(),
                "event_type": "quiz_answer",
                "content_id": "quiz1",
                "subject": "Mathematics",
                "topic": "Algebra",
                "data": {"correct": True},
            }
        ]

        result = _validate_logs(logs)
        assert len(result) == 1
        assert isinstance(result[0], PerformanceLog)

    def test_validate_logs_invalid_format(self):
        """Test validating logs with invalid format."""
        logs = [{"invalid": "data"}]

        with pytest.raises(ValueError, match="Invalid log at index 0"):
            _validate_logs(logs)


class TestSyncDownloadHandler:
    """Tests for sync download handler."""

    @patch("handlers.sync_handler.authenticate_request")
    @patch("handlers.sync_handler.SyncSessionRepository")
    @patch("handlers.sync_handler.BundleGenerator")
    @patch("handlers.sync_handler.KnowledgeModelRepository")
    def test_download_success_with_existing_bundle(
        self,
        mock_knowledge_repo_class,
        mock_bundle_gen_class,
        mock_sync_repo_class,
        mock_auth,
    ):
        """Test successful download with existing bundle."""
        # Setup mocks
        student_id = "student123"
        session_id = "session123"
        mock_auth.return_value = student_id

        mock_sync_repo = Mock()
        mock_sync_repo_class.return_value = mock_sync_repo

        from models.sync import SyncDownloadData

        session = SyncSession(
            session_id=session_id,
            student_id=student_id,
            start_time=datetime.utcnow(),
            status=SyncStatus.PENDING,
            download=SyncDownloadData(
                bundle_url="https://s3.amazonaws.com/bundle",
                bundle_size=1024,
                checksum="abc123",
            ),
        )
        mock_sync_repo.get_session.return_value = session

        # Create event
        event = {
            "headers": {"Authorization": "Bearer fake-token"},
            "pathParameters": {"sessionId": session_id},
        }

        context = Mock()

        # Execute
        response = download(event, context)

        # Verify
        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["bundle_url"] == "https://s3.amazonaws.com/bundle"
        assert body["bundle_size"] == 1024
        assert body["checksum"] == "abc123"

        # Verify session was marked complete
        mock_sync_repo.update_session_status.assert_called_with(
            session_id, SyncStatus.COMPLETE
        )

    @patch("handlers.sync_handler.authenticate_request")
    @patch("handlers.sync_handler.SyncSessionRepository")
    def test_download_session_not_found(self, mock_sync_repo_class, mock_auth):
        """Test download with non-existent session."""
        student_id = "student123"
        mock_auth.return_value = student_id

        mock_sync_repo = Mock()
        mock_sync_repo_class.return_value = mock_sync_repo
        mock_sync_repo.get_session.return_value = None

        event = {
            "headers": {"Authorization": "Bearer fake-token"},
            "pathParameters": {"sessionId": "nonexistent"},
        }

        context = Mock()

        response = download(event, context)

        assert response["statusCode"] == 404
        body = json.loads(response["body"])
        assert "error" in body

    @patch("handlers.sync_handler.authenticate_request")
    @patch("handlers.sync_handler.SyncSessionRepository")
    def test_download_access_denied(self, mock_sync_repo_class, mock_auth):
        """Test download with wrong student."""
        student_id = "student123"
        mock_auth.return_value = student_id

        mock_sync_repo = Mock()
        mock_sync_repo_class.return_value = mock_sync_repo

        session = SyncSession(
            session_id="session123",
            student_id="different_student",
            start_time=datetime.utcnow(),
            status=SyncStatus.PENDING,
        )
        mock_sync_repo.get_session.return_value = session

        event = {
            "headers": {"Authorization": "Bearer fake-token"},
            "pathParameters": {"sessionId": "session123"},
        }

        context = Mock()

        response = download(event, context)

        assert response["statusCode"] == 403
        body = json.loads(response["body"])
        assert "error" in body


class TestAuthUtils:
    """Tests for authentication utilities."""

    def test_generate_jwt_token(self):
        """Test JWT token generation."""
        from utils.auth import generate_jwt_token, verify_jwt_token

        student_id = "student123"
        token = generate_jwt_token(student_id)

        assert isinstance(token, str)
        assert len(token) > 0

        # Verify token
        verified_id = verify_jwt_token(token)
        assert verified_id == student_id

    def test_verify_invalid_token(self):
        """Test verifying invalid token."""
        from utils.auth import verify_jwt_token, AuthError

        with pytest.raises(AuthError):
            verify_jwt_token("invalid-token")

    def test_extract_token_from_header(self):
        """Test extracting token from Authorization header."""
        from utils.auth import extract_token_from_header

        header = "Bearer my-token-123"
        token = extract_token_from_header(header)
        assert token == "my-token-123"

    def test_extract_token_missing_header(self):
        """Test extracting token with missing header."""
        from utils.auth import extract_token_from_header, AuthError

        with pytest.raises(AuthError, match="Missing Authorization header"):
            extract_token_from_header(None)

    def test_extract_token_invalid_format(self):
        """Test extracting token with invalid format."""
        from utils.auth import extract_token_from_header, AuthError

        with pytest.raises(AuthError, match="Invalid Authorization header format"):
            extract_token_from_header("InvalidFormat")
