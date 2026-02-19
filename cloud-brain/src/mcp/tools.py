"""MCP tools for curriculum access - Bedrock Agent integration."""

import logging
from typing import Any

from .server import MCPServer

logger = logging.getLogger(__name__)

# Global MCP server instance
_mcp_server: MCPServer | None = None


def get_mcp_server() -> MCPServer:
    """Get or create the global MCP server instance.

    Returns:
        MCPServer instance
    """
    global _mcp_server
    if _mcp_server is None:
        _mcp_server = MCPServer()
    return _mcp_server


def get_curriculum_standards_tool(grade: int, subject: str) -> dict[str, Any]:
    """MCP Tool: Get curriculum standards for a specific grade and subject.

    This tool retrieves all curriculum standards for a given grade level and subject
    from the Nepal K-12 curriculum database.

    Args:
        grade: Grade level (6-8 for MVP)
        subject: Subject name (Mathematics, Science, Nepali, English, Social Studies)

    Returns:
        Dictionary containing list of curriculum standards with their details

    Example:
        >>> get_curriculum_standards_tool(6, "Mathematics")
        {
            "success": True,
            "standards": [
                {
                    "id": "MATH-6-001",
                    "topic": "Whole Numbers and Operations",
                    "learning_objectives": [...],
                    ...
                }
            ],
            "count": 3
        }
    """
    try:
        server = get_mcp_server()
        standards = server.get_curriculum_standards(grade, subject)

        return {
            "success": True,
            "standards": [s.model_dump() for s in standards],
            "count": len(standards),
            "grade": grade,
            "subject": subject,
        }
    except Exception as e:
        logger.error(f"Error in get_curriculum_standards_tool: {e}")
        return {
            "success": False,
            "error": str(e),
            "standards": [],
            "count": 0,
        }


def get_topic_details_tool(topic_id: str) -> dict[str, Any]:
    """MCP Tool: Get detailed information about a specific curriculum topic.

    This tool retrieves comprehensive details about a curriculum topic including
    prerequisites, learning objectives, assessment criteria, and estimated hours.

    Args:
        topic_id: Unique topic identifier (e.g., "MATH-6-001")

    Returns:
        Dictionary containing detailed topic information

    Example:
        >>> get_topic_details_tool("MATH-6-001")
        {
            "success": True,
            "topic": {
                "topic_id": "MATH-6-001",
                "topic_name": "Whole Numbers and Operations",
                "prerequisites": [],
                "learning_objectives": [...],
                ...
            }
        }
    """
    try:
        server = get_mcp_server()
        topic_details = server.get_topic_details(topic_id)

        if topic_details is None:
            return {
                "success": False,
                "error": f"Topic not found: {topic_id}",
                "topic": None,
            }

        return {
            "success": True,
            "topic": topic_details.model_dump(),
        }
    except Exception as e:
        logger.error(f"Error in get_topic_details_tool: {e}")
        return {
            "success": False,
            "error": str(e),
            "topic": None,
        }


def validate_content_alignment_tool(
    content: str, target_standards: list[str]
) -> dict[str, Any]:
    """MCP Tool: Validate content alignment with curriculum standards.

    This tool checks if generated content aligns with specified Nepal K-12 curriculum
    standards by analyzing keywords, learning objectives, and topic coverage.

    Args:
        content: Generated educational content to validate
        target_standards: List of target standard IDs to validate against

    Returns:
        Dictionary containing alignment validation results

    Example:
        >>> validate_content_alignment_tool(
        ...     "This lesson covers addition and subtraction...",
        ...     ["MATH-6-001"]
        ... )
        {
            "success": True,
            "alignment": {
                "aligned": True,
                "alignment_score": 0.85,
                "matched_standards": ["MATH-6-001"],
                "gaps": [],
                "recommendations": []
            }
        }
    """
    try:
        server = get_mcp_server()
        alignment = server.validate_content_alignment(content, target_standards)

        return {
            "success": True,
            "alignment": alignment.model_dump(),
        }
    except Exception as e:
        logger.error(f"Error in validate_content_alignment_tool: {e}")
        return {
            "success": False,
            "error": str(e),
            "alignment": None,
        }


