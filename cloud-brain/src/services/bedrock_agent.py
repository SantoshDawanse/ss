"""Amazon Bedrock Agent service for content generation."""

import json
import logging
import time
from typing import Any, Optional

import boto3
from botocore.exceptions import ClientError, ReadTimeoutError

from src.models.content import (
    Hint,
    Lesson,
    LessonGenerationRequest,
    Quiz,
    QuizGenerationRequest,
    RevisionPlan,
    StudyTrack,
)
from src.models.personalization import ContentGenerationRequest, KnowledgeModel
from src.services.curriculum_context import CurriculumContextService
from src.utils.error_handling import (
    exponential_backoff_retry,
    handle_bedrock_error,
    RetryableError,
    NonRetryableError,
)

logger = logging.getLogger(__name__)


class BedrockAgentService:
    """Service for interacting with Amazon Bedrock Agent."""

    def __init__(
        self,
        agent_id: Optional[str] = None,
        agent_alias_id: Optional[str] = None,
        region: str = "us-east-1",
    ):
        """
        Initialize Bedrock Agent service.

        Args:
            agent_id: Bedrock Agent ID (defaults to BEDROCK_AGENT_ID env var)
            agent_alias_id: Bedrock Agent Alias ID (defaults to BEDROCK_AGENT_ALIAS_ID env var)
            region: AWS region
        """
        import os
        
        # Use provided values or fall back to environment variables
        self.agent_id = agent_id or os.environ.get("BEDROCK_AGENT_ID")
        self.agent_alias_id = agent_alias_id or os.environ.get("BEDROCK_AGENT_ALIAS_ID", "TSTALIASID")  # Default alias
        self.region = region
        
        # Log configuration for debugging
        logger.info(f"Initializing Bedrock Agent: ID={self.agent_id}, Alias={self.agent_alias_id}, Region={self.region}")
        
        if not self.agent_id:
            logger.warning("BEDROCK_AGENT_ID not configured - will fall back to mock content")
        if not self.agent_alias_id:
            logger.warning("BEDROCK_AGENT_ALIAS_ID not configured - using default 'TSTALIASID'")

        # Initialize Bedrock Agent Runtime client
        self.bedrock_agent_runtime = boto3.client(
            "bedrock-agent-runtime", region_name=region
        )

        # Initialize Bedrock Agent client for management
        self.bedrock_agent = boto3.client("bedrock-agent", region_name=region)

        # Initialize curriculum context service
        self.curriculum_context = CurriculumContextService()

    @exponential_backoff_retry(max_attempts=3, initial_delay=1.0, max_delay=30.0)
    def generate_lesson(
        self,
        topic: str,
        subject: str,
        grade: int,
        difficulty: str,
        student_context: dict[str, Any],
        curriculum_standards: list[str],
    ) -> Lesson:
        """
        Generate a personalized lesson using Bedrock Agent.
        
        Implements retry logic with exponential backoff for transient failures.
        Maximum 3 attempts with delays: 1s, 2s, 4s.

        Args:
            topic: Topic name
            subject: Subject area
            grade: Grade level
            difficulty: Difficulty level (easy, medium, hard)
            student_context: Student learning context
            curriculum_standards: Target curriculum standard IDs

        Returns:
            Generated lesson

        Raises:
            RetryableError: If generation fails after retries
            NonRetryableError: If request is invalid
        """
        logger.info(f"Generating lesson for topic: {topic}, subject: {subject}")

        try:
            # Get curriculum context from MCP Server
            curriculum_context = self.curriculum_context.get_curriculum_context_for_lesson(
                subject=subject,
                grade=grade,
                topic=topic,
                target_standards=curriculum_standards,
            )
        except Exception as e:
            logger.warning(f"Failed to get curriculum context: {e}. Using cached data.")
            # Use empty context as fallback - content will still be generated
            curriculum_context = {}

        # Prepare action group input with curriculum context
        action_input = {
            "topic": topic,
            "subject": subject,
            "grade": grade,
            "difficulty": difficulty,
            "student_context": student_context,
            "curriculum_standards": curriculum_standards,
            "curriculum_context": curriculum_context,  # Injected from MCP Server
        }

        try:
            # Create prompt for lesson generation
            prompt = f"""Generate a personalized lesson for a student. You MUST respond with ONLY a valid JSON object, nothing else.

Requirements:
- Topic: {topic}
- Subject: {subject}
- Grade: {grade}
- Difficulty: {difficulty}

CRITICAL JSON RULES:
1. Return ONLY the JSON object - no explanations, no markdown, no code blocks
2. Do NOT use actual newlines in string values - keep all text on one line
3. Use simple spaces instead of newlines for readability
4. Ensure all quotes are properly escaped
5. Do not include any text before or after the JSON

Required JSON structure:
{{
  "lesson_id": "lesson-{topic.lower().replace(' ', '-')}-001",
  "subject": "{subject}",
  "topic": "{topic}",
  "title": "Introduction to {topic}",
  "difficulty": "{difficulty}",
  "estimated_minutes": 30,
  "curriculum_standards": ["MATH-{grade}-001"],
  "sections": [
    {{"type": "explanation", "content": "Clear explanation text here", "media": []}},
    {{"type": "example", "content": "Example with solution here", "media": []}},
    {{"type": "practice", "content": "Practice exercises here", "media": []}}
  ]
}}

Make content age-appropriate for grade {grade}, culturally relevant to Nepal, and aligned with {subject} curriculum."""

            # Invoke Bedrock Agent directly
            response = self._invoke_agent_direct(prompt)

            # Parse response into Lesson model
            # Clean the response - remove markdown code blocks if present
            cleaned_response = response.strip()
            if cleaned_response.startswith('```json'):
                cleaned_response = cleaned_response[7:]  # Remove ```json
            if cleaned_response.startswith('```'):
                cleaned_response = cleaned_response[3:]  # Remove ```
            if cleaned_response.endswith('```'):
                cleaned_response = cleaned_response[:-3]  # Remove trailing ```
            cleaned_response = cleaned_response.strip()
            
            # Extract JSON from response (agent might include additional text)
            json_start = cleaned_response.find('{')
            json_end = cleaned_response.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = cleaned_response[json_start:json_end]
                # Replace literal \n with actual newlines for better readability
                # but keep the JSON valid
                lesson_data = json.loads(json_str)
            else:
                lesson_data = json.loads(cleaned_response)
            
            return Lesson(**lesson_data)

        except (ClientError, ReadTimeoutError) as e:
            error_response = handle_bedrock_error(e)
            logger.error(f"Bedrock error: {error_response.message}")
            raise RetryableError(
                error_response.message,
                error_response.error_code,
                error_response.retry_after,
                error_response.details,
            )
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON response from Bedrock: {e}")
            raise RetryableError(
                "Invalid content generated",
                "BEDROCK_INVALID_RESPONSE",
                retry_after=2,
            )
        except Exception as e:
            logger.error(f"Unexpected error generating lesson: {e}")
            raise NonRetryableError(
                f"Lesson generation failed: {e}",
                "INTERNAL_ERROR",
            )

    def generate_lesson_from_request(
        self,
        request: LessonGenerationRequest,
    ) -> Lesson:
        """
        Generate a personalized lesson from a LessonGenerationRequest.

        Args:
            request: Lesson generation request

        Returns:
            Generated lesson

        Raises:
            RetryableError: If generation fails after retries
            NonRetryableError: If request is invalid
        """
        return self.generate_lesson(
            topic=request.topic,
            subject=request.subject,
            grade=request.grade,
            difficulty=request.difficulty.value,
            student_context=request.student_context,
            curriculum_standards=request.curriculum_standards,
        )

    @exponential_backoff_retry(max_attempts=3, initial_delay=1.0, max_delay=30.0)
    def generate_quiz(
        self,
        topic: str,
        subject: str,
        grade: int,
        difficulty: str,
        question_count: int,
        learning_objectives: list[str],
    ) -> Quiz:
        """
        Generate a quiz using Bedrock Agent.
        
        Implements retry logic with exponential backoff for transient failures.

        Args:
            topic: Topic name
            subject: Subject area
            grade: Grade level
            difficulty: Difficulty level
            question_count: Number of questions
            learning_objectives: Target learning objectives

        Returns:
            Generated quiz

        Raises:
            RetryableError: If generation fails after retries
            NonRetryableError: If request is invalid
        """
        logger.info(f"Generating quiz for topic: {topic}, subject: {subject}")

        try:
            # Get curriculum context from MCP Server
            curriculum_context = self.curriculum_context.get_curriculum_context_for_quiz(
                subject=subject,
                grade=grade,
                topic=topic,
                learning_objectives=learning_objectives,
            )
        except Exception as e:
            logger.warning(f"Failed to get curriculum context: {e}. Using cached data.")
            curriculum_context = {}

        action_input = {
            "topic": topic,
            "subject": subject,
            "grade": grade,
            "difficulty": difficulty,
            "question_count": question_count,
            "learning_objectives": learning_objectives,
            "curriculum_context": curriculum_context,  # Injected from MCP Server
        }

        try:
            # Create prompt for quiz generation
            prompt = f"""Generate a quiz for a student. You MUST respond with ONLY a valid JSON object, nothing else.

Requirements:
- Topic: {topic}
- Subject: {subject}
- Grade: {grade}
- Difficulty: {difficulty}
- Number of Questions: {question_count}

CRITICAL JSON RULES:
1. Return ONLY the JSON object - no explanations, no markdown, no code blocks
2. Do NOT use actual newlines in string values - keep all text on one line
3. For bloom_level, use ONLY these strings: "remember", "understand", "apply", "analyze", "evaluate", "create"
4. Ensure all quotes are properly escaped
5. Do not include any text before or after the JSON

CRITICAL ANSWER VALIDATION RULES:
6. For multiple_choice questions: correct_answer MUST be EXACTLY one of the options (exact match, including case)
7. For true_false questions: correct_answer MUST be either "True" or "False" (exact case)
8. Double-check that every correct_answer matches an option EXACTLY

Required JSON structure:
{{
  "quiz_id": "quiz-{topic.lower().replace(' ', '-')}-001",
  "subject": "{subject}",
  "topic": "{topic}",
  "title": "{topic} Quiz",
  "difficulty": "{difficulty}",
  "time_limit": 15,
  "questions": [
    {{
      "question_id": "q1",
      "type": "multiple_choice",
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": "Option A",
      "explanation": "Explanation why this is correct",
      "curriculum_standard": "MATH-{grade}-001",
      "bloom_level": "understand"
    }}
  ]
}}

IMPORTANT: Verify that correct_answer matches one of the options EXACTLY before returning the JSON.

Generate exactly {question_count} questions. Mix types (multiple_choice, true_false). Use bloom_level: "remember", "understand", "apply", "analyze", "evaluate", or "create"."""

            # Invoke Bedrock Agent directly
            response = self._invoke_agent_direct(prompt)

            # Parse response into Quiz model
            # Clean the response - remove markdown code blocks if present
            cleaned_response = response.strip()
            if cleaned_response.startswith('```json'):
                cleaned_response = cleaned_response[7:]
            if cleaned_response.startswith('```'):
                cleaned_response = cleaned_response[3:]
            if cleaned_response.endswith('```'):
                cleaned_response = cleaned_response[:-3]
            cleaned_response = cleaned_response.strip()
            
            # Extract JSON from response
            json_start = cleaned_response.find('{')
            json_end = cleaned_response.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = cleaned_response[json_start:json_end]
                quiz_data = json.loads(json_str)
            else:
                quiz_data = json.loads(cleaned_response)
            
            # Convert bloom_level integers to strings if needed
            if 'questions' in quiz_data:
                bloom_map = {
                    1: 'remember',
                    2: 'understand',
                    3: 'apply',
                    4: 'analyze',
                    5: 'evaluate',
                    6: 'create'
                }
                for question in quiz_data['questions']:
                    if 'bloom_level' in question and isinstance(question['bloom_level'], int):
                        question['bloom_level'] = bloom_map.get(question['bloom_level'], 'understand')
            
            # Validate and fix quiz questions
            quiz_data = self._validate_and_fix_quiz(quiz_data)
            
            return Quiz(**quiz_data)

        except (ClientError, ReadTimeoutError) as e:
            error_response = handle_bedrock_error(e)
            logger.error(f"Bedrock error: {error_response.message}")
            raise RetryableError(
                error_response.message,
                error_response.error_code,
                error_response.retry_after,
                error_response.details,
            )
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON response from Bedrock: {e}")
            raise RetryableError(
                "Invalid content generated",
                "BEDROCK_INVALID_RESPONSE",
                retry_after=2,
            )
        except Exception as e:
            logger.error(f"Unexpected error generating quiz: {e}")
            raise NonRetryableError(
                f"Quiz generation failed: {e}",
                "INTERNAL_ERROR",
            )

    def generate_quiz_from_request(
        self,
        request: QuizGenerationRequest,
    ) -> Quiz:
        """
        Generate a quiz from a QuizGenerationRequest.

        Args:
            request: Quiz generation request

        Returns:
            Generated quiz

        Raises:
            RetryableError: If generation fails after retries
            NonRetryableError: If request is invalid
        """
        return self.generate_quiz(
            topic=request.topic,
            subject=request.subject,
            grade=request.grade,
            difficulty=request.difficulty.value,
            question_count=request.question_count,
            learning_objectives=request.learning_objectives,
        )

    def generate_hints(
        self,
        question: str,
        correct_answer: str,
        student_error_patterns: Optional[list[str]] = None,
    ) -> list[Hint]:
        """
        Generate progressive hints for a quiz question.

        Args:
            question: Question text
            correct_answer: Correct answer
            student_error_patterns: Common student errors

        Returns:
            List of hints (3 levels)

        Raises:
            ValueError: If generation fails
        """
        logger.info("Generating hints for question")

        try:
            # Create prompt for hint generation
            prompt = f"""Generate 3 progressive hints for this question:

Question: {question}
Correct Answer: {correct_answer}
Common Student Errors: {', '.join(student_error_patterns) if student_error_patterns else 'None specified'}

Please generate hints in JSON format as an array:
[
  {{
    "hint_id": "hint-1",
    "level": 1,
    "content": "First hint - very subtle, just points in right direction",
    "reveals_answer": false
  }},
  {{
    "hint_id": "hint-2",
    "level": 2,
    "content": "Second hint - more specific, shows approach",
    "reveals_answer": false
  }},
  {{
    "hint_id": "hint-3",
    "level": 3,
    "content": "Third hint - detailed explanation with steps",
    "reveals_answer": true
  }}
]

Make hints progressively more revealing but pedagogically sound."""

            # Invoke Bedrock Agent directly
            response = self._invoke_agent_direct(prompt)

            # Parse response
            json_start = response.find('[')
            json_end = response.rfind(']') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                hints_data = json.loads(json_str)
            else:
                hints_data = json.loads(response)
            
            return [Hint(**hint) for hint in hints_data]

        except Exception as e:
            logger.error(f"Failed to generate hints: {e}")
            raise ValueError(f"Hint generation failed: {e}")

    def generate_revision_plan(
        self,
        student_id: str,
        knowledge_gaps: list[str],
        time_available: int,
        subject: str,
    ) -> RevisionPlan:
        """
        Generate a personalized revision plan.

        Args:
            student_id: Student identifier
            knowledge_gaps: List of topic IDs with gaps
            time_available: Available time in hours
            subject: Subject area

        Returns:
            Revision plan

        Raises:
            ValueError: If generation fails
        """
        logger.info(f"Generating revision plan for student: {student_id}")

        try:
            # Create prompt for revision plan generation
            prompt = f"""Generate a personalized revision plan for a student:

Student ID: {student_id}
Subject: {subject}
Knowledge Gaps: {', '.join(knowledge_gaps)}
Time Available: {time_available} hours

Please generate a revision plan in JSON format:
{{
  "plan_id": "unique-id",
  "student_id": "{student_id}",
  "subject": "{subject}",
  "total_hours": {time_available},
  "topics": [
    {{
      "topic_id": "topic-id",
      "topic_name": "topic name",
      "allocated_hours": 2,
      "priority": "high",
      "activities": ["activity1", "activity2"]
    }}
  ],
  "milestones": [
    {{
      "day": 1,
      "goal": "milestone description"
    }}
  ]
}}

Prioritize topics based on knowledge gaps and allocate time efficiently."""

            # Invoke Bedrock Agent directly
            response = self._invoke_agent_direct(prompt)

            # Parse response
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                plan_data = json.loads(json_str)
            else:
                plan_data = json.loads(response)
            
            return RevisionPlan(**plan_data)

        except Exception as e:
            logger.error(f"Failed to generate revision plan: {e}")
            raise ValueError(f"Revision plan generation failed: {e}")

    def generate_study_track(
        self,
        student_id: str,
        knowledge_model: KnowledgeModel,
        learning_velocity: float,
        curriculum_scope: list[str],
        weeks: int,
    ) -> StudyTrack:
        """
        Generate a multi-week personalized study track.

        Args:
            student_id: Student identifier
            knowledge_model: Current knowledge model
            learning_velocity: Topics per week
            curriculum_scope: Curriculum topics to cover
            weeks: Number of weeks

        Returns:
            Study track

        Raises:
            ValueError: If generation fails
        """
        logger.info(f"Generating study track for student: {student_id}")

        try:
            # Create prompt for study track generation
            prompt = f"""Generate a {weeks}-week personalized study track for a student:

Student ID: {student_id}
Learning Velocity: {learning_velocity} topics per week
Curriculum Scope: {', '.join(curriculum_scope)}
Duration: {weeks} weeks

Knowledge Model Summary:
{json.dumps(knowledge_model.model_dump(), indent=2)}

Please generate a study track in JSON format:
{{
  "track_id": "unique-id",
  "student_id": "{student_id}",
  "weeks": {weeks},
  "weekly_plans": [
    {{
      "week": 1,
      "topics": ["topic1", "topic2"],
      "learning_objectives": ["objective1", "objective2"],
      "estimated_hours": 5
    }}
  ],
  "assessment_schedule": [
    {{
      "week": 2,
      "assessment_type": "quiz",
      "topics_covered": ["topic1", "topic2"]
    }}
  ]
}}

Pace the track according to learning velocity and build on existing knowledge."""

            # Invoke Bedrock Agent directly
            response = self._invoke_agent_direct(prompt)

            # Parse response
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                track_data = json.loads(json_str)
            else:
                track_data = json.loads(response)
            
            return StudyTrack(**track_data)

        except Exception as e:
            logger.error(f"Failed to generate study track: {e}")
            raise ValueError(f"Study track generation failed: {e}")
    def generate_learning_content(
        self,
        student_id: str,
        knowledge_model: Optional[KnowledgeModel],
        performance_logs: list[Any],
        bundle_duration: int = 7,
        subjects: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """
        Generate complete learning content bundle (lessons and quizzes).

        Args:
            student_id: Student identifier
            knowledge_model: Current knowledge model
            performance_logs: Recent performance logs
            bundle_duration: Bundle duration in days
            subjects: List of subjects to generate content for

        Returns:
            Dict with lessons and quizzes

        Raises:
            ValueError: If generation fails
        """
        logger.info(f"Generating learning content for student: {student_id}")

        if not subjects:
            subjects = ["Mathematics"]

        content = {
            "lessons": [],
            "quizzes": [],
        }

        # Use default grade (8th grade for MVP)
        # TODO: Add grade field to Student model and KnowledgeModel
        grade = 8

        # Analyze student progress to determine content strategy
        student_progress = self._analyze_student_progress(performance_logs, knowledge_model)
        logger.info(f"Student progress analysis: {student_progress}")

        # Try to generate content using Bedrock Agent first
        bedrock_content_generated = False
        
        # Check if Bedrock Agent is properly configured
        if self.agent_id and self.agent_alias_id:
            logger.info("Bedrock Agent is configured - attempting real content generation")
            
            # Generate content for each subject
            for subject in subjects:
                try:
                    # Determine topics based on knowledge model and progress
                    topics = self._select_topics_for_student(
                        subject, knowledge_model, student_progress, performance_logs
                    )
                    
                    # Determine difficulty based on recent performance
                    difficulty = self._determine_difficulty_level(student_progress)
                    
                    logger.info(f"Selected topics for {subject}: {topics}, difficulty: {difficulty}")

                    # Generate lessons for each topic using Bedrock Agent
                    for topic in topics:
                        try:
                            lesson = self.generate_lesson(
                                topic=topic,
                                subject=subject,
                                grade=grade,
                                difficulty=difficulty,
                                student_context={
                                    "student_id": student_id,
                                    "recent_performance": len(performance_logs),
                                    "progress_analysis": student_progress,
                                },
                                curriculum_standards=[],
                            )
                            content["lessons"].append(lesson.model_dump())
                            bedrock_content_generated = True
                            logger.info(f"Generated lesson via Bedrock Agent: {lesson.title}")
                        except Exception as e:
                            logger.warning(f"Failed to generate lesson for {topic} via Bedrock Agent: {e}")
                            continue

                    # Generate quizzes for each topic using Bedrock Agent
                    for topic in topics:
                        try:
                            quiz = self.generate_quiz(
                                topic=topic,
                                subject=subject,
                                grade=grade,
                                difficulty=difficulty,
                                question_count=5,
                                learning_objectives=[],
                            )
                            content["quizzes"].append(quiz.model_dump())
                            bedrock_content_generated = True
                            logger.info(f"Generated quiz via Bedrock Agent: {quiz.title}")
                        except Exception as e:
                            logger.warning(f"Failed to generate quiz for {topic} via Bedrock Agent: {e}")
                            continue

                except Exception as e:
                    logger.error(f"Failed to generate content for {subject} via Bedrock Agent: {e}")
                    continue
        else:
            logger.warning("Bedrock Agent not configured - skipping real content generation")

        # If Bedrock Agent failed or is not configured, use mock content for MVP
        if not bedrock_content_generated or (not content["lessons"] and not content["quizzes"]):
            if self.agent_id and self.agent_alias_id:
                logger.warning("Bedrock Agent configured but failed to generate content - using mock content as fallback")
            else:
                logger.info("Bedrock Agent not configured - using progressive mock content for MVP")
            
            content = self._generate_mock_content(student_id, subjects[0] if subjects else "Mathematics")
        else:
            logger.info(f"Successfully generated content via Bedrock Agent: {len(content['lessons'])} lessons, {len(content['quizzes'])} quizzes")

        logger.info(
            f"Generated {len(content['lessons'])} lessons and {len(content['quizzes'])} quizzes"
        )

        return content

    def _analyze_student_progress(
        self, 
        performance_logs: list[Any], 
        knowledge_model: Optional[KnowledgeModel]
    ) -> dict[str, Any]:
        """
        Analyze student progress from performance logs and knowledge model.
        
        Args:
            performance_logs: Recent performance logs
            knowledge_model: Current knowledge model
            
        Returns:
            Dict with progress analysis
        """
        analysis = {
            "total_activities": len(performance_logs),
            "recent_accuracy": 0.0,
            "activity_level": "low",
            "struggling_topics": [],
            "mastered_topics": [],
            "needs_review": False,
            "is_progressing": True,
        }
        
        if not performance_logs:
            analysis["activity_level"] = "new_student"
            return analysis
        
        # Analyze recent performance (last 10 activities)
        recent_logs = performance_logs[-10:] if len(performance_logs) > 10 else performance_logs
        correct_answers = sum(1 for log in recent_logs if log.get("data", {}).get("correct", False))
        
        if recent_logs:
            analysis["recent_accuracy"] = correct_answers / len(recent_logs)
        
        # Determine activity level
        if len(performance_logs) > 20:
            analysis["activity_level"] = "high"
        elif len(performance_logs) > 10:
            analysis["activity_level"] = "medium"
        else:
            analysis["activity_level"] = "low"
        
        # Analyze knowledge model if available
        if knowledge_model and knowledge_model.subjects:
            for subject_name, subject_knowledge in knowledge_model.subjects.items():
                for topic_id, topic_mastery in subject_knowledge.topics.items():
                    if topic_mastery.proficiency < 0.5:
                        analysis["struggling_topics"].append(topic_id)
                    elif topic_mastery.proficiency > 0.8:
                        analysis["mastered_topics"].append(topic_id)
        
        # Determine if student needs review
        analysis["needs_review"] = (
            analysis["recent_accuracy"] < 0.6 or 
            len(analysis["struggling_topics"]) > 3
        )
        
        # Determine if student is progressing
        analysis["is_progressing"] = (
            analysis["recent_accuracy"] > 0.5 and 
            analysis["activity_level"] != "low"
        )
        
        return analysis

    def _select_topics_for_student(
        self,
        subject: str,
        knowledge_model: Optional[KnowledgeModel],
        progress_analysis: dict[str, Any],
        performance_logs: list[Any],
    ) -> list[str]:
        """
        Select appropriate topics based on student progress and knowledge model.
        
        Args:
            subject: Subject area
            knowledge_model: Current knowledge model
            progress_analysis: Student progress analysis
            performance_logs: Recent performance logs
            
        Returns:
            List of topic names
        """
        # Default topic progression for Mathematics
        topic_progression = [
            "Introduction", "Basic Operations", "Problem Solving", "Fractions",
            "Decimals", "Percentages", "Algebra Basics", "Geometry Basics",
            "Data and Statistics", "Advanced Problems"
        ]
        
        # For new students, start with basics
        if progress_analysis["activity_level"] == "new_student":
            return topic_progression[:2]
        
        # For struggling students, focus on review and struggling topics
        if progress_analysis["needs_review"]:
            if progress_analysis["struggling_topics"]:
                return progress_analysis["struggling_topics"][:2]
            else:
                return topic_progression[:3]  # Back to basics
        
        # For progressing students, advance to new topics
        if progress_analysis["is_progressing"]:
            # Find current level based on completed activities
            completed_topics = len(set(log.get("topic", "Introduction") for log in performance_logs))
            next_index = min(completed_topics + 1, len(topic_progression) - 1)
            return topic_progression[next_index:next_index + 2]
        
        # Default: mixed review and new content
        return topic_progression[2:4]

    def _determine_difficulty_level(self, progress_analysis: dict[str, Any]) -> str:
        """
        Determine appropriate difficulty level based on student progress.
        
        Args:
            progress_analysis: Student progress analysis
            
        Returns:
            Difficulty level string
        """
        if progress_analysis["activity_level"] == "new_student":
            return "easy"
        
        if progress_analysis["needs_review"] or progress_analysis["recent_accuracy"] < 0.6:
            return "easy"
        
        if progress_analysis["recent_accuracy"] > 0.8 and progress_analysis["activity_level"] == "high":
            return "hard"
        
        return "medium"

    def _generate_mock_content(self, student_id: str, subject: str) -> dict[str, Any]:
        """
        Generate mock content for MVP when Bedrock Agent is unavailable.

        Args:
            student_id: Student identifier
            subject: Subject area

        Returns:
            Dict with mock lessons and quizzes
        """
        import uuid
        import hashlib
        
        logger.info(f"Generating mock content for student {student_id}")
        
        # Create a deterministic but unique seed based on student_id and current time
        # This ensures different content each time while being reproducible for testing
        import time
        current_hour = int(time.time() // 3600)  # Changes every hour
        seed_string = f"{student_id}_{subject}_{current_hour}"
        seed_hash = hashlib.md5(seed_string.encode()).hexdigest()[:8]
        
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
        
        logger.info(f"Generated progressive mock content for {selected_topic} ({selected_difficulty}): "
                   f"1 lesson with {len(mock_lesson['sections'])} sections, "
                   f"1 quiz with {len(mock_quiz['questions'])} questions")
        
        return {
            "lessons": [mock_lesson],
            "quizzes": [mock_quiz]
        }

    def _validate_and_fix_quiz(self, quiz_data: dict[str, Any]) -> dict[str, Any]:
        """
        Validate and fix quiz questions to ensure correct answers are valid.
        
        This ensures:
        1. For multiple_choice: correct_answer is one of the options
        2. For true_false: correct_answer is either "True" or "False"
        3. For short_answer: correct_answer exists and is not empty
        
        Args:
            quiz_data: Quiz data dictionary
            
        Returns:
            Fixed quiz data dictionary
        """
        if 'questions' not in quiz_data:
            return quiz_data
        
        fixed_questions = []
        for i, question in enumerate(quiz_data['questions']):
            question_type = question.get('type', 'multiple_choice')
            correct_answer = question.get('correct_answer', '')
            options = question.get('options', [])
            
            # Validate and fix based on question type
            if question_type == 'multiple_choice':
                if not options:
                    logger.warning(f"Question {i+1}: No options provided, skipping")
                    continue
                
                # Check if correct_answer is in options (case-insensitive)
                options_lower = [opt.lower() if isinstance(opt, str) else str(opt).lower() for opt in options]
                correct_lower = correct_answer.lower() if isinstance(correct_answer, str) else str(correct_answer).lower()
                
                if correct_lower not in options_lower:
                    # Fix: Set correct_answer to first option
                    logger.warning(
                        f"Question {i+1}: correct_answer '{correct_answer}' not in options {options}. "
                        f"Setting to first option: '{options[0]}'"
                    )
                    question['correct_answer'] = options[0]
                else:
                    # Ensure correct_answer matches the exact case from options
                    correct_index = options_lower.index(correct_lower)
                    question['correct_answer'] = options[correct_index]
            
            elif question_type == 'true_false':
                # Normalize to "True" or "False"
                if correct_answer.lower() in ['true', 't', 'yes', '1']:
                    question['correct_answer'] = 'True'
                elif correct_answer.lower() in ['false', 'f', 'no', '0']:
                    question['correct_answer'] = 'False'
                else:
                    logger.warning(
                        f"Question {i+1}: Invalid true/false answer '{correct_answer}'. "
                        f"Setting to 'True'"
                    )
                    question['correct_answer'] = 'True'
                
                # Ensure options are ["True", "False"]
                question['options'] = ['True', 'False']
            
            elif question_type == 'short_answer':
                if not correct_answer or not correct_answer.strip():
                    logger.warning(f"Question {i+1}: Empty short answer, skipping")
                    continue
                
                # Ensure correct_answer is trimmed
                question['correct_answer'] = correct_answer.strip()
            
            fixed_questions.append(question)
        
        # Update quiz with fixed questions
        quiz_data['questions'] = fixed_questions
        
        logger.info(
            f"Quiz validation: {len(quiz_data['questions'])} valid questions "
            f"(original: {len(quiz_data.get('questions', []))})"
        )
        
        return quiz_data

    def _invoke_agent_direct(
        self,
        prompt: str,
        session_id: Optional[str] = None,
    ) -> str:
        """
        Invoke Bedrock Agent directly with a prompt (without action groups).

        Args:
            prompt: The prompt to send to the agent
            session_id: Optional session ID for conversation continuity

        Returns:
            Agent response as string

        Raises:
            ValueError: If agent is not configured
            ClientError: If invocation fails
        """
        if not self.agent_id or not self.agent_alias_id:
            logger.warning(f"Bedrock Agent not configured (ID: {self.agent_id}, Alias: {self.agent_alias_id})")
            raise ValueError("Bedrock Agent ID and Alias ID must be configured. Set BEDROCK_AGENT_ID and BEDROCK_AGENT_ALIAS_ID environment variables.")

        try:
            # Generate session ID if not provided
            if not session_id:
                session_id = f"session-{int(time.time())}"
            
            logger.info(f"Invoking Bedrock Agent directly (session: {session_id})")
            logger.debug(f"Prompt: {prompt[:200]}...")
            
            # Invoke agent directly with prompt
            response = self.bedrock_agent_runtime.invoke_agent(
                agentId=self.agent_id,
                agentAliasId=self.agent_alias_id,
                sessionId=session_id,
                inputText=prompt,
            )

            # Parse streaming response
            result = ""
            for event in response.get("completion", []):
                if "chunk" in event:
                    chunk = event["chunk"]
                    if "bytes" in chunk:
                        result += chunk["bytes"].decode("utf-8")

            logger.info(f"Bedrock Agent response length: {len(result)} characters")
            logger.debug(f"Bedrock Agent response: {result[:500]}...")
            
            return result

        except ClientError as e:
            logger.error(f"Bedrock Agent invocation failed: {e}")
            raise

    def create_agent(
        self,
        agent_name: str,
        foundation_model: str = "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
        instruction: Optional[str] = None,
    ) -> dict[str, str]:
        """
        Create a new Bedrock Agent.

        Args:
            agent_name: Name for the agent
            foundation_model: Foundation model ID
            instruction: Agent instructions

        Returns:
            Dict with agent_id and agent_arn

        Raises:
            ClientError: If creation fails
        """
        default_instruction = """
You are an expert educational content generator for the Sikshya-Sathi system, 
designed to create personalized learning materials for rural Nepali K-12 students.

Your responsibilities:
1. Generate lessons aligned with Nepal K-12 curriculum standards
2. Create quizzes that assess understanding at appropriate cognitive levels
3. Provide progressive hints that guide without revealing answers
4. Design revision plans based on student knowledge gaps
5. Build personalized study tracks that adapt to learning velocity

Guidelines:
- Use culturally appropriate examples relevant to Nepal
- Ensure age-appropriate language and complexity
- Follow Bloom's taxonomy for cognitive progression
- Incorporate pedagogical best practices
- Use metric system and Nepali currency in examples
- Support both Nepali and English languages
- Maintain curriculum fidelity and accuracy
"""

        try:
            response = self.bedrock_agent.create_agent(
                agentName=agent_name,
                foundationModel=foundation_model,
                instruction=instruction or default_instruction,
                agentResourceRoleArn="",  # Will be set by CDK
            )

            agent_id = response["agent"]["agentId"]
            agent_arn = response["agent"]["agentArn"]

            logger.info(f"Created Bedrock Agent: {agent_id}")

            return {
                "agent_id": agent_id,
                "agent_arn": agent_arn,
            }

        except ClientError as e:
            logger.error(f"Failed to create Bedrock Agent: {e}")
            raise
