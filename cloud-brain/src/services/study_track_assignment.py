"""Service for managing study track assignments and customizations."""

import logging
import uuid
from datetime import datetime
from typing import List, Optional

from src.models.study_track import (
    AssignmentPropagation,
    StudyTrackAssignment,
    StudyTrackCustomization,
)
from src.repositories.study_track_repository import StudyTrackRepository

logger = logging.getLogger(__name__)


class StudyTrackAssignmentService:
    """Service for managing educator study track assignments."""

    def __init__(self, repository: StudyTrackRepository):
        """Initialize the study track assignment service.
        
        Args:
            repository: Study track repository for persistence
        """
        self.repository = repository

    def assign_topics(
        self,
        educator_id: str,
        student_id: str,
        subject: str,
        topics: List[str],
        priority: str = "normal",
        due_date: Optional[datetime] = None,
        notes: Optional[str] = None,
    ) -> StudyTrackAssignment:
        """Assign specific topics to a student.
        
        Args:
            educator_id: Educator identifier
            student_id: Student identifier
            subject: Subject area
            topics: List of topic IDs to assign
            priority: Assignment priority (low, normal, high)
            due_date: Optional due date
            notes: Optional educator notes
            
        Returns:
            Created StudyTrackAssignment
        """
        logger.info(f"Educator {educator_id} assigning topics to student {student_id}")
        
        assignment = StudyTrackAssignment(
            assignment_id=str(uuid.uuid4()),
            educator_id=educator_id,
            student_id=student_id,
            subject=subject,
            topics=topics,
            priority=priority,
            due_date=due_date,
            notes=notes,
            status="pending",
        )
        
        self.repository.save_assignment(assignment)
        logger.info(f"Created assignment {assignment.assignment_id} with {len(topics)} topics")
        
        return assignment

    def customize_study_track(
        self,
        educator_id: str,
        student_id: str,
        subject: str,
        topics: List[str],
        difficulty_override: Optional[str] = None,
        pacing_multiplier: float = 1.0,
        focus_areas: Optional[List[str]] = None,
        skip_topics: Optional[List[str]] = None,
    ) -> StudyTrackCustomization:
        """Create a customized study track for a student.
        
        Args:
            educator_id: Educator identifier
            student_id: Student identifier
            subject: Subject area
            topics: Ordered list of topic IDs
            difficulty_override: Override difficulty level
            pacing_multiplier: Pacing adjustment (0.5-2.0)
            focus_areas: Topics requiring extra focus
            skip_topics: Topics to skip
            
        Returns:
            Created StudyTrackCustomization
        """
        logger.info(f"Educator {educator_id} customizing study track for student {student_id}")
        
        customization = StudyTrackCustomization(
            track_id=str(uuid.uuid4()),
            student_id=student_id,
            subject=subject,
            topics=topics,
            difficulty_override=difficulty_override,
            pacing_multiplier=pacing_multiplier,
            focus_areas=focus_areas or [],
            skip_topics=skip_topics or [],
            created_by=educator_id,
            applied_to_bundle=False,
        )
        
        self.repository.save_customization(customization)
        logger.info(f"Created customization {customization.track_id}")
        
        return customization

    def get_pending_assignments(self, student_id: str) -> List[StudyTrackAssignment]:
        """Get all pending assignments for a student.
        
        Args:
            student_id: Student identifier
            
        Returns:
            List of pending assignments
        """
        return self.repository.get_pending_assignments(student_id)

    def get_active_customization(
        self, student_id: str, subject: str
    ) -> Optional[StudyTrackCustomization]:
        """Get active study track customization for a student.
        
        Args:
            student_id: Student identifier
            subject: Subject area
            
        Returns:
            Active customization if exists, None otherwise
        """
        return self.repository.get_customization(student_id, subject)

    def apply_assignments_to_bundle(
        self, student_id: str, subject: str, bundle_id: str
    ) -> List[str]:
        """Apply pending assignments to a learning bundle.
        
        This method should be called during bundle generation to incorporate
        educator assignments into the personalized content.
        
        Args:
            student_id: Student identifier
            subject: Subject area
            bundle_id: Bundle identifier being generated
            
        Returns:
            List of topic IDs to include in the bundle
        """
        logger.info(f"Applying assignments for student {student_id} to bundle {bundle_id}")
        
        # Get pending assignments
        assignments = self.get_pending_assignments(student_id)
        
        # Filter by subject
        subject_assignments = [a for a in assignments if a.subject == subject]
        
        # Collect all assigned topics
        assigned_topics = []
        for assignment in subject_assignments:
            assigned_topics.extend(assignment.topics)
            
            # Mark assignment as active
            self.repository.update_assignment_status(assignment.assignment_id, "active")
            
            logger.info(
                f"Applied assignment {assignment.assignment_id} with {len(assignment.topics)} topics"
            )
        
        # Remove duplicates while preserving order
        unique_topics = []
        seen = set()
        for topic in assigned_topics:
            if topic not in seen:
                unique_topics.append(topic)
                seen.add(topic)
        
        return unique_topics

    def apply_customization_to_bundle(
        self, student_id: str, subject: str, bundle_id: str
    ) -> Optional[StudyTrackCustomization]:
        """Apply study track customization to a learning bundle.
        
        This method should be called during bundle generation to incorporate
        educator customizations.
        
        Args:
            student_id: Student identifier
            subject: Subject area
            bundle_id: Bundle identifier being generated
            
        Returns:
            Applied customization if exists, None otherwise
        """
        logger.info(f"Applying customization for student {student_id} to bundle {bundle_id}")
        
        customization = self.get_active_customization(student_id, subject)
        
        if customization and not customization.applied_to_bundle:
            # Mark as applied
            customization.applied_to_bundle = True
            self.repository.save_customization(customization)
            
            logger.info(f"Applied customization {customization.track_id} to bundle {bundle_id}")
            
            return customization
        
        return None

    def get_assignment(self, assignment_id: str) -> Optional[StudyTrackAssignment]:
        """Get a specific assignment by ID.
        
        Args:
            assignment_id: Assignment identifier
            
        Returns:
            StudyTrackAssignment if found, None otherwise
        """
        return self.repository.get_assignment(assignment_id)

    def complete_assignment(self, assignment_id: str) -> bool:
        """Mark an assignment as completed.
        
        Args:
            assignment_id: Assignment identifier
            
        Returns:
            True if successful, False otherwise
        """
        logger.info(f"Completing assignment {assignment_id}")
        return self.repository.update_assignment_status(assignment_id, "completed")
