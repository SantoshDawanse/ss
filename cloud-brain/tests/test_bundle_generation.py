"""Unit tests for bundle generation and storage."""

import uuid
from datetime import datetime, timedelta

import pytest

from src.models.content import (
    BloomLevel,
    DifficultyLevel,
    Hint,
    Lesson,
    LessonSection,
    LessonSectionType,
    Question,
    QuestionType,
    Quiz,
)
from src.services.bundle_generator import BundleGenerator
from src.services.bundle_packager import BundlePackager


class TestBundlePackager:
    """Test bundle packager compression and checksum utilities."""

    def test_compress_bundle_uses_gzip(self):
        """Test that bundle compression uses gzip."""
        packager = BundlePackager()

        # Create a simple bundle
        from src.models.content import LearningBundle, SubjectContent

        bundle = LearningBundle(
            bundle_id=str(uuid.uuid4()),
            student_id="test-student-1",
            valid_from=datetime.utcnow(),
            valid_until=datetime.utcnow() + timedelta(days=14),
            subjects=[
                SubjectContent(
                    subject="Mathematics",
                    lessons=[],
                    quizzes=[],
                    hints={},
                )
            ],
            total_size=1,
            checksum="",
        )

        # Compress bundle
        compressed = packager.compress_bundle(bundle)

        # Verify it's compressed (should be bytes)
        assert isinstance(compressed, bytes)
        assert len(compressed) > 0

        # Verify it can be decompressed
        decompressed = packager.decompress_bundle(compressed)
        assert decompressed.bundle_id == bundle.bundle_id
        assert decompressed.student_id == bundle.student_id

    def test_calculate_checksum_sha256(self):
        """Test that checksum calculation uses SHA-256."""
        packager = BundlePackager()

        data = b"test data for checksum"
        checksum = packager.calculate_checksum(data)

        # SHA-256 produces 64 hex characters
        assert len(checksum) == 64
        assert all(c in "0123456789abcdef" for c in checksum)

    def test_compress_logs_uses_gzip(self):
        """Test that log compression uses gzip."""
        packager = BundlePackager()

        logs = [
            {"student_id": "test-1", "lesson_id": "lesson-1", "score": 0.85},
            {"student_id": "test-1", "quiz_id": "quiz-1", "score": 0.90},
        ]

        # Compress logs
        compressed = packager.compress_logs(logs)

        # Verify it's compressed
        assert isinstance(compressed, bytes)
        assert len(compressed) > 0

        # Verify it can be decompressed
        decompressed = packager.decompress_logs(compressed)
        assert decompressed == logs


class TestBundleGenerator:
    """Test bundle generator composition and optimization."""

    def test_compose_bundle_structure(self):
        """Test that bundle composition creates correct structure."""
        generator = BundleGenerator()

        # Create sample lessons and quizzes
        lessons = {
            "Mathematics": [
                Lesson(
                    lesson_id=str(uuid.uuid4()),
                    subject="Mathematics",
                    topic="Whole Numbers",
                    title="Introduction to Whole Numbers",
                    difficulty=DifficultyLevel.EASY,
                    estimated_minutes=30,
                    curriculum_standards=["MATH-6-001"],
                    sections=[
                        LessonSection(
                            type=LessonSectionType.EXPLANATION,
                            content="Whole numbers are...",
                        )
                    ],
                )
            ]
        }

        quizzes = {
            "Mathematics": [
                Quiz(
                    quiz_id=str(uuid.uuid4()),
                    subject="Mathematics",
                    topic="Whole Numbers",
                    title="Whole Numbers Quiz",
                    difficulty=DifficultyLevel.EASY,
                    questions=[
                        Question(
                            question_id=str(uuid.uuid4()),
                            type=QuestionType.MULTIPLE_CHOICE,
                            question="What is 2 + 2?",
                            options=["3", "4", "5", "6"],
                            correct_answer="4",
                            explanation="2 + 2 = 4",
                            curriculum_standard="MATH-6-001",
                            bloom_level=BloomLevel.REMEMBER,
                        )
                    ],
                )
            ]
        }

        hints = {}

        # Compose bundle
        bundle = generator.compose_bundle(
            student_id="test-student-1",
            lessons_by_subject=lessons,
            quizzes_by_subject=quizzes,
            hints_by_question=hints,
            validity_days=14,
        )

        # Verify bundle structure
        assert bundle.bundle_id is not None
        assert bundle.student_id == "test-student-1"
        assert len(bundle.subjects) == 1
        assert bundle.subjects[0].subject == "Mathematics"
        assert len(bundle.subjects[0].lessons) == 1
        assert len(bundle.subjects[0].quizzes) == 1

        # Verify validity period is 14 days
        validity_period = bundle.valid_until - bundle.valid_from
        assert validity_period.days == 14

    def test_compress_and_optimize_bundle(self):
        """Test bundle compression and size optimization."""
        generator = BundleGenerator()

        # Create a bundle
        lessons = {
            "Mathematics": [
                Lesson(
                    lesson_id=str(uuid.uuid4()),
                    subject="Mathematics",
                    topic="Test Topic",
                    title="Test Lesson",
                    difficulty=DifficultyLevel.EASY,
                    estimated_minutes=30,
                    curriculum_standards=["MATH-6-001"],
                    sections=[
                        LessonSection(
                            type=LessonSectionType.EXPLANATION,
                            content="Test content",
                        )
                    ],
                )
            ]
        }

        bundle = generator.compose_bundle(
            student_id="test-student-1",
            lessons_by_subject=lessons,
            quizzes_by_subject={},
            hints_by_question={},
        )

        # Compress bundle
        compressed_data, checksum, final_size = generator.compress_and_optimize_bundle(
            bundle=bundle,
            max_size_bytes=5_000_000,
            weeks=1,
        )

        # Verify compression results
        assert isinstance(compressed_data, bytes)
        assert len(compressed_data) > 0
        assert len(checksum) == 64  # SHA-256
        assert final_size == len(compressed_data)
        assert bundle.total_size == final_size
        assert bundle.checksum == checksum

    def test_bundle_size_optimization_removes_media(self):
        """Test that bundle optimization removes media when size exceeds limit."""
        generator = BundleGenerator()

        # Create a bundle with media
        lessons = {
            "Mathematics": [
                Lesson(
                    lesson_id=str(uuid.uuid4()),
                    subject="Mathematics",
                    topic="Test Topic",
                    title="Test Lesson",
                    difficulty=DifficultyLevel.EASY,
                    estimated_minutes=30,
                    curriculum_standards=["MATH-6-001"],
                    sections=[
                        LessonSection(
                            type=LessonSectionType.EXPLANATION,
                            content="Test content",
                            media=[
                                {
                                    "type": "image",
                                    "url": "https://example.com/image.jpg",
                                    "alt": "Test image",
                                }
                            ],
                        )
                    ],
                )
            ]
        }

        bundle = generator.compose_bundle(
            student_id="test-student-1",
            lessons_by_subject=lessons,
            quizzes_by_subject={},
            hints_by_question={},
        )

        # Compress with very small size limit to trigger media removal
        compressed_data, checksum, final_size = generator.compress_and_optimize_bundle(
            bundle=bundle,
            max_size_bytes=100,  # Very small limit
            weeks=1,
        )

        # Verify media was removed
        assert bundle.subjects[0].lessons[0].sections[0].media is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
