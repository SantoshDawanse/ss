#!/usr/bin/env python3
"""Seed sample data into DynamoDB for development and testing."""

import boto3
import json
from datetime import datetime, timedelta
from decimal import Decimal

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
students_table = dynamodb.Table('sikshya-sathi-students-development')

# Sample students data matching the mock data
sample_students = [
    {
        'studentId': 'S001',
        'studentName': 'Aisha Sharma',
        'grade': 5,
        'classId': 'CLASS001',
        'className': 'Grade 5A',
        'educatorId': 'EDU001',
        'knowledgeModel': {
            'lastUpdated': datetime.now().isoformat(),
            'subjects': {
                'Mathematics': {
                    'topics': {
                        'Basic Arithmetic': {
                            'proficiency': Decimal('0.95'),
                            'attempts': 20,
                            'lastPracticed': (datetime.now() - timedelta(days=2)).isoformat(),
                            'masteryLevel': 'advanced',
                            'cognitiveLevel': 4
                        },
                        'Geometry': {
                            'proficiency': Decimal('0.90'),
                            'attempts': 15,
                            'lastPracticed': (datetime.now() - timedelta(days=1)).isoformat(),
                            'masteryLevel': 'proficient',
                            'cognitiveLevel': 3
                        },
                        'Algebra': {
                            'proficiency': Decimal('0.75'),
                            'attempts': 10,
                            'lastPracticed': datetime.now().isoformat(),
                            'masteryLevel': 'developing',
                            'cognitiveLevel': 3
                        }
                    },
                    'overallProficiency': Decimal('0.855'),
                    'learningVelocity': Decimal('2.5')
                }
            }
        },
        'performanceSummary': {
            'Mathematics': {
                'lessonsCompleted': 15,
                'quizzesCompleted': 10,
                'averageAccuracy': Decimal('0.855'),
                'totalTimeSpent': 3600,
                'currentStreak': 5,
                'topicsInProgress': ['Algebra'],
                'topicsMastered': ['Basic Arithmetic', 'Geometry'],
                'lastActive': '2024-02-20T10:30:00Z'
            }
        }
    },
    {
        'studentId': 'S002',
        'studentName': 'Bikram Thapa',
        'grade': 5,
        'classId': 'CLASS001',
        'className': 'Grade 5A',
        'educatorId': 'EDU001',
        'knowledgeModel': {
            'lastUpdated': datetime.now().isoformat(),
            'subjects': {
                'Mathematics': {
                    'topics': {
                        'Basic Arithmetic': {
                            'proficiency': Decimal('0.80'),
                            'attempts': 18,
                            'lastPracticed': (datetime.now() - timedelta(days=1)).isoformat(),
                            'masteryLevel': 'proficient',
                            'cognitiveLevel': 3
                        },
                        'Fractions': {
                            'proficiency': Decimal('0.65'),
                            'attempts': 12,
                            'lastPracticed': datetime.now().isoformat(),
                            'masteryLevel': 'developing',
                            'cognitiveLevel': 2
                        },
                        'Decimals': {
                            'proficiency': Decimal('0.70'),
                            'attempts': 10,
                            'lastPracticed': datetime.now().isoformat(),
                            'masteryLevel': 'developing',
                            'cognitiveLevel': 2
                        }
                    },
                    'overallProficiency': Decimal('0.72'),
                    'learningVelocity': Decimal('2.0')
                }
            }
        },
        'performanceSummary': {
            'Mathematics': {
                'lessonsCompleted': 12,
                'quizzesCompleted': 8,
                'averageAccuracy': Decimal('0.72'),
                'totalTimeSpent': 2800,
                'currentStreak': 3,
                'topicsInProgress': ['Fractions', 'Decimals'],
                'topicsMastered': ['Basic Arithmetic'],
                'lastActive': '2024-02-21T14:15:00Z'
            }
        }
    },
    {
        'studentId': 'S003',
        'studentName': 'Chandani Rai',
        'grade': 5,
        'classId': 'CLASS001',
        'className': 'Grade 5A',
        'educatorId': 'EDU001',
        'knowledgeModel': {
            'lastUpdated': datetime.now().isoformat(),
            'subjects': {
                'Science': {
                    'topics': {
                        'Biology': {
                            'proficiency': Decimal('0.95'),
                            'attempts': 20,
                            'lastPracticed': (datetime.now() - timedelta(days=3)).isoformat(),
                            'masteryLevel': 'advanced',
                            'cognitiveLevel': 4
                        },
                        'Chemistry Basics': {
                            'proficiency': Decimal('0.90'),
                            'attempts': 18,
                            'lastPracticed': (datetime.now() - timedelta(days=2)).isoformat(),
                            'masteryLevel': 'proficient',
                            'cognitiveLevel': 3
                        },
                        'Physics': {
                            'proficiency': Decimal('0.85'),
                            'attempts': 15,
                            'lastPracticed': datetime.now().isoformat(),
                            'masteryLevel': 'proficient',
                            'cognitiveLevel': 3
                        }
                    },
                    'overallProficiency': Decimal('0.91'),
                    'learningVelocity': Decimal('3.0')
                }
            }
        },
        'performanceSummary': {
            'Science': {
                'lessonsCompleted': 18,
                'quizzesCompleted': 12,
                'averageAccuracy': Decimal('0.91'),
                'totalTimeSpent': 4200,
                'currentStreak': 7,
                'topicsInProgress': ['Physics'],
                'topicsMastered': ['Biology', 'Chemistry Basics'],
                'lastActive': '2024-02-22T09:00:00Z'
            }
        }
    },
    {
        'studentId': 'S004',
        'studentName': 'Deepak Gurung',
        'grade': 5,
        'classId': 'CLASS001',
        'className': 'Grade 5A',
        'educatorId': 'EDU001',
        'knowledgeModel': {
            'lastUpdated': datetime.now().isoformat(),
            'subjects': {
                'Mathematics': {
                    'topics': {
                        'Basic Arithmetic': {
                            'proficiency': Decimal('0.58'),
                            'attempts': 15,
                            'lastPracticed': datetime.now().isoformat(),
                            'masteryLevel': 'developing',
                            'cognitiveLevel': 2
                        }
                    },
                    'overallProficiency': Decimal('0.58'),
                    'learningVelocity': Decimal('1.5')
                }
            }
        },
        'performanceSummary': {
            'Mathematics': {
                'lessonsCompleted': 8,
                'quizzesCompleted': 5,
                'averageAccuracy': Decimal('0.58'),
                'totalTimeSpent': 1800,
                'currentStreak': 2,
                'topicsInProgress': ['Basic Arithmetic'],
                'topicsMastered': [],
                'lastActive': '2024-02-19T16:45:00Z'
            }
        }
    },
    {
        'studentId': 'S005',
        'studentName': 'Elina Tamang',
        'grade': 5,
        'classId': 'CLASS001',
        'className': 'Grade 5A',
        'educatorId': 'EDU001',
        'knowledgeModel': {
            'lastUpdated': datetime.now().isoformat(),
            'subjects': {
                'English': {
                    'topics': {
                        'Vocabulary': {
                            'proficiency': Decimal('0.92'),
                            'attempts': 22,
                            'lastPracticed': (datetime.now() - timedelta(days=2)).isoformat(),
                            'masteryLevel': 'advanced',
                            'cognitiveLevel': 4
                        },
                        'Reading Comprehension': {
                            'proficiency': Decimal('0.88'),
                            'attempts': 20,
                            'lastPracticed': (datetime.now() - timedelta(days=1)).isoformat(),
                            'masteryLevel': 'proficient',
                            'cognitiveLevel': 4
                        },
                        'Grammar': {
                            'proficiency': Decimal('0.82'),
                            'attempts': 18,
                            'lastPracticed': datetime.now().isoformat(),
                            'masteryLevel': 'proficient',
                            'cognitiveLevel': 3
                        }
                    },
                    'overallProficiency': Decimal('0.88'),
                    'learningVelocity': Decimal('2.8')
                }
            }
        },
        'performanceSummary': {
            'English': {
                'lessonsCompleted': 20,
                'quizzesCompleted': 15,
                'averageAccuracy': Decimal('0.88'),
                'totalTimeSpent': 5000,
                'currentStreak': 10,
                'topicsInProgress': ['Grammar'],
                'topicsMastered': ['Vocabulary', 'Reading Comprehension'],
                'lastActive': '2024-02-22T11:20:00Z'
            }
        }
    }
]

def seed_data():
    """Seed sample data into DynamoDB."""
    print("Seeding sample data into DynamoDB...")
    
    for student in sample_students:
        try:
            students_table.put_item(Item=student)
            print(f"✓ Added student: {student['studentName']} ({student['studentId']})")
        except Exception as e:
            print(f"✗ Error adding student {student['studentId']}: {e}")
    
    print("\nSample data seeding complete!")
    print(f"Total students added: {len(sample_students)}")

if __name__ == '__main__':
    seed_data()