def get_learning_progression_tool(
    subject: str, grade_start: int, grade_end: int
) -> dict[str, Any]:
    """MCP Tool: Get learning progression for a subject across grade range.

    This tool retrieves the recommended learning progression showing topic sequence,
    dependencies, and difficulty progression for a subject across multiple grades.

    Args:
        subject: Subject name (Mathematics, Science, Nepali, English, Social Studies)
        grade_start: Starting grade level
        grade_end: Ending grade level

    Returns:
        Dictionary containing learning progression information

    Example:
        >>> get_learning_progression_tool("Mathematics", 6, 8)
        {
            "success": True,
            "progression": {
                "subject": "Mathematics",
                "grade_range": [6, 8],
                "topic_sequence": ["MATH-6-001", "MATH-6-002", ...],
                "dependencies": {...},
                "estimated_total_hours": 54.0
            }
        }
    """
    try:
        server = get_mcp_server()
        progression = server.get_learning_progression(subject, grade_start, grade_end)

        if progression is None:
            return {
                "success": False,
                "error": f"No progression found for {subject}, grades {grade_start}-{grade_end}",
                "progression": None,
            }

        return {
            "success": True,
            "progression": progression.model_dump(),
        }
    except Exception as e:
        logger.error(f"Error in get_learning_progression_tool: {e}")
        return {
            "success": False,
            "error": str(e),
            "progression": None,
        }


# Tool registry for Bedrock Agent integration
MCP_TOOLS = {
    "get_curriculum_standards": {
        "function": get_curriculum_standards_tool,
        "description": "Get curriculum standards for a specific grade and subject from Nepal K-12 curriculum",
        "parameters": {
            "grade": {
                "type": "integer",
                "description": "Grade level (6-8 for MVP)",
                "required": True,
            },
            "subject": {
                "type": "string",
                "description": "Subject name (Mathematics, Science, Nepali, English, Social Studies)",
                "required": True,
            },
        },
    },
    "get_topic_details": {
        "function": get_topic_details_tool,
        "description": "Get detailed information about a specific curriculum topic",
        "parameters": {
            "topic_id": {
                "type": "string",
                "description": "Unique topic identifier (e.g., MATH-6-001)",
                "required": True,
            },
        },
    },
    "validate_content_alignment": {
        "function": validate_content_alignment_tool,
        "description": "Validate content alignment with Nepal K-12 curriculum standards",
        "parameters": {
            "content": {
                "type": "string",
                "description": "Generated educational content to validate",
                "required": True,
            },
            "target_standards": {
                "type": "array",
                "description": "List of target standard IDs to validate against",
                "required": True,
            },
        },
    },
    "get_learning_progression": {
        "function": get_learning_progression_tool,
        "description": "Get learning progression for a subject across grade range",
        "parameters": {
            "subject": {
                "type": "string",
                "description": "Subject name (Mathematics, Science, Nepali, English, Social Studies)",
                "required": True,
            },
            "grade_start": {
                "type": "integer",
                "description": "Starting grade level",
                "required": True,
            },
            "grade_end": {
                "type": "integer",
                "description": "Ending grade level",
                "required": True,
            },
        },
    },
}


def invoke_mcp_tool(tool_name: str, **kwargs: Any) -> dict[str, Any]:
    """Invoke an MCP tool by name with arguments.

    Args:
        tool_name: Name of the tool to invoke
        **kwargs: Tool arguments

    Returns:
        Tool execution result

    Raises:
        ValueError: If tool name is invalid
    """
    if tool_name not in MCP_TOOLS:
        raise ValueError(f"Unknown MCP tool: {tool_name}")

    tool_config = MCP_TOOLS[tool_name]
    tool_function = tool_config["function"]

    return tool_function(**kwargs)
