"""DynamoDB repository for bundle metadata storage."""

import logging
from datetime import datetime
from typing import Optional

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class BundleMetadataRepository:
    """Repository for storing and querying bundle metadata in DynamoDB."""

    def __init__(
        self,
        table_name: str,
        region: str = "us-east-1",
        dynamodb_resource: Optional[boto3.resource] = None,
    ):
        """
        Initialize bundle metadata repository.

        Args:
            table_name: DynamoDB table name
            region: AWS region
            dynamodb_resource: Optional boto3 DynamoDB resource (for testing)
        """
        self.table_name = table_name
        self.region = region
        self.dynamodb = dynamodb_resource or boto3.resource("dynamodb", region_name=region)
        self.table = self.dynamodb.Table(table_name)

    def create_bundle_metadata(
        self,
        bundle_id: str,
        student_id: str,
        s3_key: str,
        total_size: int,
        checksum: str,
        valid_from: datetime,
        valid_until: datetime,
        subjects: list[str],
        additional_metadata: Optional[dict] = None,
    ) -> dict:
        """
        Store bundle metadata in DynamoDB.

        Args:
            bundle_id: Unique bundle identifier
            student_id: Student identifier
            s3_key: S3 object key
            total_size: Bundle size in bytes
            checksum: SHA-256 checksum
            valid_from: Bundle validity start
            valid_until: Bundle validity end
            subjects: List of subjects in bundle
            additional_metadata: Optional additional metadata

        Returns:
            Stored metadata dictionary

        Raises:
            Exception: If storage fails
        """
        item = {
            "bundle_id": bundle_id,
            "student_id": student_id,
            "s3_key": s3_key,
            "total_size": total_size,
            "checksum": checksum,
            "valid_from": valid_from.isoformat(),
            "valid_until": valid_until.isoformat(),
            "subjects": subjects,
            "created_at": datetime.utcnow().isoformat(),
            "status": "active",
        }

        if additional_metadata:
            item.update(additional_metadata)

        try:
            self.table.put_item(Item=item)
            logger.info(f"Stored metadata for bundle {bundle_id}")
            return item

        except ClientError as e:
            logger.error(f"Failed to store bundle metadata: {e}")
            raise Exception(f"DynamoDB put_item failed: {e}")

    def get_bundle_metadata(self, bundle_id: str) -> Optional[dict]:
        """
        Retrieve bundle metadata by ID.

        Args:
            bundle_id: Bundle identifier

        Returns:
            Bundle metadata dictionary or None if not found

        Raises:
            Exception: If retrieval fails
        """
        try:
            response = self.table.get_item(Key={"bundle_id": bundle_id})

            if "Item" in response:
                logger.info(f"Retrieved metadata for bundle {bundle_id}")
                return response["Item"]
            else:
                logger.warning(f"Bundle {bundle_id} not found")
                return None

        except ClientError as e:
            logger.error(f"Failed to get bundle metadata: {e}")
            raise Exception(f"DynamoDB get_item failed: {e}")

    def get_active_bundles_by_student(self, student_id: str) -> list[dict]:
        """
        Query active bundles for a student.

        Args:
            student_id: Student identifier

        Returns:
            List of active bundle metadata dictionaries

        Raises:
            Exception: If query fails
        """
        try:
            # Query using GSI on student_id
            response = self.table.query(
                IndexName="StudentIdIndex",
                KeyConditionExpression="student_id = :sid",
                FilterExpression="status = :status",
                ExpressionAttributeValues={
                    ":sid": student_id,
                    ":status": "active",
                },
            )

            bundles = response.get("Items", [])
            logger.info(f"Found {len(bundles)} active bundles for student {student_id}")
            return bundles

        except ClientError as e:
            logger.error(f"Failed to query bundles by student: {e}")
            raise Exception(f"DynamoDB query failed: {e}")

    def get_all_bundles_by_student(self, student_id: str) -> list[dict]:
        """
        Query all bundles for a student (active and archived).

        Args:
            student_id: Student identifier

        Returns:
            List of all bundle metadata dictionaries

        Raises:
            Exception: If query fails
        """
        try:
            response = self.table.query(
                IndexName="StudentIdIndex",
                KeyConditionExpression="student_id = :sid",
                ExpressionAttributeValues={":sid": student_id},
            )

            bundles = response.get("Items", [])
            logger.info(f"Found {len(bundles)} total bundles for student {student_id}")
            return bundles

        except ClientError as e:
            logger.error(f"Failed to query all bundles by student: {e}")
            raise Exception(f"DynamoDB query failed: {e}")

    def update_bundle_status(self, bundle_id: str, status: str) -> dict:
        """
        Update bundle status.

        Args:
            bundle_id: Bundle identifier
            status: New status (e.g., 'active', 'archived', 'expired')

        Returns:
            Updated metadata dictionary

        Raises:
            Exception: If update fails
        """
        try:
            response = self.table.update_item(
                Key={"bundle_id": bundle_id},
                UpdateExpression="SET status = :status, updated_at = :updated",
                ExpressionAttributeValues={
                    ":status": status,
                    ":updated": datetime.utcnow().isoformat(),
                },
                ReturnValues="ALL_NEW",
            )

            logger.info(f"Updated bundle {bundle_id} status to {status}")
            return response["Attributes"]

        except ClientError as e:
            logger.error(f"Failed to update bundle status: {e}")
            raise Exception(f"DynamoDB update_item failed: {e}")

    def delete_bundle_metadata(self, bundle_id: str) -> None:
        """
        Delete bundle metadata.

        Args:
            bundle_id: Bundle identifier

        Raises:
            Exception: If deletion fails
        """
        try:
            self.table.delete_item(Key={"bundle_id": bundle_id})
            logger.info(f"Deleted metadata for bundle {bundle_id}")

        except ClientError as e:
            logger.error(f"Failed to delete bundle metadata: {e}")
            raise Exception(f"DynamoDB delete_item failed: {e}")

    def get_expired_bundles(self, current_time: Optional[datetime] = None) -> list[dict]:
        """
        Scan for expired bundles.

        Args:
            current_time: Current time for comparison (defaults to now)

        Returns:
            List of expired bundle metadata dictionaries

        Raises:
            Exception: If scan fails
        """
        if current_time is None:
            current_time = datetime.utcnow()

        try:
            response = self.table.scan(
                FilterExpression="valid_until < :now AND status = :status",
                ExpressionAttributeValues={
                    ":now": current_time.isoformat(),
                    ":status": "active",
                },
            )

            bundles = response.get("Items", [])
            logger.info(f"Found {len(bundles)} expired bundles")
            return bundles

        except ClientError as e:
            logger.error(f"Failed to scan for expired bundles: {e}")
            raise Exception(f"DynamoDB scan failed: {e}")

    def batch_update_bundle_status(self, bundle_ids: list[str], status: str) -> int:
        """
        Batch update status for multiple bundles.

        Args:
            bundle_ids: List of bundle identifiers
            status: New status

        Returns:
            Number of bundles updated

        Raises:
            Exception: If batch update fails
        """
        updated_count = 0

        try:
            for bundle_id in bundle_ids:
                self.update_bundle_status(bundle_id, status)
                updated_count += 1

            logger.info(f"Batch updated {updated_count} bundles to status {status}")
            return updated_count

        except Exception as e:
            logger.error(f"Failed to batch update bundles: {e}")
            raise

    def get_bundle_statistics(self, student_id: str) -> dict:
        """
        Get bundle statistics for a student.

        Args:
            student_id: Student identifier

        Returns:
            Dictionary with statistics (total_bundles, active_bundles, total_size)

        Raises:
            Exception: If query fails
        """
        try:
            bundles = self.get_all_bundles_by_student(student_id)

            active_bundles = [b for b in bundles if b.get("status") == "active"]
            total_size = sum(b.get("total_size", 0) for b in bundles)

            stats = {
                "total_bundles": len(bundles),
                "active_bundles": len(active_bundles),
                "total_size": total_size,
                "subjects": list(
                    set(
                        subject
                        for bundle in bundles
                        for subject in bundle.get("subjects", [])
                    )
                ),
            }

            logger.info(f"Calculated statistics for student {student_id}: {stats}")
            return stats

        except Exception as e:
            logger.error(f"Failed to calculate bundle statistics: {e}")
            raise
