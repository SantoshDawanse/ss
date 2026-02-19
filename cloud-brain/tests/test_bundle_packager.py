"""Unit tests for bundle packaging service."""

import json
from datetime import datetime

import pytest

from src.models.content import (
    DifficultyLevel,
    Lesson,
    LessonSection,
    LessonSectionType,
    Quiz,
    Question,
    QuestionType,
    BloomLevel,
    Hint,
    SubjectContent,
)
from src.services.bundle_packager import BundlePackager


@pytest.fixture
def packager():
    """Create bundle packager instance."""
    return BundlePackager()


@pytest.fixture
def sample_lesson():
    """Create sample lesson."""
    return Lesson(
        lesson_id="lesson-1",
        subject="Mathematics",
        topic="Algebra",
        title="Introduction to Linear Equations",
        difficulty=DifficultyLevel.MEDIUM,
        estimated_minutes=30,
        curriculum_standards=["MATH-6-ALG-1"],
        sections=[
            LessonSection(
                type=LessonSectionType.EXPLANATION,
                content="Linear equations are equations with variables raised to the first power.",
            )
        ],
    )


@pytest.fixture
def sample_quiz():
    """Create sample quiz."""
    return Quiz(
        quiz_id="quiz-1",
        subject="Mathematics",
        topic="Algebra",
        title="Linear Equations Quiz",
        difficulty=DifficultyLevel.MEDIUM,
        questions=[
            Question(
                question_id="q1",
                type=QuestionType.MULTIPLE_CHOICE,
                question="What is the solution to 2x + 4 = 10?",
                options=["x = 2", "x = 3", "x = 4", "x = 5"],
                correct_answer="x = 3",
                explanation="Subtract 4 from both sides, then divide by 2.",
                curriculum_standard="MATH-6-ALG-1",
                bloom_level=BloomLevel.APPLY,
            )
        ],
    )


@pytest.fixture
def sample_subject_content(sample_lesson, sample_quiz):
    """Create sample subject content."""
    return SubjectContent(
        subject="Mathematics",
        lessons=[sample_lesson],
        quizzes=[sample_quiz],
        hints={
            "q1": [
                Hint(hint_id="h1", level=1, text="Start by isolating the variable."),
                Hint(hint_id="h2", level=2, text="Subtract 4 from both sides first."),
            ]
        },
    )


def test_create_bundle(packager, sample_subject_content):
    """Test bundle creation with metadata."""
    bundle = packager.create_bundle(
        student_id="student-123", subjects=[sample_subject_content], duration_weeks=2
    )

    assert bundle.bundle_id is not None
    assert bundle.student_id == "student-123"
    assert bundle.valid_from is not None
    assert bundle.valid_until > bundle.valid_from
    assert len(bundle.subjects) == 1
    assert bundle.subjects[0].subject == "Mathematics"


def test_compress_bundle(packager, sample_subject_content):
    """Test bundle compression with brotli."""
    bundle = packager.create_bundle(
        student_id="student-123", subjects=[sample_subject_content]
    )

    compressed = packager.compress_bundle(bundle)

    assert isinstance(compressed, bytes)
    assert len(compressed) > 0
    # Compressed should be smaller than JSON
    bundle_json = bundle.model_dump_json()
    assert len(compressed) < len(bundle_json.encode("utf-8"))


def test_decompress_bundle(packager, sample_subject_content):
    """Test bundle decompression."""
    original_bundle = packager.create_bundle(
        student_id="student-123", subjects=[sample_subject_content]
    )

    compressed = packager.compress_bundle(original_bundle)
    decompressed = packager.decompress_bundle(compressed)

    assert decompressed.bundle_id == original_bundle.bundle_id
    assert decompressed.student_id == original_bundle.student_id
    assert len(decompressed.subjects) == len(original_bundle.subjects)


def test_compress_logs(packager):
    """Test performance log compression with gzip."""
    logs = [
        {
            "student_id": "student-123",
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": "quiz_answer",
            "content_id": "quiz-1",
            "subject": "Mathematics",
            "topic": "Algebra",
            "data": {"correct": True, "time_spent": 45},
        }
    ]

    compressed = packager.compress_logs(logs)

    assert isinstance(compressed, bytes)
    assert len(compressed) > 0
    # Compressed should be smaller than JSON
    logs_json = json.dumps(logs)
    assert len(compressed) < len(logs_json.encode("utf-8"))


