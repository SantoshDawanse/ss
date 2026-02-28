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
    TopicMastery,
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
            topic_knowledge = TopicMastery(
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
        
        Based on the design document:
        - Proficiency <0.6: Easy difficulty
        - Proficiency 0.6-0.8: Medium difficulty
        - Proficiency >0.8: Hard difficulty or advance to next topic
        
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
        if proficiency < 0.6:
            return "easy"
        elif proficiency < 0.8:
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

    def validate_curriculum_progression(
        self,
        knowledge_model: KnowledgeModel,
        subject: str,
        topic_id: str,
        curriculum_standards: Dict[str, any],
    ) -> Tuple[bool, List[str]]:
        """Validate that a topic can be included based on prerequisite mastery.
        
        Args:
            knowledge_model: Student's knowledge model
            subject: Subject name
            topic_id: Topic identifier to validate
            curriculum_standards: Dictionary of curriculum standards from MCP Server
            
        Returns:
            Tuple of (is_valid, missing_prerequisites)
            - is_valid: True if all prerequisites are mastered
            - missing_prerequisites: List of prerequisite topic IDs not yet mastered
        """
        # Get the curriculum standard for this topic
        if topic_id not in curriculum_standards:
            logger.warning(f"Topic {topic_id} not found in curriculum standards")
            return True, []  # Allow if not in curriculum (might be custom content)
        
        standard = curriculum_standards[topic_id]
        prerequisites = standard.get("prerequisites", [])
        
        # If no prerequisites, topic is always valid
        if not prerequisites:
            return True, []
        
        # Check if student has mastered all prerequisites
        if subject not in knowledge_model.subjects:
            # Student hasn't started this subject, so no prerequisites are mastered
            return False, prerequisites
        
        missing_prerequisites = []
        for prereq_id in prerequisites:
            # Check if prerequisite topic exists in student's knowledge model
            if prereq_id not in knowledge_model.subjects[subject].topics:
                missing_prerequisites.append(prereq_id)
                continue
            
            # Check if prerequisite is mastered (proficiency >= 0.7)
            prereq_knowledge = knowledge_model.subjects[subject].topics[prereq_id]
            if prereq_knowledge.proficiency < 0.7:
                missing_prerequisites.append(prereq_id)
        
        is_valid = len(missing_prerequisites) == 0
        return is_valid, missing_prerequisites

    def filter_topics_by_prerequisites(
        self,
        knowledge_model: KnowledgeModel,
        subject: str,
        candidate_topics: List[str],
        curriculum_standards: Dict[str, any],
    ) -> List[str]:
        """Filter a list of topics to only include those with mastered prerequisites.
        
        Args:
            knowledge_model: Student's knowledge model
            subject: Subject name
            candidate_topics: List of topic IDs to filter
            curriculum_standards: Dictionary of curriculum standards from MCP Server
            
        Returns:
            Filtered list of topic IDs that can be included
        """
        valid_topics = []
        
        for topic_id in candidate_topics:
            is_valid, _ = self.validate_curriculum_progression(
                knowledge_model, subject, topic_id, curriculum_standards
            )
            if is_valid:
                valid_topics.append(topic_id)
            else:
                logger.info(
                    f"Excluding topic {topic_id} due to unmet prerequisites"
                )
        
        return valid_topics

    def generate_study_track(
        self,
        knowledge_model: KnowledgeModel,
        subject: str,
        available_topics: List[str],
        curriculum_standards: Dict[str, any],
        weeks: int = None,
    ) -> Dict[str, any]:
        """Generate a personalized study track for a student.
        
        Generates 2-4 weeks of content based on student pace with:
        - 60% new material (topics not yet covered)
        - 30% practice (topics in progress)
        - 10% review (previously mastered topics)
        
        Args:
            knowledge_model: Student's knowledge model
            subject: Subject name
            available_topics: List of all available topic IDs from curriculum
            curriculum_standards: Dictionary of curriculum standards from MCP Server
            weeks: Number of weeks to generate (2-4), auto-calculated if None
            
        Returns:
            Dictionary with study track details
        """
        # Calculate adaptive pacing to determine number of weeks
        if weeks is None:
            pacing = self.calculate_adaptive_pacing(knowledge_model, subject)
            if pacing <= 0.5:
                weeks = 4  # Slower pace: more weeks
            elif pacing >= 1.5:
                weeks = 2  # Faster pace: fewer weeks
            else:
                weeks = 3  # Normal pace
        
        # Ensure weeks is in valid range
        weeks = max(2, min(4, weeks))
        
        # Get content mix ratios
        content_mix = self.generate_content_mix(knowledge_model, subject)
        
        # Prioritize content
        priorities = self.prioritize_content(knowledge_model, subject)
        
        # Identify new, practice, and review topics
        covered_topics = set()
        if subject in knowledge_model.subjects:
            covered_topics = set(knowledge_model.subjects[subject].topics.keys())
        
        new_topics = [t for t in available_topics if t not in covered_topics]
        practice_topics = priorities["critical_gaps"] + priorities["developing"]
        review_topics = priorities["review"]
        
        # Filter topics by prerequisites
        new_topics = self.filter_topics_by_prerequisites(
            knowledge_model, subject, new_topics, curriculum_standards
        )
        practice_topics = self.filter_topics_by_prerequisites(
            knowledge_model, subject, practice_topics, curriculum_standards
        )
        
        # Calculate total content items needed
        # Assume 2-3 content items per topic (1 lesson + 1-2 quizzes)
        items_per_week = 5  # Reasonable for offline learning
        total_items = weeks * items_per_week
        
        # Calculate items per category based on content mix
        new_count = int(total_items * content_mix["new"])
        practice_count = int(total_items * content_mix["practice"])
        review_count = int(total_items * content_mix["review"])
        
        # Adjust if we don't have enough topics in each category
        new_topics_selected = new_topics[:new_count] if len(new_topics) >= new_count else new_topics
        practice_topics_selected = practice_topics[:practice_count] if len(practice_topics) >= practice_count else practice_topics
        review_topics_selected = review_topics[:review_count] if len(review_topics) >= review_count else review_topics
        
        # If we're short on topics in one category, redistribute to others
        actual_new = len(new_topics_selected)
        actual_practice = len(practice_topics_selected)
        actual_review = len(review_topics_selected)
        
        shortage = (new_count - actual_new) + (practice_count - actual_practice) + (review_count - actual_review)
        
        if shortage > 0:
            # Try to fill shortage with available topics
            if len(new_topics) > actual_new:
                additional = min(shortage, len(new_topics) - actual_new)
                new_topics_selected.extend(new_topics[actual_new:actual_new + additional])
                shortage -= additional
            
            if shortage > 0 and len(practice_topics) > actual_practice:
                additional = min(shortage, len(practice_topics) - actual_practice)
                practice_topics_selected.extend(practice_topics[actual_practice:actual_practice + additional])
                shortage -= additional
        
        # Generate study track
        study_track = {
            "student_id": knowledge_model.student_id,
            "subject": subject,
            "duration_weeks": weeks,
            "generated_at": datetime.utcnow().isoformat(),
            "content_mix": content_mix,
            "topics": {
                "new": new_topics_selected,
                "practice": practice_topics_selected,
                "review": review_topics_selected,
            },
            "total_topics": len(new_topics_selected) + len(practice_topics_selected) + len(review_topics_selected),
            "pacing_multiplier": self.calculate_adaptive_pacing(knowledge_model, subject),
        }
        
        logger.info(
            f"Generated study track for {knowledge_model.student_id} in {subject}: "
            f"{len(new_topics_selected)} new, {len(practice_topics_selected)} practice, "
            f"{len(review_topics_selected)} review topics over {weeks} weeks"
        )
        
        return study_track

    def identify_knowledge_gaps(
        self, knowledge_model: KnowledgeModel, subject: str
    ) -> List[str]:
        """Identify topics where student needs improvement.
        
        Args:
            knowledge_model: Student's knowledge model
            subject: Subject name
            
        Returns:
            List of topic IDs with low proficiency (<0.7)
        """
        if subject not in knowledge_model.subjects:
            return []
        
        gaps = []
        for topic_id, topic_knowledge in knowledge_model.subjects[subject].topics.items():
            if topic_knowledge.proficiency < 0.7:
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

    def prioritize_content(
        self, knowledge_model: KnowledgeModel, subject: str
    ) -> Dict[str, List[str]]:
        """Prioritize content based on student proficiency and practice history.
        
        Implements the priority algorithm from the design document:
        1. Critical Gaps (proficiency <0.5): Highest priority
        2. Developing Topics (proficiency 0.5-0.7): Medium priority
        3. Mastery Advancement (proficiency >0.8): Progress to next level
        4. Review Topics (proficiency >0.7, not practiced in 2 weeks): Low priority
        
        Args:
            knowledge_model: Student's knowledge model
            subject: Subject name
            
        Returns:
            Dictionary with priority categories and topic IDs
        """
        if subject not in knowledge_model.subjects:
            return {
                "critical_gaps": [],
                "developing": [],
                "mastery_advancement": [],
                "review": [],
            }
        
        critical_gaps = []
        developing = []
        mastery_advancement = []
        review = []
        
        two_weeks_ago = datetime.utcnow() - timedelta(weeks=2)
        
        for topic_id, topic_knowledge in knowledge_model.subjects[subject].topics.items():
            proficiency = topic_knowledge.proficiency
            last_practiced = topic_knowledge.last_practiced
            
            # Critical gaps: proficiency <0.5
            if proficiency < 0.5:
                critical_gaps.append(topic_id)
            # Developing topics: proficiency 0.5-0.7
            elif proficiency < 0.7:
                developing.append(topic_id)
            # Mastery advancement: proficiency >0.8
            elif proficiency > 0.8:
                mastery_advancement.append(topic_id)
            # Review topics: proficiency >0.7, not practiced in 2 weeks
            elif proficiency > 0.7 and last_practiced and last_practiced < two_weeks_ago:
                review.append(topic_id)
        
        # Sort each category by proficiency (lowest first for gaps, highest first for mastery)
        critical_gaps.sort(
            key=lambda t: knowledge_model.subjects[subject].topics[t].proficiency
        )
        developing.sort(
            key=lambda t: knowledge_model.subjects[subject].topics[t].proficiency
        )
        mastery_advancement.sort(
            key=lambda t: knowledge_model.subjects[subject].topics[t].proficiency,
            reverse=True
        )
        review.sort(
            key=lambda t: knowledge_model.subjects[subject].topics[t].last_practiced or datetime.min
        )
        
        return {
            "critical_gaps": critical_gaps,
            "developing": developing,
            "mastery_advancement": mastery_advancement,
            "review": review,
        }
