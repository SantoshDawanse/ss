"""Curriculum context service for injecting Nepal K-12 curriculum data into Bedrock Agent."""

import json
import logging
from typing import Any, Optional

from src.mcp.tools import get_mcp_server
from src.models.curriculum import CurriculumStandard, Subject

logger = logging.getLogger(__name__)


class CurriculumContextService:
    """Service for enriching Bedrock Agent prompts with curriculum context."""

    def __init__(self):
        """Initialize the service."""
        self.mcp_server = get_mcp_server()

    def get_curriculum_context_for_lesson(
        self,
        subject: str,
        grade: int,
        topic: str,
        target_standards: list[str],
    ) -> dict[str, Any]:
        """
        Get curriculum context for lesson generation.

        Args:
            subject: Subject area
            grade: Grade level
            topic: Topic name
            target_standards: Target curriculum standard IDs

        Returns:
            Dict with curriculum context
        """
        logger.info(f"Getting curriculum context for lesson: {subject}, grade {grade}, topic {topic}")

        try:
            # Get curriculum standards for the subject and grade
            standards = self.mcp_server.get_curriculum_standards(
                grade=grade,
                subject=Subject(subject),
            )

            # Filter to target standards
            relevant_standards = [
                s for s in standards
                if s.id in target_standards
            ]

            # Get topic details if available
            topic_details = None
            for standard in relevant_standards:
                if topic.lower() in standard.topic.lower():
                    try:
                        topic_details = self.mcp_server.get_topic_details(standard.id)
                        break
                    except Exception as e:
                        logger.warning(f"Failed to get topic details for {standard.id}: {e}")

            # Get learning progression
            try:
                progression = self.mcp_server.get_learning_progression(
                    subject=Subject(subject),
                    grade_start=max(6, grade - 1),
                    grade_end=min(8, grade + 1),
                )
            except Exception as e:
                logger.warning(f"Failed to get learning progression: {e}")
                progression = None

            # Build context
            context = {
                "curriculum_standards": [
                    {
                        "id": s.id,
                        "topic": s.topic,
                        "learning_objectives": s.learning_objectives,
                        "bloom_level": s.bloom_level,
                        "estimated_hours": s.estimated_hours,
                    }
                    for s in relevant_standards
                ],
                "topic_details": None,
                "learning_progression": None,
            }

            if topic_details:
                context["topic_details"] = {
                    "prerequisites": topic_details.prerequisites,
                    "learning_objectives": topic_details.learning_objectives,
                    "assessment_criteria": topic_details.assessment_criteria,
                    "subtopics": topic_details.subtopics,
                    "bloom_level": topic_details.bloom_level,
                }

            if progression:
                context["learning_progression"] = {
                    "dependencies": progression.dependencies,
                }

            return context

        except Exception as e:
            logger.error(f"Failed to get curriculum context: {e}")
            return {
                "curriculum_standards": [],
                "topic_details": None,
                "learning_progression": None,
                "error": str(e),
            }

    def get_curriculum_context_for_quiz(
        self,
        subject: str,
        grade: int,
        topic: str,
        learning_objectives: list[str],
    ) -> dict[str, Any]:
        """
        Get curriculum context for quiz generation.

        Args:
            subject: Subject area
            grade: Grade level
            topic: Topic name
            learning_objectives: Target learning objectives

        Returns:
            Dict with curriculum context
        """
        logger.info(f"Getting curriculum context for quiz: {subject}, grade {grade}, topic {topic}")

        try:
            # Get curriculum standards
            standards = self.mcp_server.get_curriculum_standards(
                grade=grade,
                subject=Subject(subject),
            )

            # Filter to relevant standards
            relevant_standards = [
                s for s in standards
                if any(obj in s.learning_objectives for obj in learning_objectives)
                or topic.lower() in s.topic.lower()
            ]

            # Build context
            context = {
                "curriculum_standards": [
                    {
                        "id": s.id,
                        "topic": s.topic,
                        "learning_objectives": s.learning_objectives,
                        "bloom_level": s.bloom_level,
                    }
                    for s in relevant_standards
                ],
                "assessment_guidance": self._get_assessment_guidance(
                    subject, grade, relevant_standards
                ),
            }

            return context

        except Exception as e:
            logger.error(f"Failed to get curriculum context for quiz: {e}")
            return {
                "curriculum_standards": [],
                "assessment_guidance": {},
                "error": str(e),
            }

    def inject_curriculum_context_into_prompt(
        self,
        base_prompt: str,
        curriculum_context: dict[str, Any],
    ) -> str:
        """
        Inject curriculum context into Bedrock Agent prompt.

        Args:
            base_prompt: Base prompt text
            curriculum_context: Curriculum context dict

        Returns:
            Enhanced prompt with curriculum context
        """
        context_text = "\n\n## Curriculum Context\n\n"

        # Add curriculum standards
        if curriculum_context.get("curriculum_standards"):
            context_text += "### Curriculum Standards\n\n"
            for standard in curriculum_context["curriculum_standards"]:
                context_text += f"**{standard['id']}**: {standard['topic']}\n"
                context_text += f"- Bloom Level: {standard['bloom_level']}\n"
                context_text += "- Learning Objectives:\n"
                for obj in standard.get("learning_objectives", []):
                    context_text += f"  - {obj}\n"
                context_text += "\n"

        # Add topic details
        if curriculum_context.get("topic_details"):
            details = curriculum_context["topic_details"]
            context_text += "### Topic Details\n\n"

            if details.get("prerequisites"):
                context_text += "**Prerequisites**: " + ", ".join(details["prerequisites"]) + "\n\n"

            if details.get("key_concepts"):
                context_text += "**Key Concepts**:\n"
                for concept in details["key_concepts"]:
                    context_text += f"- {concept}\n"
                context_text += "\n"

            if details.get("common_misconceptions"):
                context_text += "**Common Misconceptions**:\n"
                for misconception in details["common_misconceptions"]:
                    context_text += f"- {misconception}\n"
                context_text += "\n"

        # Add learning progression
        if curriculum_context.get("learning_progression"):
            progression = curriculum_context["learning_progression"]
            context_text += "### Learning Progression\n\n"
            context_text += "This topic has the following dependencies:\n"
            for topic_id, deps in progression.get("dependencies", {}).items():
                if deps:
                    context_text += f"- {topic_id} requires: {', '.join(deps)}\n"
            context_text += "\n"

        # Add assessment guidance
        if curriculum_context.get("assessment_guidance"):
            guidance = curriculum_context["assessment_guidance"]
            context_text += "### Assessment Guidance\n\n"
            for key, value in guidance.items():
                context_text += f"**{key}**: {value}\n"
            context_text += "\n"

        # Combine base prompt with context
        enhanced_prompt = f"{base_prompt}\n{context_text}"

        return enhanced_prompt

    def validate_content_alignment(
        self,
        content: str,
        target_standards: list[str],
    ) -> dict[str, Any]:
        """
        Validate content alignment with curriculum standards.

        Args:
            content: Content to validate
            target_standards: Target curriculum standard IDs

        Returns:
            Dict with alignment validation results
        """
        logger.info(f"Validating content alignment with standards: {target_standards}")

        try:
            alignment = self.mcp_server.validate_content_alignment(
                content=content,
                target_standards=target_standards,
            )

            return {
                "aligned": alignment.aligned,
                "alignment_score": alignment.alignment_score,
                "gaps": alignment.gaps,
                "recommendations": alignment.recommendations,
            }

        except Exception as e:
            logger.error(f"Failed to validate content alignment: {e}")
            return {
                "aligned": False,
                "alignment_score": 0.0,
                "gaps": [],
                "recommendations": [],
                "error": str(e),
            }

    def _get_assessment_guidance(
        self,
        subject: str,
        grade: int,
        standards: list[CurriculumStandard],
    ) -> dict[str, str]:
        """
        Get assessment guidance for quiz generation.

        Args:
            subject: Subject area
            grade: Grade level
            standards: Curriculum standards

        Returns:
            Dict with assessment guidance
        """
        guidance = {}

        # Bloom's taxonomy distribution
        bloom_levels = [s.bloom_level for s in standards]
        if bloom_levels:
            guidance["bloom_distribution"] = (
                "Include questions at multiple cognitive levels: "
                f"{', '.join(set(bloom_levels))}"
            )

        # Question types by subject
        if subject == Subject.MATHEMATICS.value:
            guidance["question_types"] = (
                "Use multiple choice for concepts, short answer for calculations"
            )
        elif subject == Subject.SCIENCE.value:
            guidance["question_types"] = (
                "Mix conceptual questions with application problems"
            )
        else:
            guidance["question_types"] = (
                "Use varied question types to assess different skills"
            )

        # Difficulty progression
        guidance["difficulty"] = (
            "Start with easier questions to build confidence, "
            "then progress to more challenging ones"
        )

        return guidance
