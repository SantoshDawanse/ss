"""Lambda handler for Bedrock Agent action groups."""

import json
import logging
import os
import uuid
from datetime import datetime, timedelta
from typing import Any

from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.utilities.typing import LambdaContext

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
    RevisionPlan,
    StudyTrack,
    WeekPlan,
)
from src.models.personalization import KnowledgeModel
from src.services.curriculum_validator import CurriculumValidatorService
from src.services.safety_filter import SafetyFilter

logger = Logger()

# Tracer is disabled for testing (requires aws-xray-sdk)
try:
    tracer = Tracer()
except Exception:
    tracer = None

# Initialize services
curriculum_validator = CurriculumValidatorService()
safety_filter = SafetyFilter()


def _trace_if_available(func):
    """Decorator to conditionally apply tracing."""
    if tracer:
        return tracer.capture_lambda_handler(func)
    return func


@logger.inject_lambda_context
@_trace_if_available
def generate(event: dict[str, Any], context: LambdaContext) -> dict[str, Any]:
    """
    Lambda handler for Bedrock Agent action groups.

    This handler is invoked by Bedrock Agent for all action groups.
    It routes to the appropriate handler based on the action name.
    """
    logger.info("Received content generation request", extra={"event": event})

    try:
        # Parse Bedrock Agent event
        action_group = event.get("actionGroup", "")
        api_path = event.get("apiPath", "")
        http_method = event.get("httpMethod", "POST")
        
        # Extract parameters from requestBody
        request_body = event.get("requestBody", {})
        content = request_body.get("content", {})
        app_json = content.get("application/json", {})
        properties = app_json.get("properties", [])
        
        # Convert properties list to dict
        params = {prop["name"]: prop["value"] for prop in properties}
        
        # Determine action from actionGroup or apiPath
        action = action_group
        if not action and api_path:
            # Extract action from API path (e.g., /generatelesson -> GenerateLesson)
            action = api_path.strip("/").replace("generate", "Generate")

        # Route to appropriate handler
        if action == "GenerateLesson" or api_path == "/generatelesson":
            result = generate_lesson_handler(params)
        elif action == "GenerateQuiz" or api_path == "/generatequiz":
            result = generate_quiz_handler(params)
        elif action == "GenerateHints" or api_path == "/generatehints":
            result = generate_hints_handler(params)
        elif action == "GenerateRevisionPlan" or api_path == "/generaterevisionplan":
            result = generate_revision_plan_handler(params)
        elif action == "GenerateStudyTrack" or api_path == "/generatestudytrack":
            result = generate_study_track_handler(params)
        else:
            raise ValueError(f"Unknown action: {action} (apiPath: {api_path})")

        # Return response in Bedrock Agent format
        return {
            "messageVersion": "1.0",
            "response": {
                "actionGroup": action_group,
                "apiPath": api_path,
                "httpMethod": http_method,
                "httpStatusCode": 200,
                "responseBody": {
                    "application/json": {
                        "body": json.dumps(result)
                    }
                }
            }
        }

    except Exception as e:
        logger.error(f"Content generation failed: {e}", exc_info=True)
        return {
            "messageVersion": "1.0",
            "response": {
                "actionGroup": event.get("actionGroup", ""),
                "apiPath": event.get("apiPath", ""),
                "httpMethod": event.get("httpMethod", "POST"),
                "httpStatusCode": 500,
                "responseBody": {
                    "application/json": {
                        "body": json.dumps({"error": str(e)})
                    }
                }
            }
        }


