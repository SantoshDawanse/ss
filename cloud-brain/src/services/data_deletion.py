"""Data deletion service for student learning history."""

import logging
from typing import List, Dict, Any, Optional
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class DataDeletionService:
    """Service for deleting student learning history with cascading deletes."""

    def __init__(
        self,
        students_table_name: str = "sikshya-sathi-students-dev",
        bundles_table_name: str = "sikshya-sathi-bundles-dev",
        sync_sessions_table_name: str = "sikshya-sathi-sync-sessions-dev",
        s3_bucket_name: str = "sikshya-sathi-bundles-dev"
    ):
        """Initialize the deletion service.
        
        Args:
            students_table_name: DynamoDB table for student knowledge models
            bundles_table_name: DynamoDB table for bundle metadata
            sync_sessions_table_name: DynamoDB table for sync sessions
            s3_bucket_name: S3 bucket for learning bundles
        """
        self.students_table_name = students_table_name
        self.bundles_table_name = bundles_table_name
        self.sync_sessions_table_name = sync_sessions_table_name
        self.s3_bucket_name = s3_bucket_name
        
        try:
            dynamodb = boto3.resource("dynamodb")
            self.students_table = dynamodb.Table(students_table_name)
            self.bundles_table = dynamodb.Table(bundles_table_name)
            self.sync_sessions_table = dynamodb.Table(sync_sessions_table_name)
            
            self.s3_client = boto3.client("s3")
        except Exception as e:
            logger.error(f"Failed to initialize AWS resources: {e}")
            self.students_table = None
            self.bundles_table = None
            self.sync_sessions_table = None
            self.s3_client = None
    
    def delete_student_knowledge_model(self, student_id: str) -> bool:
        """Delete student's knowledge model from DynamoDB.
        
        Args:
            student_id: Student identifier
            
        Returns:
            True if successful, False otherwise
        """
        if not self.students_table:
            logger.error("Students table not initialized")
            return False
        
        try:
            self.students_table.delete_item(Key={"studentId": student_id})
            logger.info(f"Deleted knowledge model for student {student_id}")
            return True
        except ClientError as e:
            logger.error(f"Error deleting knowledge model: {e}")
            return False
    
    def get_student_bundle_ids(self, student_id: str) -> List[str]:
        """Get all bundle IDs for a student.
        
        Args:
            student_id: Student identifier
            
        Returns:
            List of bundle IDs
        """
        if not self.bundles_table:
            logger.error("Bundles table not initialized")
            return []
        
        try:
            response = self.bundles_table.query(
                IndexName="StudentIdIndex",
                KeyConditionExpression="studentId = :sid",
                ExpressionAttributeValues={":sid": student_id}
            )
            
            bundle_ids = [item["bundleId"] for item in response.get("Items", [])]
            logger.info(f"Found {len(bundle_ids)} bundles for student {student_id}")
            return bundle_ids
        except ClientError as e:
            logger.error(f"Error querying bundles: {e}")
            return []
    
    def delete_bundle_from_s3(self, bundle_id: str) -> bool:
        """Delete a learning bundle from S3.
        
        Args:
            bundle_id: Bundle identifier
            
        Returns:
            True if successful, False otherwise
        """
        if not self.s3_client:
            logger.error("S3 client not initialized")
            return False
        
        try:
            # Bundle is stored as bundles/{bundle_id}.zip
            key = f"bundles/{bundle_id}.zip"
            self.s3_client.delete_object(Bucket=self.s3_bucket_name, Key=key)
            logger.info(f"Deleted bundle {bundle_id} from S3")
            return True
        except ClientError as e:
            # If object doesn't exist, consider it a success
            if e.response["Error"]["Code"] == "NoSuchKey":
                logger.info(f"Bundle {bundle_id} not found in S3 (already deleted)")
                return True
            logger.error(f"Error deleting bundle from S3: {e}")
            return False
    
    def delete_bundle_metadata(self, bundle_id: str) -> bool:
        """Delete bundle metadata from DynamoDB.
        
        Args:
            bundle_id: Bundle identifier
            
        Returns:
            True if successful, False otherwise
        """
        if not self.bundles_table:
            logger.error("Bundles table not initialized")
            return False
        
        try:
            self.bundles_table.delete_item(Key={"bundleId": bundle_id})
            logger.info(f"Deleted bundle metadata for {bundle_id}")
            return True
        except ClientError as e:
            logger.error(f"Error deleting bundle metadata: {e}")
            return False
    
    def delete_student_bundles(self, student_id: str) -> Dict[str, Any]:
        """Delete all learning bundles for a student (cascading delete).
        
        Args:
            student_id: Student identifier
            
        Returns:
            Dictionary with deletion results
        """
        bundle_ids = self.get_student_bundle_ids(student_id)
        
        results = {
            "total_bundles": len(bundle_ids),
            "s3_deleted": 0,
            "metadata_deleted": 0,
            "errors": []
        }
        
        for bundle_id in bundle_ids:
            # Delete from S3
            if self.delete_bundle_from_s3(bundle_id):
                results["s3_deleted"] += 1
            else:
                results["errors"].append(f"Failed to delete bundle {bundle_id} from S3")
            
            # Delete metadata
            if self.delete_bundle_metadata(bundle_id):
                results["metadata_deleted"] += 1
            else:
                results["errors"].append(f"Failed to delete metadata for bundle {bundle_id}")
        
        return results
    
    def get_student_sync_session_ids(self, student_id: str) -> List[str]:
        """Get all sync session IDs for a student.
        
        Args:
            student_id: Student identifier
            
        Returns:
            List of sync session IDs
        """
        if not self.sync_sessions_table:
            logger.error("Sync sessions table not initialized")
            return []
        
        try:
            response = self.sync_sessions_table.query(
                IndexName="StudentIdIndex",
                KeyConditionExpression="studentId = :sid",
                ExpressionAttributeValues={":sid": student_id}
            )
            
            session_ids = [item["sessionId"] for item in response.get("Items", [])]
            logger.info(f"Found {len(session_ids)} sync sessions for student {student_id}")
            return session_ids
        except ClientError as e:
            logger.error(f"Error querying sync sessions: {e}")
            return []
    
    def delete_sync_session(self, session_id: str) -> bool:
        """Delete a sync session from DynamoDB.
        
        Args:
            session_id: Sync session identifier
            
        Returns:
            True if successful, False otherwise
        """
        if not self.sync_sessions_table:
            logger.error("Sync sessions table not initialized")
            return False
        
        try:
            self.sync_sessions_table.delete_item(Key={"sessionId": session_id})
            logger.info(f"Deleted sync session {session_id}")
            return True
        except ClientError as e:
            logger.error(f"Error deleting sync session: {e}")
            return False
    
    def delete_student_sync_sessions(self, student_id: str) -> Dict[str, Any]:
        """Delete all sync sessions for a student.
        
        Args:
            student_id: Student identifier
            
        Returns:
            Dictionary with deletion results
        """
        session_ids = self.get_student_sync_session_ids(student_id)
        
        results = {
            "total_sessions": len(session_ids),
            "deleted": 0,
            "errors": []
        }
        
        for session_id in session_ids:
            if self.delete_sync_session(session_id):
                results["deleted"] += 1
            else:
                results["errors"].append(f"Failed to delete sync session {session_id}")
        
        return results
    
    def delete_student_learning_history(self, student_id: str) -> Dict[str, Any]:
        """Delete all learning history for a student (complete cascading delete).
        
        This includes:
        - Knowledge model
        - Learning bundles (S3 and metadata)
        - Sync sessions
        
        Args:
            student_id: Student identifier
            
        Returns:
            Dictionary with comprehensive deletion results
        """
        logger.info(f"Starting complete deletion for student {student_id}")
        
        results = {
            "student_id": student_id,
            "knowledge_model_deleted": False,
            "bundles": {},
            "sync_sessions": {},
            "success": False,
            "errors": []
        }
        
        # Delete knowledge model
        if self.delete_student_knowledge_model(student_id):
            results["knowledge_model_deleted"] = True
        else:
            results["errors"].append("Failed to delete knowledge model")
        
        # Delete bundles (cascading)
        bundle_results = self.delete_student_bundles(student_id)
        results["bundles"] = bundle_results
        if bundle_results["errors"]:
            results["errors"].extend(bundle_results["errors"])
        
        # Delete sync sessions
        sync_results = self.delete_student_sync_sessions(student_id)
        results["sync_sessions"] = sync_results
        if sync_results["errors"]:
            results["errors"].extend(sync_results["errors"])
        
        # Determine overall success
        results["success"] = (
            results["knowledge_model_deleted"] and
            len(results["errors"]) == 0
        )
        
        if results["success"]:
            logger.info(f"Successfully deleted all data for student {student_id}")
        else:
            logger.warning(f"Deletion completed with errors for student {student_id}: {results['errors']}")
        
        return results
    
    def verify_deletion(self, student_id: str) -> Dict[str, bool]:
        """Verify that all student data has been deleted.
        
        Args:
            student_id: Student identifier
            
        Returns:
            Dictionary indicating what data still exists
        """
        verification = {
            "knowledge_model_exists": False,
            "bundles_exist": False,
            "sync_sessions_exist": False
        }
        
        # Check knowledge model
        if self.students_table:
            try:
                response = self.students_table.get_item(Key={"studentId": student_id})
                verification["knowledge_model_exists"] = "Item" in response
            except ClientError:
                pass
        
        # Check bundles
        bundle_ids = self.get_student_bundle_ids(student_id)
        verification["bundles_exist"] = len(bundle_ids) > 0
        
        # Check sync sessions
        session_ids = self.get_student_sync_session_ids(student_id)
        verification["sync_sessions_exist"] = len(session_ids) > 0
        
        return verification
