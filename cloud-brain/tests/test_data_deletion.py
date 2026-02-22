"""Unit tests for data deletion service."""

import pytest
from unittest.mock import Mock, MagicMock, patch
from botocore.exceptions import ClientError

from src.services.data_deletion import DataDeletionService


class TestDataDeletionService:
    """Test suite for DataDeletionService."""

    def setup_method(self):
        """Set up test fixtures."""
        # Mock AWS resources
        with patch("boto3.resource"), patch("boto3.client"):
            self.service = DataDeletionService(
                students_table_name="test-students",
                bundles_table_name="test-bundles",
                sync_sessions_table_name="test-sync-sessions",
                s3_bucket_name="test-bucket"
            )
        
        # Mock the tables and client
        self.service.students_table = Mock()
        self.service.bundles_table = Mock()
        self.service.sync_sessions_table = Mock()
        self.service.s3_client = Mock()
    
    def test_delete_student_knowledge_model_success(self):
        """Test successful deletion of knowledge model."""
        student_id = "student123"
        
        result = self.service.delete_student_knowledge_model(student_id)
        
        assert result is True
        self.service.students_table.delete_item.assert_called_once_with(
            Key={"studentId": student_id}
        )
    
    def test_delete_student_knowledge_model_error(self):
        """Test handling of deletion error."""
        student_id = "student123"
        self.service.students_table.delete_item.side_effect = ClientError(
            {"Error": {"Code": "InternalError", "Message": "Test error"}},
            "DeleteItem"
        )
        
        result = self.service.delete_student_knowledge_model(student_id)
        
        assert result is False
    
    def test_delete_student_knowledge_model_no_table(self):
        """Test deletion when table is not initialized."""
        self.service.students_table = None
        
        result = self.service.delete_student_knowledge_model("student123")
        
        assert result is False
    
    def test_get_student_bundle_ids_success(self):
        """Test retrieving bundle IDs for a student."""
        student_id = "student123"
        self.service.bundles_table.query.return_value = {
            "Items": [
                {"bundleId": "bundle1"},
                {"bundleId": "bundle2"},
                {"bundleId": "bundle3"}
            ]
        }
        
        result = self.service.get_student_bundle_ids(student_id)
        
        assert len(result) == 3
        assert "bundle1" in result
        assert "bundle2" in result
        assert "bundle3" in result
    
    def test_get_student_bundle_ids_empty(self):
        """Test retrieving bundle IDs when student has no bundles."""
        student_id = "student123"
        self.service.bundles_table.query.return_value = {"Items": []}
        
        result = self.service.get_student_bundle_ids(student_id)
        
        assert len(result) == 0
    
    def test_get_student_bundle_ids_error(self):
        """Test handling of query error."""
        student_id = "student123"
        self.service.bundles_table.query.side_effect = ClientError(
            {"Error": {"Code": "InternalError", "Message": "Test error"}},
            "Query"
        )
        
        result = self.service.get_student_bundle_ids(student_id)
        
        assert len(result) == 0
    
    def test_delete_bundle_from_s3_success(self):
        """Test successful deletion of bundle from S3."""
        bundle_id = "bundle123"
        
        result = self.service.delete_bundle_from_s3(bundle_id)
        
        assert result is True
        self.service.s3_client.delete_object.assert_called_once_with(
            Bucket="test-bucket",
            Key=f"bundles/{bundle_id}.zip"
        )
    
    def test_delete_bundle_from_s3_not_found(self):
        """Test deletion when bundle doesn't exist in S3."""
        bundle_id = "bundle123"
        self.service.s3_client.delete_object.side_effect = ClientError(
            {"Error": {"Code": "NoSuchKey", "Message": "Not found"}},
            "DeleteObject"
        )
        
        result = self.service.delete_bundle_from_s3(bundle_id)
        
        # Should still return True (already deleted)
        assert result is True
    
    def test_delete_bundle_from_s3_error(self):
        """Test handling of S3 deletion error."""
        bundle_id = "bundle123"
        self.service.s3_client.delete_object.side_effect = ClientError(
            {"Error": {"Code": "InternalError", "Message": "Test error"}},
            "DeleteObject"
        )
        
        result = self.service.delete_bundle_from_s3(bundle_id)
        
        assert result is False
    
    def test_delete_bundle_metadata_success(self):
        """Test successful deletion of bundle metadata."""
        bundle_id = "bundle123"
        
        result = self.service.delete_bundle_metadata(bundle_id)
        
        assert result is True
        self.service.bundles_table.delete_item.assert_called_once_with(
            Key={"bundleId": bundle_id}
        )
    
    def test_delete_student_bundles_success(self):
        """Test successful deletion of all student bundles."""
        student_id = "student123"
        
        # Mock bundle IDs
        self.service.bundles_table.query.return_value = {
            "Items": [
                {"bundleId": "bundle1"},
                {"bundleId": "bundle2"}
            ]
        }
        
        result = self.service.delete_student_bundles(student_id)
        
        assert result["total_bundles"] == 2
        assert result["s3_deleted"] == 2
        assert result["metadata_deleted"] == 2
        assert len(result["errors"]) == 0
    
    def test_delete_student_bundles_with_errors(self):
        """Test deletion with some failures."""
        student_id = "student123"
        
        # Mock bundle IDs
        self.service.bundles_table.query.return_value = {
            "Items": [{"bundleId": "bundle1"}]
        }
        
        # Make S3 deletion fail
        self.service.s3_client.delete_object.side_effect = ClientError(
            {"Error": {"Code": "InternalError", "Message": "Test error"}},
            "DeleteObject"
        )
        
        result = self.service.delete_student_bundles(student_id)
        
        assert result["total_bundles"] == 1
        assert result["s3_deleted"] == 0
        assert len(result["errors"]) > 0
    
    def test_get_student_sync_session_ids_success(self):
        """Test retrieving sync session IDs for a student."""
        student_id = "student123"
        self.service.sync_sessions_table.query.return_value = {
            "Items": [
                {"sessionId": "session1"},
                {"sessionId": "session2"}
            ]
        }
        
        result = self.service.get_student_sync_session_ids(student_id)
        
        assert len(result) == 2
        assert "session1" in result
        assert "session2" in result
    
    def test_delete_sync_session_success(self):
        """Test successful deletion of sync session."""
        session_id = "session123"
        
        result = self.service.delete_sync_session(session_id)
        
        assert result is True
        self.service.sync_sessions_table.delete_item.assert_called_once_with(
            Key={"sessionId": session_id}
        )
    
    def test_delete_student_sync_sessions_success(self):
        """Test successful deletion of all student sync sessions."""
        student_id = "student123"
        
        # Mock session IDs
        self.service.sync_sessions_table.query.return_value = {
            "Items": [
                {"sessionId": "session1"},
                {"sessionId": "session2"}
            ]
        }
        
        result = self.service.delete_student_sync_sessions(student_id)
        
        assert result["total_sessions"] == 2
        assert result["deleted"] == 2
        assert len(result["errors"]) == 0
    
    def test_delete_student_learning_history_complete_success(self):
        """Test complete deletion of all student data."""
        student_id = "student123"
        
        # Mock successful operations
        self.service.bundles_table.query.return_value = {
            "Items": [{"bundleId": "bundle1"}]
        }
        self.service.sync_sessions_table.query.return_value = {
            "Items": [{"sessionId": "session1"}]
        }
        
        result = self.service.delete_student_learning_history(student_id)
        
        assert result["student_id"] == student_id
        assert result["knowledge_model_deleted"] is True
        assert result["bundles"]["total_bundles"] == 1
        assert result["sync_sessions"]["total_sessions"] == 1
        assert result["success"] is True
        assert len(result["errors"]) == 0
    
    def test_delete_student_learning_history_with_errors(self):
        """Test deletion with some failures."""
        student_id = "student123"
        
        # Make knowledge model deletion fail
        self.service.students_table.delete_item.side_effect = ClientError(
            {"Error": {"Code": "InternalError", "Message": "Test error"}},
            "DeleteItem"
        )
        
        # Mock empty bundles and sessions
        self.service.bundles_table.query.return_value = {"Items": []}
        self.service.sync_sessions_table.query.return_value = {"Items": []}
        
        result = self.service.delete_student_learning_history(student_id)
        
        assert result["knowledge_model_deleted"] is False
        assert result["success"] is False
        assert len(result["errors"]) > 0
    
    def test_verify_deletion_all_deleted(self):
        """Test verification when all data is deleted."""
        student_id = "student123"
        
        # Mock no data found
        self.service.students_table.get_item.return_value = {}
        self.service.bundles_table.query.return_value = {"Items": []}
        self.service.sync_sessions_table.query.return_value = {"Items": []}
        
        result = self.service.verify_deletion(student_id)
        
        assert result["knowledge_model_exists"] is False
        assert result["bundles_exist"] is False
        assert result["sync_sessions_exist"] is False
    
    def test_verify_deletion_data_still_exists(self):
        """Test verification when some data still exists."""
        student_id = "student123"
        
        # Mock data still exists
        self.service.students_table.get_item.return_value = {"Item": {"studentId": student_id}}
        self.service.bundles_table.query.return_value = {"Items": [{"bundleId": "bundle1"}]}
        self.service.sync_sessions_table.query.return_value = {"Items": []}
        
        result = self.service.verify_deletion(student_id)
        
        assert result["knowledge_model_exists"] is True
        assert result["bundles_exist"] is True
        assert result["sync_sessions_exist"] is False
