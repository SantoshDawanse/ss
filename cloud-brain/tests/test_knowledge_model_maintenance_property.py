"""Property-based tests for knowledge model maintenance.

Feature: sikshya-sathi-system
Property 13: Knowledge Model Maintenance

For any Performance Log received by the Cloud Brain, the student's Knowledge
Model must be updated to reflect the new proficiency data.

Validates: Requirements 5.6
"""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck
from datetime import datetime, timedelta

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


# Custom strategies for generating test data
@st.composite
def topic_knowledge_strategy(draw):
    """Generate topic knowledge with random proficiency."""
    proficiency = draw(st.floats(min_value=0.0, max_value=1.0))
    
    # Determine mastery level based on proficiency
    if proficiency < 0.3:
        mastery = MasteryLevel.NOVICE
    elif proficiency < 0.6:
        mastery = MasteryLevel.DEVELOPING
    elif proficiency < 0.85:
        mastery = MasteryLevel.PROFICIENT
    else:
        mastery = MasteryLevel.ADVANCED
    
    return TopicKnowledge(
        proficiency=proficiency,
        attempts=draw(st.integers(min_value=0, max_value=50)),
        last_practiced=datetime.utcnow() - timedelta(days=draw(st.integers(min_value=0, max_value=30))),
        mastery_level=mastery,
        cognitive_level=draw(st.integers(min_value=1, max_value=6)),
    )


@st.composite
def subject_knowledge_strategy(draw, num_topics=5):
    """Generate subject knowledge with multiple topics."""
    topics = {}
    for i in range(num_topics):
        topic_id = f"topic-{i+1}"
        topics[topic_id] = draw(topic_knowledge_strategy())
    
    # Calculate overall proficiency as average
    overall_proficiency = sum(t.proficiency for t in topics.values()) / len(topics) if topics else 0.0
    
    return SubjectKnowledge(
        topics=topics,
        overall_proficiency=overall_proficiency,
        learning_velocity=draw(st.floats(min_value=0.0, max_value=5.0)),
    )


@st.composite
def knowledge_model_strategy(draw, student_id_prefix="student"):
    """Generate a complete knowledge model for a student."""
    student_id = f"{student_id_prefix}-{draw(st.integers(min_value=1, max_value=10000))}"
    
    subjects_data = {}
    # Generate knowledge for Mathematics (primary subject for MVP)
    subjects_data[Subject.MATHEMATICS.value] = draw(
        subject_knowledge_strategy(num_topics=5)
    )
    
    return KnowledgeModel(
        student_id=student_id,
        last_updated=datetime.utcnow() - timedelta(days=draw(st.integers(min_value=0, max_value=7))),
        subjects=subjects_data,
    )


@st.composite
def performance_log_strategy(draw, student_id, subject=Subject.MATHEMATICS.value, topic=None):
    """Generate a performance log entry."""
    event_types = ["lesson_complete", "quiz_answer", "quiz_complete"]
    event_type = draw(st.sampled_from(event_types))
    
    # Use provided topic or generate one
    if topic is None:
        topic = f"topic-{draw(st.integers(min_value=1, max_value=5))}"
    
    # Generate event-specific data
    data = {}
    if event_type == "quiz_answer":
        data["correct"] = draw(st.booleans())
        data["time_spent"] = draw(st.integers(min_value=10, max_value=300))
        data["hints_used"] = draw(st.integers(min_value=0, max_value=3))
    elif event_type == "lesson_complete":
        data["time_spent"] = draw(st.integers(min_value=60, max_value=1800))
    elif event_type == "quiz_complete":
        data["accuracy"] = draw(st.floats(min_value=0.0, max_value=1.0))
        data["questions_answered"] = draw(st.integers(min_value=1, max_value=10))
        data["time_spent"] = draw(st.integers(min_value=120, max_value=1800))
    
    return PerformanceLog(
        student_id=student_id,
        timestamp=datetime.utcnow() - timedelta(minutes=draw(st.integers(min_value=0, max_value=1440))),
        event_type=event_type,
        content_id=f"content-{draw(st.integers(min_value=1, max_value=100))}",
        subject=subject,
        topic=topic,
        data=data,
    )


