"""Personalization engine for adaptive learning."""

import logging
import math
from datetime import datetime, timedelta
from typing import Dict, List, Tuple

from src.models.personalization import (
    KnowledgeModel,
    MasteryLevel,
    PerformanceLog,
    SubjectKnowledge,
    TopicKnowledge,
)
from src.repositories.knowledge_model_repository import KnowledgeModelRepository

logger = logging.getLogger(__name__)


class PersonalizationEngine:
    """Engine for personalizing content based on student performance."""

    def __init__(self, repository: KnowledgeModelRepository):
        """Initialize the personalization engine.
        
        Args:
            repository: Knowledge model repository for persistence
        """
        self.repository = repository
        
        # Bayesian Knowledge Tracing parameters
        # Tuned to prevent rapid convergence to extreme values
        self.p_init = 0.4  # Initial knowledge probability (start higher to avoid floor)
        self.p_learn = 0.04  # Learning rate (further reduced to slow convergence)
        self.p_guess = 0.15  # Probability of guessing correctly (reduced to differentiate from knowledge)
        self.p_slip = 0.2  # Probability of making a mistake despite knowing (increased for realism)
        
        # Content mix ratios
        self.new_content_ratio = 0.6
        self.practice_ratio = 0.3
        self.review_ratio = 0.1

    def analyze_performance_logs(
        self, student_id: str, performance_logs: List[PerformanceLog]
    ) -> KnowledgeModel:
        """Analyze performance logs and update knowledge model.
        
        Args:
            student_id: Student identifier
            performance_logs: List of performance logs to analyze
            
        Returns:
            Updated knowledge model
        """
        # Get existing knowledge model or create new one
        knowledge_model = self.repository.get_knowledge_model(student_id)
        if not knowledge_model:
            knowledge_model = self.repository.create_initial_knowledge_model(student_id)
        
        # Group logs by subject and topic
        logs_by_topic: Dict[Tuple[str, str], List[PerformanceLog]] = {}
        for log in performance_logs:
            key = (log.subject, log.topic)
            if key not in logs_by_topic:
                logs_by_topic[key] = []
            logs_by_topic[key].append(log)
        
        # Update knowledge for each topic
        for (subject, topic), topic_logs in logs_by_topic.items():
            self._update_topic_knowledge(knowledge_model, subject, topic, topic_logs)
        
        # Calculate learning velocity for each subject
        for subject in knowledge_model.subjects:
            self._calculate_learning_velocity(knowledge_model, subject, performance_logs)
        
        # Save updated model
        knowledge_model.last_updated = datetime.utcnow()
        self.repository.save_knowledge_model(knowledge_model)
        
        return knowledge_model

    def _update_topic_knowledge(
        self,
        knowledge_model: KnowledgeModel,
        subject: str,
        topic: str,
        logs: List[PerformanceLog],
    ) -> None:
        """Update knowledge for a specific topic using Bayesian Knowledge Tracing.
        
        Args:
            knowledge_model: Knowledge model to update
            subject: Subject name
            topic: Topic identifier
            logs: Performance logs for this topic
        """
        # Ensure subject exists
        if subject not in knowledge_model.subjects:
            knowledge_model.subjects[subject] = SubjectKnowledge()
        
        # Get current topic knowledge or initialize
        if topic in knowledge_model.subjects[subject].topics:
            topic_knowledge = knowledge_model.subjects[subject].topics[topic]
            p_known = topic_knowledge.proficiency
        else:
            p_known = self.p_init
            topic_knowledge = TopicKnowledge(
                proficiency=p_known,
                attempts=0,
                last_practiced=None,
                mastery_level=MasteryLevel.NOVICE,
                cognitive_level=1,
            )
            knowledge_model.subjects[subject].topics[topic] = topic_knowledge
        
        # Process quiz answers to update proficiency using BKT
        quiz_logs = [log for log in logs if log.event_type in ["quiz_answer", "quiz_complete"]]
        
        for log in quiz_logs:
            # Handle both quiz_answer and quiz_complete events
            if log.event_type == "quiz_complete":
                # For quiz_complete, use accuracy from data
                accuracy = log.data.get("accuracy", 0.0)
                questions_answered = log.data.get("questions_answered", 1)
                
                # Simulate individual answers based on accuracy
                correct_count = int(accuracy * questions_answered)
                for i in range(questions_answered):
                    correct = i < correct_count
                    
                    # Apply BKT update
                    if correct:
                        numerator = p_known * (1 - self.p_slip)
                        denominator = numerator + (1 - p_known) * self.p_guess
                        p_known = numerator / denominator if denominator > 0 else p_known
                    else:
                        numerator = p_known * self.p_slip
                        denominator = numerator + (1 - p_known) * (1 - self.p_guess)
                        p_known = numerator / denominator if denominator > 0 else p_known
                    
                    # Apply learning rate
                    p_known = p_known + (1 - p_known) * self.p_learn
                    p_known = max(0.0, min(1.0, p_known))
                    
                    topic_knowledge.attempts += 1
            else:
                # Handle quiz_answer event
                correct = log.data.get("correct", False)
                
                # Bayesian Knowledge Tracing update
                if correct:
                    # P(L_n+1 | correct) = P(L_n) * (1 - p_slip) / 
                    #                      (P(L_n) * (1 - p_slip) + (1 - P(L_n)) * p_guess)
                    numerator = p_known * (1 - self.p_slip)
                    denominator = numerator + (1 - p_known) * self.p_guess
                    p_known = numerator / denominator if denominator > 0 else p_known
                else:
                    # P(L_n+1 | incorrect) = P(L_n) * p_slip / 
                    #                        (P(L_n) * p_slip + (1 - P(L_n)) * (1 - p_guess))
                    numerator = p_known * self.p_slip
                    denominator = numerator + (1 - p_known) * (1 - self.p_guess)
                    p_known = numerator / denominator if denominator > 0 else p_known
                
                # Apply learning rate
                p_known = p_known + (1 - p_known) * self.p_learn
                
                # Clamp to [0, 1]
                p_known = max(0.0, min(1.0, p_known))
                
                topic_knowledge.attempts += 1
        
        # Update proficiency
        topic_knowledge.proficiency = p_known
        topic_knowledge.last_practiced = datetime.utcnow()
        
        # Determine mastery level based on proficiency
        if p_known < 0.3:
            topic_knowledge.mastery_level = MasteryLevel.NOVICE
        elif p_known < 0.6:
            topic_knowledge.mastery_level = MasteryLevel.DEVELOPING
        elif p_known < 0.85:
            topic_knowledge.mastery_level = MasteryLevel.PROFICIENT
        else:
            topic_knowledge.mastery_level = MasteryLevel.ADVANCED
        
        # Estimate cognitive level based on performance
        # Higher proficiency and more attempts suggest higher cognitive level
        if topic_knowledge.attempts > 10 and p_known > 0.8:
            topic_knowledge.cognitive_level = min(6, topic_knowledge.cognitive_level + 1)
        elif topic_knowledge.attempts > 5 and p_known > 0.6:
            topic_knowledge.cognitive_level = min(5, max(3, topic_knowledge.cognitive_level))
        else:
            topic_knowledge.cognitive_level = min(4, max(1, topic_knowledge.cognitive_level))
        
        # Update overall subject proficiency
        topics = knowledge_model.subjects[subject].topics
        if topics:
            knowledge_model.subjects[subject].overall_proficiency = sum(
                t.proficiency for t in topics.values()
            ) / len(topics)

    def _calculate_learning_velocity(
        self,
        knowledge_model: KnowledgeModel,
        subject: str,
        logs: List[PerformanceLog],
    ) -> None:
        """Calculate learning velocity (topics mastered per week).
        
        Args:
            knowledge_model: Knowledge model to update
            subject: Subject name
            logs: All performance logs
        """
        if subject not in knowledge_model.subjects:
            return
        
        # Filter logs for this subject
        subject_logs = [log for log in logs if log.subject == subject]
        if not subject_logs:
            return
        
        # Find time range
        timestamps = [log.timestamp for log in subject_logs]
        min_time = min(timestamps)
        max_time = max(timestamps)
        time_span = (max_time - min_time).total_seconds() / (7 * 24 * 3600)  # weeks
        
        if time_span < 0.1:  # Less than ~17 hours, not enough data
            return
        
        # Count topics that reached proficient or advanced
        mastered_topics = sum(
            1
            for topic in knowledge_model.subjects[subject].topics.values()
            if topic.mastery_level in [MasteryLevel.PROFICIENT, MasteryLevel.ADVANCED]
        )
        
        # Calculate velocity
        knowledge_model.subjects[subject].learning_velocity = mastered_topics / time_span

    def calculate_zpd_difficulty(
        self, knowledge_model: KnowledgeModel, subject: str, topic: str
    ) -> str:
        """Calculate Zone of Proximal Development difficulty level.
        
        Args:
            knowledge_model: Student's knowledge model
            subject: Subject name
            topic: Topic identifier
            
        Returns:
            Difficulty level: 'easy', 'medium', or 'hard'
        """
        if subject not in knowledge_model.subjects:
            return "easy"
        
        if topic not in knowledge_model.subjects[subject].topics:
            return "easy"
        
        topic_knowledge = knowledge_model.subjects[subject].topics[topic]
        proficiency = topic_knowledge.proficiency
        
        # ZPD: Content should be slightly above current ability
        if proficiency < 0.3:
            return "easy"
        elif proficiency < 0.7:
            return "medium"
        else:
            return "hard"

    def generate_content_mix(
        self, knowledge_model: KnowledgeModel, subject: str
    ) -> Dict[str, float]:
        """Generate content mix ratios (new, practice, review).
        
        Args:
            knowledge_model: Student's knowledge model
            subject: Subject name
            
        Returns:
            Dictionary with ratios for 'new', 'practice', 'review'
        """
        if subject not in knowledge_model.subjects:
            # New student: focus on new content
            return {
                "new": 0.8,
                "practice": 0.15,
                "review": 0.05,
            }
        
        subject_knowledge = knowledge_model.subjects[subject]
        
        # Adjust mix based on overall proficiency
        if subject_knowledge.overall_proficiency < 0.4:
            # Struggling: more practice, less new content
            return {
                "new": 0.4,
                "practice": 0.5,
                "review": 0.1,
            }
        elif subject_knowledge.overall_proficiency > 0.8:
            # Excelling: more new content, less practice
            return {
                "new": 0.7,
                "practice": 0.2,
                "review": 0.1,
            }
        else:
            # Standard mix
            return {
                "new": self.new_content_ratio,
                "practice": self.practice_ratio,
                "review": self.review_ratio,
            }

    def calculate_adaptive_pacing(
        self, knowledge_model: KnowledgeModel, subject: str
    ) -> float:
        """Calculate adaptive pacing multiplier based on learning velocity.
        
        Args:
            knowledge_model: Student's knowledge model
            subject: Subject name
            
        Returns:
            Pacing multiplier (0.5 = slower, 1.0 = normal, 2.0 = faster)
        """
        if subject not in knowledge_model.subjects:
            return 1.0
        
        velocity = knowledge_model.subjects[subject].learning_velocity
        
        # Baseline: 1 topic per week
        baseline_velocity = 1.0
        
        if velocity < baseline_velocity * 0.5:
            # Slow learner: reduce pace
            return 0.5
        elif velocity > baseline_velocity * 1.5:
            # Fast learner: increase pace
            return 1.5
        else:
            # Normal pace
            return 1.0

    def identify_knowledge_gaps(
        self, knowledge_model: KnowledgeModel, subject: str
    ) -> List[str]:
        """Identify topics where student needs improvement.
        
        Args:
            knowledge_model: Student's knowledge model
            subject: Subject name
            
        Returns:
            List of topic IDs with low proficiency
        """
        if subject not in knowledge_model.subjects:
            return []
        
        gaps = []
        for topic_id, topic_knowledge in knowledge_model.subjects[subject].topics.items():
            if topic_knowledge.proficiency < 0.6:
                gaps.append(topic_id)
        
        # Sort by proficiency (lowest first)
        gaps.sort(
            key=lambda t: knowledge_model.subjects[subject].topics[t].proficiency
        )
        
        return gaps

    def identify_mastery_areas(
        self, knowledge_model: KnowledgeModel, subject: str
    ) -> List[str]:
        """Identify topics where student has achieved mastery.
        
        Args:
            knowledge_model: Student's knowledge model
            subject: Subject name
            
        Returns:
            List of topic IDs with high proficiency
        """
        if subject not in knowledge_model.subjects:
            return []
        
        mastery = []
        for topic_id, topic_knowledge in knowledge_model.subjects[subject].topics.items():
            if topic_knowledge.mastery_level in [
                MasteryLevel.PROFICIENT,
                MasteryLevel.ADVANCED,
            ]:
                mastery.append(topic_id)
        
        return mastery
