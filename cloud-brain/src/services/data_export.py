"""Data export service for student learning data."""

import csv
import io
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

from src.models.personalization import KnowledgeModel, PerformanceLog
from src.repositories.knowledge_model_repository import KnowledgeModelRepository

logger = logging.getLogger(__name__)


class DataExportService:
    """Service for exporting student learning data in various formats."""

    def __init__(self, knowledge_model_repo: Optional[KnowledgeModelRepository] = None):
        """Initialize the export service.
        
        Args:
            knowledge_model_repo: Repository for accessing knowledge models
        """
        self.knowledge_model_repo = knowledge_model_repo or KnowledgeModelRepository()
    
    def export_performance_logs_csv(self, logs: List[PerformanceLog]) -> str:
        """Export performance logs to CSV format.
        
        Args:
            logs: List of performance logs to export
            
        Returns:
            CSV string containing the logs
        """
        if not logs:
            return ""
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow([
            "Timestamp",
            "Event Type",
            "Subject",
            "Topic",
            "Content ID",
            "Correct",
            "Time Spent (seconds)",
            "Hints Used",
            "Attempts"
        ])
        
        # Write data rows
        for log in logs:
            writer.writerow([
                log.timestamp.isoformat(),
                log.event_type,
                log.subject,
                log.topic,
                log.content_id,
                log.data.get("correct", ""),
                log.data.get("time_spent", ""),
                log.data.get("hints_used", ""),
                log.data.get("attempts", "")
            ])
        
        return output.getvalue()
    
    def export_knowledge_model_csv(self, model: KnowledgeModel) -> str:
        """Export knowledge model to CSV format.
        
        Args:
            model: Knowledge model to export
            
        Returns:
            CSV string containing the knowledge model
        """
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow([
            "Subject",
            "Topic",
            "Proficiency",
            "Mastery Level",
            "Attempts",
            "Last Practiced",
            "Cognitive Level"
        ])
        
        # Write data rows
        for subject_name, subject_knowledge in model.subjects.items():
            for topic_id, topic_knowledge in subject_knowledge.topics.items():
                writer.writerow([
                    subject_name,
                    topic_id,
                    f"{topic_knowledge.proficiency:.2f}",
                    topic_knowledge.mastery_level.value,
                    topic_knowledge.attempts,
                    topic_knowledge.last_practiced.isoformat() if topic_knowledge.last_practiced else "",
                    topic_knowledge.cognitive_level
                ])
        
        return output.getvalue()
    
    def export_student_summary_csv(
        self,
        student_id: str,
        model: KnowledgeModel,
        logs: List[PerformanceLog]
    ) -> str:
        """Export a comprehensive student summary to CSV format.
        
        Args:
            student_id: Student identifier
            model: Student's knowledge model
            logs: Student's performance logs
            
        Returns:
            CSV string containing the summary
        """
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Student info section
        writer.writerow(["Student Learning Summary"])
        writer.writerow(["Student ID", student_id])
        writer.writerow(["Export Date", datetime.utcnow().isoformat()])
        writer.writerow(["Last Updated", model.last_updated.isoformat()])
        writer.writerow([])
        
        # Subject proficiency section
        writer.writerow(["Subject Proficiency"])
        writer.writerow(["Subject", "Overall Proficiency", "Learning Velocity (topics/week)"])
        for subject_name, subject_knowledge in model.subjects.items():
            writer.writerow([
                subject_name,
                f"{subject_knowledge.overall_proficiency:.2f}",
                f"{subject_knowledge.learning_velocity:.2f}"
            ])
        writer.writerow([])
        
        # Activity summary section
        writer.writerow(["Activity Summary"])
        writer.writerow(["Total Events", len(logs)])
        
        # Count events by type
        event_counts: Dict[str, int] = {}
        for log in logs:
            event_counts[log.event_type] = event_counts.get(log.event_type, 0) + 1
        
        for event_type, count in event_counts.items():
            writer.writerow([event_type, count])
        
        writer.writerow([])
        
        # Quiz performance section
        quiz_logs = [log for log in logs if log.event_type == "quiz_answer"]
        if quiz_logs:
            correct_count = sum(1 for log in quiz_logs if log.data.get("correct"))
            accuracy = correct_count / len(quiz_logs) if quiz_logs else 0
            
            writer.writerow(["Quiz Performance"])
            writer.writerow(["Total Questions Answered", len(quiz_logs)])
            writer.writerow(["Correct Answers", correct_count])
            writer.writerow(["Accuracy", f"{accuracy:.2%}"])
        
        return output.getvalue()
    
    def export_student_data_text(
        self,
        student_id: str,
        model: KnowledgeModel,
        logs: List[PerformanceLog]
    ) -> str:
        """Export student data as human-readable text report.
        
        Args:
            student_id: Student identifier
            model: Student's knowledge model
            logs: Student's performance logs
            
        Returns:
            Text report containing student data
        """
        lines = []
        
        # Header
        lines.append("=" * 60)
        lines.append("STUDENT LEARNING REPORT")
        lines.append("=" * 60)
        lines.append("")
        lines.append(f"Student ID: {student_id}")
        lines.append(f"Export Date: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}")
        lines.append(f"Last Updated: {model.last_updated.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        lines.append("")
        
        # Subject proficiency
        lines.append("-" * 60)
        lines.append("SUBJECT PROFICIENCY")
        lines.append("-" * 60)
        lines.append("")
        
        for subject_name, subject_knowledge in model.subjects.items():
            lines.append(f"{subject_name}:")
            lines.append(f"  Overall Proficiency: {subject_knowledge.overall_proficiency:.2%}")
            lines.append(f"  Learning Velocity: {subject_knowledge.learning_velocity:.2f} topics/week")
            lines.append(f"  Topics Tracked: {len(subject_knowledge.topics)}")
            lines.append("")
            
            # Top topics
            sorted_topics = sorted(
                subject_knowledge.topics.items(),
                key=lambda x: x[1].proficiency,
                reverse=True
            )
            
            if sorted_topics:
                lines.append(f"  Top Topics:")
                for topic_id, topic_knowledge in sorted_topics[:5]:
                    lines.append(
                        f"    - {topic_id}: {topic_knowledge.proficiency:.2%} "
                        f"({topic_knowledge.mastery_level.value})"
                    )
                lines.append("")
        
        # Activity summary
        lines.append("-" * 60)
        lines.append("ACTIVITY SUMMARY")
        lines.append("-" * 60)
        lines.append("")
        lines.append(f"Total Learning Events: {len(logs)}")
        lines.append("")
        
        # Event breakdown
        event_counts: Dict[str, int] = {}
        for log in logs:
            event_counts[log.event_type] = event_counts.get(log.event_type, 0) + 1
        
        lines.append("Event Breakdown:")
        for event_type, count in sorted(event_counts.items()):
            lines.append(f"  {event_type}: {count}")
        lines.append("")
        
        # Quiz performance
        quiz_logs = [log for log in logs if log.event_type == "quiz_answer"]
        if quiz_logs:
            correct_count = sum(1 for log in quiz_logs if log.data.get("correct"))
            accuracy = correct_count / len(quiz_logs) if quiz_logs else 0
            
            lines.append("-" * 60)
            lines.append("QUIZ PERFORMANCE")
            lines.append("-" * 60)
            lines.append("")
            lines.append(f"Total Questions Answered: {len(quiz_logs)}")
            lines.append(f"Correct Answers: {correct_count}")
            lines.append(f"Accuracy: {accuracy:.2%}")
            lines.append("")
        
        # Recent activity
        lines.append("-" * 60)
        lines.append("RECENT ACTIVITY (Last 10 Events)")
        lines.append("-" * 60)
        lines.append("")
        
        recent_logs = sorted(logs, key=lambda x: x.timestamp, reverse=True)[:10]
        for log in recent_logs:
            timestamp = log.timestamp.strftime('%Y-%m-%d %H:%M:%S')
            lines.append(f"{timestamp} - {log.event_type}")
            lines.append(f"  Subject: {log.subject}, Topic: {log.topic}")
            if log.data.get("correct") is not None:
                lines.append(f"  Result: {'Correct' if log.data['correct'] else 'Incorrect'}")
            lines.append("")
        
        lines.append("=" * 60)
        lines.append("END OF REPORT")
        lines.append("=" * 60)
        
        return "\n".join(lines)
    
    def export_student_data(
        self,
        student_id: str,
        logs: List[PerformanceLog],
        format: str = "csv"
    ) -> Dict[str, Any]:
        """Export complete student data in specified format.
        
        Args:
            student_id: Student identifier
            logs: Student's performance logs
            format: Export format ('csv' or 'text')
            
        Returns:
            Dictionary containing export data and metadata
        """
        # Get knowledge model
        model = self.knowledge_model_repo.get_knowledge_model(student_id)
        if not model:
            logger.warning(f"No knowledge model found for student {student_id}")
            # Create empty model for export
            from src.models.personalization import KnowledgeModel
            model = KnowledgeModel(student_id=student_id, subjects={})
        
        if format == "csv":
            # Generate multiple CSV files
            return {
                "format": "csv",
                "files": {
                    "summary.csv": self.export_student_summary_csv(student_id, model, logs),
                    "knowledge_model.csv": self.export_knowledge_model_csv(model),
                    "performance_logs.csv": self.export_performance_logs_csv(logs)
                },
                "export_date": datetime.utcnow().isoformat()
            }
        elif format == "text":
            return {
                "format": "text",
                "content": self.export_student_data_text(student_id, model, logs),
                "export_date": datetime.utcnow().isoformat()
            }
        else:
            raise ValueError(f"Unsupported export format: {format}")