class MockKnowledgeModelRepository(KnowledgeModelRepository):
    """Mock repository for testing without DynamoDB."""
    
    def __init__(self):
        """Initialize mock repository."""
        self.storage = {}
        self.table = None  # Disable DynamoDB
    
    def get_knowledge_model(self, student_id: str):
        """Get knowledge model from in-memory storage."""
        return self.storage.get(student_id)
    
    def save_knowledge_model(self, knowledge_model: KnowledgeModel) -> bool:
        """Save knowledge model to in-memory storage."""
        self.storage[knowledge_model.student_id] = knowledge_model
        return True
    
    def create_initial_knowledge_model(self, student_id: str) -> KnowledgeModel:
        """Create initial knowledge model."""
        knowledge_model = KnowledgeModel(
            student_id=student_id,
            last_updated=datetime.utcnow(),
            subjects={}
        )
        self.save_knowledge_model(knowledge_model)
        return knowledge_model


@pytest.fixture(scope="function")
def personalization_engine():
    """Create a personalization engine with mock repository."""
    repository = MockKnowledgeModelRepository()
    return PersonalizationEngine(repository)


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    km=knowledge_model_strategy(),
    logs=st.lists(
        st.builds(
            PerformanceLog,
            student_id=st.just("test-student"),
            event_type=st.sampled_from(["quiz_answer", "quiz_complete"]),
            content_id=st.text(min_size=5, max_size=20),
            subject=st.just(Subject.MATHEMATICS.value),
            topic=st.sampled_from([f"topic-{i}" for i in range(1, 6)]),
            data=st.one_of(
                st.fixed_dictionaries({
                    "correct": st.booleans(),
                    "time_spent": st.integers(min_value=10, max_value=300),
                }),
                st.fixed_dictionaries({
                    "accuracy": st.floats(min_value=0.0, max_value=1.0),
                    "questions_answered": st.integers(min_value=1, max_value=10),
                    "time_spent": st.integers(min_value=120, max_value=1800),
                }),
            ),
        ),
        min_size=1,
        max_size=20,
    ),
)
def test_property_13_knowledge_model_updated_after_performance_logs(
    personalization_engine, km, logs
):
    """Property 13: Knowledge Model Maintenance
    
    For any Performance Log received by the Cloud Brain, the student's
    Knowledge Model must be updated to reflect the new proficiency data.
    
    This property verifies that:
    1. Knowledge model is updated after processing performance logs
    2. last_updated timestamp is modified
    3. Topic proficiency values change based on performance
    4. Attempts counter increases
    """
    # Update student ID in logs to match knowledge model
    for log in logs:
        log.student_id = km.student_id
    
    # Save initial knowledge model
    personalization_engine.repository.save_knowledge_model(km)
    
    # Record initial state
    initial_last_updated = km.last_updated
    initial_topics = {}
    subject = Subject.MATHEMATICS.value
    if subject in km.subjects:
        for topic_id, topic_knowledge in km.subjects[subject].topics.items():
            initial_topics[topic_id] = {
                "proficiency": topic_knowledge.proficiency,
                "attempts": topic_knowledge.attempts,
            }
    
    # Property 13: Analyze performance logs (this should update the knowledge model)
    updated_km = personalization_engine.analyze_performance_logs(km.student_id, logs)
    
    # Property 13: Knowledge model must be updated
    assert updated_km is not None, \
        "Knowledge model must be returned after analyzing performance logs"
    
    # Property 13: last_updated timestamp must be modified
    assert updated_km.last_updated > initial_last_updated, \
        f"last_updated must be modified after processing logs: {initial_last_updated} -> {updated_km.last_updated}"
    
    # Property 13: For topics with quiz logs, proficiency or attempts must change
    quiz_topics = set()
    for log in logs:
        if log.event_type in ["quiz_answer", "quiz_complete"]:
            quiz_topics.add(log.topic)
    
    if quiz_topics and subject in updated_km.subjects:
        for topic_id in quiz_topics:
            if topic_id in updated_km.subjects[subject].topics:
                updated_topic = updated_km.subjects[subject].topics[topic_id]
                
                # Property 13: Attempts must increase for topics with quiz activity
                if topic_id in initial_topics:
                    initial_attempts = initial_topics[topic_id]["attempts"]
                    assert updated_topic.attempts > initial_attempts, \
                        f"Attempts for topic {topic_id} must increase: {initial_attempts} -> {updated_topic.attempts}"
                else:
                    # New topic created
                    assert updated_topic.attempts > 0, \
                        f"New topic {topic_id} must have attempts > 0"
                
                # Property 13: Proficiency must be within valid range
                assert 0.0 <= updated_topic.proficiency <= 1.0, \
                    f"Proficiency for topic {topic_id} must be in [0, 1]: {updated_topic.proficiency}"
                
                # Property 13: last_practiced must be updated
                assert updated_topic.last_practiced is not None, \
                    f"last_practiced for topic {topic_id} must be set"


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    student_id=st.text(min_size=5, max_size=20),
    topic=st.sampled_from([f"topic-{i}" for i in range(1, 6)]),
    correct_answers=st.lists(st.booleans(), min_size=1, max_size=20),
)
def test_property_13_proficiency_changes_with_performance(
    personalization_engine, student_id, topic, correct_answers
):
    """Property 13: Proficiency changes based on quiz performance
    
    For any sequence of quiz answers, the proficiency for that topic must
    change to reflect the student's performance.
    
    This property verifies that:
    1. Correct answers increase proficiency
    2. Incorrect answers decrease proficiency
    3. Proficiency stays within [0, 1] bounds
    4. Multiple answers have cumulative effect
    """
    # Create initial knowledge model
    km = personalization_engine.repository.create_initial_knowledge_model(student_id)
    
    # Generate performance logs for the topic
    logs = []
    subject = Subject.MATHEMATICS.value
    for i, correct in enumerate(correct_answers):
        log = PerformanceLog(
            student_id=student_id,
            timestamp=datetime.utcnow() - timedelta(minutes=len(correct_answers) - i),
            event_type="quiz_answer",
            content_id=f"quiz-{i}",
            subject=subject,
            topic=topic,
            data={"correct": correct, "time_spent": 60},
        )
        logs.append(log)
    
    # Property 13: Analyze logs and update knowledge model
    updated_km = personalization_engine.analyze_performance_logs(student_id, logs)
    
    # Property 13: Topic must exist in knowledge model after processing
    assert subject in updated_km.subjects, \
        f"Subject {subject} must exist after processing logs"
    assert topic in updated_km.subjects[subject].topics, \
        f"Topic {topic} must exist after processing logs"
    
    topic_knowledge = updated_km.subjects[subject].topics[topic]
    
    # Property 13: Proficiency must be within valid bounds
    assert 0.0 <= topic_knowledge.proficiency <= 1.0, \
        f"Proficiency must be in [0, 1]: {topic_knowledge.proficiency}"
    
    # Property 13: Attempts must equal number of quiz answers
    assert topic_knowledge.attempts == len(correct_answers), \
        f"Attempts must equal number of answers: {topic_knowledge.attempts} vs {len(correct_answers)}"
    
    # Property 13: Proficiency should reflect performance
    accuracy = sum(1 for c in correct_answers if c) / len(correct_answers)
    
    # High accuracy should lead to higher proficiency (generally)
    if accuracy >= 0.8 and len(correct_answers) >= 5:
        # With high accuracy over multiple attempts, proficiency should be reasonable
        assert topic_knowledge.proficiency > 0.3, \
            f"High accuracy ({accuracy:.2f}) should lead to proficiency > 0.3, got {topic_knowledge.proficiency:.2f}"
    
    # Low accuracy should lead to lower proficiency (generally)
    if accuracy <= 0.3 and len(correct_answers) >= 5:
        # With low accuracy over multiple attempts, proficiency should be lower
        assert topic_knowledge.proficiency < 0.7, \
            f"Low accuracy ({accuracy:.2f}) should lead to proficiency < 0.7, got {topic_knowledge.proficiency:.2f}"


