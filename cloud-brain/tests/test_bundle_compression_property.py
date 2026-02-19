"""Property-based tests for bundle compression.

Feature: sikshya-sathi-system
Property 5: Bundle Compression

For any Learning Bundle, the compressed size must not exceed 5MB per week of
content, and the bundle must contain properly structured lessons, quizzes, and hints.

Validates: Requirements 2.8, 4.4
"""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck, assume

from src.models.content import (
    DifficultyLevel,
    BloomLevel,
    Lesson,
    LessonSection,
    LessonSectionType,
    Quiz,
    Question,
    QuestionType,
    Hint,
    SubjectContent,
    RevisionPlan,
    StudyTrack,
    WeekPlan,
)
from src.services.bundle_packager import BundlePackager


# Constants for size constraints
MAX_SIZE_PER_WEEK_MB = 5
MAX_SIZE_PER_WEEK_BYTES = MAX_SIZE_PER_WEEK_MB * 1024 * 1024


# Custom strategies for generating test data
@st.composite
def lesson_section_strategy(draw):
    """Generate a lesson section."""
    section_type = draw(st.sampled_from(list(LessonSectionType)))
    
    # Generate realistic content length (100-1000 characters)
    content = draw(st.text(min_size=100, max_size=1000, alphabet=st.characters(
        whitelist_categories=('Lu', 'Ll', 'Nd', 'P', 'Zs'),
        blacklist_characters='\x00\r\n'
    )))
    
    return LessonSection(
        type=section_type,
        content=content,
        media=None  # Keep simple for compression testing
    )


@st.composite
def lesson_strategy(draw, subject="Mathematics"):
    """Generate a lesson."""
    lesson_id = f"lesson-{draw(st.integers(min_value=1, max_value=10000))}"
    topic = draw(st.sampled_from(["Algebra", "Geometry", "Arithmetic", "Statistics"]))
    
    # Generate 1-5 sections per lesson
    num_sections = draw(st.integers(min_value=1, max_value=5))
    sections = [draw(lesson_section_strategy()) for _ in range(num_sections)]
    
    return Lesson(
        lesson_id=lesson_id,
        subject=subject,
        topic=topic,
        title=f"{topic} Lesson {draw(st.integers(min_value=1, max_value=100))}",
        difficulty=draw(st.sampled_from(list(DifficultyLevel))),
        estimated_minutes=draw(st.integers(min_value=10, max_value=60)),
        curriculum_standards=[f"MATH-{draw(st.integers(min_value=6, max_value=8))}-{topic[:3].upper()}-{draw(st.integers(min_value=1, max_value=10))}"],
        sections=sections,
    )


@st.composite
def question_strategy(draw):
    """Generate a quiz question."""
    question_id = f"q-{draw(st.integers(min_value=1, max_value=10000))}"
    question_type = draw(st.sampled_from(list(QuestionType)))
    
    # Generate question text (50-300 characters)
    question_text = draw(st.text(min_size=50, max_size=300, alphabet=st.characters(
        whitelist_categories=('Lu', 'Ll', 'Nd', 'P', 'Zs'),
        blacklist_characters='\x00\r\n'
    )))
    
    # Generate options for multiple choice
    options = None
    if question_type == QuestionType.MULTIPLE_CHOICE:
        options = [
            draw(st.text(min_size=5, max_size=50)) for _ in range(4)
        ]
        correct_answer = draw(st.sampled_from(options))
    else:
        correct_answer = draw(st.text(min_size=5, max_size=50))
    
    explanation = draw(st.text(min_size=50, max_size=200))
    
    return Question(
        question_id=question_id,
        type=question_type,
        question=question_text,
        options=options,
        correct_answer=correct_answer,
        explanation=explanation,
        curriculum_standard=f"MATH-{draw(st.integers(min_value=6, max_value=8))}-ALG-{draw(st.integers(min_value=1, max_value=10))}",
        bloom_level=draw(st.sampled_from(list(BloomLevel))),
    )


