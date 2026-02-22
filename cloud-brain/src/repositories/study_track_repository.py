"""Repository for study track assignments in DynamoDB."""

import json
import logging
from datetime import datetime
from typing import List, Optional

import boto3
from botocore.exceptions import ClientError

from src.models.study_track import StudyTrackAssignment, StudyTrackCustomization

logger = logging.getLogger(__name__)


class StudyTrackRepository:
    """Repository for managing study track assignments in DynamoDB."""

    def __init__(self, table_name: str = "sikshya-sathi-study-tracks-dev"):
        """Initialize the repository.
        
        Args:
            table_name: DynamoDB table name for study track assignments
        """
        self.table_name = table_name
        try:
            dynamodb = boto3.resource("dynamodb")
            self.table = dynamodb.Table(table_name)
        except Exception as e:
            logger.error(f"Failed to initialize DynamoDB table: {e}")
            self.table = None

    def save_assignment(self, assignment: StudyTrackAssignment) -> bool:
        """Save a study track assignment.
        
        Args:
            assignment: Study track assignment to save
            
        Returns:
            True if successful, False otherwise
        """
        if not self.table:
            logger.error("DynamoDB table not initialized")
            return False

        try:
            item = {
                "assignmentId": assignment.assignment_id,
                "educatorId": assignment.educator_id,
                "studentId": assignment.student_id,
                "subject": assignment.subject,
                "topics": json.dumps(assignment.topics),
                "customTrack": json.dumps(assignment.custom_track) if assignment.custom_track else None,
                "priority": assignment.priority,
                "dueDate": assignment.due_date.isoformat() if assignment.due_date else None,
                "notes": assignment.notes,
                "createdAt": assignment.created_at.isoformat(),
                "status": assignment.status,
            }
            
            self.table.put_item(Item=item)
            logger.info(f"Successfully saved assignment {assignment.assignment_id}")
            return True
            
        except ClientError as e:
            logger.error(f"DynamoDB error saving assignment: {e}")
            return False
        except Exception as e:
            logger.error(f"Error saving assignment: {e}")
            return False

    def get_assignment(self, assignment_id: str) -> Optional[StudyTrackAssignment]:
        """Retrieve a study track assignment.
        
        Args:
            assignment_id: Assignment identifier
            
        Returns:
            StudyTrackAssignment if found, None otherwise
        """
        if not self.table:
            logger.error("DynamoDB table not initialized")
            return None

        try:
            response = self.table.get_item(Key={"assignmentId": assignment_id})
            
            if "Item" not in response:
                logger.info(f"No assignment found with ID {assignment_id}")
                return None
            
            item = response["Item"]
            
            return StudyTrackAssignment(
                assignment_id=item["assignmentId"],
                educator_id=item["educatorId"],
                student_id=item["studentId"],
                subject=item["subject"],
                topics=json.loads(item["topics"]) if isinstance(item["topics"], str) else item["topics"],
                custom_track=json.loads(item["customTrack"]) if item.get("customTrack") else None,
                priority=item.get("priority", "normal"),
                due_date=datetime.fromisoformat(item["dueDate"]) if item.get("dueDate") else None,
                notes=item.get("notes"),
                created_at=datetime.fromisoformat(item["createdAt"]),
                status=item.get("status", "pending"),
            )
            
        except ClientError as e:
            logger.error(f"DynamoDB error retrieving assignment: {e}")
            return None
        except Exception as e:
            logger.error(f"Error parsing assignment: {e}")
            return None

    def get_pending_assignments(self, student_id: str) -> List[StudyTrackAssignment]:
        """Get all pending assignments for a student.
        
        Args:
            student_id: Student identifier
            
        Returns:
            List of pending assignments
        """
        if not self.table:
            logger.error("DynamoDB table not initialized")
            return []

        try:
            # Query using GSI on studentId
            response = self.table.query(
                IndexName="StudentIdIndex",
                KeyConditionExpression="studentId = :sid",
                FilterExpression="status = :status",
                ExpressionAttributeValues={
                    ":sid": student_id,
                    ":status": "pending",
                },
            )
            
            assignments = []
            for item in response.get("Items", []):
                assignment = StudyTrackAssignment(
                    assignment_id=item["assignmentId"],
                    educator_id=item["educatorId"],
                    student_id=item["studentId"],
                    subject=item["subject"],
                    topics=json.loads(item["topics"]) if isinstance(item["topics"], str) else item["topics"],
                    custom_track=json.loads(item["customTrack"]) if item.get("customTrack") else None,
                    priority=item.get("priority", "normal"),
                    due_date=datetime.fromisoformat(item["dueDate"]) if item.get("dueDate") else None,
                    notes=item.get("notes"),
                    created_at=datetime.fromisoformat(item["createdAt"]),
                    status=item.get("status", "pending"),
                )
                assignments.append(assignment)
            
            return assignments
            
        except ClientError as e:
            logger.error(f"DynamoDB error querying assignments: {e}")
            return []
        except Exception as e:
            logger.error(f"Error querying assignments: {e}")
            return []

    def update_assignment_status(self, assignment_id: str, status: str) -> bool:
        """Update the status of an assignment.
        
        Args:
            assignment_id: Assignment identifier
            status: New status
            
        Returns:
            True if successful, False otherwise
        """
        if not self.table:
            logger.error("DynamoDB table not initialized")
            return False

        try:
            self.table.update_item(
                Key={"assignmentId": assignment_id},
                UpdateExpression="SET #status = :status",
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={":status": status},
            )
            logger.info(f"Updated assignment {assignment_id} status to {status}")
            return True
            
        except ClientError as e:
            logger.error(f"DynamoDB error updating assignment status: {e}")
            return False
        except Exception as e:
            logger.error(f"Error updating assignment status: {e}")
            return False

    def save_customization(self, customization: StudyTrackCustomization) -> bool:
        """Save a study track customization.
        
        Args:
            customization: Study track customization to save
            
        Returns:
            True if successful, False otherwise
        """
        if not self.table:
            logger.error("DynamoDB table not initialized")
            return False

        try:
            item = {
                "trackId": customization.track_id,
                "studentId": customization.student_id,
                "subject": customization.subject,
                "topics": json.dumps(customization.topics),
                "difficultyOverride": customization.difficulty_override,
                "pacingMultiplier": str(customization.pacing_multiplier),
                "focusAreas": json.dumps(customization.focus_areas),
                "skipTopics": json.dumps(customization.skip_topics),
                "createdBy": customization.created_by,
                "createdAt": customization.created_at.isoformat(),
                "appliedToBundle": customization.applied_to_bundle,
            }
            
            # Use a different table or partition for customizations
            # For simplicity, using same table with different key prefix
            item["assignmentId"] = f"CUSTOM#{customization.track_id}"
            
            self.table.put_item(Item=item)
            logger.info(f"Successfully saved customization {customization.track_id}")
            return True
            
        except ClientError as e:
            logger.error(f"DynamoDB error saving customization: {e}")
            return False
        except Exception as e:
            logger.error(f"Error saving customization: {e}")
            return False

    def get_customization(self, student_id: str, subject: str) -> Optional[StudyTrackCustomization]:
        """Get active study track customization for a student and subject.
        
        Args:
            student_id: Student identifier
            subject: Subject area
            
        Returns:
            StudyTrackCustomization if found, None otherwise
        """
        if not self.table:
            logger.error("DynamoDB table not initialized")
            return None

        try:
            # Query for customizations
            response = self.table.query(
                IndexName="StudentIdIndex",
                KeyConditionExpression="studentId = :sid",
                FilterExpression="subject = :subject AND begins_with(assignmentId, :prefix)",
                ExpressionAttributeValues={
                    ":sid": student_id,
                    ":subject": subject,
                    ":prefix": "CUSTOM#",
                },
            )
            
            items = response.get("Items", [])
            if not items:
                return None
            
            # Return the most recent customization
            item = sorted(items, key=lambda x: x.get("createdAt", ""), reverse=True)[0]
            
            return StudyTrackCustomization(
                track_id=item["trackId"],
                student_id=item["studentId"],
                subject=item["subject"],
                topics=json.loads(item["topics"]) if isinstance(item["topics"], str) else item["topics"],
                difficulty_override=item.get("difficultyOverride"),
                pacing_multiplier=float(item.get("pacingMultiplier", 1.0)),
                focus_areas=json.loads(item["focusAreas"]) if item.get("focusAreas") else [],
                skip_topics=json.loads(item["skipTopics"]) if item.get("skipTopics") else [],
                created_by=item["createdBy"],
                created_at=datetime.fromisoformat(item["createdAt"]),
                applied_to_bundle=item.get("appliedToBundle", False),
            )
            
        except ClientError as e:
            logger.error(f"DynamoDB error retrieving customization: {e}")
            return None
        except Exception as e:
            logger.error(f"Error parsing customization: {e}")
            return None
