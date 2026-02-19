"""Authentication utilities for Cloud Brain API."""

import os
from datetime import datetime, timedelta
from typing import Optional

import jwt
from jwt.exceptions import InvalidTokenError


class AuthError(Exception):
    """Authentication error."""

    pass


def generate_jwt_token(student_id: str, expires_in_hours: int = 24) -> str:
    """
    Generate JWT token for student.

    Args:
        student_id: Student identifier
        expires_in_hours: Token expiration time in hours

    Returns:
        JWT token string
    """
    secret = os.environ.get("JWT_SECRET", "dev-secret-change-in-production")
    
    payload = {
        "sub": student_id,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=expires_in_hours),
        "iss": "sikshya-sathi-cloud-brain",
    }
    
    return jwt.encode(payload, secret, algorithm="HS256")


def verify_jwt_token(token: str) -> str:
    """
    Verify JWT token and extract student ID.

    Args:
        token: JWT token string

    Returns:
        Student ID from token

    Raises:
        AuthError: If token is invalid or expired
    """
    secret = os.environ.get("JWT_SECRET", "dev-secret-change-in-production")
    
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        student_id = payload.get("sub")
        
        if not student_id:
            raise AuthError("Token missing student ID")
        
        return student_id
    
    except InvalidTokenError as e:
        raise AuthError(f"Invalid token: {str(e)}")


def extract_token_from_header(authorization_header: Optional[str]) -> str:
    """
    Extract JWT token from Authorization header.

    Args:
        authorization_header: Authorization header value

    Returns:
        JWT token string

    Raises:
        AuthError: If header is missing or malformed
    """
    if not authorization_header:
        raise AuthError("Missing Authorization header")
    
    parts = authorization_header.split()
    
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise AuthError("Invalid Authorization header format. Expected: Bearer <token>")
    
    return parts[1]


def authenticate_request(event: dict) -> str:
    """
    Authenticate API Gateway request and extract student ID.

    Args:
        event: API Gateway event

    Returns:
        Student ID from authenticated token

    Raises:
        AuthError: If authentication fails
    """
    headers = event.get("headers", {})
    
    # Handle case-insensitive headers
    auth_header = headers.get("Authorization") or headers.get("authorization")
    
    token = extract_token_from_header(auth_header)
    student_id = verify_jwt_token(token)
    
    return student_id
