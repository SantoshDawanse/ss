"""Lambda handlers for sync API endpoints."""

import gzip
import hashlib
import json
import logging
import traceback
from datetime import datetime
from typing import Any

from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext

from src.models.personalization import PerformanceLog
from src.models.sync import (
    SyncUploadRequest,
    SyncUploadResponse,
    SyncDownloadResponse,
    SyncStatus,
    SyncUploadData,
)
from src.repositories.knowledge_model_repository import KnowledgeModelRepository
from src.repositories.sync_session_repository import SyncSessionRepository
from src.services.personalization_engine import PersonalizationEngine
from src.utils.auth import authenticate_request, AuthError
from src.utils.error_handling import (
    ErrorCode,
    create_error_response,
    exponential_backoff_retry,
)
from src.utils.monitoring import (
    get_monitoring_service,
    LatencyTimer,
    MetricName,
)

logger = Logger()


def _create_response(status_code: int, body: dict) -> dict:
    """
    Create API Gateway response.

    Args:
        status_code: HTTP status code
        body: Response body

    Returns:
        API Gateway response dict
    """
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps(body),
    }


def _create_error_response(status_code: int, message: str, error_code: str = None) -> dict:
    """
    Create structured error response.

    Args:
        status_code: HTTP status code
        message: Error message
        error_code: Optional error code

    Returns:
        API Gateway error response with structured format
    """
    error_resp = create_error_response(
        error_code=error_code or f"ERROR_{status_code}",
        message=message,
        retryable=status_code in [408, 429, 500, 502, 503, 504],
        retry_after=5 if status_code in [429, 503] else None,
    )
    
    return _create_response(status_code, error_resp.to_dict())


@logger.inject_lambda_context
def upload(event: dict, context: LambdaContext) -> dict:
    """
    Handle sync upload request.

    Receives and decompresses performance logs, validates format,
    stores in DynamoDB, and triggers personalization engine update.

    Args:
        event: API Gateway event
        context: Lambda context

    Returns:
        API Gateway response
    """
    monitoring = get_monitoring_service()
    sync_success = False
    
    try:
        # Authenticate request
        try:
            student_id = authenticate_request(event)
            logger.info(f"Authenticated student: {student_id}")
        except AuthError as e:
            logger.warning(f"Authentication failed: {str(e)}")
            return _create_error_response(401, str(e), "AUTH_FAILED")

        # Parse request body
        try:
            body = json.loads(event.get("body", "{}"))
            request = SyncUploadRequest(**body)
        except Exception as e:
            logger.error(f"Invalid request body: {str(e)}")
            return _create_error_response(400, "Invalid request body", "INVALID_REQUEST")

        # Verify student ID matches authenticated user
        if request.student_id != student_id:
            logger.warning(f"Student ID mismatch: {request.student_id} != {student_id}")
            return _create_error_response(403, "Student ID mismatch", "FORBIDDEN")

        # Initialize repositories
        sync_repo = SyncSessionRepository()
        knowledge_repo = KnowledgeModelRepository()

        # Check for existing incomplete session (resume capability)
        existing_session = sync_repo.get_latest_session_for_student(student_id)
        if existing_session and existing_session.status in [
            SyncStatus.PENDING,
            SyncStatus.UPLOADING,
        ]:
            logger.info(f"Resuming existing session: {existing_session.session_id}")
            session = existing_session
        else:
            # Create new sync session
            session = sync_repo.create_session(student_id)
            logger.info(f"Created sync session: {session.session_id}")

        # Update checkpoint for resume capability
        sync_repo.update_checkpoint(
            session.session_id,
            {
                "stage": "upload_started",
                "timestamp": datetime.utcnow().isoformat(),
                "logs_count": len(request.logs),
            },
        )

        # Decompress and validate logs
        try:
            logs_data = _decompress_logs(request.logs)
            performance_logs = _validate_logs(logs_data)
            logger.info(f"Received {len(performance_logs)} performance logs")
        except Exception as e:
            logger.error(f"Log processing failed: {str(e)}")
            sync_repo.update_session_status(
                session.session_id, SyncStatus.FAILED, str(e)
            )
            return _create_error_response(
                400,
                "Invalid log format",
                ErrorCode.INVALID_LOGS,
            )

        # Calculate checksum
        logs_json = json.dumps(logs_data, sort_keys=True)
        checksum = hashlib.sha256(logs_json.encode()).hexdigest()

        # Store upload data
        upload_data = SyncUploadData(
            performance_logs=logs_data,
            compressed_size=len(json.dumps(request.logs)),
            checksum=checksum,
        )
        sync_repo.update_upload_data(session.session_id, upload_data)

        # Update checkpoint after successful upload
        sync_repo.update_checkpoint(
            session.session_id,
            {
                "stage": "upload_complete",
                "timestamp": datetime.utcnow().isoformat(),
                "logs_count": len(performance_logs),
                "checksum": checksum,
            },
        )

        # Update knowledge model with new performance data
        try:
            personalization_engine = PersonalizationEngine(knowledge_repo)
            knowledge_model = knowledge_repo.get_knowledge_model(student_id)
            
            if knowledge_model:
                # Update existing model
                updated_model = personalization_engine.update_knowledge_model(
                    knowledge_model, performance_logs
                )
                knowledge_repo.save_knowledge_model(updated_model)
                logger.info(f"Updated knowledge model for student {student_id}")
            else:
                # Create new model for new student
                logger.info(f"No existing knowledge model for student {student_id}")
                # Knowledge model will be created during first content generation
        except Exception as e:
            logger.error(f"Failed to update knowledge model: {str(e)}")
            logger.error(traceback.format_exc())
            # Don't fail the sync - we can still generate content

        # Update checkpoint after knowledge model update
        sync_repo.update_checkpoint(
            session.session_id,
            {
                "stage": "knowledge_model_updated",
                "timestamp": datetime.utcnow().isoformat(),
            },
        )

        # Mark session as ready for download
        sync_repo.update_session_status(session.session_id, SyncStatus.PENDING)

        # Create response
        response = SyncUploadResponse(
            session_id=session.session_id,
            logs_received=len(performance_logs),
            bundle_ready=True,  # Bundle will be generated on download request
        )

        logger.info(f"Upload completed successfully for session {session.session_id}")
        sync_success = True
        return _create_response(200, response.model_dump())

    except Exception as e:
        logger.error(f"Unexpected error in upload handler: {str(e)}")
        logger.error(traceback.format_exc())
        return _create_error_response(500, "Internal server error", "INTERNAL_ERROR")
    finally:
        # Record sync completion metric
        monitoring.record_success(
            MetricName.SYNC_COMPLETION_RATE,
            sync_success,
            dimensions={"SyncType": "upload"},
        )


