"""Service for generating learning bundles."""

import logging
from typing import Optional

from src.models.content import LearningBundle
from src.models.personalization import KnowledgeModel, PerformanceLog
from src.repositories.bundle_metadata_repository import BundleMetadataRepository
from src.services.bedrock_agent import BedrockAgentService
from src.services.bundle_packager import BundlePackager
from src.services.bundle_storage import BundleStorage

logger = logging.getLogger(__name__)


class BundleGenerator:
    """Service for generating complete learning bundles."""

    def __init__(self):
        """Initialize bundle generator."""
        self.bedrock_agent = BedrockAgentService()
        self.bundle_packager = BundlePackager()
        self.bundle_storage = BundleStorage()
        self.bundle_metadata_repo = BundleMetadataRepository()

    def generate_bundle(
        self,
        student_id: str,
        knowledge_model: Optional[KnowledgeModel],
        performance_logs: list[dict],
        bundle_duration: int = 2,  # weeks
        subjects: Optional[list[str]] = None,
    ) -> LearningBundle:
        """
        Generate a complete learning bundle for a student.

        Args:
            student_id: Student identifier
            knowledge_model: Current knowledge model (None for new students)
            performance_logs: Recent performance logs
            bundle_duration: Bundle duration in weeks
            subjects: Subjects to include (default: Mathematics)

        Returns:
            Generated learning bundle with metadata
        """
        logger.info(f"Generating bundle for student {student_id}")

        # Default to Mathematics for MVP
        if not subjects:
            subjects = ["Mathematics"]

        # Generate content using Bedrock Agent
        try:
            content = self.bedrock_agent.generate_learning_content(
                student_id=student_id,
                knowledge_model=knowledge_model,
                performance_logs=performance_logs,
                bundle_duration=bundle_duration,
                subjects=subjects,
            )
            logger.info(f"Generated content for {len(subjects)} subjects")
        except Exception as e:
            logger.error(f"Content generation failed: {str(e)}")
            raise

        # Package content into compressed bundle
        try:
            bundle_data = self.bundle_packager.package_bundle(
                student_id=student_id,
                content=content,
                bundle_duration=bundle_duration,
            )
            logger.info(f"Packaged bundle: {bundle_data.total_size} bytes")
        except Exception as e:
            logger.error(f"Bundle packaging failed: {str(e)}")
            raise

        # Upload to S3 and get presigned URL
        try:
            presigned_url = self.bundle_storage.upload_bundle(
                bundle_id=bundle_data.bundle_id,
                student_id=student_id,
                bundle_bytes=bundle_data.compressed_data,
            )
            logger.info(f"Uploaded bundle to S3: {bundle_data.bundle_id}")
        except Exception as e:
            logger.error(f"Bundle upload failed: {str(e)}")
            raise

        # Save metadata to DynamoDB
        try:
            bundle_metadata = LearningBundle(
                bundle_id=bundle_data.bundle_id,
                student_id=student_id,
                valid_from=bundle_data.valid_from,
                valid_until=bundle_data.valid_until,
                subjects=content.subjects,
                total_size=bundle_data.total_size,
                checksum=bundle_data.checksum,
                presigned_url=presigned_url,
            )
            
            self.bundle_metadata_repo.save_bundle_metadata(bundle_metadata)
            logger.info(f"Saved bundle metadata: {bundle_data.bundle_id}")
        except Exception as e:
            logger.error(f"Failed to save bundle metadata: {str(e)}")
            raise

        return bundle_metadata