@st.composite
def quiz_strategy(draw, subject="Mathematics"):
    """Generate a quiz."""
    quiz_id = f"quiz-{draw(st.integers(min_value=1, max_value=10000))}"
    topic = draw(st.sampled_from(["Algebra", "Geometry", "Arithmetic", "Statistics"]))
    
    # Generate 3-10 questions per quiz
    num_questions = draw(st.integers(min_value=3, max_value=10))
    questions = [draw(question_strategy()) for _ in range(num_questions)]
    
    return Quiz(
        quiz_id=quiz_id,
        subject=subject,
        topic=topic,
        title=f"{topic} Quiz {draw(st.integers(min_value=1, max_value=100))}",
        difficulty=draw(st.sampled_from(list(DifficultyLevel))),
        time_limit=draw(st.one_of(st.none(), st.integers(min_value=10, max_value=60))),
        questions=questions,
    )


@st.composite
def hint_strategy(draw):
    """Generate a hint."""
    hint_id = f"hint-{draw(st.integers(min_value=1, max_value=10000))}"
    level = draw(st.integers(min_value=1, max_value=3))
    text = draw(st.text(min_size=20, max_size=150))
    
    return Hint(
        hint_id=hint_id,
        level=level,
        text=text,
    )


@st.composite
def subject_content_strategy(draw, subject="Mathematics", num_lessons=None, num_quizzes=None):
    """Generate subject content with configurable lesson/quiz counts."""
    # Default to reasonable ranges if not specified
    if num_lessons is None:
        num_lessons = draw(st.integers(min_value=5, max_value=15))
    if num_quizzes is None:
        num_quizzes = draw(st.integers(min_value=3, max_value=10))
    
    lessons = [draw(lesson_strategy(subject=subject)) for _ in range(num_lessons)]
    quizzes = [draw(quiz_strategy(subject=subject)) for _ in range(num_quizzes)]
    
    # Generate hints for quiz questions
    hints = {}
    for quiz in quizzes:
        for question in quiz.questions:
            # Generate 1-3 hints per question
            num_hints = draw(st.integers(min_value=1, max_value=3))
            hints[question.question_id] = [draw(hint_strategy()) for _ in range(num_hints)]
    
    return SubjectContent(
        subject=subject,
        lessons=lessons,
        quizzes=quizzes,
        hints=hints,
        revision_plan=None,  # Keep simple for compression testing
        study_track=None,
    )


