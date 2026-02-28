"""Unit tests for personalization engine."""

import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from src.models.personalization import (
    KnowledgeModel,
    MasteryLevel,
    PerformanceLog,
    SubjectKnowledge,
    TopicMastery,
)
from src.repositories.knowledge_model_repository import KnowledgeModelRepository
from src.services.personalization_engine import PersonalizationEngine


@pytest.fixture
def mock_repository():
    """Create a mock knowledge model repository."""
    repo = MagicMock(spec=KnowledgeModelRepository)
    return repo


@pytest.fixture
def personalization_engine(mock_repository):
    """Create a personalization engine with mock repository."""
    return PersonalizationEngine(mock_repository)


@pytest.fixture
def sample_knowledge_model():
    """Create a sample knowledge model for testing."""
    return KnowledgeModel(
        student_id="student123",
        last_updated=datetime.utcnow(),
        subjects={
            "Mathematics": SubjectKnowledge(
                topics={
                    "algebra": TopicMastery(
                        proficiency=0.7,
                        attempts=10,
                        last_practiced=datetime.utcnow(),
                        mastery_level=MasteryLevel.PROFICIENT,
                        cognitive_level=3,
                    ),
                    "geometry": TopicMastery(
                        proficiency=0.4,
                        attempts=5,
                        last_practiced=datetime.utcnow() - timedelta(days=3),
                        mastery_level=MasteryLevel.DEVELOPING,
                        cognitive_level=2,
                    ),
                },
                overall_proficiency=0.55,
                learning_velocity=1.2,
            )
        },
    )


@pytest.fixture
def sample_performance_logs():
    """Create sample performance logs."""
    base_time = datetime.utcnow()
    return [
        PerformanceLog(
            student_id="student123",
            timestamp=base_time - timedelta(minutes=10),
            event_type="quiz_answer",
            content_id="quiz1",
            subject="Mathematics",
            topic="algebra",
            data={"correct": True, "time_spent": 30},
        ),
        PerformanceLog(
            student_id="student123",
            timestamp=base_time - timedelta(minutes=8),
            event_type="quiz_answer",
            content_id="quiz1",
            subject="Mathematics",
            topic="algebra",
            data={"correct": True, "time_spent": 25},
        ),
        PerformanceLog(
            student_id="student123",
            timestamp=base_time - timedelta(minutes=5),
            event_type="quiz_answer",
            content_id="quiz2",
            subject="Mathematics",
            topic="geometry",
            data={"correct": False, "time_spent": 45},
        ),
    ]


