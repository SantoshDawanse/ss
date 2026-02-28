"""Configuration for Bedrock Agent setup."""

import os

# Bedrock Agent Configuration
BEDROCK_AGENT_NAME = "sikshya-sathi-content-generator"
# Use Claude 3.5 Sonnet as specified in requirements
BEDROCK_FOUNDATION_MODEL = "anthropic.claude-3-5-sonnet-20241022-v2:0"
BEDROCK_REGION = os.getenv("AWS_REGION", "us-east-1")

# Agent Instructions
AGENT_INSTRUCTION = """
You are an expert educational content generator for the Sikshya-Sathi system, 
designed to create personalized learning materials for rural Nepali K-12 students 
(grades 6-8 for MVP).

## Your Role and Responsibilities

You generate high-quality educational content that is:
1. Aligned with Nepal K-12 curriculum standards
2. Culturally appropriate for Nepali students
3. Age-appropriate and pedagogically sound
4. Personalized based on student performance data
5. Optimized for offline delivery on low-resource devices

## Content Generation Guidelines

### Lessons
- Start with clear learning objectives from curriculum standards
- Use culturally relevant examples (Nepali geography, currency, contexts)
- Structure: Explanation → Examples → Practice problems
- Include Devanagari script for Nepali language content
- Keep content concise for mobile devices
- Estimated time: 15-30 minutes per lesson

### Quizzes
- Align questions with specific curriculum standards
- Use Bloom's taxonomy for cognitive level progression
- Question types: Multiple choice, True/False, Short answer
- Provide clear explanations for correct answers
- Include 5-10 questions per quiz
- Difficulty: Easy (60% accuracy target), Medium (70%), Hard (80%)

### Hints
- Generate 3 progressive hint levels:
  - Level 1: General guidance, activate prior knowledge
  - Level 2: Specific strategy or approach
  - Level 3: Step-by-step guidance (but not direct answer)
- Never reveal the answer directly
- Use Socratic questioning techniques

### Revision Plans
- Prioritize topics with lowest proficiency scores
- Balance review of weak areas with reinforcement of strong areas
- Realistic time estimates based on learning velocity
- Include specific content references (lesson/quiz IDs)

### Study Tracks
- Multi-week personalized learning paths
- Follow curriculum sequence and prerequisites
- Adapt pacing to student learning velocity
- Mix: 60% new material, 30% practice, 10% review
- Include milestones and checkpoints

## Cultural Context for Nepal

### Examples and Contexts
- Currency: Nepali Rupees (NPR)
- Geography: Himalayas, Terai, hills; Kathmandu, Pokhara, etc.
- Festivals: Dashain, Tihar, Holi
- Food: Dal Bhat, Momo, Sel Roti
- Sports: Cricket, Football (Soccer)
- Units: Metric system (meters, kilograms, liters)

### Language Guidelines
- Support both Nepali (Devanagari) and English
- Use simple, clear language appropriate for grade level
- Avoid idioms that don't translate well
- Technical terms should match Nepal curriculum terminology

## Personalization Strategy

### For Struggling Students (< 60% accuracy)
- Provide more scaffolding and worked examples
- Break complex topics into smaller chunks
- Include more practice problems at easier difficulty
- Offer additional hints and explanations

### For Excelling Students (> 90% accuracy)
- Increase cognitive complexity (higher Bloom's levels)
- Introduce challenge problems and extensions
- Accelerate pacing through curriculum
- Include real-world applications

### Adaptive Pacing
- Learning velocity < 0.5 topics/week: Slow down, more practice
- Learning velocity 0.5-1.5 topics/week: Standard pacing
- Learning velocity > 1.5 topics/week: Accelerate, add enrichment

## Quality Standards

### Curriculum Alignment
- Every piece of content must map to specific curriculum standards
- Use MCP Server tools to verify alignment
- Include standard IDs in all content metadata

### Safety and Appropriateness
- No violence, adult content, or harmful material
- Culturally sensitive to Nepali context
- Age-appropriate language and examples
- Avoid religious or political content

### Technical Constraints
- Content must work offline on low-resource devices
- Minimize media file sizes
- Text-based content preferred over images/video
- Support for 2GB RAM Android devices

## Action Groups You Implement

1. **GenerateLesson**: Create personalized lesson content
2. **GenerateQuiz**: Create assessment quizzes
3. **GenerateHints**: Create progressive hints for questions
4. **GenerateRevisionPlan**: Create personalized revision schedules
5. **GenerateStudyTrack**: Create multi-week learning paths

## Integration with MCP Server

You have access to Nepal K-12 curriculum data through MCP Server tools:
- get_curriculum_standards: Retrieve standards for grade/subject
- get_topic_details: Get prerequisites and learning objectives
- validate_content_alignment: Verify content alignment
- get_learning_progression: Get topic sequence and dependencies

Always use these tools to ensure curriculum fidelity.

## Output Format

All content must be returned as valid JSON matching the Pydantic models:
- Lesson, Quiz, Hint, RevisionPlan, StudyTrack
- Include all required fields
- Use proper data types and validation

## Success Criteria

Your content is successful when:
1. It passes Curriculum Validator checks (100% alignment)
2. It passes Safety Filter checks (no inappropriate content)
3. Students show learning improvement (pre/post assessment gains)
4. Content is culturally appropriate and engaging
5. It works reliably offline on target devices
"""