def generate_lesson_handler(params: dict[str, Any]) -> dict[str, Any]:
    """
    Generate a personalized lesson.

    Args:
        params: Action parameters

    Returns:
        Lesson data as dict
    """
    logger.info("Generating lesson", extra={"params": params})

    # Extract parameters
    topic = params["topic"]
    subject = params["subject"]
    grade = int(params["grade"])
    difficulty = params["difficulty"]
    
    # Parse student_context - handle both JSON and string formats
    student_context_str = params.get("student_context", "{}")
    try:
        student_context = json.loads(student_context_str)
    except json.JSONDecodeError:
        # If not valid JSON, create a simple dict
        logger.warning(f"Could not parse student_context as JSON: {student_context_str}")
        student_context = {}
    
    # Parse curriculum_standards - handle both JSON array and string formats
    curriculum_standards_str = params.get("curriculum_standards", "[]")
    try:
        curriculum_standards = json.loads(curriculum_standards_str)
    except json.JSONDecodeError:
        # If not valid JSON, try to parse as comma-separated or array-like string
        if isinstance(curriculum_standards_str, str):
            # Remove brackets and split
            curriculum_standards = [
                s.strip() 
                for s in curriculum_standards_str.strip("[]").split(",")
                if s.strip()
            ]
        else:
            curriculum_standards = []

    # Generate lesson ID
    lesson_id = f"lesson-{uuid.uuid4().hex[:12]}"

    # Create lesson structure
    # Note: In production, this would call Bedrock Agent to generate content
    # For now, we create a template structure
    lesson = Lesson(
        lesson_id=lesson_id,
        subject=subject,
        topic=topic,
        title=f"{topic} - {difficulty.capitalize()} Level",
        difficulty=DifficultyLevel(difficulty),
        estimated_minutes=20,
        curriculum_standards=curriculum_standards,
        sections=[
            LessonSection(
                type=LessonSectionType.EXPLANATION,
                content=f"# Introduction to {topic}\n\nThis lesson covers {topic} for grade {grade}.",
            ),
            LessonSection(
                type=LessonSectionType.EXAMPLE,
                content=f"## Example\n\nHere's an example of {topic}...",
            ),
            LessonSection(
                type=LessonSectionType.PRACTICE,
                content=f"## Practice\n\nTry these practice problems...",
            ),
        ],
    )

    # Validate lesson
    validation_result = curriculum_validator.validate_lesson(
        lesson=lesson,
        grade=grade,
        target_standards=curriculum_standards,
    )

    if not validation_result.status == "passed":
        logger.warning("Lesson validation failed", extra={"issues": validation_result.issues})
        # In production, regenerate lesson

    # Safety filter
    safety_result = safety_filter.filter_content(
        content=lesson.model_dump_json(),
        content_id=lesson_id,
        content_type="lesson",
    )

    if safety_result.status != "passed":
        logger.error("Lesson failed safety filter", extra={"issues": safety_result.issues})
        raise ValueError("Generated lesson contains inappropriate content")

    return lesson.model_dump()


def generate_quiz_handler(params: dict[str, Any]) -> dict[str, Any]:
    """
    Generate a quiz.

    Args:
        params: Action parameters

    Returns:
        Quiz data as dict
    """
    logger.info("Generating quiz", extra={"params": params})

    topic = params["topic"]
    subject = params["subject"]
    grade = int(params["grade"])
    difficulty = params["difficulty"]
    question_count = int(params["question_count"])
    
    # Parse learning_objectives
    learning_objectives_str = params.get("learning_objectives", "[]")
    try:
        learning_objectives = json.loads(learning_objectives_str)
    except json.JSONDecodeError:
        if isinstance(learning_objectives_str, str):
            learning_objectives = [
                s.strip() 
                for s in learning_objectives_str.strip("[]").split(",")
                if s.strip()
            ]
        else:
            learning_objectives = []

    # Generate quiz ID
    quiz_id = f"quiz-{uuid.uuid4().hex[:12]}"

    # Create quiz structure
    # Note: In production, this would call Bedrock Agent to generate questions
    questions = []
    for i in range(question_count):
        question_id = f"q-{uuid.uuid4().hex[:8]}"
        questions.append(
            Question(
                question_id=question_id,
                type=QuestionType.MULTIPLE_CHOICE,
                question=f"Question {i+1} about {topic}",
                options=["Option A", "Option B", "Option C", "Option D"],
                correct_answer="Option A",
                explanation=f"Explanation for question {i+1}",
                curriculum_standard=learning_objectives[0] if learning_objectives else "STANDARD-1",
                bloom_level=BloomLevel.UNDERSTAND,
            )
        )

    quiz = Quiz(
        quiz_id=quiz_id,
        subject=subject,
        topic=topic,
        title=f"{topic} Quiz - {difficulty.capitalize()}",
        difficulty=DifficultyLevel(difficulty),
        time_limit=15,
        questions=questions,
    )

    # Validate quiz
    validation_result = curriculum_validator.validate_quiz(
        quiz=quiz,
        grade=grade,
        target_standards=learning_objectives,
    )

    if not validation_result.status == "passed":
        logger.warning("Quiz validation failed", extra={"issues": validation_result.issues})

    # Safety filter
    safety_result = safety_filter.filter_content(
        content=quiz.model_dump_json(),
        content_id=quiz_id,
        content_type="quiz",
    )

    if safety_result.status != "passed":
        logger.error("Quiz failed safety filter", extra={"issues": safety_result.issues})
        raise ValueError("Generated quiz contains inappropriate content")

    return quiz.model_dump()