class TestPersonalizationEngine:
    """Test suite for PersonalizationEngine."""

    def test_analyze_performance_logs_updates_knowledge(
        self, personalization_engine, mock_repository, sample_knowledge_model, sample_performance_logs
    ):
        """Test that analyzing performance logs updates the knowledge model."""
        mock_repository.get_knowledge_model.return_value = sample_knowledge_model
        mock_repository.save_knowledge_model.return_value = True

        result = personalization_engine.analyze_performance_logs(
            "student123", sample_performance_logs
        )

        assert result.student_id == "student123"
        assert "Mathematics" in result.subjects
        mock_repository.save_knowledge_model.assert_called_once()

    def test_analyze_performance_logs_creates_new_model(
        self, personalization_engine, mock_repository, sample_performance_logs
    ):
        """Test that analyzing logs creates a new model if none exists."""
        mock_repository.get_knowledge_model.return_value = None
        new_model = KnowledgeModel(student_id="student123", subjects={})
        mock_repository.create_initial_knowledge_model.return_value = new_model
        mock_repository.save_knowledge_model.return_value = True

        result = personalization_engine.analyze_performance_logs(
            "student123", sample_performance_logs
        )

        mock_repository.create_initial_knowledge_model.assert_called_once_with("student123")
        assert result.student_id == "student123"

    def test_bayesian_knowledge_tracing_correct_answers(
        self, personalization_engine, mock_repository
    ):
        """Test that BKT increases proficiency with correct answers."""
        knowledge_model = KnowledgeModel(student_id="student123", subjects={})
        mock_repository.get_knowledge_model.return_value = knowledge_model
        mock_repository.save_knowledge_model.return_value = True

        # Create logs with all correct answers
        logs = [
            PerformanceLog(
                student_id="student123",
                timestamp=datetime.utcnow(),
                event_type="quiz_answer",
                content_id=f"quiz{i}",
                subject="Mathematics",
                topic="algebra",
                data={"correct": True},
            )
            for i in range(5)
        ]

        result = personalization_engine.analyze_performance_logs("student123", logs)

        # Proficiency should increase with correct answers
        assert "Mathematics" in result.subjects
        assert "algebra" in result.subjects["Mathematics"].topics
        topic = result.subjects["Mathematics"].topics["algebra"]
        assert topic.proficiency > personalization_engine.p_init

    def test_bayesian_knowledge_tracing_incorrect_answers(
        self, personalization_engine, mock_repository
    ):
        """Test that BKT handles incorrect answers appropriately."""
        knowledge_model = KnowledgeModel(student_id="student123", subjects={})
        mock_repository.get_knowledge_model.return_value = knowledge_model
        mock_repository.save_knowledge_model.return_value = True

        # Create logs with all incorrect answers
        logs = [
            PerformanceLog(
                student_id="student123",
                timestamp=datetime.utcnow(),
                event_type="quiz_answer",
                content_id=f"quiz{i}",
                subject="Mathematics",
                topic="algebra",
                data={"correct": False},
            )
            for i in range(5)
        ]

        result = personalization_engine.analyze_performance_logs("student123", logs)

        # Proficiency should remain low with incorrect answers
        topic = result.subjects["Mathematics"].topics["algebra"]
        assert topic.proficiency < 0.5

    def test_mastery_level_assignment(
        self, personalization_engine, mock_repository
    ):
        """Test that mastery levels are assigned correctly based on proficiency."""
        knowledge_model = KnowledgeModel(student_id="student123", subjects={})
        mock_repository.get_knowledge_model.return_value = knowledge_model
        mock_repository.save_knowledge_model.return_value = True

        # Create logs with many correct answers to achieve high proficiency
        logs = [
            PerformanceLog(
                student_id="student123",
                timestamp=datetime.utcnow(),
                event_type="quiz_answer",
                content_id=f"quiz{i}",
                subject="Mathematics",
                topic="algebra",
                data={"correct": True},
            )
            for i in range(20)
        ]

        result = personalization_engine.analyze_performance_logs("student123", logs)

        topic = result.subjects["Mathematics"].topics["algebra"]
        # With many correct answers, should reach at least PROFICIENT
        assert topic.mastery_level in [MasteryLevel.PROFICIENT, MasteryLevel.ADVANCED]

    def test_calculate_zpd_difficulty(
        self, personalization_engine, sample_knowledge_model
    ):
        """Test Zone of Proximal Development difficulty calculation."""
        # Test easy difficulty for low proficiency (geometry has 0.4 proficiency)
        difficulty = personalization_engine.calculate_zpd_difficulty(
            sample_knowledge_model, "Mathematics", "geometry"
        )
        assert difficulty == "easy"

        # Test medium difficulty for moderate proficiency (algebra has 0.7 proficiency)
        difficulty = personalization_engine.calculate_zpd_difficulty(
            sample_knowledge_model, "Mathematics", "algebra"
        )
        assert difficulty == "medium"

    def test_generate_content_mix_new_student(
        self, personalization_engine
    ):
        """Test content mix for new student."""
        knowledge_model = KnowledgeModel(student_id="student123", subjects={})

        mix = personalization_engine.generate_content_mix(knowledge_model, "Mathematics")

        # New student should get more new content
        assert mix["new"] > 0.6
        assert mix["practice"] + mix["review"] < 0.4

    def test_generate_content_mix_struggling_student(
        self, personalization_engine
    ):
        """Test content mix for struggling student."""
        knowledge_model = KnowledgeModel(
            student_id="student123",
            subjects={
                "Mathematics": SubjectKnowledge(
                    overall_proficiency=0.3,
                    learning_velocity=0.5,
                )
            },
        )

        mix = personalization_engine.generate_content_mix(knowledge_model, "Mathematics")

        # Struggling student should get more practice
        assert mix["practice"] > mix["new"]

    def test_generate_content_mix_excelling_student(
        self, personalization_engine
    ):
        """Test content mix for excelling student."""
        knowledge_model = KnowledgeModel(
            student_id="student123",
            subjects={
                "Mathematics": SubjectKnowledge(
                    overall_proficiency=0.85,
                    learning_velocity=2.0,
                )
            },
        )

        mix = personalization_engine.generate_content_mix(knowledge_model, "Mathematics")

        # Excelling student should get more new content
        assert mix["new"] > 0.6

    def test_calculate_adaptive_pacing(
        self, personalization_engine, sample_knowledge_model
    ):
        """Test adaptive pacing calculation."""
        # Normal velocity should give normal pacing
        pacing = personalization_engine.calculate_adaptive_pacing(
            sample_knowledge_model, "Mathematics"
        )
        assert 0.8 <= pacing <= 1.5

    def test_identify_knowledge_gaps(
        self, personalization_engine, sample_knowledge_model
    ):
        """Test identification of knowledge gaps."""
        gaps = personalization_engine.identify_knowledge_gaps(
            sample_knowledge_model, "Mathematics"
        )

        # Geometry has low proficiency (0.4), should be identified as gap
        assert "geometry" in gaps

    def test_identify_mastery_areas(
        self, personalization_engine, sample_knowledge_model
    ):
        """Test identification of mastery areas."""
        mastery = personalization_engine.identify_mastery_areas(
            sample_knowledge_model, "Mathematics"
        )

        # Algebra has proficient mastery level
        assert "algebra" in mastery

    def test_learning_velocity_calculation(
        self, personalization_engine, mock_repository
    ):
        """Test learning velocity calculation."""
        knowledge_model = KnowledgeModel(student_id="student123", subjects={})
        mock_repository.get_knowledge_model.return_value = knowledge_model
        mock_repository.save_knowledge_model.return_value = True

        # Create logs spanning multiple weeks with mastery progression
        base_time = datetime.utcnow()
        logs = []
        
        # Week 1: algebra
        for i in range(10):
            logs.append(
                PerformanceLog(
                    student_id="student123",
                    timestamp=base_time - timedelta(days=14, hours=i),
                    event_type="quiz_answer",
                    content_id=f"quiz{i}",
                    subject="Mathematics",
                    topic="algebra",
                    data={"correct": True},
                )
            )
        
        # Week 2: geometry
        for i in range(10):
            logs.append(
                PerformanceLog(
                    student_id="student123",
                    timestamp=base_time - timedelta(days=7, hours=i),
                    event_type="quiz_answer",
                    content_id=f"quiz{i+10}",
                    subject="Mathematics",
                    topic="geometry",
                    data={"correct": True},
                )
            )

        result = personalization_engine.analyze_performance_logs("student123", logs)

        # Should have calculated learning velocity
        assert result.subjects["Mathematics"].learning_velocity > 0

    def test_overall_proficiency_calculation(
        self, personalization_engine, mock_repository
    ):
        """Test that overall proficiency is calculated correctly."""
        knowledge_model = KnowledgeModel(student_id="student123", subjects={})
        mock_repository.get_knowledge_model.return_value = knowledge_model
        mock_repository.save_knowledge_model.return_value = True

        logs = [
            PerformanceLog(
                student_id="student123",
                timestamp=datetime.utcnow(),
                event_type="quiz_answer",
                content_id="quiz1",
                subject="Mathematics",
                topic="algebra",
                data={"correct": True},
            ),
            PerformanceLog(
                student_id="student123",
                timestamp=datetime.utcnow(),
                event_type="quiz_answer",
                content_id="quiz2",
                subject="Mathematics",
                topic="geometry",
                data={"correct": False},
            ),
        ]

        result = personalization_engine.analyze_performance_logs("student123", logs)

        # Overall proficiency should be average of topic proficiencies
        topics = result.subjects["Mathematics"].topics
        expected_avg = sum(t.proficiency for t in topics.values()) / len(topics)
        assert abs(result.subjects["Mathematics"].overall_proficiency - expected_avg) < 0.01
