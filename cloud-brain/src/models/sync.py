"""Sync models for Cloud Brain API."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class SyncStatus(str, Enum):
    """Sync session status."""

    PENDING = "pending"
    UPLOADING = "uploading"
    DOWNLOADING = "downloading"
    COMPLETE = "complete"
    FAILED = "failed"


class SyncUploadData(BaseModel):
    """Upload data for sync session."""

    performance_logs: list[dict] = Field(..., description="Compressed performance logs")
    compressed_size: int = Field(..., description="Size in bytes")
    checksum: str = Field(..., description="SHA256 checksum")


class SyncDownloadData(BaseModel):
    """Download data for sync session."""

    bundle_url: str = Field(..., description="S3 presigned URL")
    bundle_size: int = Field(..., description="Size in bytes")
    checksum: str = Field(..., description="SHA256 checksum")


class SyncSession(BaseModel):
    """Sync session record."""

    session_id: str = Field(..., description="Unique session identifier")
    student_id: str = Field(..., description="Student identifier")
    start_time: datetime = Field(
        default_factory=datetime.utcnow, description="Session start time"
    )
    end_time: Optional[datetime] = Field(None, description="Session end time")
    status: SyncStatus = Field(default=SyncStatus.PENDING, description="Session status")
    upload: Optional[SyncUploadData] = Field(None, description="Upload data")
    download: Optional[SyncDownloadData] = Field(None, description="Download data")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    checkpoint: Optional[dict] = Field(
        None, description="Resume checkpoint data"
    )


class SyncUploadRequest(BaseModel):
    """Request for sync upload."""

    model_config = {"populate_by_name": True}

    student_id: str = Field(..., alias="studentId", description="Student identifier")
    logs: str | list[dict] = Field(..., description="Performance logs (compressed or encrypted)")
    last_sync_time: Optional[datetime] = Field(
        None, alias="lastSyncTime", description="Last successful sync timestamp"
    )


class SyncUploadResponse(BaseModel):
    """Response for sync upload."""

    model_config = {"populate_by_name": True}

    session_id: str = Field(..., alias="sessionId", description="Sync session identifier")
    logs_received: int = Field(..., alias="logsReceived", description="Number of logs received")
    bundle_ready: bool = Field(..., alias="bundleReady", description="Whether bundle is ready for download")


class SyncDownloadResponse(BaseModel):
    """Response for sync download."""

    model_config = {"populate_by_name": True}

    bundle_url: str = Field(..., alias="bundleUrl", description="S3 presigned URL for bundle")
    bundle_size: int = Field(..., alias="bundleSize", description="Bundle size in bytes")
    checksum: str = Field(..., description="SHA256 checksum")
    valid_until: datetime = Field(..., alias="validUntil", description="URL expiration time")


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = Field(..., description="Service status")
    version: str = Field(..., description="API version")
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="Response timestamp"
    )
