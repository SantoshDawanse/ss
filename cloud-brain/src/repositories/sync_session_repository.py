"""Repository for sync session data."""

import os
from datetime import datetime
from typing import Optional
from uuid import uuid4

import boto3
from botocore.exceptions import ClientError

from src.models.sync import SyncSession, SyncStatus, SyncUploadData, SyncDownloadData


class SyncSessionRepository:
    """Repository for managing sync sessions in DynamoDB."""

    def __init__(self):
        """Initialize repository."""
        self.dynamodb = boto3.resource("dynamodb")
        self.table_name = os.environ.get("SYNC_SESSIONS_TABLE", "sikshya-sathi-sync-sessions-dev")
        self.table = self.dynamodb.Table(self.table_name)

    def create_session(self, student_id: str) -> SyncSession:
        """
        Create a new sync session.

        Args:
            student_id: Student identifier

        Returns:
            Created sync session
        """
        session = SyncSession(
            session_id=str(uuid4()),
            student_id=student_id,
            start_time=datetime.utcnow(),
            status=SyncStatus.PENDING,
        )

        item = {
            "sessionId": session.session_id,
            "studentId": session.student_id,
            "startTime": session.start_time.isoformat(),
            "status": session.status.value,
        }

        self.table.put_item(Item=item)
        return session

    def get_session(self, session_id: str) -> Optional[SyncSession]:
        """
        Get sync session by ID.

        Args:
            session_id: Session identifier

        Returns:
            Sync session or None if not found
        """
        try:
            response = self.table.get_item(Key={"sessionId": session_id})
            item = response.get("Item")

            if not item:
                return None

            return self._item_to_session(item)

        except ClientError:
            return None

    def update_session_status(
        self,
        session_id: str,
        status: SyncStatus,
        error_message: Optional[str] = None,
    ) -> None:
        """
        Update sync session status.

        Args:
            session_id: Session identifier
            status: New status
            error_message: Optional error message
        """
        update_expr = "SET #status = :status"
        expr_attr_names = {"#status": "status"}
        expr_attr_values = {":status": status.value}

        if status in [SyncStatus.COMPLETE, SyncStatus.FAILED]:
            update_expr += ", endTime = :endTime"
            expr_attr_values[":endTime"] = datetime.utcnow().isoformat()

        if error_message:
            update_expr += ", errorMessage = :errorMessage"
            expr_attr_values[":errorMessage"] = error_message

        self.table.update_item(
            Key={"sessionId": session_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_attr_names,
            ExpressionAttributeValues=expr_attr_values,
        )

    def update_upload_data(
        self, session_id: str, upload_data: SyncUploadData
    ) -> None:
        """
        Update sync session with upload data.

        Args:
            session_id: Session identifier
            upload_data: Upload data
        """
        self.table.update_item(
            Key={"sessionId": session_id},
            UpdateExpression="SET upload = :upload, #status = :status",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":upload": {
                    "performanceLogs": upload_data.performance_logs,
                    "compressedSize": upload_data.compressed_size,
                    "checksum": upload_data.checksum,
                },
                ":status": SyncStatus.UPLOADING.value,
            },
        )

    def update_download_data(
        self, session_id: str, download_data: SyncDownloadData
    ) -> None:
        """
        Update sync session with download data.

        Args:
            session_id: Session identifier
            download_data: Download data
        """
        self.table.update_item(
            Key={"sessionId": session_id},
            UpdateExpression="SET download = :download, #status = :status",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":download": {
                    "bundleUrl": download_data.bundle_url,
                    "bundleSize": download_data.bundle_size,
                    "checksum": download_data.checksum,
                },
                ":status": SyncStatus.DOWNLOADING.value,
            },
        )

    def update_checkpoint(self, session_id: str, checkpoint: dict) -> None:
        """
        Update sync session checkpoint for resume capability.

        Args:
            session_id: Session identifier
            checkpoint: Checkpoint data
        """
        self.table.update_item(
            Key={"sessionId": session_id},
            UpdateExpression="SET checkpoint = :checkpoint",
            ExpressionAttributeValues={":checkpoint": checkpoint},
        )

    def get_latest_session_for_student(
        self, student_id: str
    ) -> Optional[SyncSession]:
        """
        Get the latest sync session for a student.

        Args:
            student_id: Student identifier

        Returns:
            Latest sync session or None
        """
        try:
            response = self.table.query(
                IndexName="StudentIdIndex",
                KeyConditionExpression="studentId = :studentId",
                ExpressionAttributeValues={":studentId": student_id},
                ScanIndexForward=False,  # Descending order
                Limit=1,
            )

            items = response.get("Items", [])
            if not items:
                return None

            return self._item_to_session(items[0])

        except ClientError:
            return None

    def _item_to_session(self, item: dict) -> SyncSession:
        """
        Convert DynamoDB item to SyncSession.

        Args:
            item: DynamoDB item

        Returns:
            SyncSession object
        """
        upload_data = None
        if "upload" in item:
            upload = item["upload"]
            upload_data = SyncUploadData(
                performance_logs=upload.get("performanceLogs", []),
                compressed_size=upload.get("compressedSize", 0),
                checksum=upload.get("checksum", ""),
            )

        download_data = None
        if "download" in item:
            download = item["download"]
            download_data = SyncDownloadData(
                bundle_url=download.get("bundleUrl", ""),
                bundle_size=download.get("bundleSize", 0),
                checksum=download.get("checksum", ""),
            )

        return SyncSession(
            session_id=item["sessionId"],
            student_id=item["studentId"],
            start_time=datetime.fromisoformat(item["startTime"]),
            end_time=datetime.fromisoformat(item["endTime"])
            if "endTime" in item
            else None,
            status=SyncStatus(item["status"]),
            upload=upload_data,
            download=download_data,
            error_message=item.get("errorMessage"),
            checkpoint=item.get("checkpoint"),
        )