def _decompress_logs(logs: list[dict]) -> list[dict]:
    """
    Decompress performance logs if compressed.

    Args:
        logs: List of log entries (may be compressed)

    Returns:
        Decompressed log entries
    """
    # Check if logs are compressed (base64 encoded gzip)
    if isinstance(logs, str):
        try:
            import base64
            compressed = base64.b64decode(logs)
            decompressed = gzip.decompress(compressed)
            return json.loads(decompressed)
        except Exception:
            # Not compressed, treat as JSON string
            return json.loads(logs)
    
    # Already a list
    return logs


def _validate_logs(logs: list[dict]) -> list[PerformanceLog]:
    """
    Validate performance logs format.

    Args:
        logs: List of log dictionaries

    Returns:
        List of validated PerformanceLog objects

    Raises:
        ValueError: If logs are invalid
    """
    if not isinstance(logs, list):
        raise ValueError("Logs must be a list")

    validated_logs = []
    for i, log in enumerate(logs):
        try:
            # Convert timestamp string to datetime if needed
            if isinstance(log.get("timestamp"), str):
                from datetime import datetime
                log["timestamp"] = datetime.fromisoformat(
                    log["timestamp"].replace("Z", "+00:00")
                )
            
            validated_log = PerformanceLog(**log)
            validated_logs.append(validated_log)
        except Exception as e:
            raise ValueError(f"Invalid log at index {i}: {str(e)}")

    return validated_logs