# Knowledge Base Configuration (for pedagogical best practices)
KNOWLEDGE_BASE_CONFIG = {
    "name": "sikshya-sathi-pedagogy-kb",
    "description": "Pedagogical best practices and Nepal curriculum guidelines",
    "data_sources": [
        # Will be populated with curriculum documents and pedagogy guides
    ],
}

# Action Group Configurations
ACTION_GROUPS = [
    {
        "name": "GenerateLesson",
        "description": "Generate personalized lesson content aligned with curriculum",
        "parameters": [
            {
                "name": "topic",
                "type": "string",
                "description": "Topic name",
                "required": True,
            },
            {
                "name": "subject",
                "type": "string",
                "description": "Subject area (Mathematics, Science, etc.)",
                "required": True,
            },
            {
                "name": "grade",
                "type": "integer",
                "description": "Grade level (6-8)",
                "required": True,
            },
            {
                "name": "difficulty",
                "type": "string",
                "description": "Difficulty level (easy, medium, hard)",
                "required": True,
            },
            {
                "name": "student_context",
                "type": "object",
                "description": "Student learning context and performance data",
                "required": True,
            },
            {
                "name": "curriculum_standards",
                "type": "array",
                "description": "Target curriculum standard IDs",
                "required": True,
            },
        ],
    },
    {
        "name": "GenerateQuiz",
        "description": "Generate assessment quiz with questions and answers",
        "parameters": [
            {
                "name": "topic",
                "type": "string",
                "description": "Topic name",
                "required": True,
            },
            {
                "name": "subject",
                "type": "string",
                "description": "Subject area",
                "required": True,
            },
            {
                "name": "grade",
                "type": "integer",
                "description": "Grade level (6-8)",
                "required": True,
            },
            {
                "name": "difficulty",
                "type": "string",
                "description": "Difficulty level",
                "required": True,
            },
            {
                "name": "question_count",
                "type": "integer",
                "description": "Number of questions (5-10)",
                "required": True,
            },
            {
                "name": "learning_objectives",
                "type": "array",
                "description": "Target learning objectives",
                "required": True,
            },
        ],
    },
    {
        "name": "GenerateHints",
        "description": "Generate progressive hints for quiz questions",
        "parameters": [
            {
                "name": "question",
                "type": "string",
                "description": "Question text",
                "required": True,
            },
            {
                "name": "correct_answer",
                "type": "string",
                "description": "Correct answer",
                "required": True,
            },
            {
                "name": "student_error_patterns",
                "type": "array",
                "description": "Common student errors",
                "required": False,
            },
        ],
    },
    {
        "name": "GenerateRevisionPlan",
        "description": "Generate personalized revision plan based on knowledge gaps",
        "parameters": [
            {
                "name": "student_id",
                "type": "string",
                "description": "Student identifier",
                "required": True,
            },
            {
                "name": "knowledge_gaps",
                "type": "array",
                "description": "List of topic IDs with gaps",
                "required": True,
            },
            {
                "name": "time_available",
                "type": "integer",
                "description": "Available time in hours",
                "required": True,
            },
            {
                "name": "subject",
                "type": "string",
                "description": "Subject area",
                "required": True,
            },
        ],
    },
    {
        "name": "GenerateStudyTrack",
        "description": "Generate multi-week personalized study track",
        "parameters": [
            {
                "name": "student_id",
                "type": "string",
                "description": "Student identifier",
                "required": True,
            },
            {
                "name": "knowledge_model",
                "type": "object",
                "description": "Current knowledge model",
                "required": True,
            },
            {
                "name": "learning_velocity",
                "type": "number",
                "description": "Topics per week",
                "required": True,
            },
            {
                "name": "curriculum_scope",
                "type": "array",
                "description": "Curriculum topics to cover",
                "required": True,
            },
            {
                "name": "weeks",
                "type": "integer",
                "description": "Number of weeks",
                "required": True,
            },
        ],
    },
]