def test_decompress_logs(packager):
    """Test log decompression."""
    original_logs = [
        {
            "student_id": "student-123",
            "event_type": "quiz_answer",
            "data": {"correct": True},
        }
    ]

    compressed = packager.compress_logs(original_logs)
    decompressed = packager.decompress_logs(compressed)

    assert len(decompressed) == len(original_logs)
    assert decompressed[0]["student_id"] == original_logs[0]["student_id"]


def test_calculate_checksum(packager):
    """Test SHA-256 checksum calculation."""
    data = b"test data"
    checksum = packager.calculate_checksum(data)

    assert isinstance(checksum, str)
    assert len(checksum) == 64  # SHA-256 hex is 64 characters
    # Same data should produce same checksum
    assert checksum == packager.calculate_checksum(data)


def test_sign_and_verify_bundle(packager):
    """Test RSA-2048 signing and verification."""
    data = b"test bundle data"

    signature = packager.sign_bundle(data)

    assert isinstance(signature, bytes)
    assert len(signature) > 0
    # Verify signature
    assert packager.verify_signature(data, signature) is True


def test_verify_invalid_signature(packager):
    """Test signature verification fails for tampered data."""
    data = b"test bundle data"
    signature = packager.sign_bundle(data)

    # Tamper with data
    tampered_data = b"tampered data"

    # Verification should fail
    assert packager.verify_signature(tampered_data, signature) is False


def test_package_bundle_complete(packager, sample_subject_content):
    """Test complete bundle packaging workflow."""
    compressed_data, checksum, signature, bundle = packager.package_bundle(
        student_id="student-123", subjects=[sample_subject_content], duration_weeks=2
    )

    # Check compressed data
    assert isinstance(compressed_data, bytes)
    assert len(compressed_data) > 0

    # Check checksum
    assert isinstance(checksum, str)
    assert len(checksum) == 64
    assert checksum == bundle.checksum

    # Check signature
    assert isinstance(signature, bytes)
    assert packager.verify_signature(compressed_data, signature) is True

    # Check bundle metadata
    assert bundle.total_size == len(compressed_data)
    assert bundle.student_id == "student-123"


def test_validate_bundle_success(packager, sample_subject_content):
    """Test bundle validation with correct checksum and signature."""
    compressed_data, checksum, signature, _ = packager.package_bundle(
        student_id="student-123", subjects=[sample_subject_content]
    )

    is_valid = packager.validate_bundle(compressed_data, checksum, signature)

    assert is_valid is True


def test_validate_bundle_wrong_checksum(packager, sample_subject_content):
    """Test bundle validation fails with wrong checksum."""
    compressed_data, _, signature, _ = packager.package_bundle(
        student_id="student-123", subjects=[sample_subject_content]
    )

    wrong_checksum = "0" * 64

    is_valid = packager.validate_bundle(compressed_data, wrong_checksum, signature)

    assert is_valid is False


def test_validate_bundle_wrong_signature(packager, sample_subject_content):
    """Test bundle validation fails with wrong signature."""
    compressed_data, checksum, _, _ = packager.package_bundle(
        student_id="student-123", subjects=[sample_subject_content]
    )

    wrong_signature = b"invalid signature"

    is_valid = packager.validate_bundle(compressed_data, checksum, wrong_signature)

    assert is_valid is False


def test_get_public_key_pem(packager):
    """Test public key export in PEM format."""
    public_key_pem = packager.get_public_key_pem()

    assert isinstance(public_key_pem, str)
    assert "BEGIN PUBLIC KEY" in public_key_pem
    assert "END PUBLIC KEY" in public_key_pem


def test_bundle_size_constraint(packager, sample_subject_content):
    """Test that bundle size is reasonable (< 5MB per week)."""
    # Create 2-week bundle
    compressed_data, _, _, bundle = packager.package_bundle(
        student_id="student-123", subjects=[sample_subject_content], duration_weeks=2
    )

    # Size should be less than 5MB per week (10MB for 2 weeks)
    max_size = 10 * 1024 * 1024  # 10MB
    assert len(compressed_data) < max_size
    assert bundle.total_size < max_size
