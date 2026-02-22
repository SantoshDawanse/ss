"""Data anonymization service for privacy compliance."""

import hashlib
import logging
import re
from typing import Any, Dict, List, Optional

from src.models.personalization import PerformanceLog, KnowledgeModel

logger = logging.getLogger(__name__)


class DataAnonymizationService:
    """Service for anonymizing student data before analytics processing."""

    def __init__(self, salt: Optional[str] = None):
        """Initialize the anonymization service.
        
        Args:
            salt: Optional salt for hashing (should be stored securely)
        """
        self.salt = salt or "sikshya-sathi-default-salt"
        
    def anonymize_student_id(self, student_id: str) -> str:
        """Anonymize a student ID using one-way hashing.
        
        Args:
            student_id: Original student identifier
            
        Returns:
            Anonymized student identifier (SHA256 hash)
        """
        combined = f"{student_id}{self.salt}"
        return hashlib.sha256(combined.encode()).hexdigest()[:16]
    
    def remove_pii_from_text(self, text: str) -> str:
        """Remove personally identifiable information from text.
        
        Args:
            text: Text that may contain PII
            
        Returns:
            Text with PII removed/redacted
        """
        if not text:
            return text
            
        # Remove email addresses
        text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL]', text)
        
        # Remove phone numbers (various formats)
        text = re.sub(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', '[PHONE]', text)
        text = re.sub(r'\b\+?\d{1,3}[-.]?\d{3,4}[-.]?\d{4,}\b', '[PHONE]', text)
        
        # Remove potential names (capitalized words that might be names)
        # This is conservative - only removes obvious name patterns
        text = re.sub(r'\b[A-Z][a-z]+ [A-Z][a-z]+\b', '[NAME]', text)
        
        return text
    
    def anonymize_performance_log(self, log: PerformanceLog) -> Dict[str, Any]:
        """Anonymize a performance log for analytics.
        
        Args:
            log: Performance log to anonymize
            
        Returns:
            Anonymized log as dictionary
        """
        anonymized = {
            "anonymized_student_id": self.anonymize_student_id(log.student_id),
            "timestamp": log.timestamp.isoformat(),
            "event_type": log.event_type,
            "content_id": log.content_id,
            "subject": log.subject,
            "topic": log.topic,
            "data": {}
        }
        
        # Copy data but remove any potential PII
        for key, value in log.data.items():
            if isinstance(value, str):
                anonymized["data"][key] = self.remove_pii_from_text(value)
            else:
                anonymized["data"][key] = value
        
        return anonymized
    
    def anonymize_performance_logs(self, logs: List[PerformanceLog]) -> List[Dict[str, Any]]:
        """Anonymize multiple performance logs.
        
        Args:
            logs: List of performance logs
            
        Returns:
            List of anonymized logs
        """
        return [self.anonymize_performance_log(log) for log in logs]
    
    def anonymize_knowledge_model(self, model: KnowledgeModel) -> Dict[str, Any]:
        """Anonymize a knowledge model for analytics.
        
        Args:
            model: Knowledge model to anonymize
            
        Returns:
            Anonymized knowledge model as dictionary
        """
        anonymized = {
            "anonymized_student_id": self.anonymize_student_id(model.student_id),
            "last_updated": model.last_updated.isoformat(),
            "subjects": {}
        }
        
        # Copy subject data (no PII in knowledge models)
        for subject_name, subject_knowledge in model.subjects.items():
            anonymized["subjects"][subject_name] = {
                "overall_proficiency": subject_knowledge.overall_proficiency,
                "learning_velocity": subject_knowledge.learning_velocity,
                "topics": {}
            }
            
            for topic_id, topic_knowledge in subject_knowledge.topics.items():
                anonymized["subjects"][subject_name]["topics"][topic_id] = {
                    "proficiency": topic_knowledge.proficiency,
                    "attempts": topic_knowledge.attempts,
                    "last_practiced": topic_knowledge.last_practiced.isoformat() if topic_knowledge.last_practiced else None,
                    "mastery_level": topic_knowledge.mastery_level.value,
                    "cognitive_level": topic_knowledge.cognitive_level
                }
        
        return anonymized
    
    def sanitize_log_message(self, message: str) -> str:
        """Sanitize a log message by removing PII.
        
        Args:
            message: Log message that may contain PII
            
        Returns:
            Sanitized log message
        """
        return self.remove_pii_from_text(message)