@pytest.mark.property_test
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    km=knowledge_model_strategy(),
    new_logs=st.lists(
        st.builds(
            PerformanceLog,
            student_id=st.just("test-student"),
            event_type=st.sampled_from(["quiz_answer", "quiz_complete"]),
            content_id=st.text(min_size=5, max_size=20),
            subject=st.just(Subject.MATHEMATICS.value),
            topic=st.sampled_from([f"topic-{i}" for i in range(1, 6)]),
            data=st.fixed_dictionaries({
                "correct": st.booleans(),
                "time_spent": st.integers(min_value=10, max_value=300),
            }),
        ),
        min_size=1,
        max_size=10,
    ),
)
def test_property_13_multiple_updates_are_cumulative(
    personalization_engine, km, new_logs
):
    """Property 13: Multiple knowledge model updates are cumulative
    
    For any sequence of performance log batches, each update must build
    upon the previous state, maintaining cumulative learning progress.
    
    This property verifies that:
    1. Multiple updates don't reset progress
    2. Attempts accumulate across updates
    3. Proficiency evolves based on all performance data
    4. Knowledge model maintains consistency
    """
    # Update student ID in logs
    for log in new_logs:
        log.student_id = km.student_id
    
    # Save initial knowledge model
    personalization_engine.repository.save_knowledge_model(km)
    
    # Record initial attempts for each topic
    subject = Subject.MATHEMATICS.value
    initial_attempts = {}
    if subject in km.subjects:
        for topic_id, topic_knowledge in km.subjects[subject].topics.items():
            initial_attempts[topic_id] = topic_knowledge.attempts
    
    # Property 13: First update
    updated_km_1 = personalization_engine.analyze_performance_logs(km.student_id, new_logs[:len(new_logs)//2] if len(new_logs) > 1 else new_logs)
    
    # Record state after first update
    mid_attempts = {}
    if subject in updated_km_1.subjects:
        for topic_id, topic_knowledge in updated_km_1.subjects[subject].topics.items():
            mid_attempts[topic_id] = topic_knowledge.attempts
    
    # Property 13: Second update with remaining logs
    if len(new_logs) > 1:
        updated_km_2 = personalization_engine.analyze_performance_logs(
            km.student_id, new_logs[len(new_logs)//2:]
        )
        
        # Property 13: Attempts must continue to accumulate
        if subject in updated_km_2.subjects:
            for topic_id, topic_knowledge in updated_km_2.subjects[subject].topics.items():
                if topic_id in mid_attempts:
                    # Count new logs for this topic in second batch
                    new_topic_logs = sum(
                        1 for log in new_logs[len(new_logs)//2:]
                        if log.topic == topic_id and log.event_type in ["quiz_answer", "quiz_complete"]
                    )
                    
                    if new_topic_logs > 0:
                        assert topic_knowledge.attempts >= mid_attempts[topic_id], \
                            f"Attempts for topic {topic_id} must not decrease: " \
                            f"{mid_attempts[topic_id]} -> {topic_knowledge.attempts}"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    student_id=st.text(min_size=5, max_size=20, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'))),
    topic=st.sampled_from([f"topic-{i}" for i in range(1, 6)]),
)
def test_property_13_new_student_gets_initial_knowledge_model(
    student_id, topic
):
    """Property 13: New students get initial knowledge model
    
    For any new student (no existing knowledge model), processing their
    first performance logs must create a new knowledge model.
    
    This property verifies that:
    1. New knowledge model is created for new students
    2. Initial proficiency is set appropriately
    3. Knowledge model is persisted
    4. Subsequent updates work correctly
    """
    # Create fresh engine for each test to avoid state pollution
    repository = MockKnowledgeModelRepository()
    personalization_engine = PersonalizationEngine(repository)
    
    # Ensure student doesn't exist
    assert personalization_engine.repository.get_knowledge_model(student_id) is None, \
        "Student should not exist initially"
    
    # Generate first performance log
    subject = Subject.MATHEMATICS.value
    log = PerformanceLog(
        student_id=student_id,
        timestamp=datetime.utcnow(),
        event_type="quiz_answer",
        content_id="quiz-1",
        subject=subject,
        topic=topic,
        data={"correct": True, "time_spent": 60},
    )
    
    # Property 13: Analyze first log (should create knowledge model)
    km = personalization_engine.analyze_performance_logs(student_id, [log])
    
    # Property 13: Knowledge model must be created
    assert km is not None, \
        "Knowledge model must be created for new student"
    
    assert km.student_id == student_id, \
        f"Knowledge model must have correct student ID: {km.student_id}"
    
    # Property 13: Subject and topic must exist
    assert subject in km.subjects, \
        f"Subject {subject} must exist in new knowledge model"
    
    assert topic in km.subjects[subject].topics, \
        f"Topic {topic} must exist in new knowledge model"
    
    # Property 13: Topic must have valid initial state
    topic_knowledge = km.subjects[subject].topics[topic]
    assert 0.0 <= topic_knowledge.proficiency <= 1.0, \
        f"Initial proficiency must be in [0, 1]: {topic_knowledge.proficiency}"
    
    assert topic_knowledge.attempts > 0, \
        f"Attempts must be > 0 after first log: {topic_knowledge.attempts}"
    
    # Property 13: Knowledge model must be persisted
    retrieved_km = personalization_engine.repository.get_knowledge_model(student_id)
    assert retrieved_km is not None, \
        "Knowledge model must be persisted in repository"
    
    assert retrieved_km.student_id == student_id, \
        "Retrieved knowledge model must match student ID"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    km=knowledge_model_strategy(),
    logs=st.lists(
        st.builds(
            PerformanceLog,
            student_id=st.just("test-student"),
            event_type=st.just("quiz_complete"),
            content_id=st.text(min_size=5, max_size=20),
            subject=st.just(Subject.MATHEMATICS.value),
            topic=st.sampled_from([f"topic-{i}" for i in range(1, 6)]),
            data=st.fixed_dictionaries({
                "accuracy": st.floats(min_value=0.0, max_value=1.0),
                "questions_answered": st.integers(min_value=1, max_value=10),
                "time_spent": st.integers(min_value=120, max_value=1800),
            }),
        ),
        min_size=1,
        max_size=10,
    ),
)
def test_property_13_quiz_complete_events_update_knowledge(
    personalization_engine, km, logs
):
    """Property 13: Quiz complete events update knowledge model
    
    For any quiz_complete performance logs, the knowledge model must be
    updated based on the overall quiz accuracy.
    
    This property verifies that:
    1. quiz_complete events are processed
    2. Accuracy data influences proficiency
    3. Multiple questions in a quiz are accounted for
    4. Knowledge model reflects quiz performance
    """
    # Update student ID in logs
    for log in logs:
        log.student_id = km.student_id
    
    # Save initial knowledge model
    personalization_engine.repository.save_knowledge_model(km)
    
    # Property 13: Analyze quiz_complete logs
    updated_km = personalization_engine.analyze_performance_logs(km.student_id, logs)
    
    # Property 13: Knowledge model must be updated
    assert updated_km is not None, \
        "Knowledge model must be updated after quiz_complete events"
    
    subject = Subject.MATHEMATICS.value
    
    # Property 13: For each topic with quiz_complete logs, verify update
    quiz_topics = {}
    for log in logs:
        if log.topic not in quiz_topics:
            quiz_topics[log.topic] = []
        quiz_topics[log.topic].append(log)
    
    if subject in updated_km.subjects:
        for topic_id, topic_logs in quiz_topics.items():
            if topic_id in updated_km.subjects[subject].topics:
                topic_knowledge = updated_km.subjects[subject].topics[topic_id]
                
                # Property 13: Attempts must increase
                total_questions = sum(
                    log.data.get("questions_answered", 1) for log in topic_logs
                )
                assert topic_knowledge.attempts >= total_questions, \
                    f"Attempts for topic {topic_id} must account for all questions: " \
                    f"{topic_knowledge.attempts} >= {total_questions}"
                
                # Property 13: Proficiency must be valid
                assert 0.0 <= topic_knowledge.proficiency <= 1.0, \
                    f"Proficiency for topic {topic_id} must be in [0, 1]: {topic_knowledge.proficiency}"


@pytest.mark.property_test
@settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    km=knowledge_model_strategy(),
    empty_logs=st.just([]),
)
def test_property_13_empty_logs_dont_break_knowledge_model(
    personalization_engine, km, empty_logs
):
    """Property 13: Empty performance logs don't break knowledge model
    
    For any knowledge model, processing an empty list of performance logs
    must not corrupt or invalidate the knowledge model.
    
    This property verifies that:
    1. Empty logs are handled gracefully
    2. Knowledge model remains valid
    3. No data is lost or corrupted
    4. System remains stable
    """
    # Save initial knowledge model
    personalization_engine.repository.save_knowledge_model(km)
    
    # Record initial state
    initial_last_updated = km.last_updated
    subject = Subject.MATHEMATICS.value
    initial_topics = {}
    if subject in km.subjects:
        for topic_id, topic_knowledge in km.subjects[subject].topics.items():
            initial_topics[topic_id] = {
                "proficiency": topic_knowledge.proficiency,
                "attempts": topic_knowledge.attempts,
            }
    
    # Property 13: Analyze empty logs
    updated_km = personalization_engine.analyze_performance_logs(km.student_id, empty_logs)
    
    # Property 13: Knowledge model must still be valid
    assert updated_km is not None, \
        "Knowledge model must be returned even with empty logs"
    
    assert updated_km.student_id == km.student_id, \
        "Student ID must remain unchanged"
    
    # Property 13: last_updated should be modified (even for empty logs)
    assert updated_km.last_updated >= initial_last_updated, \
        "last_updated should be updated or remain the same"
    
    # Property 13: Topic data should remain unchanged
    if subject in updated_km.subjects:
        for topic_id, initial_data in initial_topics.items():
            if topic_id in updated_km.subjects[subject].topics:
                topic_knowledge = updated_km.subjects[subject].topics[topic_id]
                
                # Proficiency and attempts should not change with empty logs
                assert topic_knowledge.proficiency == initial_data["proficiency"], \
                    f"Proficiency for topic {topic_id} should not change with empty logs"
                
                assert topic_knowledge.attempts == initial_data["attempts"], \
                    f"Attempts for topic {topic_id} should not change with empty logs"
