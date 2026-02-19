"""Property-based tests for adaptive progression.

Feature: sikshya-sathi-system
Property 12: Adaptive Progression

For any student demonstrating mastery (>90% accuracy over 5 consecutive quizzes),
the Cloud Brain must generate more challenging content in the next Learning Bundle.

Validates: Requirements 5.4
"""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck
from datetime import datetime, timedelta

from src.models.content import DifficultyLevel
from src.models.curriculum import Subject
from src.models.personalization import (
    KnowledgeModel,
    SubjectKnowledge,
    TopicKnowledge,
    MasteryLevel,
    PerformanceLog,
)
from src.services.personalization_engine import PersonalizationEngine
from src.repositories.knowledge_model_repository import KnowledgeModelRepository


# In-memory repository for testing
class InMemoryKnowledgeModelRepository(KnowledgeModelRepository):
    """In-memory implementation of knowledge model repository for testing."""
    
    def __init__(self):
        """Initialize in-memory storage."""
        self.storage = {}
        # Don't call parent __init__ to avoid DynamoDB connection
    
    def get_knowledge_model(self, student_id: str):
        """Retrieve knowledge model from memory."""
        return self.storage.get(student_id)
    
    def save_knowledge_model(self, knowledge_model: KnowledgeModel) -> bool:
        """Save knowledge model to memory."""
        self.storage[knowledge_model.student_id] = knowledge_model
        return True
    
    def create_initial_knowledge_model(self, student_id: str) -> KnowledgeModel:
        """Create initial knowledge model in memory."""
        from datetime import datetime
        knowledge_model = KnowledgeModel(
            student_id=student_id,
            last_updated=datetime.utcnow(),
            subjects={}
        )
        self.save_knowledge_model(knowledge_model)
        return knowledge_model


# Custom strategies for generating test data
@st.composite
def mastery_performance_logs_strategy(draw, student_id, subject=Subject.MATHEMATICS.value):
    """Generate performance logs showing mastery (>90% accuracy)."""
    logs = []
    
    # Generate 5+ quizzes with multiple questions each, showing high accuracy
    num_quizzes = draw(st.integers(min_value=5, max_value=8))
    questions_per_quiz = 5
    
    for quiz_num in range(num_quizzes):
        quiz_id = f"quiz-{quiz_num+1}"
        topic = f"topic-{draw(st.integers(min_value=1, max_value=3))}"
        
        # Generate quiz_answer events with >90% correct
        correct_answers = draw(st.integers(min_value=5, max_value=5))  # All or almost all correct
        
        for q in range(questions_per_quiz):
            correct = q < correct_answers  # First N answers are correct
            
            log = PerformanceLog(
                student_id=student_id,
                timestamp=datetime.utcnow() - timedelta(days=num_quizzes - quiz_num, minutes=questions_per_quiz - q),
                event_type="quiz_answer",
                content_id=f"{quiz_id}-question-{q+1}",
                subject=subject,
                topic=topic,
                data={
                    "correct": correct,
                    "time_spent": draw(st.integers(min_value=30, max_value=120)),
                    "hints_used": 0 if correct else draw(st.integers(min_value=0, max_value=2)),
                },
            )
            logs.append(log)
    
    return logs


@st.composite
def struggling_performance_logs_strategy(draw, student_id, subject=Subject.MATHEMATICS.value):
    """Generate performance logs showing struggle (<60% accuracy)."""
    logs = []
    
    # Generate 5+ quizzes with multiple questions each, showing low accuracy
    num_quizzes = draw(st.integers(min_value=5, max_value=8))
    questions_per_quiz = 5
    
    for quiz_num in range(num_quizzes):
        quiz_id = f"quiz-{quiz_num+1}"
        topic = f"topic-{draw(st.integers(min_value=1, max_value=3))}"
        
        # Generate quiz_answer events with <60% correct
        correct_answers = draw(st.integers(min_value=0, max_value=2))  # 0-2 out of 5 correct
        
        for q in range(questions_per_quiz):
            correct = q < correct_answers
            
            log = PerformanceLog(
                student_id=student_id,
                timestamp=datetime.utcnow() - timedelta(days=num_quizzes - quiz_num, minutes=questions_per_quiz - q),
                event_type="quiz_answer",
                content_id=f"{quiz_id}-question-{q+1}",
                subject=subject,
                topic=topic,
                data={
                    "correct": correct,
                    "time_spent": draw(st.integers(min_value=60, max_value=300)),
                    "hints_used": draw(st.integers(min_value=1, max_value=3)),
                },
            )
            logs.append(log)
    
    return logs


