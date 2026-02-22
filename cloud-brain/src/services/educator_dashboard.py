"""Educator dashboard service for viewing student progress and generating reports."""

import logging
from datetime import datetime, timedelta
from typing import List, Optional

from src.models.educator import (
    ClassPerformanceReport,
    CurriculumCoverageReport,
    DashboardData,
    StudentProgress,
)
from src.models.personalization import KnowledgeModel, MasteryLevel, PerformanceLog
from src.repositories.knowledge_model_repository import KnowledgeModelRepository

logger = logging.getLogger(__name__)


class EducatorDashboardService:
    """Service for generating educator dashboard data and reports."""

    def __init__(self, knowledge_repository: KnowledgeModelRepository):
        """Initialize the educator dashboard service.
        
        Args:
            knowledge_repository: Repository for student knowledge models
        """
        self.knowledge_repository = knowledge_repository

    def get_dashboard_data(
        self, educator_id: str, class_ids: List[str], student_ids: List[str]
    ) -> DashboardData:
        """Get complete dashboard data for an educator.
        
        Args:
            educator_id: Educator identifier
            class_ids: List of class identifiers
            student_ids: List of student identifiers in the educator's classes
            
        Returns:
            Complete dashboard data
        """
        logger.info(f"Generating dashboard data for educator {educator_id}")
        
        # Generate student progress for all students
        student_progress = []
        for student_id in student_ids:
            progress = self.get_student_progress(student_id)
            if progress:
                student_progress.extend(progress)
        
        # Generate class performance reports
        class_reports = []
        for class_id in class_ids:
            # Get students in this class (simplified - in real implementation, query from DB)
            class_student_ids = student_ids  # Placeholder
            report = self.generate_class_performance_report(class_id, "Class A", class_student_ids)
            if report:
                class_reports.append(report)
        
        # Generate curriculum coverage reports
        coverage_reports = []
        for class_id in class_ids:
            class_student_ids = student_ids  # Placeholder
            for subject in ["Mathematics", "Science", "English"]:
                report = self.generate_curriculum_coverage_report(
                    class_id=class_id, subject=subject, student_ids=class_student_ids
                )
                if report:
                    coverage_reports.append(report)
        
        return DashboardData(
            educator_id=educator_id,
            class_ids=class_ids,
            student_progress=student_progress,
            class_reports=class_reports,
            coverage_reports=coverage_reports,
        )

    def get_student_progress(self, student_id: str) -> List[StudentProgress]:
        """Get progress summary for a student across all subjects.
        
        Args:
            student_id: Student identifier
            
        Returns:
            List of StudentProgress objects (one per subject)
        """
        knowledge_model = self.knowledge_repository.get_knowledge_model(student_id)
        if not knowledge_model:
            logger.warning(f"No knowledge model found for student {student_id}")
            return []
        
        progress_list = []
        for subject, subject_knowledge in knowledge_model.subjects.items():
            # Calculate metrics
            topics_in_progress = []
            topics_mastered = []
            
            for topic_id, topic_knowledge in subject_knowledge.topics.items():
                if topic_knowledge.mastery_level in [MasteryLevel.PROFICIENT, MasteryLevel.ADVANCED]:
                    topics_mastered.append(topic_id)
                elif topic_knowledge.mastery_level in [MasteryLevel.DEVELOPING]:
                    topics_in_progress.append(topic_id)
            
            # Create progress object
            progress = StudentProgress(
                student_id=student_id,
                student_name=f"Student {student_id}",  # Placeholder - should come from student DB
                subject=subject,
                lessons_completed=len(subject_knowledge.topics),  # Simplified
                quizzes_completed=sum(t.attempts for t in subject_knowledge.topics.values()),
                average_accuracy=subject_knowledge.overall_proficiency,
                total_time_spent=0,  # Would need to calculate from performance logs
                current_streak=0,  # Would need to calculate from performance logs
                topics_in_progress=topics_in_progress,
                topics_mastered=topics_mastered,
                last_active=max(
                    (t.last_practiced for t in subject_knowledge.topics.values() if t.last_practiced),
                    default=None
                ),
            )
            progress_list.append(progress)
        
        return progress_list

    def generate_class_performance_report(
        self, class_id: str, class_name: str, student_ids: List[str], subject: Optional[str] = None
    ) -> Optional[ClassPerformanceReport]:
        """Generate class-level performance report.
        
        Args:
            class_id: Class identifier
            class_name: Class name
            student_ids: List of student identifiers in the class
            subject: Optional subject filter (if None, aggregates all subjects)
            
        Returns:
            ClassPerformanceReport or None if no data available
        """
        if not student_ids:
            logger.warning(f"No students provided for class {class_id}")
            return None
        
        logger.info(f"Generating class performance report for class {class_id}")
        
        # Collect data from all students
        total_students = len(student_ids)
        active_students = 0
        completion_rates = []
        accuracies = []
        struggling_students = []
        top_performers = []
        
        for student_id in student_ids:
            knowledge_model = self.knowledge_repository.get_knowledge_model(student_id)
            if not knowledge_model:
                continue
            
            # Check if student is active (has recent activity)
            if knowledge_model.last_updated > datetime.utcnow() - timedelta(days=7):
                active_students += 1
            
            # Calculate metrics for the subject (or all subjects)
            subjects_to_check = [subject] if subject else list(knowledge_model.subjects.keys())
            
            for subj in subjects_to_check:
                if subj not in knowledge_model.subjects:
                    continue
                
                subject_knowledge = knowledge_model.subjects[subj]
                
                # Completion rate (topics with at least one attempt)
                if subject_knowledge.topics:
                    completed_topics = sum(1 for t in subject_knowledge.topics.values() if t.attempts > 0)
                    completion_rate = completed_topics / len(subject_knowledge.topics)
                    completion_rates.append(completion_rate)
                
                # Accuracy
                accuracies.append(subject_knowledge.overall_proficiency)
                
                # Identify struggling students (proficiency < 0.4)
                if subject_knowledge.overall_proficiency < 0.4:
                    if student_id not in struggling_students:
                        struggling_students.append(student_id)
                
                # Identify top performers (proficiency > 0.8)
                if subject_knowledge.overall_proficiency > 0.8:
                    if student_id not in top_performers:
                        top_performers.append(student_id)
        
        # Calculate averages
        avg_completion_rate = sum(completion_rates) / len(completion_rates) if completion_rates else 0.0
        avg_accuracy = sum(accuracies) / len(accuracies) if accuracies else 0.0
        
        return ClassPerformanceReport(
            class_id=class_id,
            class_name=class_name,
            subject=subject or "All Subjects",
            total_students=total_students,
            active_students=active_students,
            average_completion_rate=avg_completion_rate,
            average_accuracy=avg_accuracy,
            struggling_students=struggling_students[:5],  # Top 5 struggling
            top_performers=top_performers[:5],  # Top 5 performers
        )

    def generate_curriculum_coverage_report(
        self,
        subject: str,
        student_ids: Optional[List[str]] = None,
        class_id: Optional[str] = None,
        student_id: Optional[str] = None,
    ) -> Optional[CurriculumCoverageReport]:
        """Generate curriculum coverage report for a class or individual student.
        
        Args:
            subject: Subject area
            student_ids: List of student IDs (for class report)
            class_id: Class identifier (for class report)
            student_id: Student identifier (for individual report)
            
        Returns:
            CurriculumCoverageReport or None if no data available
        """
        logger.info(f"Generating curriculum coverage report for subject {subject}")
        
        # Define curriculum topics (simplified - should come from MCP server)
        curriculum_topics = self._get_curriculum_topics(subject)
        total_topics = len(curriculum_topics)
        
        if student_id:
            # Individual student report
            knowledge_model = self.knowledge_repository.get_knowledge_model(student_id)
            if not knowledge_model or subject not in knowledge_model.subjects:
                return None
            
            subject_knowledge = knowledge_model.subjects[subject]
            topics_covered = len(subject_knowledge.topics)
            topics_mastered = sum(
                1 for t in subject_knowledge.topics.values()
                if t.mastery_level in [MasteryLevel.PROFICIENT, MasteryLevel.ADVANCED]
            )
            
            # Build topic details
            topic_details = []
            for topic_id in curriculum_topics:
                if topic_id in subject_knowledge.topics:
                    topic_knowledge = subject_knowledge.topics[topic_id]
                    topic_details.append({
                        "topic_id": topic_id,
                        "covered": True,
                        "mastered": topic_knowledge.mastery_level in [MasteryLevel.PROFICIENT, MasteryLevel.ADVANCED],
                        "proficiency": topic_knowledge.proficiency,
                    })
                else:
                    topic_details.append({
                        "topic_id": topic_id,
                        "covered": False,
                        "mastered": False,
                        "proficiency": 0.0,
                    })
            
            return CurriculumCoverageReport(
                student_id=student_id,
                subject=subject,
                total_topics=total_topics,
                topics_covered=topics_covered,
                topics_mastered=topics_mastered,
                coverage_percentage=(topics_covered / total_topics * 100) if total_topics > 0 else 0.0,
                topic_details=topic_details,
            )
        
        elif class_id and student_ids:
            # Class-level report (aggregate)
            all_topics_covered = set()
            all_topics_mastered = set()
            
            for sid in student_ids:
                knowledge_model = self.knowledge_repository.get_knowledge_model(sid)
                if not knowledge_model or subject not in knowledge_model.subjects:
                    continue
                
                subject_knowledge = knowledge_model.subjects[subject]
                all_topics_covered.update(subject_knowledge.topics.keys())
                
                for topic_id, topic_knowledge in subject_knowledge.topics.items():
                    if topic_knowledge.mastery_level in [MasteryLevel.PROFICIENT, MasteryLevel.ADVANCED]:
                        all_topics_mastered.add(topic_id)
            
            topics_covered = len(all_topics_covered)
            topics_mastered = len(all_topics_mastered)
            
            # Build topic details (class aggregate)
            topic_details = []
            for topic_id in curriculum_topics:
                covered = topic_id in all_topics_covered
                mastered = topic_id in all_topics_mastered
                
                # Calculate average proficiency for this topic across class
                proficiencies = []
                for sid in student_ids:
                    knowledge_model = self.knowledge_repository.get_knowledge_model(sid)
                    if knowledge_model and subject in knowledge_model.subjects:
                        if topic_id in knowledge_model.subjects[subject].topics:
                            proficiencies.append(knowledge_model.subjects[subject].topics[topic_id].proficiency)
                
                avg_proficiency = sum(proficiencies) / len(proficiencies) if proficiencies else 0.0
                
                topic_details.append({
                    "topic_id": topic_id,
                    "covered": covered,
                    "mastered": mastered,
                    "proficiency": avg_proficiency,
                    "students_covered": len(proficiencies),
                })
            
            return CurriculumCoverageReport(
                class_id=class_id,
                subject=subject,
                total_topics=total_topics,
                topics_covered=topics_covered,
                topics_mastered=topics_mastered,
                coverage_percentage=(topics_covered / total_topics * 100) if total_topics > 0 else 0.0,
                topic_details=topic_details,
            )
        
        return None

    def _get_curriculum_topics(self, subject: str) -> List[str]:
        """Get curriculum topics for a subject.
        
        Args:
            subject: Subject area
            
        Returns:
            List of topic identifiers
        """
        # Simplified - in real implementation, query from MCP server
        curriculum_map = {
            "Mathematics": [
                "algebra_basics", "geometry_shapes", "fractions", "decimals",
                "equations", "graphs", "statistics", "probability"
            ],
            "Science": [
                "cells", "photosynthesis", "forces", "energy",
                "matter", "chemical_reactions", "ecosystems", "human_body"
            ],
            "English": [
                "grammar", "vocabulary", "reading_comprehension", "writing",
                "literature", "poetry", "essays", "presentations"
            ],
        }
        return curriculum_map.get(subject, [])
