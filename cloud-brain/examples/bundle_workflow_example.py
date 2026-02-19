"""
Example workflow demonstrating the complete bundle generation and packaging process.

This example shows how the three components work together:
1. BundlePackager - Compresses, signs, and validates bundles
2. BundleStorage - Uploads to S3 and generates presigned URLs
3. BundleMetadataRepository - Stores metadata in DynamoDB

Usage:
    python -m examples.bundle_workflow_example
"""

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

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
    SubjectContent,
)
from src.repositories.bundle_metadata_repository import BundleMetadataRepository
from src.services.bundle_packager import BundlePackager
from src.services.bundle_storage import BundleStorage


def create_sample_content() -> SubjectContent:
    """Create sample educational content."""
    # Create a lesson
    lesson = Lesson(
        lesson_id="lesson-math-001",
        subject="Mathematics",
        topic="Linear Equations",
        title="Introduction to Linear Equations",
        difficulty=DifficultyLevel.MEDIUM,
        estimated_minutes=30,
        curriculum_standards=["MATH-6-ALG-1", "MATH-6-ALG-2"],
        sections=[
            LessonSection(
                type=LessonSectionType.EXPLANATION,
                content="A linear equation is an equation where the highest power of the variable is 1.",
            ),
            LessonSection(
                type=LessonSectionType.EXAMPLE,
                content="Example: 2x + 4 = 10\nSolution: x = 3",
            ),
            LessonSection(
                type=LessonSectionType.PRACTICE,
                content="Try solving: 3x - 6 = 9",
            ),
        ],
    )

    # Create a quiz
    quiz = Quiz(
        quiz_id="quiz-math-001",
        subject="Mathematics",
        topic="Linear Equations",
        title="Linear Equations Practice Quiz",
        difficulty=DifficultyLevel.MEDIUM,
        time_limit=15,
        questions=[
            Question(
                question_id="q1",
                type=QuestionType.MULTIPLE_CHOICE,
                question="What is the solution to 2x + 4 = 10?",
                options=["x = 2", "x = 3", "x = 4", "x = 5"],
                correct_answer="x = 3",
                explanation="Subtract 4 from both sides: 2x = 6, then divide by 2: x = 3",
                curriculum_standard="MATH-6-ALG-1",
                bloom_level=BloomLevel.APPLY,
            ),
            Question(
                question_id="q2",
                type=QuestionType.TRUE_FALSE,
                question="The equation 5x = 15 has the solution x = 3",
                options=["True", "False"],
                correct_answer="True",
                explanation="Dividing both sides by 5 gives x = 3",
                curriculum_standard="MATH-6-ALG-1",
                bloom_level=BloomLevel.UNDERSTAND,
            ),
        ],
    )

    # Create hints
    hints = {
        "q1": [
            Hint(hint_id="h1-1", level=1, text="Start by isolating the variable term."),
            Hint(
                hint_id="h1-2",
                level=2,
                text="Subtract 4 from both sides of the equation.",
            ),
            Hint(hint_id="h1-3", level=3, text="After subtracting, divide both sides by 2."),
        ],
        "q2": [
            Hint(hint_id="h2-1", level=1, text="Try dividing both sides by 5."),
            Hint(hint_id="h2-2", level=2, text="5 × 3 = 15, so x = 3 is correct."),
        ],
    }

    # Create subject content
    return SubjectContent(
        subject="Mathematics", lessons=[lesson], quizzes=[quiz], hints=hints
    )