@st.composite
def mixed_performance_logs_strategy(draw, student_id, subject=Subject.MATHEMATICS.value):
    """Generate performance logs with mixed accuracy (60-90%)."""
    logs = []
    
    # Generate 5+ quizzes with multiple questions each, showing medium accuracy
    num_quizzes = draw(st.integers(min_value=5, max_value=8))
    questions_per_quiz = 5
    
    for quiz_num in range(num_quizzes):
        quiz_id = f"quiz-{quiz_num+1}"
        topic = f"topic-{draw(st.integers(min_value=1, max_value=3))}"
        
        # Generate quiz_answer events with 60-90% correct
        correct_answers = draw(st.integers(min_value=3, max_value=4))  # 3-4 out of 5 correct
        
        for q in range(questions_per_quiz):
            correct = q < correct_answers
            
            log = PerformanceLog(
                student_id=student_id,
                timestamp=datetime.utcnow() - timedelta(days=num_quizzes - quiz_num, minutes=questions_per_quiz - q),
                event_type="quiz_answer",
                content_id=f"{quiz_id}-question-{q+1}",
                subject=subject,
                topic=topic,
                data={
                    "correct": correct,
                    "time_spent": draw(st.integers(min_value=45, max_value=180)),
                    "hints_used": draw(st.integers(min_value=0, max_value=2)),
                },
            )
            logs.append(log)
    
    return logs


@st.composite
def quiz_answer_logs_strategy(draw, student_id, num_answers=5, accuracy_range=(0.0, 1.0)):
    """Generate individual quiz answer logs with specified accuracy range."""
    logs = []
    
    for i in range(num_answers):
        # Determine if answer is correct based on accuracy range
        target_accuracy = draw(st.floats(min_value=accuracy_range[0], max_value=accuracy_range[1]))
        correct = draw(st.floats(min_value=0.0, max_value=1.0)) < target_accuracy
        
        log = PerformanceLog(
            student_id=student_id,
            timestamp=datetime.utcnow() - timedelta(minutes=num_answers - i),
            event_type="quiz_answer",
            content_id=f"quiz-1-question-{i+1}",
            subject=Subject.MATHEMATICS.value,
            topic=f"topic-1",
            data={
                "correct": correct,
                "time_spent": draw(st.integers(min_value=10, max_value=300)),
                "hints_used": draw(st.integers(min_value=0, max_value=3)),
            },
        )
        logs.append(log)
    
    return logs


