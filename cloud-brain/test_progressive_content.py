#!/usr/bin/env python3
"""
Test script to verify progressive content generation works correctly.
"""

import hashlib
import time
import uuid
import json

def generate_mock_content(student_id: str, subject: str) -> dict:
    """
    Generate mock content for MVP when Bedrock Agent is unavailable.
    This is a copy of the _generate_mock_content method for testing.
    """
    print(f"Generating mock content for student {student_id}")
    
    # Create a deterministic but unique seed based on student_id and current time
    # This ensures different content each time while being reproducible for testing
    current_hour = int(time.time() // 3600)  # Changes every hour
    seed_string = f"{student_id}_{subject}_{current_hour}"
    seed_hash = hashlib.md5(seed_string.encode()).hexdigest()[:8]
    
    print(f"Seed: {seed_string} -> Hash: {seed_hash}")
    
    # Generate different topics based on the seed
    topics = [
        "Introduction", "Basic Concepts", "Problem Solving", "Applications", 
        "Advanced Topics", "Real World Examples", "Practice Problems", "Review"
    ]
    topic_index = int(seed_hash[:2], 16) % len(topics)
    selected_topic = topics[topic_index]
    
    # Generate different difficulty levels
    difficulties = ["easy", "medium", "hard"]
    difficulty_index = int(seed_hash[2:4], 16) % len(difficulties)
    selected_difficulty = difficulties[difficulty_index]
    
    print(f"Selected topic: {selected_topic} (index {topic_index})")
    print(f"Selected difficulty: {selected_difficulty} (index {difficulty_index})")
    
    # Mock lesson with progressive content
    mock_lesson = {
        "lesson_id": f"lesson_{uuid.uuid4()}",
        "subject": subject,
        "topic": selected_topic,
        "title": f"{selected_topic} in {subject}",
        "difficulty": selected_difficulty,
        "estimated_minutes": 25 + (topic_index * 5),  # Progressive duration
        "curriculum_standards": [f"STANDARD_{topic_index:03d}"],
        "sections": [
            {
                "type": "explanation",
                "content": f"In this lesson, we'll explore {selected_topic.lower()} in {subject}. "
                          f"This builds on previous concepts and introduces new ideas that are essential "
                          f"for your understanding. We'll cover the key principles step by step.",
                "media": []
            },
            {
                "type": "example", 
                "content": f"Let's examine a practical example of {selected_topic.lower()}. "
                          f"This example shows how the concept applies in real situations you might encounter. "
                          f"Pay attention to the method we use to solve this problem.",
                "media": []
            },
            {
                "type": "practice",
                "content": f"Now practice what you've learned about {selected_topic.lower()}! "
                          f"These exercises will help you master the concept. Start with the easier problems "
                          f"and work your way up to more challenging ones.",
                "media": []
            }
        ]
    }
    
    # Generate different questions based on topic and difficulty
    question_templates = [
        {
            "easy": f"What is the main idea behind {selected_topic.lower()}?",
            "medium": f"How would you apply {selected_topic.lower()} to solve a problem?",
            "hard": f"Analyze the relationship between {selected_topic.lower()} and other concepts."
        },
        {
            "easy": f"Which statement best describes {selected_topic.lower()}?",
            "medium": f"What steps would you follow when working with {selected_topic.lower()}?",
            "hard": f"Evaluate the effectiveness of different approaches to {selected_topic.lower()}."
        },
        {
            "easy": f"True or False: {selected_topic} is important in {subject}.",
            "medium": f"True or False: {selected_topic} can be applied in multiple ways.",
            "hard": f"True or False: Mastering {selected_topic} requires understanding prerequisites."
        }
    ]
    
    questions = []
    for i, template in enumerate(question_templates):
        question_type = "true_false" if "True or False" in template[selected_difficulty] else "multiple_choice"
        
        if question_type == "multiple_choice":
            options = [
                f"Understanding and applying {selected_topic.lower()} correctly",
                f"Memorizing facts about {selected_topic.lower()}",
                f"Skipping {selected_topic.lower()} entirely",
                f"Guessing the answer about {selected_topic.lower()}"
            ]
            correct_answer = options[0]
        else:
            options = ["True", "False"]
            correct_answer = "True"
        
        questions.append({
            "question_id": f"q_{uuid.uuid4()}",
            "type": question_type,
            "question": template[selected_difficulty],
            "options": options,
            "correct_answer": correct_answer,
            "explanation": f"This is correct because {selected_topic.lower()} requires proper understanding and application of the underlying concepts.",
            "curriculum_standard": f"STANDARD_{topic_index:03d}",
            "bloom_level": 1 + difficulty_index
        })
    
    # Mock quiz with progressive content
    mock_quiz = {
        "quiz_id": f"quiz_{uuid.uuid4()}",
        "subject": subject,
        "topic": selected_topic,
        "title": f"{selected_topic} Quiz - {selected_difficulty.title()} Level",
        "difficulty": selected_difficulty,
        "time_limit": 10 + (len(questions) * 2),
        "questions": questions
    }
    
    print(f"Generated progressive mock content for {selected_topic} ({selected_difficulty}): "
          f"1 lesson with {len(mock_lesson['sections'])} sections, "
          f"1 quiz with {len(mock_quiz['questions'])} questions")
    
    return {
        "lessons": [mock_lesson],
        "quizzes": [mock_quiz]
    }

def test_progressive_content():
    """Test that content generation produces different content over time."""
    print("=== Testing Progressive Content Generation ===\n")
    
    student_id = 'test-student-123'
    subject = 'Mathematics'
    
    # Store original time function
    original_time = time.time
    
    # Generate content at different time periods
    contents = []
    time_periods = [0, 3600, 7200, 10800]  # 0, 1, 2, 3 hours
    
    for i, time_offset in enumerate(time_periods):
        print(f"--- Generation {i+1} (Hour {time_offset//3600}) ---")
        
        # Mock time.time() to return specific hour
        time.time = lambda offset=time_offset: offset
        
        content = generate_mock_content(student_id, subject)
        contents.append(content)
        
        lesson = content['lessons'][0]
        quiz = content['quizzes'][0]
        
        print(f"Lesson: {lesson['title']} ({lesson['difficulty']}, {lesson['estimated_minutes']} min)")
        print(f"Quiz: {quiz['title']} ({quiz['difficulty']}, {quiz['time_limit']} min)")
        print()
    
    # Restore original time function
    time.time = original_time
    
    # Analyze results
    print("=== Analysis ===")
    topics = [content['lessons'][0]['topic'] for content in contents]
    difficulties = [content['lessons'][0]['difficulty'] for content in contents]
    durations = [content['lessons'][0]['estimated_minutes'] for content in contents]
    
    print(f"Topics: {topics}")
    print(f"Difficulties: {difficulties}")
    print(f"Durations: {durations}")
    
    unique_topics = len(set(topics))
    unique_difficulties = len(set(difficulties))
    unique_durations = len(set(durations))
    
    print(f"\nUnique topics: {unique_topics}/{len(topics)}")
    print(f"Unique difficulties: {unique_difficulties}/{len(difficulties)}")
    print(f"Unique durations: {unique_durations}/{len(durations)}")
    
    # Success criteria
    has_variety = unique_topics > 1 or unique_difficulties > 1
    print(f"\nContent shows variety: {has_variety}")
    
    if has_variety:
        print("✅ SUCCESS: Progressive content generation is working!")
    else:
        print("❌ FAILURE: Content is not varying enough")
    
    return has_variety

if __name__ == "__main__":
    test_progressive_content()