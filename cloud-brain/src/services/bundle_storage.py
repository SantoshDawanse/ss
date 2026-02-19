"""S3 storage service for learning bundles."""

import logging
from datetime import datetime, timedelta
from typing import Optional

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class BundleStorage:
    """Service for storing and retrieving learning bundles from S3."""

    def __init__(
        self,
        bucket_name: str,
        region: str = "us-east-1",
        s3_client: Optional[boto3.client] = None,
    ):
        """
        Initialize bundle storage.

        Args:
            bucket_name: S3 bucket name for bundle storage
            region: AWS region
            s3_client: Optional boto3 S3 client (for testing)
        """
        self.bucket_name = bucket_name
        self.region = region
        self.s3_client = s3_client or boto3.client("s3", region_name=region)

    def upload_bundle(
        self,
        bundle_id: str,
        student_id: str,
        compressed_data: bytes,
        metadata: Optional[dict] = None,
    ) -> str:
        """
        Upload compressed bundle to S3.

        Args:
            bundle_id: Unique bundle identifier
            student_id: Student identifier
            compressed_data: Compressed bundle bytes
            metadata: Optional metadata to attach to S3 object

        Returns:
            S3 object key

        Raises:
            Exception: If upload fails
        """
        # Construct S3 key: students/{student_id}/bundles/{bundle_id}.bundle
        s3_key = f"students/{student_id}/bundles/{bundle_id}.bundle"

        # Prepare metadata
        s3_metadata = metadata or {}
        s3_metadata.update(
            {
                "bundle-id": bundle_id,
                "student-id": student_id,
                "upload-timestamp": datetime.utcnow().isoformat(),
            }
        )

        try:
            # Upload to S3
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=compressed_data,
                Metadata=s3_metadata,
                ContentType="application/octet-stream",
                ServerSideEncryption="AES256",  # Enable server-side encryption
            )

            logger.info(
                f"Uploaded bundle {bundle_id} for student {student_id} to S3: {s3_key}"
            )
            return s3_key

        except ClientError as e:
            logger.error(f"Failed to upload bundle to S3: {e}")
            raise Exception(f"S3 upload failed: {e}")

    def generate_presigned_url(
        self, s3_key: str, expiration: int = 3600
    ) -> str:
        """
        Generate presigned URL for bundle download.

        Args:
            s3_key: S3 object key
            expiration: URL expiration time in seconds (default: 1 hour)

        Returns:
            Presigned URL for download

        Raises:
            Exception: If URL generation fails
        """
        try:
            url = self.s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": s3_key},
                ExpiresIn=expiration,
            )

            logger.info(f"Generated presigned URL for {s3_key}, expires in {expiration}s")
            return url

        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            raise Exception(f"Presigned URL generation failed: {e}")

    def download_bundle(self, s3_key: str) -> bytes:
        """
        Download bundle from S3.

        Args:
            s3_key: S3 object key

        Returns:
            Bundle data as bytes

        Raises:
            Exception: If download fails
        """
        try:
            response = self.s3_client.get_object(Bucket=self.bucket_name, Key=s3_key)
            data = response["Body"].read()

            logger.info(f"Downloaded bundle from S3: {s3_key}")
            return data

        except ClientError as e:
            logger.error(f"Failed to download bundle from S3: {e}")
            raise Exception(f"S3 download failed: {e}")

    def delete_bundle(self, s3_key: str) -> None:
        """
        Delete bundle from S3.

        Args:
            s3_key: S3 object key

        Raises:
            Exception: If deletion fails
        """
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=s3_key)

            logger.info(f"Deleted bundle from S3: {s3_key}")

        except ClientError as e:
            logger.error(f"Failed to delete bundle from S3: {e}")
            raise Exception(f"S3 deletion failed: {e}")

    def list_student_bundles(self, student_id: str) -> list[dict]:
        """
        List all bundles for a student.

        Args:
            student_id: Student identifier

        Returns:
            List of bundle metadata dictionaries

        Raises:
            Exception: If listing fails
        """
        prefix = f"students/{student_id}/bundles/"

        try:
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name, Prefix=prefix
            )

            bundles = []
            if "Contents" in response:
                for obj in response["Contents"]:
                    bundles.append(
                        {
                            "key": obj["Key"],
                            "size": obj["Size"],
                            "last_modified": obj["LastModified"],
                            "etag": obj["ETag"],
                        }
                    )

            logger.info(f"Listed {len(bundles)} bundles for student {student_id}")
            return bundles

        except ClientError as e:
            logger.error(f"Failed to list bundles from S3: {e}")
            raise Exception(f"S3 listing failed: {e}")

    def setup_lifecycle_policy(self, days_to_expire: int = 90) -> None:
        """
        Set up S3 lifecycle policy to automatically delete old bundles.

        Args:
            days_to_expire: Number of days before bundles expire (default: 90)

        Raises:
            Exception: If policy setup fails
        """
        lifecycle_policy = {
            "Rules": [
                {
                    "Id": "DeleteOldBundles",
                    "Status": "Enabled",
                    "Prefix": "students/",
                    "Expiration": {"Days": days_to_expire},
                    "NoncurrentVersionExpiration": {"NoncurrentDays": 30},
                }
            ]
        }

        try:
            self.s3_client.put_bucket_lifecycle_configuration(
                Bucket=self.bucket_name, LifecycleConfiguration=lifecycle_policy
            )

            logger.info(
                f"Set up lifecycle policy for bucket {self.bucket_name}: "
                f"expire after {days_to_expire} days"
            )

        except ClientError as e:
            logger.error(f"Failed to set up lifecycle policy: {e}")
            raise Exception(f"Lifecycle policy setup failed: {e}")

    def get_bundle_metadata(self, s3_key: str) -> dict:
        """
        Get bundle metadata from S3 object.

        Args:
            s3_key: S3 object key

        Returns:
            Dictionary of metadata

        Raises:
            Exception: If metadata retrieval fails
        """
        try:
            response = self.s3_client.head_object(Bucket=self.bucket_name, Key=s3_key)

            metadata = {
                "size": response["ContentLength"],
                "last_modified": response["LastModified"],
                "etag": response["ETag"],
                "metadata": response.get("Metadata", {}),
            }

            logger.info(f"Retrieved metadata for {s3_key}")
            return metadata

        except ClientError as e:
            logger.error(f"Failed to get bundle metadata: {e}")
            raise Exception(f"Metadata retrieval failed: {e}")
