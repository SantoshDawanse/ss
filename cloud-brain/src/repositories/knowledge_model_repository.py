"""Repository for student knowledge model persistence in DynamoDB."""

import json
import logging
import os
from datetime import datetime
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from src.models.personalization import KnowledgeModel, SubjectKnowledge, TopicMastery, MasteryLevel

logger = logging.getLogger(__name__)


class KnowledgeModelRepository:
    """Repository for managing student knowledge models in DynamoDB."""

    def __init__(self, table_name: str = None):
        """Initialize the repository.
        
        Args:
            table_name: DynamoDB table name for student data (defaults to STUDENTS_TABLE env var)
        """
        if table_name is None:
            table_name = os.environ.get('STUDENTS_TABLE', 'sikshya-sathi-students-development')
        self.table_name = table_name
        try:
            dynamodb = boto3.resource("dynamodb")
            self.table = dynamodb.Table(table_name)
        except Exception as e:
            logger.error(f"Failed to initialize DynamoDB table: {e}")
            self.table = None

    def get_knowledge_model(self, student_id: str) -> Optional[KnowledgeModel]:
        """Retrieve knowledge model for a student.
        
        Args:
            student_id: Student identifier
            
        Returns:
            KnowledgeModel if found, None otherwise
        """
        if not self.table:
            logger.error("DynamoDB table not initialized")
            return None

        try:
            response = self.table.get_item(Key={"studentId": student_id})
            
            if "Item" not in response:
                logger.info(f"No knowledge model found for student {student_id}")
                return None
            
            item = response["Item"]
            
            # Parse the knowledge model from DynamoDB item
            subjects = {}
            if "subjects" in item:
                subjects_data = json.loads(item["subjects"]) if isinstance(item["subjects"], str) else item["subjects"]
                for subject_name, subject_data in subjects_data.items():
                    topics = {}
                    for topic_id, topic_data in subject_data.get("topics", {}).items():
                        topics[topic_id] = TopicMastery(
                            proficiency=topic_data["proficiency"],
                            attempts=topic_data["attempts"],
                            last_practiced=datetime.fromisoformat(topic_data["last_practiced"]) if topic_data.get("last_practiced") else None,
                            mastery_level=MasteryLevel(topic_data["mastery_level"]),
                            cognitive_level=topic_data["cognitive_level"]
                        )
                    
                    subjects[subject_name] = SubjectKnowledge(
                        topics=topics,
                        overall_proficiency=subject_data.get("overall_proficiency", 0.0),
                        learning_velocity=subject_data.get("learning_velocity", 0.0)
                    )
            
            knowledge_model = KnowledgeModel(
                student_id=student_id,
                last_updated=datetime.fromisoformat(item.get("lastUpdated", datetime.utcnow().isoformat())),
                subjects=subjects
            )
            
            return knowledge_model
            
        except ClientError as e:
            logger.error(f"DynamoDB error retrieving knowledge model: {e}")
            return None
        except Exception as e:
            logger.error(f"Error parsing knowledge model: {e}")
            return None

    def save_knowledge_model(self, knowledge_model: KnowledgeModel) -> bool:
        """Save or update knowledge model for a student.
        
        Args:
            knowledge_model: Knowledge model to save
            
        Returns:
            True if successful, False otherwise
        """
        if not self.table:
            logger.error("DynamoDB table not initialized")
            return False

        try:
            # Convert knowledge model to DynamoDB item
            subjects_data = {}
            for subject_name, subject_knowledge in knowledge_model.subjects.items():
                topics_data = {}
                for topic_id, topic_knowledge in subject_knowledge.topics.items():
                    topics_data[topic_id] = {
                        "proficiency": topic_knowledge.proficiency,
                        "attempts": topic_knowledge.attempts,
                        "last_practiced": topic_knowledge.last_practiced.isoformat() if topic_knowledge.last_practiced else None,
                        "mastery_level": topic_knowledge.mastery_level.value,
                        "cognitive_level": topic_knowledge.cognitive_level
                    }
                
                subjects_data[subject_name] = {
                    "topics": topics_data,
                    "overall_proficiency": subject_knowledge.overall_proficiency,
                    "learning_velocity": subject_knowledge.learning_velocity
                }
            
            item = {
                "studentId": knowledge_model.student_id,
                "lastUpdated": knowledge_model.last_updated.isoformat(),
                "subjects": json.dumps(subjects_data)
            }
            
            self.table.put_item(Item=item)
            logger.info(f"Successfully saved knowledge model for student {knowledge_model.student_id}")
            return True
            
        except ClientError as e:
            logger.error(f"DynamoDB error saving knowledge model: {e}")
            return False
        except Exception as e:
            logger.error(f"Error saving knowledge model: {e}")
            return False

    def create_initial_knowledge_model(self, student_id: str) -> KnowledgeModel:
        """Create an initial empty knowledge model for a new student.
        
        Args:
            student_id: Student identifier
            
        Returns:
            New KnowledgeModel instance
        """
        knowledge_model = KnowledgeModel(
            student_id=student_id,
            last_updated=datetime.utcnow(),
            subjects={}
        )
        
        self.save_knowledge_model(knowledge_model)
        return knowledge_model

    def update_topic_knowledge(
        self,
        student_id: str,
        subject: str,
        topic_id: str,
        proficiency: float,
        mastery_level: MasteryLevel,
        cognitive_level: int
    ) -> bool:
        """Update knowledge for a specific topic.
        
        Args:
            student_id: Student identifier
            subject: Subject name
            topic_id: Topic identifier
            proficiency: New proficiency score (0-1)
            mastery_level: New mastery level
            cognitive_level: Bloom's taxonomy level (1-6)
            
        Returns:
            True if successful, False otherwise
        """
        knowledge_model = self.get_knowledge_model(student_id)
        
        if not knowledge_model:
            knowledge_model = self.create_initial_knowledge_model(student_id)
        
        # Ensure subject exists
        if subject not in knowledge_model.subjects:
            knowledge_model.subjects[subject] = SubjectKnowledge()
        
        # Update or create topic knowledge
        if topic_id in knowledge_model.subjects[subject].topics:
            topic = knowledge_model.subjects[subject].topics[topic_id]
            topic.proficiency = proficiency
            topic.attempts += 1
            topic.last_practiced = datetime.utcnow()
            topic.mastery_level = mastery_level
            topic.cognitive_level = cognitive_level
        else:
            knowledge_model.subjects[subject].topics[topic_id] = TopicMastery(
                proficiency=proficiency,
                attempts=1,
                last_practiced=datetime.utcnow(),
                mastery_level=mastery_level,
                cognitive_level=cognitive_level
            )
        
        # Update overall subject proficiency
        topics = knowledge_model.subjects[subject].topics
        if topics:
            knowledge_model.subjects[subject].overall_proficiency = sum(
                t.proficiency for t in topics.values()
            ) / len(topics)
        
        knowledge_model.last_updated = datetime.utcnow()
        
        return self.save_knowledge_model(knowledge_model)