def main():
    """Demonstrate the complete bundle workflow."""
    print("=" * 60)
    print("Bundle Generation and Packaging Workflow Example")
    print("=" * 60)

    # Configuration (would come from environment variables in production)
    BUCKET_NAME = os.getenv("BUNDLE_BUCKET", "sikshya-sathi-bundles")
    TABLE_NAME = os.getenv("BUNDLE_TABLE", "sikshya-sathi-bundle-metadata")
    REGION = os.getenv("AWS_REGION", "us-east-1")

    student_id = "student-demo-001"
    duration_weeks = 2

    # Step 1: Create sample content
    print("\n1. Creating sample educational content...")
    subject_content = create_sample_content()
    print(f"   ✓ Created content for {subject_content.subject}")
    print(f"   ✓ Lessons: {len(subject_content.lessons)}")
    print(f"   ✓ Quizzes: {len(subject_content.quizzes)}")

    # Step 2: Package the bundle
    print("\n2. Packaging bundle with compression and signing...")
    packager = BundlePackager()

    compressed_data, checksum, signature, bundle = packager.package_bundle(
        student_id=student_id, subjects=[subject_content], duration_weeks=duration_weeks
    )

    print(f"   ✓ Bundle ID: {bundle.bundle_id}")
    print(f"   ✓ Compressed size: {len(compressed_data):,} bytes")
    print(f"   ✓ Checksum: {checksum[:16]}...")
    print(f"   ✓ Signature length: {len(signature)} bytes")
    print(f"   ✓ Valid from: {bundle.valid_from}")
    print(f"   ✓ Valid until: {bundle.valid_until}")

    # Step 3: Validate bundle integrity
    print("\n3. Validating bundle integrity...")
    is_valid = packager.validate_bundle(compressed_data, checksum, signature)
    print(f"   ✓ Bundle validation: {'PASSED' if is_valid else 'FAILED'}")

    # Step 4: Upload to S3 (mock in this example)
    print("\n4. Uploading bundle to S3...")
    print("   (Using mock S3 client for demonstration)")
    # In production:
    # storage = BundleStorage(bucket_name=BUCKET_NAME, region=REGION)
    # s3_key = storage.upload_bundle(
    #     bundle_id=bundle.bundle_id,
    #     student_id=student_id,
    #     compressed_data=compressed_data,
    #     metadata={"checksum": checksum, "size": str(len(compressed_data))}
    # )
    s3_key = f"students/{student_id}/bundles/{bundle.bundle_id}.bundle"
    print(f"   ✓ S3 key: {s3_key}")

    # Step 5: Generate presigned URL (mock)
    print("\n5. Generating presigned download URL...")
    # In production:
    # presigned_url = storage.generate_presigned_url(s3_key, expiration=3600)
    presigned_url = f"https://{BUCKET_NAME}.s3.amazonaws.com/{s3_key}?presigned=true"
    print(f"   ✓ URL: {presigned_url[:60]}...")
    print(f"   ✓ Expires in: 1 hour")

    # Step 6: Store metadata in DynamoDB (mock)
    print("\n6. Storing bundle metadata in DynamoDB...")
    print("   (Using mock DynamoDB client for demonstration)")
    # In production:
    # repository = BundleMetadataRepository(table_name=TABLE_NAME, region=REGION)
    # metadata = repository.create_bundle_metadata(
    #     bundle_id=bundle.bundle_id,
    #     student_id=student_id,
    #     s3_key=s3_key,
    #     total_size=len(compressed_data),
    #     checksum=checksum,
    #     valid_from=bundle.valid_from,
    #     valid_until=bundle.valid_until,
    #     subjects=[subject_content.subject],
    # )
    print(f"   ✓ Metadata stored for bundle {bundle.bundle_id}")

    # Step 7: Summary
    print("\n" + "=" * 60)
    print("Bundle Workflow Complete!")
    print("=" * 60)
    print(f"\nBundle Summary:")
    print(f"  • Bundle ID: {bundle.bundle_id}")
    print(f"  • Student ID: {student_id}")
    print(f"  • Size: {len(compressed_data):,} bytes")
    print(f"  • Subjects: {', '.join([s.subject for s in bundle.subjects])}")
    print(f"  • Duration: {duration_weeks} weeks")
    print(f"  • Status: Ready for download")
    print(f"\nNext Steps:")
    print(f"  1. Local Brain downloads bundle from presigned URL")
    print(f"  2. Local Brain verifies checksum and signature")
    print(f"  3. Local Brain decompresses and imports content")
    print(f"  4. Student can learn offline for {duration_weeks} weeks")
    print()


if __name__ == "__main__":
    main()