@logger.inject_lambda_context
def download(event: dict, context: LambdaContext) -> dict:
    """
    Handle sync download request.

    Generates learning bundle based on updated knowledge model
    and returns presigned S3 URL.

    Args:
        event: API Gateway event
        context: Lambda context

    Returns:
        API Gateway response
    """
    monitoring = get_monitoring_service()
    sync_success = False
    
    try:
        # Authenticate request
        try:
            student_id = authenticate_request(event)
            logger.info(f"Authenticated student: {student_id}")
        except AuthError as e:
            logger.warning(f"Authentication failed: {str(e)}")
            return _create_error_response(401, str(e), "AUTH_FAILED")

        # Get session ID from path parameters
        path_params = event.get("pathParameters", {})
        session_id = path_params.get("sessionId")

        if not session_id:
            return _create_error_response(400, "Missing session ID", "INVALID_REQUEST")

        # Initialize repositories
        sync_repo = SyncSessionRepository()

        # Get sync session
        session = sync_repo.get_session(session_id)
        if not session:
            return _create_error_response(404, "Session not found", "SESSION_NOT_FOUND")

        # Verify student owns this session
        if session.student_id != student_id:
            logger.warning(f"Student ID mismatch for session {session_id}")
            return _create_error_response(403, "Access denied", "FORBIDDEN")

        # Check if session is ready for download
        if session.status == SyncStatus.FAILED:
            return _create_error_response(
                400, f"Session failed: {session.error_message}", "SESSION_FAILED"
            )

        # Update checkpoint for download start
        sync_repo.update_checkpoint(
            session_id,
            {
                "stage": "download_started",
                "timestamp": datetime.utcnow().isoformat(),
            },
        )

        # Generate bundle if not already generated
        if not session.download:
            try:
                from services.bundle_generator import BundleGenerator
                from repositories.knowledge_model_repository import KnowledgeModelRepository
                
                knowledge_repo = KnowledgeModelRepository()
                bundle_generator = BundleGenerator()
                
                # Get knowledge model
                knowledge_model = knowledge_repo.get_knowledge_model(student_id)
                
                # Update checkpoint for bundle generation
                sync_repo.update_checkpoint(
                    session_id,
                    {
                        "stage": "bundle_generation_started",
                        "timestamp": datetime.utcnow().isoformat(),
                    },
                )
                
                # Generate bundle with latency tracking
                with LatencyTimer(
                    monitoring,
                    MetricName.BUNDLE_GENERATION_LATENCY,
                    dimensions={"StudentId": student_id},
                ):
                    bundle_metadata = bundle_generator.generate_bundle(
                        student_id=student_id,
                        knowledge_model=knowledge_model,
                        performance_logs=session.upload.performance_logs if session.upload else [],
                    )
                
                # Update checkpoint after bundle generation
                sync_repo.update_checkpoint(
                    session_id,
                    {
                        "stage": "bundle_generation_complete",
                        "timestamp": datetime.utcnow().isoformat(),
                        "bundle_id": bundle_metadata.bundle_id,
                        "bundle_size": bundle_metadata.total_size,
                    },
                )
                
                # Create download data
                from models.sync import SyncDownloadData
                from datetime import datetime, timedelta
                
                download_data = SyncDownloadData(
                    bundle_url=bundle_metadata.presigned_url,
                    bundle_size=bundle_metadata.total_size,
                    checksum=bundle_metadata.checksum,
                )
                
                sync_repo.update_download_data(session_id, download_data)
                session.download = download_data
                
                logger.info(f"Generated bundle for session {session_id}")
                
            except Exception as e:
                logger.error(f"Bundle generation failed: {str(e)}")
                logger.error(traceback.format_exc())
                sync_repo.update_session_status(
                    session_id, SyncStatus.FAILED, f"Bundle generation failed: {str(e)}"
                )
                return _create_error_response(
                    500, "Bundle generation failed", "BUNDLE_GENERATION_FAILED"
                )

        # Update checkpoint for download complete
        sync_repo.update_checkpoint(
            session_id,
            {
                "stage": "download_complete",
                "timestamp": datetime.utcnow().isoformat(),
            },
        )

        # Mark session as complete
        sync_repo.update_session_status(session_id, SyncStatus.COMPLETE)

        # Create response
        from datetime import datetime, timedelta
        response = SyncDownloadResponse(
            bundle_url=session.download.bundle_url,
            bundle_size=session.download.bundle_size,
            checksum=session.download.checksum,
            valid_until=datetime.utcnow() + timedelta(hours=1),  # URL valid for 1 hour
        )

        logger.info(f"Download completed successfully for session {session_id}")
        sync_success = True
        return _create_response(200, response.model_dump())

    except Exception as e:
        logger.error(f"Unexpected error in download handler: {str(e)}")
        logger.error(traceback.format_exc())
        return _create_error_response(500, "Internal server error", "INTERNAL_ERROR")
    finally:
        # Record sync completion metric
        monitoring.record_success(
            MetricName.SYNC_COMPLETION_RATE,
            sync_success,
            dimensions={"SyncType": "download"},
        )
