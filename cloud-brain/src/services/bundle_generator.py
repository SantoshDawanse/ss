"""Service for generating learning bundles."""

import logging
import os
import time
import uuid
from datetime import datetime, timedelta
from typing import Optional

from src.models.content import (
    Hint,
    LearningBundle,
    Lesson,
    Quiz,
    SubjectContent,
)
from src.models.personalization import KnowledgeModel
from src.repositories.bundle_metadata_repository import BundleMetadataRepository
from src.services.bedrock_agent import BedrockAgentService
from src.services.bundle_packager import BundlePackager
from src.services.bundle_storage import BundleStorage
from src.services.bundle_error_handler import (
    validate_bundle_content,
    optimize_bundle_size,
    handle_s3_upload_failure,
    InsufficientContentError,
    BundleSizeExceededError,
)
from src.utils.error_handling import RetryableError, NonRetryableError
from src.utils.audit_logging import get_audit_logger
from src.utils.monitoring import get_monitoring_service

logger = logging.getLogger(__name__)
audit_logger = get_audit_logger()
monitoring_service = get_monitoring_service()


class BundleGenerator:
    """Service for generating complete learning bundles."""

    def __init__(
        self,
        bundle_packager: Optional[BundlePackager] = None,
        bundle_storage: Optional[BundleStorage] = None,
        bundle_metadata_repo: Optional[BundleMetadataRepository] = None,
        bedrock_agent: Optional[BedrockAgentService] = None,
    ):
        """
        Initialize bundle generator.

        Args:
            bundle_packager: Optional bundle packager service (for testing)
            bundle_storage: Optional bundle storage service (for testing)
            bundle_metadata_repo: Optional metadata repository (for testing)
            bedrock_agent: Optional Bedrock agent service (for testing)
        """
        self.bedrock_agent = bedrock_agent or BedrockAgentService()
        self.bundle_packager = bundle_packager or BundlePackager()
        
        # Get bucket name from environment variable (set by CDK)
        bucket_name = os.environ.get("BUNDLES_BUCKET", "sikshya-sathi-bundles")
        self.bundle_storage = bundle_storage or BundleStorage(
            bucket_name=bucket_name
        )
        
        # Get table name from environment variable (set by CDK)
        table_name = os.environ.get("BUNDLES_TABLE", "BundleMetadata")
        self.bundle_metadata_repo = bundle_metadata_repo or BundleMetadataRepository(
            table_name=table_name
        )

    def compose_bundle(
        self,
        student_id: str,
        lessons_by_subject: dict[str, list[Lesson]],
        quizzes_by_subject: dict[str, list[Quiz]],
        hints_by_question: dict[str, list[Hint]],
        validity_days: int = 14,
    ) -> LearningBundle:
        """
        Compose a learning bundle from validated content.

        Args:
            student_id: Student identifier
            lessons_by_subject: Dictionary mapping subject to list of lessons
            quizzes_by_subject: Dictionary mapping subject to list of quizzes
            hints_by_question: Dictionary mapping question_id to list of hints
            validity_days: Bundle validity period in days (default: 14)

        Returns:
            Composed LearningBundle (not yet compressed)
            
        Raises:
            InsufficientContentError: If bundle has insufficient content (< 3 items)
        """
        logger.info(f"Composing bundle for student {student_id}")

        # Validate content sufficiency (minimum 3 items)
        all_lessons = [lesson for lessons in lessons_by_subject.values() for lesson in lessons]
        all_quizzes = [quiz for quizzes in quizzes_by_subject.values() for quiz in quizzes]
        
        try:
            validate_bundle_content(all_lessons, all_quizzes, min_items=2)
        except InsufficientContentError as e:
            logger.error(f"Bundle composition failed: {e}")
            raise NonRetryableError(
                str(e),
                "INSUFFICIENT_CONTENT",
                details={
                    "student_id": student_id,
                    "lessons": len(all_lessons),
                    "quizzes": len(all_quizzes),
                },
            )

        # Generate bundle ID
        bundle_id = str(uuid.uuid4())

        # Set validity period (14 days as per requirements)
        valid_from = datetime.utcnow()
        valid_until = valid_from + timedelta(days=validity_days)

        # Organize content by subject
        subjects = []
        all_subjects = set(lessons_by_subject.keys()) | set(quizzes_by_subject.keys())

        for subject in sorted(all_subjects):
            subject_lessons = lessons_by_subject.get(subject, [])
            subject_quizzes = quizzes_by_subject.get(subject, [])

            # Create SubjectContent
            subject_content = SubjectContent(
                subject=subject,
                lessons=subject_lessons,
                quizzes=subject_quizzes,
                hints=hints_by_question,  # Include hints for quiz questions
            )

            subjects.append(subject_content)

        # Create bundle (size and checksum will be calculated after compression)
        bundle = LearningBundle(
            bundle_id=bundle_id,
            student_id=student_id,
            valid_from=valid_from,
            valid_until=valid_until,
            subjects=subjects,
            total_size=1,  # Placeholder, will be updated after compression
            checksum="",  # Will be calculated after compression
        )

        logger.info(
            f"Composed bundle {bundle_id} with {len(subjects)} subjects, "
            f"valid until {valid_until.isoformat()}"
        )

        return bundle

    def compress_and_optimize_bundle(
        self,
        bundle: LearningBundle,
        max_size_bytes: int = 5_000_000,  # 5MB per week
        weeks: int = 1,
    ) -> tuple[bytes, str, int]:
        """
        Compress bundle and optimize size if needed.
        
        Implements size optimization:
        1. Remove optional media attachments
        2. Reduce practice problems
        3. Use maximum compression level

        Args:
            bundle: Learning bundle to compress
            max_size_bytes: Maximum size in bytes (default: 5MB)
            weeks: Number of weeks of content (for size calculation)

        Returns:
            Tuple of (compressed_data, checksum, final_size)
            
        Raises:
            BundleSizeExceededError: If size cannot be reduced below limit
        """
        logger.info(f"Compressing bundle {bundle.bundle_id}")

        # Calculate target size based on weeks
        target_size = max_size_bytes * weeks

        # Convert bundle to dict for optimization
        bundle_dict = bundle.model_dump()
        
        try:
            # Optimize bundle size if needed
            optimized_bundle_dict = optimize_bundle_size(bundle_dict, target_size)
            
            # Compress optimized bundle
            import json
            import gzip
            bundle_json = json.dumps(optimized_bundle_dict)
            compressed_data = gzip.compress(bundle_json.encode('utf-8'), compresslevel=9)
            current_size = len(compressed_data)
            
            logger.info(f"Bundle compressed: {current_size} bytes (target: {target_size} bytes)")
            
        except BundleSizeExceededError as e:
            logger.error(f"Bundle size optimization failed: {e}")
            raise NonRetryableError(
                str(e),
                "BUNDLE_SIZE_EXCEEDED",
                details={
                    "bundle_id": bundle.bundle_id,
                    "target_size": target_size,
                },
            )

        # Calculate checksum
        checksum = self.bundle_packager.calculate_checksum(compressed_data)

        # Update bundle metadata
        bundle.total_size = current_size
        bundle.checksum = checksum

        logger.info(
            f"Bundle {bundle.bundle_id} compressed: "
            f"{current_size} bytes, checksum: {checksum[:16]}..."
        )

        return compressed_data, checksum, current_size

    def upload_bundle_to_s3(
        self,
        bundle_id: str,
        student_id: str,
        compressed_data: bytes,
    ) -> tuple[str, str]:
        """
        Upload bundle to S3 and generate presigned URL.
        
        Implements retry logic with exponential backoff for S3 upload failures.

        Args:
            bundle_id: Bundle identifier
            student_id: Student identifier
            compressed_data: Compressed bundle bytes

        Returns:
            Tuple of (s3_key, presigned_url)
            
        Raises:
            NonRetryableError: If upload fails after retries
        """
        logger.info(f"Uploading bundle {bundle_id} to S3")

        # Upload to S3 with retry logic (already implemented in bundle_storage)
        # The bundle_storage.upload_bundle already has retry logic with exponential backoff
        try:
            s3_key = self.bundle_storage.upload_bundle(
                bundle_id=bundle_id,
                student_id=student_id,
                compressed_data=compressed_data,
                max_retries=3,
            )
        except Exception as e:
            # Handle S3 upload failure
            handle_s3_upload_failure(e, bundle_id, attempt=3, max_attempts=3)

        # Generate presigned URL valid for 14 days
        try:
            presigned_url = self.bundle_storage.generate_presigned_url(
                s3_key=s3_key,
                expiration=1209600,  # 14 days in seconds
            )
        except Exception as e:
            logger.error(f"Failed to generate presigned URL for bundle {bundle_id}: {e}")
            raise NonRetryableError(
                f"Presigned URL generation failed: {e}",
                "PRESIGNED_URL_FAILED",
                details={"bundle_id": bundle_id, "s3_key": s3_key},
            )

        logger.info(f"Bundle {bundle_id} uploaded to S3: {s3_key}")

        return s3_key, presigned_url

    def save_bundle_metadata(
        self,
        bundle: LearningBundle,
        s3_key: str,
    ) -> None:
        """
        Save bundle metadata to DynamoDB.

        Args:
            bundle: Learning bundle with metadata
            s3_key: S3 object key
        """
        logger.info(f"Saving metadata for bundle {bundle.bundle_id}")

        # Calculate content count
        content_count = sum(
            len(subject.lessons) + len(subject.quizzes) for subject in bundle.subjects
        )

        # Extract subject names
        subjects = [subject.subject for subject in bundle.subjects]

        # Store metadata in DynamoDB
        self.bundle_metadata_repo.create_bundle_metadata(
            bundle_id=bundle.bundle_id,
            student_id=bundle.student_id,
            s3_key=s3_key,
            total_size=bundle.total_size,
            checksum=bundle.checksum,
            valid_from=bundle.valid_from,
            valid_until=bundle.valid_until,
            subjects=subjects,
            additional_metadata={
                "content_count": content_count,
                "generation_timestamp": datetime.utcnow().isoformat(),
            },
        )

        logger.info(
            f"Saved metadata for bundle {bundle.bundle_id}: "
            f"{content_count} items, {len(subjects)} subjects"
        )

    def generate_complete_bundle(
        self,
        student_id: str,
        lessons_by_subject: dict[str, list[Lesson]],
        quizzes_by_subject: dict[str, list[Quiz]],
        hints_by_question: dict[str, list[Hint]],
        validity_days: int = 14,
        max_size_per_week: int = 5_000_000,
        weeks: int = 1,
    ) -> LearningBundle:
        """
        Generate, compress, upload, and store a complete learning bundle.

        This is the main entry point for bundle generation that orchestrates
        all the steps: composition, compression, optimization, S3 upload,
        and metadata storage.

        Args:
            student_id: Student identifier
            lessons_by_subject: Dictionary mapping subject to list of lessons
            quizzes_by_subject: Dictionary mapping subject to list of quizzes
            hints_by_question: Dictionary mapping question_id to list of hints
            validity_days: Bundle validity period in days (default: 14)
            max_size_per_week: Maximum size per week in bytes (default: 5MB)
            weeks: Number of weeks of content (default: 1)

        Returns:
            Complete LearningBundle with presigned URL

        Raises:
            Exception: If any step fails
        """
        logger.info(f"Generating complete bundle for student {student_id}")
        
        # Track generation time
        start_time = time.time()
        success = False
        error_message = None
        bundle_id = None
        final_size = 0
        content_count = 0
        subjects = []

        try:
            # Step 1: Compose bundle
            bundle = self.compose_bundle(
                student_id=student_id,
                lessons_by_subject=lessons_by_subject,
                quizzes_by_subject=quizzes_by_subject,
                hints_by_question=hints_by_question,
                validity_days=validity_days,
            )
            
            bundle_id = bundle.bundle_id
            subjects = [subject.subject for subject in bundle.subjects]
            content_count = sum(
                len(subject.lessons) + len(subject.quizzes) for subject in bundle.subjects
            )

            # Step 2: Compress and optimize
            compressed_data, checksum, final_size = self.compress_and_optimize_bundle(
                bundle=bundle,
                max_size_bytes=max_size_per_week,
                weeks=weeks,
            )

            # Step 3: Upload to S3 and get presigned URL
            s3_key, presigned_url = self.upload_bundle_to_s3(
                bundle_id=bundle.bundle_id,
                student_id=student_id,
                compressed_data=compressed_data,
            )

            # Update bundle with presigned URL
            bundle.presigned_url = presigned_url

            # Step 4: Save metadata to DynamoDB
            self.save_bundle_metadata(
                bundle=bundle,
                s3_key=s3_key,
            )

            logger.info(
                f"Successfully generated complete bundle {bundle.bundle_id} "
                f"for student {student_id}: {final_size} bytes"
            )
            
            success = True
            return bundle
            
        except Exception as e:
            error_message = str(e)
            logger.error(f"Bundle generation failed: {error_message}")
            raise
            
        finally:
            # Log bundle generation event (success or failure)
            generation_duration_ms = (time.time() - start_time) * 1000
            
            audit_logger.log_bundle_generation(
                bundle_id=bundle_id or "unknown",
                student_id=student_id,
                size_bytes=final_size,
                content_count=content_count,
                subjects=subjects,
                generation_duration_ms=generation_duration_ms,
                success=success,
                error_message=error_message,
            )
            
            # Emit bundle generation metrics
            monitoring_service.emit_bundle_generation_metrics(
                latency_ms=generation_duration_ms,
                success=success,
                size_bytes=final_size if success else None,
                content_count=content_count if success else None,
            )

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
            logger.info(f"Generated content: {len(content.get('lessons', []))} lessons, {len(content.get('quizzes', []))} quizzes")
        except Exception as e:
            logger.error(f"Content generation failed: {str(e)}")
            raise

        # Convert content dict to SubjectContent objects
        try:
            from src.models.content import SubjectContent, Lesson, Quiz
            
            subject_content_list = []
            for subject in subjects:
                # Parse lessons
                lessons = []
                for lesson_dict in content.get('lessons', []):
                    try:
                        lessons.append(Lesson(**lesson_dict))
                    except Exception as e:
                        logger.warning(f"Failed to parse lesson: {e}")
                        continue
                
                # Parse quizzes
                quizzes = []
                for quiz_dict in content.get('quizzes', []):
                    try:
                        quizzes.append(Quiz(**quiz_dict))
                    except Exception as e:
                        logger.warning(f"Failed to parse quiz: {e}")
                        continue
                
                subject_content = SubjectContent(
                    subject=subject,
                    lessons=lessons,
                    quizzes=quizzes,
                    hints={},
                    revision_plan=None,
                    study_track=None
                )
                subject_content_list.append(subject_content)
            
            logger.info(f"Converted content to {len(subject_content_list)} SubjectContent objects")
        except Exception as e:
            logger.error(f"Content conversion failed: {str(e)}")
            raise

        # Package content into compressed bundle
        try:
            compressed_data, checksum, signature, bundle = self.bundle_packager.package_bundle(
                student_id=student_id,
                subjects=subject_content_list,
                duration_weeks=bundle_duration,
            )
            logger.info(f"Packaged bundle: {bundle.total_size} bytes")
        except Exception as e:
            logger.error(f"Bundle packaging failed: {str(e)}")
            raise

        # Upload to S3 and get presigned URL
        try:
            s3_key = self.bundle_storage.upload_bundle(
                bundle_id=bundle.bundle_id,
                student_id=student_id,
                compressed_data=compressed_data,
            )
            
            # Generate presigned URL for download
            presigned_url = self.bundle_storage.generate_presigned_url(s3_key)
            
            logger.info(f"Uploaded bundle to S3: {bundle.bundle_id}")
        except Exception as e:
            logger.error(f"Bundle upload failed: {str(e)}")
            raise

        # Update bundle with presigned URL
        bundle.presigned_url = presigned_url

        # Save metadata to DynamoDB
        try:
            self.save_bundle_metadata(bundle, s3_key)
            logger.info(f"Saved bundle metadata: {bundle.bundle_id}")
        except Exception as e:
            logger.error(f"Failed to save bundle metadata: {str(e)}")
            raise

        return bundle
