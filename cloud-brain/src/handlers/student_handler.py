"""Lambda handler for student registration API."""

import json
import re
from typing import Dict, Any

from botocore.exceptions import ClientError
from pydantic import ValidationError

from src.models.student import StudentRegistrationRequest, StudentRegistrationResponse
from src.repositories.student_repository import StudentRepository
from src.utils.auth import generate_jwt_token


# UUID v4 validation pattern from design document
UUID_V4_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    re.IGNORECASE
)


def _validate_uuid(student_id: str) -> bool:
    """
    Validate UUID v4 format.
    
    Args:
        student_id: Student ID to validate
        
    Returns:
        True if valid UUID v4, False otherwise
    """
    return bool(UUID_V4_PATTERN.match(student_id))


def _validate_student_name(student_name: str) -> bool:
    """
    Validate student name.
    
    Args:
        student_name: Student name to validate
        
    Returns:
        True if valid (non-empty after trimming, max 100 chars), False otherwise
    """
    if not student_name:
        return False
    
    trimmed = student_name.strip()
    return len(trimmed) > 0 and len(trimmed) <= 100


def _create_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create API Gateway response with CORS headers.
    
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
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        "body": json.dumps(body),
    }


def _create_error_response(
    status_code: int,
    error_code: str,
    message: str,
    retryable: bool = False
) -> Dict[str, Any]:
    """
    Create error response.
    
    Args:
        status_code: HTTP status code
        error_code: Error code constant
        message: Human-readable error message
        retryable: Whether the error is retryable
        
    Returns:
        API Gateway error response
    """
    body = {
        "error": error_code,
        "message": message,
        "retryable": retryable,
    }
    return _create_response(status_code, body)


def register(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle POST /api/students/register endpoint.
    
    Registers a new student or returns existing student record (idempotent).
    
    Args:
        event: API Gateway event
        context: Lambda context
        
    Returns:
        API Gateway response with student record or error
    """
    # Parse request body
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return _create_error_response(
            400,
            "INVALID_JSON",
            "Request body must be valid JSON",
            retryable=False
        )
    
    # Extract fields
    student_id = body.get("studentId")
    student_name = body.get("studentName")
    
    # Check for missing fields
    if not student_id:
        return _create_error_response(
            400,
            "MISSING_FIELD",
            "Required field missing: studentId",
            retryable=False
        )
    
    if not student_name:
        return _create_error_response(
            400,
            "MISSING_FIELD",
            "Required field missing: studentName",
            retryable=False
        )
    
    # Validate UUID format
    if not _validate_uuid(student_id):
        return _create_error_response(
            400,
            "INVALID_UUID",
            "studentId must be a valid UUID v4 format",
            retryable=False
        )
    
    # Validate student name
    if not _validate_student_name(student_name):
        return _create_error_response(
            400,
            "INVALID_NAME",
            "studentName must be a non-empty string (max 100 characters)",
            retryable=False
        )
    
    # Validate using Pydantic model
    try:
        request = StudentRegistrationRequest(
            student_id=student_id,
            student_name=student_name.strip()
        )
    except ValidationError as e:
        return _create_error_response(
            400,
            "INVALID_REQUEST",
            f"Validation error: {str(e)}",
            retryable=False
        )
    
    # Create or retrieve student
    try:
        repository = StudentRepository()
        
        # Check if student already exists (for idempotency)
        existing_student = repository.get_student(request.student_id)
        
        if existing_student:
            # Student already exists - return 200 (idempotent)
            # Generate JWT token for authentication
            auth_token = generate_jwt_token(existing_student.student_id)
            
            response = StudentRegistrationResponse(
                student_id=existing_student.student_id,
                student_name=existing_student.student_name,
                registration_timestamp=existing_student.registration_timestamp,
                status="already_registered"
            )
            response_body = response.model_dump(mode='json')
            response_body['authToken'] = auth_token
            return _create_response(200, response_body)
        
        # Create new student
        student = repository.create_student(
            student_id=request.student_id,
            student_name=request.student_name
        )
        
        # Generate JWT token for authentication
        auth_token = generate_jwt_token(student.student_id)
        
        # Return 201 Created
        response = StudentRegistrationResponse(
            student_id=student.student_id,
            student_name=student.student_name,
            registration_timestamp=student.registration_timestamp,
            status="registered"
        )
        response_body = response.model_dump(mode='json')
        response_body['authToken'] = auth_token
        return _create_response(201, response_body)
        
    except ClientError as e:
        # DynamoDB error - return 503 Service Unavailable
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        return _create_error_response(
            503,
            "SERVICE_UNAVAILABLE",
            f"Unable to register student. Please try again. (Error: {error_code})",
            retryable=True
        )
    
    except Exception as e:
        # Unexpected error - return 500 Internal Server Error
        return _create_error_response(
            500,
            "INTERNAL_ERROR",
            "An unexpected error occurred. Please try again.",
            retryable=True
        )
