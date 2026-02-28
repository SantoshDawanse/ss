"""Demo script to showcase personalization engine functionality."""

from datetime import datetime, timedelta
from src.models.personalization import (
    KnowledgeModel,
    MasteryLevel,
    PerformanceLog,
    SubjectKnowledge,
    TopicMastery,
)
from src.repositories.knowledge_model_repository import KnowledgeModelRepository
from src.services.personalization_engine import PersonalizationEngine


def demo_personalization_engine():
    """Demonstrate the personalization engine capabilities."""
    
    # Initialize the engine
    repo = KnowledgeModelRepository()
    engine = PersonalizationEngine(repo)
    
    # Create sample performance logs
    student_id = "demo-student-001"
    base_time = datetime.utcnow()
    
    performance_logs = [
        # Student did well on algebra
        PerformanceLog(
            student_id=student_id,
            timestamp=base_time - timedelta(days=7),
            event_type="quiz_complete",
            content_id="quiz-algebra-1",
            subject="Mathematics",
            topic="algebra",
            data={"accuracy": 0.85, "questions_answered": 10},
        ),
        # Student struggled with geometry
        PerformanceLog(
            student_id=student_id,
            timestamp=base_time - timedelta(days=5),
            event_type="quiz_complete",
            content_id="quiz-geometry-1",
            subject="Mathematics",
            topic="geometry",
            data={"accuracy": 0.45, "questions_answered": 10},
        ),
        # Student improved on geometry
        PerformanceLog(
            student_id=student_id,
            timestamp=base_time - timedelta(days=2),
            event_type="quiz_complete",
            content_id="quiz-geometry-2",
            subject="Mathematics",
            topic="geometry",
            data={"accuracy": 0.60, "questions_answered": 10},
        ),
    ]
    
    # Analyze performance logs
    print("=" * 60)
    print("PERSONALIZATION ENGINE DEMO")
    print("=" * 60)
    print(f"\nStudent ID: {student_id}")
    print(f"Performance logs analyzed: {len(performance_logs)}")
    
    knowledge_model = engine.analyze_performance_logs(student_id, performance_logs)
    
    # Display knowledge model
    print("\n" + "=" * 60)
    print("KNOWLEDGE MODEL")
    print("=" * 60)
    
    for subject, subject_knowledge in knowledge_model.subjects.items():
        print(f"\nSubject: {subject}")
        print(f"Overall Proficiency: {subject_knowledge.overall_proficiency:.2f}")
        print(f"Learning Velocity: {subject_knowledge.learning_velocity:.2f} topics/week")
        
        print("\nTopics:")
        for topic_id, topic_mastery in subject_knowledge.topics.items():
            print(f"  - {topic_id}:")
            print(f"    Proficiency: {topic_mastery.proficiency:.2f}")
            print(f"    Mastery Level: {topic_mastery.mastery_level.value}")
            print(f"    Attempts: {topic_mastery.attempts}")
            print(f"    Cognitive Level: {topic_mastery.cognitive_level}")
    
    # Content prioritization
    print("\n" + "=" * 60)
    print("CONTENT PRIORITIZATION")
    print("=" * 60)
    
    priorities = engine.prioritize_content(knowledge_model, "Mathematics")
    
    print(f"\nCritical Gaps (proficiency <0.5): {priorities['critical_gaps']}")
    print(f"Developing Topics (0.5-0.7): {priorities['developing']}")
    print(f"Mastery Advancement (>0.8): {priorities['mastery_advancement']}")
    print(f"Review Topics: {priorities['review']}")
    
    # Difficulty selection
    print("\n" + "=" * 60)
    print("DIFFICULTY SELECTION")
    print("=" * 60)
    
    for topic_id in ["algebra", "geometry"]:
        difficulty = engine.calculate_zpd_difficulty(knowledge_model, "Mathematics", topic_id)
        print(f"\n{topic_id}: {difficulty}")
    
    # Content mix
    print("\n" + "=" * 60)
    print("CONTENT MIX")
    print("=" * 60)
    
    content_mix = engine.generate_content_mix(knowledge_model, "Mathematics")
    print(f"\nNew Material: {content_mix['new']*100:.0f}%")
    print(f"Practice: {content_mix['practice']*100:.0f}%")
    print(f"Review: {content_mix['review']*100:.0f}%")
    
    # Study track generation
    print("\n" + "=" * 60)
    print("STUDY TRACK GENERATION")
    print("=" * 60)
    
    # Mock curriculum standards
    curriculum_standards = {
        "algebra": {"prerequisites": []},
        "geometry": {"prerequisites": []},
        "trigonometry": {"prerequisites": ["algebra", "geometry"]},
        "calculus": {"prerequisites": ["algebra", "trigonometry"]},
    }
    
    available_topics = ["algebra", "geometry", "trigonometry", "calculus"]
    
    study_track = engine.generate_study_track(
        knowledge_model,
        "Mathematics",
        available_topics,
        curriculum_standards,
    )
    
    print(f"\nDuration: {study_track['duration_weeks']} weeks")
    print(f"Pacing Multiplier: {study_track['pacing_multiplier']}")
    print(f"Total Topics: {study_track['total_topics']}")
    print(f"\nNew Topics: {study_track['topics']['new']}")
    print(f"Practice Topics: {study_track['topics']['practice']}")
    print(f"Review Topics: {study_track['topics']['review']}")
    
    print("\n" + "=" * 60)
    print("DEMO COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    demo_personalization_engine()