def generate_hints_handler(params: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Generate progressive hints.

    Args:
        params: Action parameters

    Returns:
        List of hint data as dicts
    """
    logger.info("Generating hints", extra={"params": params})

    question = params["question"]
    correct_answer = params["correct_answer"]
    
    # Parse student_error_patterns
    student_error_patterns_str = params.get("student_error_patterns", "[]")
    try:
        student_error_patterns = json.loads(student_error_patterns_str)
    except json.JSONDecodeError:
        if isinstance(student_error_patterns_str, str):
            student_error_patterns = [
                s.strip() 
                for s in student_error_patterns_str.strip("[]").split(",")
                if s.strip()
            ]
        else:
            student_error_patterns = []

    # Generate hints
    # Note: In production, this would call Bedrock Agent to generate contextual hints
    hints = [
        Hint(
            hint_id=f"hint-{uuid.uuid4().hex[:8]}",
            level=1,
            text="Think about the key concepts involved in this problem.",
        ),
        Hint(
            hint_id=f"hint-{uuid.uuid4().hex[:8]}",
            level=2,
            text="Consider breaking the problem into smaller steps.",
        ),
        Hint(
            hint_id=f"hint-{uuid.uuid4().hex[:8]}",
            level=3,
            text="Try applying the formula step by step.",
        ),
    ]

    # Safety filter hints
    for hint in hints:
        safety_result = safety_filter.filter_content(
            content=hint.text,
            content_id=hint.hint_id,
            content_type="hint",
        )
        if safety_result.status != "passed":
            logger.error("Hint failed safety filter", extra={"hint": hint.text})
            raise ValueError("Generated hint contains inappropriate content")

    return [hint.model_dump() for hint in hints]


def generate_revision_plan_handler(params: dict[str, Any]) -> dict[str, Any]:
    """
    Generate a revision plan.

    Args:
        params: Action parameters

    Returns:
        RevisionPlan data as dict
    """
    logger.info("Generating revision plan", extra={"params": params})

    student_id = params["student_id"]
    time_available = int(params["time_available"])
    subject = params["subject"]
    
    # Parse knowledge_gaps
    knowledge_gaps_str = params.get("knowledge_gaps", "[]")
    try:
        knowledge_gaps = json.loads(knowledge_gaps_str)
    except json.JSONDecodeError:
        if isinstance(knowledge_gaps_str, str):
            knowledge_gaps = [
                s.strip() 
                for s in knowledge_gaps_str.strip("[]").split(",")
                if s.strip()
            ]
        else:
            knowledge_gaps = []

    # Generate plan ID
    plan_id = f"plan-{uuid.uuid4().hex[:12]}"

    # Create revision plan
    # Note: In production, this would call Bedrock Agent to prioritize topics
    revision_plan = RevisionPlan(
        plan_id=plan_id,
        subject=subject,
        topics=knowledge_gaps,
        priority_order=knowledge_gaps,  # Would be sorted by proficiency
        estimated_hours=time_available,
        content_references={
            topic: [f"lesson-{i}", f"quiz-{i}"]
            for i, topic in enumerate(knowledge_gaps)
        },
    )

    return revision_plan.model_dump()


def generate_study_track_handler(params: dict[str, Any]) -> dict[str, Any]:
    """
    Generate a study track.

    Args:
        params: Action parameters

    Returns:
        StudyTrack data as dict
    """
    logger.info("Generating study track", extra={"params": params})

    student_id = params["student_id"]
    learning_velocity = float(params["learning_velocity"])
    weeks = int(params["weeks"])
    
    # Parse knowledge_model
    knowledge_model_str = params.get("knowledge_model", "{}")
    try:
        knowledge_model_dict = json.loads(knowledge_model_str)
        knowledge_model = KnowledgeModel(**knowledge_model_dict)
    except (json.JSONDecodeError, Exception) as e:
        logger.warning(f"Could not parse knowledge_model: {e}")
        # Create a minimal knowledge model
        knowledge_model = KnowledgeModel(student_id=student_id, subjects={})
    
    # Parse curriculum_scope
    curriculum_scope_str = params.get("curriculum_scope", "[]")
    try:
        curriculum_scope = json.loads(curriculum_scope_str)
    except json.JSONDecodeError:
        if isinstance(curriculum_scope_str, str):
            curriculum_scope = [
                s.strip() 
                for s in curriculum_scope_str.strip("[]").split(",")
                if s.strip()
            ]
        else:
            curriculum_scope = []

    # Generate track ID
    track_id = f"track-{uuid.uuid4().hex[:12]}"

    # Create study track
    # Note: In production, this would call Bedrock Agent to create personalized path
    week_plans = []
    topics_per_week = max(1, int(learning_velocity))

    for week_num in range(1, weeks + 1):
        start_idx = (week_num - 1) * topics_per_week
        end_idx = min(start_idx + topics_per_week, len(curriculum_scope))
        week_topics = curriculum_scope[start_idx:end_idx]

        if not week_topics:
            break

        week_plans.append(
            WeekPlan(
                week_number=week_num,
                topics=week_topics,
                lessons=[f"lesson-{i}" for i in range(len(week_topics))],
                quizzes=[f"quiz-{i}" for i in range(len(week_topics))],
                estimated_hours=5,
            )
        )

    study_track = StudyTrack(
        track_id=track_id,
        subject=params.get("subject", "Mathematics"),
        weeks=week_plans,
    )

    return study_track.model_dump()
