"""Learning bundle packaging service with compression and signing."""

import gzip
import hashlib
import json
import uuid
from datetime import datetime, timedelta
from typing import Optional

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from src.models.content import LearningBundle, SubjectContent


class BundlePackager:
    """Service for packaging, compressing, and signing learning bundles."""

    def __init__(self, private_key_pem: Optional[str] = None):
        """
        Initialize bundle packager.

        Args:
            private_key_pem: RSA private key in PEM format for signing.
                            If None, generates a new key pair.
        """
        if private_key_pem:
            self.private_key = serialization.load_pem_private_key(
                private_key_pem.encode(), password=None, backend=default_backend()
            )
        else:
            # Generate new RSA-2048 key pair
            self.private_key = rsa.generate_private_key(
                public_exponent=65537, key_size=2048, backend=default_backend()
            )

        self.public_key = self.private_key.public_key()

    def get_public_key_pem(self) -> str:
        """
        Get public key in PEM format for distribution.

        Returns:
            Public key as PEM string
        """
        pem = self.public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        return pem.decode()

    def create_bundle(
        self,
        student_id: str,
        subjects: list[SubjectContent],
        duration_weeks: int = 2,
    ) -> LearningBundle:
        """
        Create a learning bundle with metadata.

        Args:
            student_id: Student identifier
            subjects: List of subject content
            duration_weeks: Bundle validity duration in weeks

        Returns:
            LearningBundle with metadata (not yet compressed/signed)
        """
        bundle_id = str(uuid.uuid4())
        valid_from = datetime.utcnow()
        valid_until = valid_from + timedelta(weeks=duration_weeks)

        # Create bundle structure
        bundle = LearningBundle(
            bundle_id=bundle_id,
            student_id=student_id,
            valid_from=valid_from,
            valid_until=valid_until,
            subjects=subjects,
            total_size=1,  # Placeholder, will be updated after compression
            checksum="",  # Will be calculated after compression
        )

        return bundle

    def compress_bundle(self, bundle: LearningBundle) -> bytes:
        """
        Compress bundle content using gzip.

        Args:
            bundle: Learning bundle to compress

        Returns:
            Compressed bundle as bytes
        """
        # Serialize bundle to JSON
        bundle_json = bundle.model_dump_json()
        bundle_bytes = bundle_json.encode("utf-8")

        # Compress with gzip (as specified in design document)
        compressed = gzip.compress(bundle_bytes, compresslevel=9)

        return compressed

    def compress_logs(self, logs: list[dict]) -> bytes:
        """
        Compress performance logs using gzip.

        Args:
            logs: List of performance log dictionaries

        Returns:
            Compressed logs as bytes
        """
        # Serialize logs to JSON
        logs_json = json.dumps(logs)
        logs_bytes = logs_json.encode("utf-8")

        # Compress with gzip (faster than brotli, good for logs)
        compressed = gzip.compress(logs_bytes, compresslevel=9)

        return compressed

    def calculate_checksum(self, data: bytes) -> str:
        """
        Calculate SHA-256 checksum of data.

        Args:
            data: Data to checksum

        Returns:
            Hex-encoded SHA-256 checksum
        """
        sha256 = hashlib.sha256()
        sha256.update(data)
        return sha256.hexdigest()

    def sign_bundle(self, data: bytes) -> bytes:
        """
        Sign bundle data with RSA-2048 private key.

        Args:
            data: Data to sign

        Returns:
            Digital signature as bytes
        """
        signature = self.private_key.sign(
            data,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256(),
        )
        return signature

    def verify_signature(self, data: bytes, signature: bytes) -> bool:
        """
        Verify bundle signature with public key.

        Args:
            data: Original data
            signature: Signature to verify

        Returns:
            True if signature is valid, False otherwise
        """
        try:
            self.public_key.verify(
                signature,
                data,
                padding.PSS(
                    mgf=padding.MGF1(hashes.SHA256()),
                    salt_length=padding.PSS.MAX_LENGTH,
                ),
                hashes.SHA256(),
            )
            return True
        except Exception:
            return False

    def package_bundle(
        self, student_id: str, subjects: list[SubjectContent], duration_weeks: int = 2
    ) -> tuple[bytes, str, bytes, LearningBundle]:
        """
        Complete bundle packaging: create, compress, sign, and checksum.

        Args:
            student_id: Student identifier
            subjects: List of subject content
            duration_weeks: Bundle validity duration in weeks

        Returns:
            Tuple of (compressed_data, checksum, signature, bundle_metadata)
        """
        # Create bundle structure
        bundle = self.create_bundle(student_id, subjects, duration_weeks)

        # Compress bundle
        compressed_data = self.compress_bundle(bundle)

        # Calculate checksum
        checksum = self.calculate_checksum(compressed_data)

        # Sign compressed data
        signature = self.sign_bundle(compressed_data)

        # Update bundle metadata with size and checksum
        bundle.total_size = len(compressed_data)
        bundle.checksum = checksum

        return compressed_data, checksum, signature, bundle

    def decompress_bundle(self, compressed_data: bytes) -> LearningBundle:
        """
        Decompress and parse bundle.

        Args:
            compressed_data: Compressed bundle bytes

        Returns:
            Parsed LearningBundle

        Raises:
            ValueError: If decompression or parsing fails
        """
        try:
            # Decompress with gzip
            decompressed = gzip.decompress(compressed_data)

            # Parse JSON
            bundle_json = decompressed.decode("utf-8")
            bundle = LearningBundle.model_validate_json(bundle_json)

            return bundle
        except Exception as e:
            raise ValueError(f"Failed to decompress bundle: {e}")

    def decompress_logs(self, compressed_data: bytes) -> list[dict]:
        """
        Decompress and parse performance logs.

        Args:
            compressed_data: Compressed logs bytes

        Returns:
            List of log dictionaries

        Raises:
            ValueError: If decompression or parsing fails
        """
        try:
            # Decompress with gzip
            decompressed = gzip.decompress(compressed_data)

            # Parse JSON
            logs_json = decompressed.decode("utf-8")
            logs = json.loads(logs_json)

            return logs
        except Exception as e:
            raise ValueError(f"Failed to decompress logs: {e}")

    def validate_bundle(
        self, compressed_data: bytes, expected_checksum: str, signature: bytes
    ) -> bool:
        """
        Validate bundle integrity and authenticity.

        Args:
            compressed_data: Compressed bundle bytes
            expected_checksum: Expected SHA-256 checksum
            signature: Digital signature

        Returns:
            True if bundle is valid, False otherwise
        """
        # Verify checksum
        actual_checksum = self.calculate_checksum(compressed_data)
        if actual_checksum != expected_checksum:
            return False

        # Verify signature
        if not self.verify_signature(compressed_data, signature):
            return False

        return True