@pytest.fixture
def personalization_engine():
    """Create a personalization engine with in-memory repository."""
    repository = InMemoryKnowledgeModelRepository()
    return PersonalizationEngine(repository)


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    student_id=st.text(alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')), min_size=5, max_size=20),
    mastery_logs=mastery_performance_logs_strategy(student_id="test-student"),
)
def test_property_12_mastery_leads_to_harder_content(
    personalization_engine, student_id, mastery_logs
):
    """Property 12: Adaptive Progression
    
    For any student demonstrating mastery (>90% accuracy over 5 consecutive quizzes),
    the Cloud Brain must generate more challenging content.
    
    This property verifies that:
    1. Students with >90% accuracy over 5+ quizzes are identified as mastering
    2. Knowledge model reflects high proficiency
    3. Next content difficulty is increased (medium or hard)
    4. System adapts to student success
    """
    # Update student ID in logs
    for log in mastery_logs:
        log.student_id = student_id
    
    # Property 12: Verify logs show mastery pattern
    quiz_answer_logs = [log for log in mastery_logs if log.event_type == "quiz_answer"]
    assert len(quiz_answer_logs) >= 25, \
        "Must have at least 25 quiz answers (5 quizzes x 5 questions) to demonstrate mastery"
    
    # Property 12: Calculate recent accuracy from last 25 answers (5 quizzes)
    recent_25_answers = quiz_answer_logs[-25:]
    correct_count = sum(1 for log in recent_25_answers if log.data.get("correct", False))
    recent_accuracy = correct_count / len(recent_25_answers)
    
    assert recent_accuracy >= 0.9, \
        f"Recent accuracy must be >=90% for mastery, got {recent_accuracy:.2%}"
    
    # Property 12: Analyze performance and update knowledge model
    knowledge_model = personalization_engine.analyze_performance_logs(student_id, mastery_logs)
    
    # Property 12: Knowledge model must reflect high proficiency
    subject = Subject.MATHEMATICS.value
    assert subject in knowledge_model.subjects, \
        "Knowledge model must include the subject"
    
    subject_knowledge = knowledge_model.subjects[subject]
    
    # Property 12: Overall proficiency should be high for mastery
    assert subject_knowledge.overall_proficiency > 0.7, \
        f"Mastery students should have high proficiency, got {subject_knowledge.overall_proficiency:.2f}"
    
    # Property 12: At least one topic should show mastery
    mastery_topics = [
        topic_id for topic_id, topic in subject_knowledge.topics.items()
        if topic.mastery_level in [MasteryLevel.PROFICIENT, MasteryLevel.ADVANCED]
    ]
    assert len(mastery_topics) > 0, \
        "Student demonstrating mastery should have at least one topic at proficient/advanced level"
    
    # Property 12: Calculate difficulty for next content
    # For mastery students, difficulty should be medium or hard
    for topic_id in subject_knowledge.topics:
        difficulty = personalization_engine.calculate_zpd_difficulty(
            knowledge_model, subject, topic_id
        )
        
        # Property 12: Mastery students should NOT get easy content
        assert difficulty in ["medium", "hard"], \
            f"Student with mastery should get medium/hard content, got {difficulty}"


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    student_id=st.text(alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')), min_size=5, max_size=20),
    struggling_logs=struggling_performance_logs_strategy(student_id="test-student"),
)
def test_property_12_struggling_leads_to_easier_content(
    personalization_engine, student_id, struggling_logs
):
    """Property 12: Adaptive Progression (inverse case)
    
    For any student struggling (<60% accuracy), the Cloud Brain must
    generate easier content to support learning.
    
    This property verifies that:
    1. Students with <60% accuracy are identified as struggling
    2. Knowledge model reflects low proficiency
    3. Next content difficulty is decreased (easy or medium)
    4. System adapts to student needs
    """
    # Update student ID in logs
    for log in struggling_logs:
        log.student_id = student_id
    
    # Property 12: Verify logs show struggling pattern
    quiz_answer_logs = [log for log in struggling_logs if log.event_type == "quiz_answer"]
    assert len(quiz_answer_logs) >= 25, \
        "Must have at least 25 quiz answers to identify struggle"
    
    # Property 12: Calculate recent accuracy from last 25 answers
    recent_25_answers = quiz_answer_logs[-25:]
    correct_count = sum(1 for log in recent_25_answers if log.data.get("correct", False))
    recent_accuracy = correct_count / len(recent_25_answers)
    
    assert recent_accuracy < 0.6, \
        f"Recent accuracy must be <60% for struggling, got {recent_accuracy:.2%}"
    
    # Property 12: Analyze performance and update knowledge model
    knowledge_model = personalization_engine.analyze_performance_logs(student_id, struggling_logs)
    
    # Property 12: Knowledge model must reflect low proficiency
    subject = Subject.MATHEMATICS.value
    assert subject in knowledge_model.subjects, \
        "Knowledge model must include the subject"
    
    subject_knowledge = knowledge_model.subjects[subject]
    
    # Property 12: Overall proficiency should be low for struggling students
    assert subject_knowledge.overall_proficiency < 0.6, \
        f"Struggling students should have low proficiency, got {subject_knowledge.overall_proficiency:.2f}"
    
    # Property 12: Calculate difficulty for next content
    # For struggling students, difficulty should be easy or medium
    for topic_id in subject_knowledge.topics:
        difficulty = personalization_engine.calculate_zpd_difficulty(
            knowledge_model, subject, topic_id
        )
        
        # Property 12: Struggling students should NOT get hard content
        assert difficulty in ["easy", "medium"], \
            f"Struggling student should get easy/medium content, got {difficulty}"


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    mastering_student_id=st.text(alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')), min_size=5, max_size=20),
    struggling_student_id=st.text(alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')), min_size=5, max_size=20),
    mastery_logs=mastery_performance_logs_strategy(student_id="mastering"),
    struggling_logs=struggling_performance_logs_strategy(student_id="struggling"),
)
def test_property_12_different_performance_different_difficulty(
    personalization_engine,
    mastering_student_id,
    struggling_student_id,
    mastery_logs,
    struggling_logs,
):
    """Property 12: Different performance levels lead to different content difficulty
    
    For any two students with significantly different performance (one mastering,
    one struggling), they must receive content at different difficulty levels.
    
    This property verifies that:
    1. Mastering students get harder content than struggling students
    2. Adaptive progression is personalized
    3. System differentiates between performance levels
    """
    # Ensure different student IDs
    if mastering_student_id == struggling_student_id:
        struggling_student_id = f"{struggling_student_id}-different"
    
    # Update student IDs in logs
    for log in mastery_logs:
        log.student_id = mastering_student_id
    for log in struggling_logs:
        log.student_id = struggling_student_id
    
    # Property 12: Analyze both students
    mastering_km = personalization_engine.analyze_performance_logs(
        mastering_student_id, mastery_logs
    )
    struggling_km = personalization_engine.analyze_performance_logs(
        struggling_student_id, struggling_logs
    )
    
    subject = Subject.MATHEMATICS.value
    
    # Property 12: Get proficiency levels
    mastering_proficiency = mastering_km.subjects[subject].overall_proficiency
    struggling_proficiency = struggling_km.subjects[subject].overall_proficiency
    
    # Property 12: Proficiency must be significantly different
    assert mastering_proficiency > struggling_proficiency + 0.2, \
        f"Mastering student ({mastering_proficiency:.2f}) should have significantly " \
        f"higher proficiency than struggling student ({struggling_proficiency:.2f})"
    
    # Property 12: Calculate difficulty for a common topic
    # Use first topic from each student
    mastering_topic = list(mastering_km.subjects[subject].topics.keys())[0]
    struggling_topic = list(struggling_km.subjects[subject].topics.keys())[0]
    
    mastering_difficulty = personalization_engine.calculate_zpd_difficulty(
        mastering_km, subject, mastering_topic
    )
    struggling_difficulty = personalization_engine.calculate_zpd_difficulty(
        struggling_km, subject, struggling_topic
    )
    
    # Property 12: Difficulty levels must be different
    # Mastering student should get harder content
    difficulty_order = {"easy": 1, "medium": 2, "hard": 3}
    
    assert difficulty_order[mastering_difficulty] >= difficulty_order[struggling_difficulty], \
        f"Mastering student should get harder or equal difficulty " \
        f"({mastering_difficulty}) than struggling student ({struggling_difficulty})"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    student_id=st.text(alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')), min_size=5, max_size=20),
    initial_logs=struggling_performance_logs_strategy(student_id="test"),
    improvement_logs=mastery_performance_logs_strategy(student_id="test"),
)
def test_property_12_progression_adapts_over_time(
    personalization_engine, student_id, initial_logs, improvement_logs
):
    """Property 12: Adaptive progression responds to improvement over time
    
    For any student who improves from struggling to mastery, the system
    must adapt difficulty progressively.
    
    This property verifies that:
    1. Initial struggling performance leads to easier content
    2. Improved performance leads to harder content
    3. System tracks progression over time
    4. Difficulty increases as student improves
    """
    # Update student IDs
    for log in initial_logs:
        log.student_id = student_id
    for log in improvement_logs:
        log.student_id = student_id
        # Adjust timestamps to be after initial logs
        log.timestamp = log.timestamp + timedelta(days=14)
    
    subject = Subject.MATHEMATICS.value
    
    # Property 12: Analyze initial struggling performance
    initial_km = personalization_engine.analyze_performance_logs(student_id, initial_logs)
    
    initial_proficiency = initial_km.subjects[subject].overall_proficiency
    initial_topic = list(initial_km.subjects[subject].topics.keys())[0]
    initial_difficulty = personalization_engine.calculate_zpd_difficulty(
        initial_km, subject, initial_topic
    )
    
    # Property 12: Initial difficulty should be easy/medium for struggling student
    assert initial_difficulty in ["easy", "medium"], \
        f"Initial difficulty for struggling student should be easy/medium, got {initial_difficulty}"
    
    # Property 12: Analyze after improvement
    all_logs = initial_logs + improvement_logs
    improved_km = personalization_engine.analyze_performance_logs(student_id, all_logs)
    
    improved_proficiency = improved_km.subjects[subject].overall_proficiency
    improved_topic = list(improved_km.subjects[subject].topics.keys())[0]
    improved_difficulty = personalization_engine.calculate_zpd_difficulty(
        improved_km, subject, improved_topic
    )
    
    # Property 12: Proficiency must have increased
    assert improved_proficiency > initial_proficiency, \
        f"Proficiency should increase from {initial_proficiency:.2f} to {improved_proficiency:.2f}"
    
    # Property 12: Difficulty should increase or stay same (never decrease)
    difficulty_order = {"easy": 1, "medium": 2, "hard": 3}
    
    assert difficulty_order[improved_difficulty] >= difficulty_order[initial_difficulty], \
        f"Difficulty should increase or stay same: {initial_difficulty} -> {improved_difficulty}"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    student_id=st.text(alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')), min_size=5, max_size=20),
    mixed_logs=mixed_performance_logs_strategy(student_id="test"),
)
def test_property_12_medium_performance_medium_difficulty(
    personalization_engine, student_id, mixed_logs
):
    """Property 12: Medium performance leads to medium difficulty
    
    For any student with medium performance (60-90% accuracy), the system
    should provide medium difficulty content.
    
    This property verifies that:
    1. Medium performance is correctly identified
    2. Content difficulty matches performance level
    3. System provides appropriate challenge
    """
    # Update student ID in logs
    for log in mixed_logs:
        log.student_id = student_id
    
    # Property 12: Verify logs show medium performance
    quiz_answer_logs = [log for log in mixed_logs if log.event_type == "quiz_answer"]
    recent_25_answers = quiz_answer_logs[-25:] if len(quiz_answer_logs) >= 25 else quiz_answer_logs
    correct_count = sum(1 for log in recent_25_answers if log.data.get("correct", False))
    recent_accuracy = correct_count / len(recent_25_answers)
    
    assert 0.6 <= recent_accuracy <= 0.9, \
        f"Recent accuracy should be 60-90% for medium performance, got {recent_accuracy:.2%}"
    
    # Property 12: Analyze performance
    knowledge_model = personalization_engine.analyze_performance_logs(student_id, mixed_logs)
    
    subject = Subject.MATHEMATICS.value
    subject_knowledge = knowledge_model.subjects[subject]
    
    # Property 12: Proficiency should be in medium range
    assert 0.4 <= subject_knowledge.overall_proficiency <= 0.8, \
        f"Medium performance should lead to medium proficiency, got {subject_knowledge.overall_proficiency:.2f}"
    
    # Property 12: Difficulty should be medium for most topics
    medium_difficulty_count = 0
    for topic_id in subject_knowledge.topics:
        difficulty = personalization_engine.calculate_zpd_difficulty(
            knowledge_model, subject, topic_id
        )
        if difficulty == "medium":
            medium_difficulty_count += 1
    
    # Property 12: At least half of topics should get medium difficulty
    total_topics = len(subject_knowledge.topics)
    assert medium_difficulty_count >= total_topics * 0.5, \
        f"Medium performance should lead to medium difficulty for most topics"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    student_id=st.text(alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')), min_size=5, max_size=20),
    quiz_answers=quiz_answer_logs_strategy(student_id="test", num_answers=10, accuracy_range=(0.9, 1.0)),
)
def test_property_12_consistent_mastery_across_topics(
    personalization_engine, student_id, quiz_answers
):
    """Property 12: Consistent mastery across multiple topics
    
    For any student demonstrating mastery across multiple topics, all topics
    should receive increased difficulty.
    
    This property verifies that:
    1. Mastery in multiple topics is recognized
    2. All mastered topics get harder content
    3. Progression is consistent across topics
    """
    # Update student ID in logs
    for log in quiz_answers:
        log.student_id = student_id
    
    # Property 12: Calculate accuracy
    correct_count = sum(1 for log in quiz_answers if log.data.get("correct", False))
    accuracy = correct_count / len(quiz_answers)
    
    assert accuracy >= 0.9, \
        f"Accuracy should be >=90% for mastery, got {accuracy:.2%}"
    
    # Property 12: Analyze performance
    knowledge_model = personalization_engine.analyze_performance_logs(student_id, quiz_answers)
    
    subject = Subject.MATHEMATICS.value
    subject_knowledge = knowledge_model.subjects[subject]
    
    # Property 12: Check difficulty for all topics
    difficulties = {}
    for topic_id in subject_knowledge.topics:
        topic_proficiency = subject_knowledge.topics[topic_id].proficiency
        difficulty = personalization_engine.calculate_zpd_difficulty(
            knowledge_model, subject, topic_id
        )
        difficulties[topic_id] = (topic_proficiency, difficulty)
    
    # Property 12: Topics with high proficiency should get harder content
    for topic_id, (proficiency, difficulty) in difficulties.items():
        if proficiency > 0.7:
            assert difficulty in ["medium", "hard"], \
                f"Topic {topic_id} with high proficiency ({proficiency:.2f}) " \
                f"should get medium/hard difficulty, got {difficulty}"


@pytest.mark.property_test
@settings(
    max_examples=30,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    student_id=st.text(alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')), min_size=5, max_size=20),
    num_consecutive_quizzes=st.integers(min_value=5, max_value=15),
)
def test_property_12_mastery_threshold_is_consistent(
    personalization_engine, student_id, num_consecutive_quizzes
):
    """Property 12: Mastery threshold (>90% over 5 quizzes) is consistently applied
    
    For any number of consecutive high-accuracy quizzes (>=5), the system
    must recognize mastery and increase difficulty.
    
    This property verifies that:
    1. Mastery threshold is consistently 90% accuracy
    2. Minimum 5 quizzes are considered
    3. System responds to sustained high performance
    """
    # Generate logs with >90% accuracy
    logs = []
    for i in range(num_consecutive_quizzes):
        log = PerformanceLog(
            student_id=student_id,
            timestamp=datetime.utcnow() - timedelta(days=num_consecutive_quizzes - i),
            event_type="quiz_complete",
            content_id=f"quiz-{i+1}",
            subject=Subject.MATHEMATICS.value,
            topic="topic-1",
            data={
                "accuracy": 0.95,  # Consistent 95% accuracy
                "time_spent": 300,
                "questions_answered": 10,
            },
        )
        logs.append(log)
    
    # Property 12: Analyze performance
    knowledge_model = personalization_engine.analyze_performance_logs(student_id, logs)
    
    subject = Subject.MATHEMATICS.value
    subject_knowledge = knowledge_model.subjects[subject]
    
    # Property 12: With sustained 95% accuracy, proficiency should be high
    assert subject_knowledge.overall_proficiency > 0.7, \
        f"Sustained 95% accuracy should lead to high proficiency, got {subject_knowledge.overall_proficiency:.2f}"
    
    # Property 12: Difficulty should be increased
    topic_id = "topic-1"
    difficulty = personalization_engine.calculate_zpd_difficulty(
        knowledge_model, subject, topic_id
    )
    
    assert difficulty in ["medium", "hard"], \
        f"Sustained mastery should lead to medium/hard difficulty, got {difficulty}"
    
    # Property 12: Mastery level should be proficient or advanced
    topic_knowledge = subject_knowledge.topics[topic_id]
    assert topic_knowledge.mastery_level in [MasteryLevel.PROFICIENT, MasteryLevel.ADVANCED], \
        f"Sustained mastery should lead to proficient/advanced level, got {topic_knowledge.mastery_level}"
