"""Lambda handler for educator and administrator endpoints."""

import json
import logging
from typing import Any, Dict

from src.models.educator import DashboardData
from src.models.study_track import StudyTrackAssignment, StudyTrackCustomization
from src.models.content_review import ContentApproval, ContentReviewQueue
from src.repositories.knowledge_model_repository import KnowledgeModelRepository
from src.repositories.study_track_repository import StudyTrackRepository
from src.repositories.content_review_repository import ContentReviewRepository
from src.services.educator_dashboard import EducatorDashboardService
from src.services.study_track_assignment import StudyTrackAssignmentService
from src.services.content_review import ContentReviewService

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Handle educator API requests.
    
    Args:
        event: Lambda event containing API Gateway request
        context: Lambda context
        
    Returns:
        API Gateway response
    """
    try:
        # Parse request
        path = event.get("path", "")
        http_method = event.get("httpMethod", "")
        body = json.loads(event.get("body", "{}")) if event.get("body") else {}
        
        logger.info(f"Educator handler: {http_method} {path}")
        
        # Initialize services
        knowledge_repository = KnowledgeModelRepository()
        dashboard_service = EducatorDashboardService(knowledge_repository)
        
        study_track_repository = StudyTrackRepository()
        assignment_service = StudyTrackAssignmentService(study_track_repository)
        
        content_review_repository = ContentReviewRepository()
        review_service = ContentReviewService(content_review_repository)
        
        # Route to appropriate handler
        if path == "/educator/dashboard" and http_method == "GET":
            return handle_get_dashboard(event, dashboard_service)
        elif path == "/educator/student-progress" and http_method == "GET":
            return handle_get_student_progress(event, dashboard_service)
        elif path == "/educator/class-report" and http_method == "GET":
            return handle_get_class_report(event, dashboard_service)
        elif path == "/educator/curriculum-coverage" and http_method == "GET":
            return handle_get_curriculum_coverage(event, dashboard_service)
        elif path == "/educator/assign-topics" and http_method == "POST":
            return handle_assign_topics(event, assignment_service)
        elif path == "/educator/customize-track" and http_method == "POST":
            return handle_customize_track(event, assignment_service)
        elif path == "/educator/assignments" and http_method == "GET":
            return handle_get_assignments(event, assignment_service)
        elif path == "/educator/review-queue" and http_method == "GET":
            return handle_get_review_queue(event, review_service)
        elif path == "/educator/review-content" and http_method == "POST":
            return handle_review_content(event, review_service)
        else:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Endpoint not found"}),
                "headers": {"Content-Type": "application/json"},
            }
    
    except Exception as e:
        logger.error(f"Error in educator handler: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def handle_get_dashboard(
    event: Dict[str, Any], dashboard_service: EducatorDashboardService
) -> Dict[str, Any]:
    """Handle GET /educator/dashboard request.
    
    Args:
        event: Lambda event
        dashboard_service: Dashboard service instance
        
    Returns:
        API Gateway response with dashboard data
    """
    try:
        # Extract query parameters
        params = event.get("queryStringParameters", {}) or {}
        educator_id = params.get("educator_id")
        class_ids = params.get("class_ids", "").split(",") if params.get("class_ids") else []
        student_ids = params.get("student_ids", "").split(",") if params.get("student_ids") else []
        
        if not educator_id:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "educator_id is required"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        # Generate dashboard data
        dashboard_data = dashboard_service.get_dashboard_data(educator_id, class_ids, student_ids)
        
        return {
            "statusCode": 200,
            "body": dashboard_data.model_dump_json(),
            "headers": {"Content-Type": "application/json"},
        }
    
    except Exception as e:
        logger.error(f"Error getting dashboard: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def handle_get_student_progress(
    event: Dict[str, Any], dashboard_service: EducatorDashboardService
) -> Dict[str, Any]:
    """Handle GET /educator/student-progress request.
    
    Args:
        event: Lambda event
        dashboard_service: Dashboard service instance
        
    Returns:
        API Gateway response with student progress data
    """
    try:
        # Extract query parameters
        params = event.get("queryStringParameters", {}) or {}
        student_id = params.get("student_id")
        
        if not student_id:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "student_id is required"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        # Get student progress
        progress_list = dashboard_service.get_student_progress(student_id)
        
        return {
            "statusCode": 200,
            "body": json.dumps([p.model_dump() for p in progress_list], default=str),
            "headers": {"Content-Type": "application/json"},
        }
    
    except Exception as e:
        logger.error(f"Error getting student progress: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def handle_get_class_report(
    event: Dict[str, Any], dashboard_service: EducatorDashboardService
) -> Dict[str, Any]:
    """Handle GET /educator/class-report request.
    
    Args:
        event: Lambda event
        dashboard_service: Dashboard service instance
        
    Returns:
        API Gateway response with class performance report
    """
    try:
        # Extract query parameters
        params = event.get("queryStringParameters", {}) or {}
        class_id = params.get("class_id")
        class_name = params.get("class_name", f"Class {class_id}")
        student_ids = params.get("student_ids", "").split(",") if params.get("student_ids") else []
        subject = params.get("subject")
        
        if not class_id:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "class_id is required"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        # Generate class report
        report = dashboard_service.generate_class_performance_report(
            class_id, class_name, student_ids, subject
        )
        
        if not report:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "No data available for class"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        return {
            "statusCode": 200,
            "body": report.model_dump_json(),
            "headers": {"Content-Type": "application/json"},
        }
    
    except Exception as e:
        logger.error(f"Error generating class report: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def handle_get_curriculum_coverage(
    event: Dict[str, Any], dashboard_service: EducatorDashboardService
) -> Dict[str, Any]:
    """Handle GET /educator/curriculum-coverage request.
    
    Args:
        event: Lambda event
        dashboard_service: Dashboard service instance
        
    Returns:
        API Gateway response with curriculum coverage report
    """
    try:
        # Extract query parameters
        params = event.get("queryStringParameters", {}) or {}
        subject = params.get("subject")
        class_id = params.get("class_id")
        student_id = params.get("student_id")
        student_ids = params.get("student_ids", "").split(",") if params.get("student_ids") else []
        
        if not subject:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "subject is required"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        # Generate coverage report
        report = dashboard_service.generate_curriculum_coverage_report(
            subject=subject,
            student_ids=student_ids if class_id else None,
            class_id=class_id,
            student_id=student_id,
        )
        
        if not report:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "No data available"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        return {
            "statusCode": 200,
            "body": report.model_dump_json(),
            "headers": {"Content-Type": "application/json"},
        }
    
    except Exception as e:
        logger.error(f"Error generating curriculum coverage report: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }



def handle_assign_topics(
    event: Dict[str, Any], assignment_service: StudyTrackAssignmentService
) -> Dict[str, Any]:
    """Handle POST /educator/assign-topics request.
    
    Args:
        event: Lambda event
        assignment_service: Assignment service instance
        
    Returns:
        API Gateway response with created assignment
    """
    try:
        # Parse request body
        body = json.loads(event.get("body", "{}"))
        
        educator_id = body.get("educator_id")
        student_id = body.get("student_id")
        subject = body.get("subject")
        topics = body.get("topics", [])
        priority = body.get("priority", "normal")
        due_date = body.get("due_date")
        notes = body.get("notes")
        
        if not all([educator_id, student_id, subject, topics]):
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "educator_id, student_id, subject, and topics are required"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        # Parse due_date if provided
        due_date_obj = None
        if due_date:
            try:
                from datetime import datetime
                due_date_obj = datetime.fromisoformat(due_date)
            except ValueError:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "Invalid due_date format. Use ISO format."}),
                    "headers": {"Content-Type": "application/json"},
                }
        
        # Create assignment
        assignment = assignment_service.assign_topics(
            educator_id=educator_id,
            student_id=student_id,
            subject=subject,
            topics=topics,
            priority=priority,
            due_date=due_date_obj,
            notes=notes,
        )
        
        return {
            "statusCode": 201,
            "body": assignment.model_dump_json(),
            "headers": {"Content-Type": "application/json"},
        }
    
    except Exception as e:
        logger.error(f"Error assigning topics: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def handle_customize_track(
    event: Dict[str, Any], assignment_service: StudyTrackAssignmentService
) -> Dict[str, Any]:
    """Handle POST /educator/customize-track request.
    
    Args:
        event: Lambda event
        assignment_service: Assignment service instance
        
    Returns:
        API Gateway response with created customization
    """
    try:
        # Parse request body
        body = json.loads(event.get("body", "{}"))
        
        educator_id = body.get("educator_id")
        student_id = body.get("student_id")
        subject = body.get("subject")
        topics = body.get("topics", [])
        difficulty_override = body.get("difficulty_override")
        pacing_multiplier = body.get("pacing_multiplier", 1.0)
        focus_areas = body.get("focus_areas", [])
        skip_topics = body.get("skip_topics", [])
        
        if not all([educator_id, student_id, subject, topics]):
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "educator_id, student_id, subject, and topics are required"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        # Create customization
        customization = assignment_service.customize_study_track(
            educator_id=educator_id,
            student_id=student_id,
            subject=subject,
            topics=topics,
            difficulty_override=difficulty_override,
            pacing_multiplier=pacing_multiplier,
            focus_areas=focus_areas,
            skip_topics=skip_topics,
        )
        
        return {
            "statusCode": 201,
            "body": customization.model_dump_json(),
            "headers": {"Content-Type": "application/json"},
        }
    
    except Exception as e:
        logger.error(f"Error customizing track: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def handle_get_assignments(
    event: Dict[str, Any], assignment_service: StudyTrackAssignmentService
) -> Dict[str, Any]:
    """Handle GET /educator/assignments request.
    
    Args:
        event: Lambda event
        assignment_service: Assignment service instance
        
    Returns:
        API Gateway response with assignments
    """
    try:
        # Extract query parameters
        params = event.get("queryStringParameters", {}) or {}
        student_id = params.get("student_id")
        
        if not student_id:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "student_id is required"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        # Get pending assignments
        assignments = assignment_service.get_pending_assignments(student_id)
        
        return {
            "statusCode": 200,
            "body": json.dumps([a.model_dump() for a in assignments], default=str),
            "headers": {"Content-Type": "application/json"},
        }
    
    except Exception as e:
        logger.error(f"Error getting assignments: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }



def handle_get_review_queue(
    event: Dict[str, Any], review_service: ContentReviewService
) -> Dict[str, Any]:
    """Handle GET /educator/review-queue request.
    
    Args:
        event: Lambda event
        review_service: Content review service instance
        
    Returns:
        API Gateway response with review queue
    """
    try:
        # Extract query parameters
        params = event.get("queryStringParameters", {}) or {}
        educator_id = params.get("educator_id")
        subject = params.get("subject")
        grade = int(params.get("grade")) if params.get("grade") else None
        limit = int(params.get("limit", 50))
        
        if not educator_id:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "educator_id is required"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        # Get review queue
        queue = review_service.get_review_queue(educator_id, subject, grade, limit)
        
        return {
            "statusCode": 200,
            "body": queue.model_dump_json(),
            "headers": {"Content-Type": "application/json"},
        }
    
    except Exception as e:
        logger.error(f"Error getting review queue: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def handle_review_content(
    event: Dict[str, Any], review_service: ContentReviewService
) -> Dict[str, Any]:
    """Handle POST /educator/review-content request.
    
    Args:
        event: Lambda event
        review_service: Content review service instance
        
    Returns:
        API Gateway response with review result
    """
    try:
        # Parse request body
        body = json.loads(event.get("body", "{}"))
        
        review_id = body.get("review_id")
        educator_id = body.get("educator_id")
        approved = body.get("approved")
        feedback = body.get("feedback")
        rejection_reason = body.get("rejection_reason")
        
        if not all([review_id, educator_id]) or approved is None:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "review_id, educator_id, and approved are required"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        # Create approval object
        from src.models.content_review import ContentApproval
        approval = ContentApproval(
            review_id=review_id,
            educator_id=educator_id,
            approved=approved,
            feedback=feedback,
            rejection_reason=rejection_reason,
        )
        
        # Process approval
        success = review_service.process_approval(approval)
        
        if not success:
            return {
                "statusCode": 500,
                "body": json.dumps({"error": "Failed to process review"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        return {
            "statusCode": 200,
            "body": json.dumps({
                "success": True,
                "review_id": review_id,
                "status": "approved" if approved else "rejected",
            }),
            "headers": {"Content-Type": "application/json"},
        }
    
    except Exception as e:
        logger.error(f"Error reviewing content: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }
