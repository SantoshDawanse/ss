"""Repository for content review items in DynamoDB."""

import json
import logging
from datetime import datetime
from typing import List, Optional

import boto3
from botocore.exceptions import ClientError

from src.models.content_review import ContentReviewItem

logger = logging.getLogger(__name__)


class ContentReviewRepository:
    """Repository for managing content review items in DynamoDB."""

    def __init__(self, table_name: str = "sikshya-sathi-content-reviews-dev"):
        """Initialize the repository.
        
        Args:
            table_name: DynamoDB table name for content reviews
        """
        self.table_name = table_name
        try:
            dynamodb = boto3.resource("dynamodb")
            self.table = dynamodb.Table(table_name)
        except Exception as e:
            logger.error(f"Failed to initialize DynamoDB table: {e}")
            self.table = None

    def save_review_item(self, review_item: ContentReviewItem) -> bool:
        """Save a content review item.
        
        Args:
            review_item: Content review item to save
            
        Returns:
            True if successful, False otherwise
        """
        if not self.table:
            logger.error("DynamoDB table not initialized")
            return False

        try:
            item = {
                "reviewId": review_item.review_id,
                "contentId": review_item.content_id,
                "contentType": review_item.content_type,
                "subject": review_item.subject,
                "topic": review_item.topic,
                "grade": review_item.grade,
                "contentPreview": json.dumps(review_item.content_preview),
                "generatedAt": review_item.generated_at.isoformat(),
                "status": review_item.status,
                "reviewedBy": review_item.reviewed_by,
                "reviewedAt": review_item.reviewed_at.isoformat() if review_item.reviewed_at else None,
                "feedback": review_item.feedback,
                "rejectionReason": review_item.rejection_reason,
            }
            
            self.table.put_item(Item=item)
            logger.info(f"Successfully saved review item {review_item.review_id}")
            return True
            
        except ClientError as e:
            logger.error(f"DynamoDB error saving review item: {e}")
            return False
        except Exception as e:
            logger.error(f"Error saving review item: {e}")
            return False

    def get_review_item(self, review_id: str) -> Optional[ContentReviewItem]:
        """Retrieve a content review item.
        
        Args:
            review_id: Review item identifier
            
        Returns:
            ContentReviewItem if found, None otherwise
        """
        if not self.table:
            logger.error("DynamoDB table not initialized")
            return None

        try:
            response = self.table.get_item(Key={"reviewId": review_id})
            
            if "Item" not in response:
                logger.info(f"No review item found with ID {review_id}")
                return None
            
            item = response["Item"]
            
            return ContentReviewItem(
                review_id=item["reviewId"],
                content_id=item["contentId"],
                content_type=item["contentType"],
                subject=item["subject"],
                topic=item["topic"],
                grade=int(item["grade"]),
                content_preview=json.loads(item["contentPreview"]) if isinstance(item["contentPreview"], str) else item["contentPreview"],
                generated_at=datetime.fromisoformat(item["generatedAt"]),
                status=item.get("status", "pending"),
                reviewed_by=item.get("reviewedBy"),
                reviewed_at=datetime.fromisoformat(item["reviewedAt"]) if item.get("reviewedAt") else None,
                feedback=item.get("feedback"),
                rejection_reason=item.get("rejectionReason"),
            )
            
        except ClientError as e:
            logger.error(f"DynamoDB error retrieving review item: {e}")
            return None
        except Exception as e:
            logger.error(f"Error parsing review item: {e}")
            return None

    def get_pending_reviews(
        self, subject: Optional[str] = None, grade: Optional[int] = None, limit: int = 50
    ) -> List[ContentReviewItem]:
        """Get pending content review items.
        
        Args:
            subject: Optional subject filter
            grade: Optional grade filter
            limit: Maximum number of items to return
            
        Returns:
            List of pending review items
        """
        if not self.table:
            logger.error("DynamoDB table not initialized")
            return []

        try:
            # Build filter expression
            filter_expression = "status = :status"
            expression_values = {":status": "pending"}
            
            if subject:
                filter_expression += " AND subject = :subject"
                expression_values[":subject"] = subject
            
            if grade:
                filter_expression += " AND grade = :grade"
                expression_values[":grade"] = grade
            
            # Scan with filter (in production, use GSI for better performance)
            response = self.table.scan(
                FilterExpression=filter_expression,
                ExpressionAttributeValues=expression_values,
                Limit=limit,
            )
            
            review_items = []
            for item in response.get("Items", []):
                review_item = ContentReviewItem(
                    review_id=item["reviewId"],
                    content_id=item["contentId"],
                    content_type=item["contentType"],
                    subject=item["subject"],
                    topic=item["topic"],
                    grade=int(item["grade"]),
                    content_preview=json.loads(item["contentPreview"]) if isinstance(item["contentPreview"], str) else item["contentPreview"],
                    generated_at=datetime.fromisoformat(item["generatedAt"]),
                    status=item.get("status", "pending"),
                    reviewed_by=item.get("reviewedBy"),
                    reviewed_at=datetime.fromisoformat(item["reviewedAt"]) if item.get("reviewedAt") else None,
                    feedback=item.get("feedback"),
                    rejection_reason=item.get("rejectionReason"),
                )
                review_items.append(review_item)
            
            return review_items
            
        except ClientError as e:
            logger.error(f"DynamoDB error querying review items: {e}")
            return []
        except Exception as e:
            logger.error(f"Error querying review items: {e}")
            return []

    def update_review_status(
        self,
        review_id: str,
        status: str,
        educator_id: str,
        feedback: Optional[str] = None,
        rejection_reason: Optional[str] = None,
    ) -> bool:
        """Update the status of a review item.
        
        Args:
            review_id: Review item identifier
            status: New status (approved, rejected)
            educator_id: Educator who reviewed
            feedback: Optional feedback
            rejection_reason: Optional rejection reason
            
        Returns:
            True if successful, False otherwise
        """
        if not self.table:
            logger.error("DynamoDB table not initialized")
            return False

        try:
            update_expression = "SET #status = :status, reviewedBy = :educator, reviewedAt = :timestamp"
            expression_values = {
                ":status": status,
                ":educator": educator_id,
                ":timestamp": datetime.utcnow().isoformat(),
            }
            expression_names = {"#status": "status"}
            
            if feedback:
                update_expression += ", feedback = :feedback"
                expression_values[":feedback"] = feedback
            
            if rejection_reason:
                update_expression += ", rejectionReason = :reason"
                expression_values[":reason"] = rejection_reason
            
            self.table.update_item(
                Key={"reviewId": review_id},
                UpdateExpression=update_expression,
                ExpressionAttributeNames=expression_names,
                ExpressionAttributeValues=expression_values,
            )
            logger.info(f"Updated review item {review_id} status to {status}")
            return True
            
        except ClientError as e:
            logger.error(f"DynamoDB error updating review status: {e}")
            return False
        except Exception as e:
            logger.error(f"Error updating review status: {e}")
            return False
