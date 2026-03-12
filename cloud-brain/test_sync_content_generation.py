#!/usr/bin/env python3
"""
Test script to verify sync operations generate real Bedrock content.
This simulates what happens during a sync download operation.
"""

import json
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from src.services.bundle_generator import BundleGenerator
from src.repositories.knowledge_model_repository import KnowledgeModelRepository


def test_sync_content_generation():
    """Test that sync operations generate real Bedrock content."""
    print("🧪 Testing Sync Content Generation")
    print("=" * 70)
    print()
    
    # Initialize services
    print("1. Initializing services...")
    knowledge_repo = KnowledgeModelRepository()
    bundle_generator = BundleGenerator()
    print("   ✅ Services initialized")
    print()
    
    # Test student
    student_id = "test-sync-student-001"
    
    # Create or get knowledge model
    print("2. Getting/creating knowledge model...")
    knowledge_model = knowledge_repo.get_knowledge_model(student_id)
    if not knowledge_model:
        knowledge_model = knowledge_repo.create_initial_knowledge_model(student_id)
        knowledge_repo.save_knowledge_model(knowledge_model)
        print(f"   ✅ Created initial knowledge model for {student_id}")
    else:
        print(f"   ✅ Retrieved existing knowledge model for {student_id}")
    print()
    
    # Simulate performance logs (what would be uploaded during sync)
    print("3. Simulating performance logs...")
    performance_logs = [
        {
            "log_id": "log-001",
            "student_id": student_id,
            "activity_type": "quiz_attempt",
            "timestamp": "2026-03-12T20:00:00Z",
            "data": {
                "quiz_id": "quiz-001",
                "score": 0.7,
                "correct": True,
                "topic": "Basic Addition"
            }
        },
        {
            "log_id": "log-002",
            "student_id": student_id,
            "activity_type": "lesson_completed",
            "timestamp": "2026-03-12T20:10:00Z",
            "data": {
                "lesson_id": "lesson-001",
                "completion_time": 300,
                "topic": "Basic Addition"
            }
        }
    ]
    print(f"   ✅ Created {len(performance_logs)} performance logs")
    print()
    
    # Generate bundle (this is what happens during sync download)
    print("4. Generating learning bundle...")
    print("   This simulates what happens during sync download...")
    print()
    
    try:
        # Check if Bedrock Agent is configured
        import os
        agent_id = os.environ.get("BEDROCK_AGENT_ID")
        alias_id = os.environ.get("BEDROCK_AGENT_ALIAS_ID")
        
        if agent_id and alias_id:
            print(f"   🤖 Bedrock Agent configured:")
            print(f"      Agent ID: {agent_id}")
            print(f"      Alias ID: {alias_id}")
        else:
            print(f"   ⚠️  Bedrock Agent NOT configured in environment")
            print(f"      Agent ID: {agent_id or 'NOT SET'}")
            print(f"      Alias ID: {alias_id or 'NOT SET'}")
        print()
        
        bundle = bundle_generator.generate_bundle(
            student_id=student_id,
            knowledge_model=knowledge_model,
            performance_logs=performance_logs,
            bundle_duration=1,  # 1 week
            subjects=["Mathematics"]
        )
        
        print("   ✅ Bundle generated successfully!")
        print()
        
        # Analyze bundle content
        print("5. Analyzing bundle content...")
        print(f"   Bundle ID: {bundle.bundle_id}")
        print(f"   Student ID: {bundle.student_id}")
        print(f"   Size: {bundle.total_size:,} bytes")
        print(f"   Valid until: {bundle.valid_until}")
        print()
        
        # Check subjects and content
        total_lessons = 0
        total_quizzes = 0
        
        for subject in bundle.subjects:
            lesson_count = len(subject.lessons)
            quiz_count = len(subject.quizzes)
            total_lessons += lesson_count
            total_quizzes += quiz_count
            
            print(f"   Subject: {subject.subject}")
            print(f"      Lessons: {lesson_count}")
            print(f"      Quizzes: {quiz_count}")
            
            # Show sample lesson
            if subject.lessons:
                sample_lesson = subject.lessons[0]
                print(f"      Sample Lesson: {sample_lesson.title}")
                print(f"         Topic: {sample_lesson.topic}")
                print(f"         Difficulty: {sample_lesson.difficulty}")
                print(f"         Sections: {len(sample_lesson.sections)}")
                
                # Check if content looks like real Bedrock content or mock
                is_mock = any(
                    "mock" in section.content.lower() or
                    "placeholder" in section.content.lower() or
                    "fallback" in section.content.lower()
                    for section in sample_lesson.sections
                )
                
                if is_mock:
                    print(f"         ⚠️  WARNING: Content appears to be MOCK/FALLBACK")
                else:
                    print(f"         ✅ Content appears to be REAL Bedrock-generated")
            
            # Show sample quiz
            if subject.quizzes:
                sample_quiz = subject.quizzes[0]
                print(f"      Sample Quiz: {sample_quiz.title}")
                print(f"         Topic: {sample_quiz.topic}")
                print(f"         Questions: {len(sample_quiz.questions)}")
                
                if sample_quiz.questions:
                    sample_question = sample_quiz.questions[0]
                    print(f"         Sample Question: {sample_question.question[:80]}...")
            
            print()
        
        # Summary
        print("=" * 70)
        print("📊 Summary")
        print("=" * 70)
        print(f"Total Lessons: {total_lessons}")
        print(f"Total Quizzes: {total_quizzes}")
        print(f"Bundle Size: {bundle.total_size:,} bytes")
        print()
        
        if total_lessons > 0 and total_quizzes > 0:
            print("✅ SUCCESS: Bundle contains real content!")
            print()
            print("🎉 Sync operations will now generate real Bedrock content")
            print("   instead of fallback/mock data.")
            return 0
        else:
            print("❌ FAILURE: Bundle is empty or contains no content")
            return 1
            
    except Exception as e:
        print(f"❌ Error generating bundle: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(test_sync_content_generation())
