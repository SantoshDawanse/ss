"""MCP Server for Nepal K-12 curriculum integration."""

import json
import logging
from pathlib import Path
from typing import Any, Optional

from src.models.curriculum import (
    BloomLevel,
    ContentAlignment,
    CurriculumStandard,
    LearningProgression,
    Subject,
    TopicDetails,
)

logger = logging.getLogger(__name__)


class MCPServer:
    """Model Context Protocol Server for curriculum data."""

    def __init__(self, data_dir: Optional[Path] = None):
        """Initialize MCP Server with curriculum data.

        Args:
            data_dir: Directory containing curriculum data files.
                     Defaults to src/mcp/data/
        """
        if data_dir is None:
            data_dir = Path(__file__).parent / "data"
        self.data_dir = data_dir
        self.curriculum_data: dict[str, CurriculumStandard] = {}
        # Indexes for efficient retrieval (Requirement 1.3)
        self._grade_subject_index: dict[tuple[int, str], list[str]] = {}
        self._load_curriculum_data()

    def _load_curriculum_data(self) -> None:
        """Load curriculum data from JSON files.
        
        Handles missing/corrupted files gracefully by logging errors and
        initializing with empty data (Requirement 1.5).
        """
        curriculum_file = self.data_dir / "curriculum_standards.json"
        
        # Check if file exists
        if not curriculum_file.exists():
            logger.error(
                f"Curriculum data file not found: {curriculum_file}. "
                "MCP Server will return empty results."
            )
            return
        
        # Try to load and validate data
        try:
            with open(curriculum_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # Validate and load each standard
            validation_errors = 0
            for item in data:
                try:
                    standard = CurriculumStandard(**item)
                    self.curriculum_data[standard.id] = standard
                    
                    # Build grade-subject index (Requirement 1.3)
                    # subject is already a string value from the enum
                    subject_value = standard.subject if isinstance(standard.subject, str) else standard.subject.value
                    key = (standard.grade, subject_value)
                    if key not in self._grade_subject_index:
                        self._grade_subject_index[key] = []
                    self._grade_subject_index[key].append(standard.id)
                    
                except Exception as e:
                    validation_errors += 1
                    logger.warning(
                        f"Validation error for standard {item.get('id', 'unknown')}: {e}"
                    )
            
            # Log loading statistics (Requirement 1.2)
            logger.info(
                f"Loaded {len(self.curriculum_data)} curriculum standards "
                f"({validation_errors} validation errors)"
            )
            
        except json.JSONDecodeError as e:
            logger.error(
                f"Corrupted curriculum data file (invalid JSON): {curriculum_file}. "
                f"Error: {e}. MCP Server will return empty results."
            )
        except Exception as e:
            logger.error(
                f"Error loading curriculum data: {e}. "
                "MCP Server will return empty results."
            )

    def get_curriculum_standards(
        self, grade: int, subject: str
    ) -> list[CurriculumStandard]:
        """Get curriculum standards for a specific grade and subject.

        Args:
            grade: Grade level (6-8)
            subject: Subject name

        Returns:
            List of curriculum standards matching the criteria
        """
        try:
            subject_enum = Subject(subject)
            subject_value = subject_enum.value
        except ValueError:
            logger.warning(f"Invalid subject: {subject}")
            return []

        # Use index for efficient retrieval (Requirement 1.3)
        key = (grade, subject_value)
        standard_ids = self._grade_subject_index.get(key, [])
        standards = [self.curriculum_data[sid] for sid in standard_ids]

        logger.info(
            f"Found {len(standards)} standards for grade {grade}, subject {subject}"
        )
        return standards

    def get_topic_details(self, topic_id: str) -> Optional[TopicDetails]:
        """Get detailed information about a specific topic.

        Args:
            topic_id: Unique topic identifier

        Returns:
            TopicDetails if found, None otherwise
        """
        standard = self.curriculum_data.get(topic_id)
        if not standard:
            logger.warning(f"Topic not found: {topic_id}")
            return None

        # Convert CurriculumStandard to TopicDetails
        topic_details = TopicDetails(
            topic_id=standard.id,
            topic_name=standard.topic,
            grade=standard.grade,
            subject=standard.subject,
            prerequisites=standard.prerequisites,
            learning_objectives=standard.learning_objectives,
            assessment_criteria=[
                f"Demonstrate {obj}" for obj in standard.learning_objectives
            ],
            bloom_level=standard.bloom_level,
            estimated_hours=standard.estimated_hours,
            subtopics=[],  # Can be extended with subtopic data
            resources=[],  # Can be extended with resource links
        )

        logger.info(f"Retrieved details for topic: {topic_id}")
        return topic_details

    def validate_content_alignment(
        self, content: str, target_standards: list[str]
    ) -> ContentAlignment:
        """Validate content alignment with curriculum standards.

        Args:
            content: Generated content to validate
            target_standards: List of target standard IDs

        Returns:
            ContentAlignment validation result
        """
        matched_standards = []
        gaps = []

        # Check if target standards exist
        for standard_id in target_standards:
            standard = self.curriculum_data.get(standard_id)
            if not standard:
                gaps.append(f"Standard not found: {standard_id}")
                continue

            # Simple keyword matching for alignment
            keywords = standard.keywords
            content_lower = content.lower()
            matches = sum(1 for keyword in keywords if keyword.lower() in content_lower)

            if matches > 0:
                matched_standards.append(standard_id)
            else:
                gaps.append(
                    f"No keyword matches for standard: {standard_id} ({standard.topic})"
                )

        # Calculate alignment score
        if target_standards:
            alignment_score = len(matched_standards) / len(target_standards)
        else:
            alignment_score = 0.0

        aligned = alignment_score >= 0.7  # 70% threshold

        recommendations = []
        if not aligned:
            recommendations.append(
                "Increase coverage of curriculum keywords in content"
            )
            recommendations.append("Ensure all target learning objectives are addressed")

        result = ContentAlignment(
            aligned=aligned,
            alignment_score=alignment_score,
            matched_standards=matched_standards,
            gaps=gaps,
            recommendations=recommendations,
        )

        logger.info(
            f"Content alignment: {alignment_score:.2f}, aligned: {aligned}, "
            f"matched: {len(matched_standards)}/{len(target_standards)}"
        )
        return result

    def get_learning_progression(
        self, subject: str, grade_start: int, grade_end: int
    ) -> Optional[LearningProgression]:
        """Get learning progression for a subject across grade range.

        Args:
            subject: Subject name
            grade_start: Starting grade
            grade_end: Ending grade

        Returns:
            LearningProgression if found, None otherwise
        """
        try:
            subject_enum = Subject(subject)
        except ValueError:
            logger.warning(f"Invalid subject: {subject}")
            return None

        # Get all standards for subject in grade range
        standards = [
            standard
            for standard in self.curriculum_data.values()
            if standard.subject == subject_enum
            and grade_start <= standard.grade <= grade_end
        ]

        if not standards:
            logger.warning(
                f"No standards found for {subject}, grades {grade_start}-{grade_end}"
            )
            return None

        # Build topic sequence (ordered by grade, then by prerequisites)
        topic_sequence = []
        dependencies = {}
        difficulty_progression = []
        total_hours = 0.0

        # Sort by grade first
        standards_by_grade = sorted(standards, key=lambda s: s.grade)

        for standard in standards_by_grade:
            topic_sequence.append(standard.id)
            dependencies[standard.id] = standard.prerequisites
            total_hours += standard.estimated_hours

        # Sort by difficulty (Bloom's level)
        bloom_order = {
            BloomLevel.REMEMBER: 1,
            BloomLevel.UNDERSTAND: 2,
            BloomLevel.APPLY: 3,
            BloomLevel.ANALYZE: 4,
            BloomLevel.EVALUATE: 5,
            BloomLevel.CREATE: 6,
        }
        difficulty_sorted = sorted(
            standards, key=lambda s: bloom_order.get(s.bloom_level, 0)
        )
        difficulty_progression = [s.id for s in difficulty_sorted]

        progression = LearningProgression(
            subject=subject_enum,
            grade_range=(grade_start, grade_end),
            topic_sequence=topic_sequence,
            dependencies=dependencies,
            difficulty_progression=difficulty_progression,
            estimated_total_hours=total_hours,
        )

        logger.info(
            f"Generated learning progression for {subject}, "
            f"grades {grade_start}-{grade_end}: {len(topic_sequence)} topics"
        )
        return progression

    def handle_tool_call(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        """Handle MCP tool calls.

        Args:
            tool_name: Name of the tool to invoke
            arguments: Tool arguments

        Returns:
            Tool execution result

        Raises:
            ValueError: If tool name is invalid
        """
        if tool_name == "get_curriculum_standards":
            grade = arguments.get("grade")
            subject = arguments.get("subject")
            if grade is None or subject is None:
                raise ValueError("Missing required arguments: grade, subject")
            return [s.model_dump() for s in self.get_curriculum_standards(grade, subject)]

        elif tool_name == "get_topic_details":
            topic_id = arguments.get("topic_id")
            if topic_id is None:
                raise ValueError("Missing required argument: topic_id")
            details = self.get_topic_details(topic_id)
            return details.model_dump() if details else None

        elif tool_name == "validate_content_alignment":
            content = arguments.get("content")
            target_standards = arguments.get("target_standards")
            if content is None or target_standards is None:
                raise ValueError(
                    "Missing required arguments: content, target_standards"
                )
            return self.validate_content_alignment(content, target_standards).model_dump()

        elif tool_name == "get_learning_progression":
            subject = arguments.get("subject")
            grade_start = arguments.get("grade_start")
            grade_end = arguments.get("grade_end")
            if subject is None or grade_start is None or grade_end is None:
                raise ValueError(
                    "Missing required arguments: subject, grade_start, grade_end"
                )
            progression = self.get_learning_progression(subject, grade_start, grade_end)
            return progression.model_dump() if progression else None

        else:
            raise ValueError(f"Unknown tool: {tool_name}")


# Lambda handler for AWS Lambda integration
_mcp_server_instance = None


def lambda_handler(event: dict, context: Any) -> dict:
    """AWS Lambda handler for MCP Server tool calls.
    
    Args:
        event: Lambda event containing tool_name and arguments
        context: Lambda context
        
    Returns:
        Response dict with statusCode, body, and headers
    """
    global _mcp_server_instance
    
    # Initialize MCP Server on cold start
    if _mcp_server_instance is None:
        import os
        data_path = os.environ.get("CURRICULUM_DATA_PATH")
        if data_path:
            _mcp_server_instance = MCPServer(data_dir=Path(data_path))
        else:
            _mcp_server_instance = MCPServer()
        logger.info("MCP Server initialized for Lambda")
    
    try:
        # Extract tool call information from event
        tool_name = event.get("tool_name")
        arguments = event.get("arguments", {})
        
        if not tool_name:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing tool_name in request"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        # Handle tool call
        result = _mcp_server_instance.handle_tool_call(tool_name, arguments)
        
        return {
            "statusCode": 200,
            "body": json.dumps({"result": result}),
            "headers": {"Content-Type": "application/json"},
        }
        
    except ValueError as e:
        logger.error(f"Invalid request: {e}")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }
    except Exception as e:
        logger.error(f"Error handling tool call: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Internal server error"}),
            "headers": {"Content-Type": "application/json"},
        }