@pytest.fixture
def packager():
    """Create bundle packager instance."""
    return BundlePackager()


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    subject_content=subject_content_strategy(),
    duration_weeks=st.integers(min_value=1, max_value=4),
)
def test_property_5_bundle_size_constraint(packager, subject_content, duration_weeks):
    """Property 5: Bundle Compression - Size Constraint
    
    For any Learning Bundle, the compressed size must not exceed 5MB per week
    of content.
    
    This property verifies that:
    1. Compressed bundle size is within the 5MB per week limit
    2. Compression is effective (compressed < uncompressed)
    3. Bundle can be decompressed successfully
    """
    # Create and compress bundle
    compressed_data, checksum, signature, bundle = packager.package_bundle(
        student_id=f"student-{duration_weeks}",
        subjects=[subject_content],
        duration_weeks=duration_weeks,
    )
    
    # Property 5: Compressed size must not exceed 5MB per week
    max_allowed_size = MAX_SIZE_PER_WEEK_BYTES * duration_weeks
    assert len(compressed_data) <= max_allowed_size, \
        f"Bundle size {len(compressed_data)} bytes exceeds limit of {max_allowed_size} bytes " \
        f"for {duration_weeks} week(s) (5MB per week)"
    
    # Property 5: Bundle metadata must reflect actual compressed size
    assert bundle.total_size == len(compressed_data), \
        "Bundle metadata size must match actual compressed data size"
    
    # Property 5: Compression must be effective (compressed < uncompressed)
    uncompressed_json = bundle.model_dump_json()
    uncompressed_size = len(uncompressed_json.encode("utf-8"))
    assert len(compressed_data) < uncompressed_size, \
        f"Compressed size {len(compressed_data)} should be less than uncompressed {uncompressed_size}"
    
    # Property 5: Bundle must be decompressible
    decompressed_bundle = packager.decompress_bundle(compressed_data)
    assert decompressed_bundle.bundle_id == bundle.bundle_id, \
        "Decompressed bundle must have same ID as original"
    assert decompressed_bundle.student_id == bundle.student_id, \
        "Decompressed bundle must have same student ID as original"


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    subject_content=subject_content_strategy(),
    duration_weeks=st.integers(min_value=1, max_value=4),
)
def test_property_5_bundle_structure_integrity(packager, subject_content, duration_weeks):
    """Property 5: Bundle Compression - Structure Integrity
    
    For any Learning Bundle, the bundle must contain properly structured
    lessons, quizzes, and hints after compression and decompression.
    
    This property verifies that:
    1. All lessons are preserved
    2. All quizzes are preserved
    3. All hints are preserved
    4. Content structure is intact
    """
    # Create and compress bundle
    compressed_data, _, _, bundle = packager.package_bundle(
        student_id=f"student-{duration_weeks}",
        subjects=[subject_content],
        duration_weeks=duration_weeks,
    )
    
    # Decompress bundle
    decompressed_bundle = packager.decompress_bundle(compressed_data)
    
    # Property 5: Bundle must have subjects
    assert len(decompressed_bundle.subjects) > 0, \
        "Bundle must contain at least one subject"
    
    # Property 5: All subjects must be preserved
    assert len(decompressed_bundle.subjects) == len(bundle.subjects), \
        "All subjects must be preserved after compression/decompression"
    
    # Check first subject (we only have one in this test)
    original_subject = subject_content
    decompressed_subject = decompressed_bundle.subjects[0]
    
    # Property 5: All lessons must be preserved
    assert len(decompressed_subject.lessons) == len(original_subject.lessons), \
        f"All {len(original_subject.lessons)} lessons must be preserved"
    
    # Property 5: All quizzes must be preserved
    assert len(decompressed_subject.quizzes) == len(original_subject.quizzes), \
        f"All {len(original_subject.quizzes)} quizzes must be preserved"
    
    # Property 5: All hints must be preserved
    assert len(decompressed_subject.hints) == len(original_subject.hints), \
        f"All hints for {len(original_subject.hints)} questions must be preserved"
    
    # Property 5: Lesson structure must be intact
    for i, lesson in enumerate(decompressed_subject.lessons):
        original_lesson = original_subject.lessons[i]
        assert lesson.lesson_id == original_lesson.lesson_id, \
            "Lesson IDs must be preserved"
        assert lesson.subject == original_lesson.subject, \
            "Lesson subject must be preserved"
        assert len(lesson.sections) == len(original_lesson.sections), \
            "All lesson sections must be preserved"
    
    # Property 5: Quiz structure must be intact
    for i, quiz in enumerate(decompressed_subject.quizzes):
        original_quiz = original_subject.quizzes[i]
        assert quiz.quiz_id == original_quiz.quiz_id, \
            "Quiz IDs must be preserved"
        assert len(quiz.questions) == len(original_quiz.questions), \
            "All quiz questions must be preserved"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow, HealthCheck.data_too_large]
)
@given(
    subject_content=subject_content_strategy(num_lessons=10, num_quizzes=5),
    duration_weeks=st.just(2),  # Fixed at 2 weeks for this test
)
def test_property_5_compression_ratio(packager, subject_content, duration_weeks):
    """Property 5: Bundle Compression - Compression Ratio
    
    For any Learning Bundle, brotli compression should achieve a reasonable
    compression ratio (at least 30% reduction).
    
    This property verifies that:
    1. Compression reduces size by at least 30%
    2. Larger bundles benefit from compression
    3. Compression is consistent across different content sizes
    """
    # Create bundle
    bundle = packager.create_bundle(
        student_id="test-student",
        subjects=[subject_content],
        duration_weeks=duration_weeks,
    )
    
    # Get uncompressed size
    uncompressed_json = bundle.model_dump_json()
    uncompressed_size = len(uncompressed_json.encode("utf-8"))
    
    # Compress bundle
    compressed_data = packager.compress_bundle(bundle)
    compressed_size = len(compressed_data)
    
    # Property 5: Compression ratio should be at least 30% reduction
    compression_ratio = (uncompressed_size - compressed_size) / uncompressed_size
    assert compression_ratio >= 0.30, \
        f"Compression should reduce size by at least 30%, got {compression_ratio*100:.1f}% " \
        f"(uncompressed: {uncompressed_size}, compressed: {compressed_size})"
    
    # Property 5: Compressed size must still be within limits
    max_allowed_size = MAX_SIZE_PER_WEEK_BYTES * duration_weeks
    assert compressed_size <= max_allowed_size, \
        f"Even with good compression, bundle must be within {max_allowed_size} bytes limit"


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    subject_content=subject_content_strategy(),
    duration_weeks=st.integers(min_value=1, max_value=4),
)
def test_property_5_bundle_metadata_accuracy(packager, subject_content, duration_weeks):
    """Property 5: Bundle Compression - Metadata Accuracy
    
    For any Learning Bundle, the metadata (size, checksum) must accurately
    reflect the compressed bundle.
    
    This property verifies that:
    1. Bundle size metadata matches actual compressed size
    2. Checksum is correctly calculated
    3. Bundle validity period is set correctly
    """
    # Package bundle
    compressed_data, checksum, signature, bundle = packager.package_bundle(
        student_id=f"student-{duration_weeks}",
        subjects=[subject_content],
        duration_weeks=duration_weeks,
    )
    
    # Property 5: Bundle size must match compressed data size
    assert bundle.total_size == len(compressed_data), \
        f"Bundle metadata size {bundle.total_size} must match compressed size {len(compressed_data)}"
    
    # Property 5: Bundle checksum must match calculated checksum
    assert bundle.checksum == checksum, \
        "Bundle metadata checksum must match calculated checksum"
    
    # Property 5: Checksum must be valid SHA-256 (64 hex characters)
    assert len(checksum) == 64, \
        "Checksum must be 64 characters (SHA-256 hex)"
    assert all(c in '0123456789abcdef' for c in checksum), \
        "Checksum must be valid hexadecimal"
    
    # Property 5: Bundle validity period must be correct
    validity_duration = bundle.valid_until - bundle.valid_from
    expected_days = duration_weeks * 7
    actual_days = validity_duration.days
    
    # Allow for small rounding differences
    assert abs(actual_days - expected_days) <= 1, \
        f"Bundle validity should be {expected_days} days, got {actual_days}"
    
    # Property 5: Bundle must have valid student ID
    assert bundle.student_id is not None and len(bundle.student_id) > 0, \
        "Bundle must have a valid student ID"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow, HealthCheck.data_too_large]
)
@given(
    subject_content=subject_content_strategy(num_lessons=5, num_quizzes=3),
    duration_weeks=st.integers(min_value=1, max_value=4),
)
def test_property_5_bundle_validation_integrity(packager, subject_content, duration_weeks):
    """Property 5: Bundle Compression - Validation Integrity
    
    For any Learning Bundle, the validation process must correctly verify
    bundle integrity using checksum and signature.
    
    This property verifies that:
    1. Valid bundles pass validation
    2. Tampered bundles fail validation
    3. Signature verification works correctly
    """
    # Package bundle
    compressed_data, checksum, signature, bundle = packager.package_bundle(
        student_id=f"student-{duration_weeks}",
        subjects=[subject_content],
        duration_weeks=duration_weeks,
    )
    
    # Property 5: Valid bundle must pass validation
    is_valid = packager.validate_bundle(compressed_data, checksum, signature)
    assert is_valid is True, \
        "Valid bundle with correct checksum and signature must pass validation"
    
    # Property 5: Bundle with wrong checksum must fail validation
    wrong_checksum = "0" * 64
    is_valid_wrong_checksum = packager.validate_bundle(compressed_data, wrong_checksum, signature)
    assert is_valid_wrong_checksum is False, \
        "Bundle with incorrect checksum must fail validation"
    
    # Property 5: Bundle with wrong signature must fail validation
    wrong_signature = b"invalid_signature_data"
    is_valid_wrong_signature = packager.validate_bundle(compressed_data, checksum, wrong_signature)
    assert is_valid_wrong_signature is False, \
        "Bundle with incorrect signature must fail validation"
    
    # Property 5: Tampered data must fail validation
    if len(compressed_data) > 10:
        # Tamper with a byte in the middle
        tampered_data = bytearray(compressed_data)
        tampered_data[len(tampered_data) // 2] ^= 0xFF  # Flip bits
        tampered_data = bytes(tampered_data)
        
        is_valid_tampered = packager.validate_bundle(tampered_data, checksum, signature)
        assert is_valid_tampered is False, \
            "Tampered bundle data must fail validation"


@pytest.mark.property_test
@settings(
    max_examples=30,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    duration_weeks=st.integers(min_value=1, max_value=4),
)
def test_property_5_empty_bundle_handling(packager, duration_weeks):
    """Property 5: Bundle Compression - Empty Bundle Handling
    
    For any bundle with minimal content, compression and validation should
    still work correctly.
    
    This property verifies that:
    1. Empty or minimal bundles can be compressed
    2. Size constraints are still respected
    3. Structure is preserved even for minimal content
    """
    # Create minimal subject content (1 lesson, 1 quiz)
    minimal_lesson = Lesson(
        lesson_id="lesson-1",
        subject="Mathematics",
        topic="Test",
        title="Minimal Lesson",
        difficulty=DifficultyLevel.EASY,
        estimated_minutes=10,
        curriculum_standards=["TEST-1"],
        sections=[
            LessonSection(
                type=LessonSectionType.EXPLANATION,
                content="Minimal content for testing.",
            )
        ],
    )
    
    minimal_quiz = Quiz(
        quiz_id="quiz-1",
        subject="Mathematics",
        topic="Test",
        title="Minimal Quiz",
        difficulty=DifficultyLevel.EASY,
        questions=[
            Question(
                question_id="q1",
                type=QuestionType.TRUE_FALSE,
                question="Is this a test?",
                correct_answer="True",
                explanation="Yes, this is a test.",
                curriculum_standard="TEST-1",
                bloom_level=BloomLevel.REMEMBER,
            )
        ],
    )
    
    minimal_content = SubjectContent(
        subject="Mathematics",
        lessons=[minimal_lesson],
        quizzes=[minimal_quiz],
        hints={"q1": [Hint(hint_id="h1", level=1, text="Think about it.")]},
    )
    
    # Package minimal bundle
    compressed_data, checksum, signature, bundle = packager.package_bundle(
        student_id="test-student",
        subjects=[minimal_content],
        duration_weeks=duration_weeks,
    )
    
    # Property 5: Minimal bundle must still be within size limits
    max_allowed_size = MAX_SIZE_PER_WEEK_BYTES * duration_weeks
    assert len(compressed_data) <= max_allowed_size, \
        "Even minimal bundles must respect size constraints"
    
    # Property 5: Minimal bundle must be valid
    is_valid = packager.validate_bundle(compressed_data, checksum, signature)
    assert is_valid is True, \
        "Minimal bundle must pass validation"
    
    # Property 5: Minimal bundle must be decompressible
    decompressed = packager.decompress_bundle(compressed_data)
    assert len(decompressed.subjects) == 1, \
        "Minimal bundle must preserve subject"
    assert len(decompressed.subjects[0].lessons) == 1, \
        "Minimal bundle must preserve lesson"
    assert len(decompressed.subjects[0].quizzes) == 1, \
        "Minimal bundle must preserve quiz"
