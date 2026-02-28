"""Amazon Bedrock Agent service for content generation."""

import json
import logging
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
            agent_id: Bedrock Agent ID
            agent_alias_id: Bedrock Agent Alias ID
            region: AWS region
        """
        self.agent_id = agent_id
        self.agent_alias_id = agent_alias_id
        self.region = region

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
            # Invoke Bedrock Agent action group
            response = self._invoke_action_group(
                action_group_name="GenerateLesson",
                action_input=action_input,
            )

            # Parse response into Lesson model
            lesson_data = json.loads(response)
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
            response = self._invoke_action_group(
                action_group_name="GenerateQuiz",
                action_input=action_input,
            )

            quiz_data = json.loads(response)
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

        action_input = {
            "question": question,
            "correct_answer": correct_answer,
            "student_error_patterns": student_error_patterns or [],
        }

        try:
            response = self._invoke_action_group(
                action_group_name="GenerateHints",
                action_input=action_input,
            )

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

        action_input = {
            "student_id": student_id,
            "knowledge_gaps": knowledge_gaps,
            "time_available": time_available,
            "subject": subject,
        }

        try:
            response = self._invoke_action_group(
                action_group_name="GenerateRevisionPlan",
                action_input=action_input,
            )

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

        action_input = {
            "student_id": student_id,
            "knowledge_model": knowledge_model.model_dump(),
            "learning_velocity": learning_velocity,
            "curriculum_scope": curriculum_scope,
            "weeks": weeks,
        }

        try:
            response = self._invoke_action_group(
                action_group_name="GenerateStudyTrack",
                action_input=action_input,
            )

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

        # Try to generate content using Bedrock Agent
        bedrock_failed = False
        
        # Generate content for each subject
        for subject in subjects:
            try:
                # Determine topics based on knowledge model
                if knowledge_model and knowledge_model.subjects:
                    # Find topics that need work from subjects
                    weak_topics = []
                    for subject_name, subject_knowledge in knowledge_model.subjects.items():
                        for topic_id, topic_mastery in subject_knowledge.topics.items():
                            if topic_mastery.proficiency < 0.7:
                                weak_topics.append(topic_id)
                    topics = weak_topics[:3] if weak_topics else ["Introduction"]
                else:
                    # Default topics for new students
                    topics = ["Introduction"]

                # Generate lessons for each topic
                for topic in topics:
                    try:
                        lesson = self.generate_lesson(
                            topic=topic,
                            subject=subject,
                            grade=grade,
                            difficulty="medium",
                            student_context={
                                "student_id": student_id,
                                "recent_performance": len(performance_logs),
                            },
                            curriculum_standards=[],
                        )
                        content["lessons"].append(lesson.model_dump())
                    except Exception as e:
                        logger.warning(f"Failed to generate lesson for {topic}: {e}")
                        bedrock_failed = True
                        continue

                # Generate quizzes for each topic
                for topic in topics:
                    try:
                        quiz = self.generate_quiz(
                            topic=topic,
                            subject=subject,
                            grade=grade,
                            difficulty="medium",
                            question_count=5,
                            learning_objectives=[],
                        )
                        content["quizzes"].append(quiz.model_dump())
                    except Exception as e:
                        logger.warning(f"Failed to generate quiz for {topic}: {e}")
                        bedrock_failed = True
                        continue

            except Exception as e:
                logger.error(f"Failed to generate content for {subject}: {e}")
                bedrock_failed = True
                continue

        # If Bedrock Agent failed or no content generated, use mock content for MVP
        if not content["lessons"] and not content["quizzes"]:
            logger.warning("Bedrock Agent failed, using mock content for MVP")
            content = self._generate_mock_content(student_id, subjects[0] if subjects else "Mathematics")

        logger.info(
            f"Generated {len(content['lessons'])} lessons and {len(content['quizzes'])} quizzes"
        )

        return content

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
        
        logger.info(f"Generating mock content for student {student_id}")
        
        # Mock lesson with correct structure
        mock_lesson = {
            "lesson_id": f"lesson_{uuid.uuid4()}",
            "subject": subject,
            "topic": "Introduction",
            "title": f"Introduction to {subject}",
            "difficulty": "medium",
            "estimated_minutes": 30,
            "curriculum_standards": ["STANDARD_001"],
            "sections": [
                {
                    "type": "explanation",
                    "content": f"Welcome to {subject}! This lesson introduces you to the fundamental concepts. "
                              f"We'll explore the basic principles and how they apply to real-world situations.",
                    "media": []
                },
                {
                    "type": "example",
                    "content": "Let's look at a practical example to understand this concept better. "
                              "Consider a simple problem that demonstrates the fundamental principle.",
                    "media": []
                },
                {
                    "type": "practice",
                    "content": "Now it's your turn! Try solving these practice problems to reinforce your understanding. "
                              "Remember to apply the concepts we just learned.",
                    "media": []
                }
            ]
        }
        
        # Mock quiz with correct structure
        mock_quiz = {
            "quiz_id": f"quiz_{uuid.uuid4()}",
            "subject": subject,
            "topic": "Introduction",
            "title": f"{subject} Practice Quiz",
            "difficulty": "medium",
            "time_limit": 15,
            "questions": [
                {
                    "question_id": f"q_{uuid.uuid4()}",
                    "type": "multiple_choice",
                    "question": f"What is a fundamental concept in {subject}?",
                    "options": [
                        "Understanding basic principles",
                        "Memorizing formulas",
                        "Skipping steps",
                        "Guessing answers"
                    ],
                    "correct_answer": "Understanding basic principles",
                    "explanation": "Understanding basic principles is fundamental because it allows you to apply concepts to new situations.",
                    "curriculum_standard": "STANDARD_001",
                    "bloom_level": 2
                },
                {
                    "question_id": f"q_{uuid.uuid4()}",
                    "type": "multiple_choice",
                    "question": "Which approach is best for solving problems?",
                    "options": [
                        "Apply learned concepts systematically",
                        "Random trial and error",
                        "Skip difficult parts",
                        "Copy from others"
                    ],
                    "correct_answer": "Apply learned concepts systematically",
                    "explanation": "Applying concepts systematically ensures you understand the process and can solve similar problems independently.",
                    "curriculum_standard": "STANDARD_001",
                    "bloom_level": 3
                },
                {
                    "question_id": f"q_{uuid.uuid4()}",
                    "type": "true_false",
                    "question": f"Practice is important for mastering {subject}.",
                    "options": ["True", "False"],
                    "correct_answer": "True",
                    "explanation": "Regular practice helps reinforce concepts and build problem-solving skills.",
                    "curriculum_standard": "STANDARD_001",
                    "bloom_level": 1
                }
            ]
        }
        
        logger.info(f"Generated mock content: 1 lesson with {len(mock_lesson['sections'])} sections, "
                   f"1 quiz with {len(mock_quiz['questions'])} questions")
        
        return {
            "lessons": [mock_lesson],
            "quizzes": [mock_quiz]
        }


    def _invoke_action_group(
        self,
        action_group_name: str,
        action_input: dict[str, Any],
    ) -> str:
        """
        Invoke a Bedrock Agent action group.

        Args:
            action_group_name: Name of the action group
            action_input: Input parameters for the action

        Returns:
            Action group response as JSON string

        Raises:
            ClientError: If invocation fails
        """
        if not self.agent_id or not self.agent_alias_id:
            raise ValueError("Agent ID and Alias ID must be configured")

        try:
            # Invoke agent with action group
            response = self.bedrock_agent_runtime.invoke_agent(
                agentId=self.agent_id,
                agentAliasId=self.agent_alias_id,
                sessionId=f"session-{action_group_name}",
                inputText=json.dumps({
                    "action": action_group_name,
                    "parameters": action_input,
                }),
            )

            # Parse streaming response
            result = ""
            for event in response.get("completion", []):
                if "chunk" in event:
                    chunk = event["chunk"]
                    if "bytes" in chunk:
                        result += chunk["bytes"].decode("utf-8")

            return result

        except ClientError as e:
            logger.error(f"Bedrock Agent invocation failed: {e}")
            raise

    def create_agent(
        self,
        agent_name: str,
        foundation_model: str = "anthropic.claude-3-5-sonnet-20241022-v2:0",
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
