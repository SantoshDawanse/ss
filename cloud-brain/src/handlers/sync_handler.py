"""Lambda handlers for sync API endpoints."""

import gzip
import hashlib
import json
import logging
import traceback
from datetime import datetime, timedelta
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
            logger.info(f"Request body keys: {list(body.keys())}")
            logger.info(f"Logs type: {type(body.get('logs'))}")
            if isinstance(body.get('logs'), str):
                logger.info(f"Logs length (string): {len(body.get('logs', ''))}")
            elif isinstance(body.get('logs'), list):
                logger.info(f"Logs length (list): {len(body.get('logs', []))}")
            request = SyncUploadRequest(**body)
        except Exception as e:
            logger.error(f"Invalid request body: {str(e)}")
            logger.error(f"Request body: {json.dumps(body, default=str)[:500]}")
            return _create_error_response(400, f"Invalid request body: {str(e)}", "INVALID_REQUEST")

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
        logs_count = len(request.logs) if isinstance(request.logs, list) else 1
        sync_repo.update_checkpoint(
            session.session_id,
            {
                "stage": "upload_started",
                "timestamp": datetime.utcnow().isoformat(),
                "logs_count": logs_count,
            },
        )

        # Decompress and validate logs
        try:
            logs_data = _decompress_logs(request.logs)
            performance_logs = _validate_logs(logs_data) if logs_data else []
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

        # Calculate checksum (convert PerformanceLog objects to dicts for JSON serialization)
        logs_dict = [log.model_dump() if hasattr(log, 'model_dump') else log for log in performance_logs]
        logs_json = json.dumps(logs_dict, sort_keys=True, default=str)
        checksum = hashlib.sha256(logs_json.encode()).hexdigest()

        # Store upload data
        upload_data = SyncUploadData(
            performance_logs=logs_data,
            compressed_size=len(json.dumps(logs_dict, default=str)),
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
                # Update existing model with new performance logs
                updated_model = personalization_engine.update_knowledge_model(
                    knowledge_model, performance_logs
                )
                knowledge_repo.save_knowledge_model(updated_model)
                logger.info(f"Updated knowledge model for student {student_id}")
            else:
                # First-time user: Create initial knowledge model
                logger.info(f"Creating initial knowledge model for new student {student_id}")
                initial_model = knowledge_repo.create_initial_knowledge_model(student_id)
                knowledge_repo.save_knowledge_model(initial_model)
                logger.info(f"Created initial knowledge model for student {student_id}")
        except Exception as e:
            logger.error(f"Failed to update knowledge model: {str(e)}")
            logger.error(traceback.format_exc())
            # Don't fail the sync - we can still generate content with default model

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
        return _create_response(200, response.model_dump(mode='json', by_alias=True))

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


def _decompress_logs(logs: str | list[dict]) -> list[dict]:
    """
    Decompress and decrypt performance logs if compressed/encrypted.

    Args:
        logs: List of log entries or base64-encoded encrypted string

    Returns:
        Decompressed log entries
    """
    # Check if logs are encrypted/compressed (base64 encoded string)
    if isinstance(logs, str):
        try:
            import base64
            
            # Try to decode as base64 first
            decoded = base64.b64decode(logs)
            decoded_str = decoded.decode('utf-8')
            
            # Check if it's an encrypted format with {ciphertext, iv} structure
            try:
                encrypted_obj = json.loads(decoded_str)
                if isinstance(encrypted_obj, dict) and 'ciphertext' in encrypted_obj and 'iv' in encrypted_obj:
                    # This is encrypted data from the frontend
                    # Decode the ciphertext (it's base64 encoded)
                    inner_decoded = base64.b64decode(encrypted_obj['ciphertext'])
                    inner_str = inner_decoded.decode('utf-8')
                    
                    # The format is "iv:data", split and get the data part
                    if ':' in inner_str:
                        parts = inner_str.split(':', 1)
                        data_str = parts[1] if len(parts) > 1 else parts[0]
                        return json.loads(data_str)
                    else:
                        return json.loads(inner_str)
            except (json.JSONDecodeError, KeyError):
                pass
            
            # Try gzip decompression
            try:
                decompressed = gzip.decompress(decoded)
                return json.loads(decompressed)
            except Exception:
                # Not gzipped, try as plain JSON
                try:
                    return json.loads(decoded_str)
                except Exception:
                    # If it's still a string after decoding, parse it
                    return json.loads(logs)
        except Exception as e:
            logger.warning(f"Failed to decode logs: {str(e)}, treating as JSON string")
            # Last resort: try to parse as JSON string directly
            try:
                return json.loads(logs)
            except Exception:
                # If it's an empty string or invalid, return empty list
                logger.error(f"Could not parse logs: {str(e)}")
                return []
    
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
    
    # Empty logs are valid for first-time users
    if len(logs) == 0:
        return []

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
                from src.services.bundle_generator import BundleGenerator
                from src.repositories.knowledge_model_repository import KnowledgeModelRepository
                
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
                from src.models.sync import SyncDownloadData
                
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
        response = SyncDownloadResponse(
            bundle_url=session.download.bundle_url,
            bundle_size=session.download.bundle_size,
            checksum=session.download.checksum,
            valid_until=datetime.utcnow() + timedelta(hours=1),  # URL valid for 1 hour
        )

        logger.info(f"Download completed successfully for session {session_id}")
        sync_success = True
        return _create_response(200, response.model_dump(mode='json', by_alias=True))

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
