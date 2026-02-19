# Bedrock Agent Setup Guide

This guide explains how to configure and deploy the Amazon Bedrock Agent for the Sikshya-Sathi Cloud Brain.

## Overview

The Bedrock Agent is the AI-powered content generation engine that creates personalized educational materials for students. It uses Claude 3.5 Sonnet as the foundation model and implements five action groups for different content types.

## Prerequisites

1. AWS account with Bedrock access enabled
2. CDK stack deployed (provides IAM role)
3. AWS CLI configured with appropriate credentials
4. Python 3.11+ with boto3 installed

## Architecture

```
Bedrock Agent (Claude 3.5 Sonnet)
├── Action Groups
│   ├── GenerateLesson
│   ├── GenerateQuiz
│   ├── GenerateHints
│   ├── GenerateRevisionPlan
│   └── GenerateStudyTrack
├── Knowledge Base (Pedagogical best practices)
└── MCP Server Integration (Curriculum data)
```

## Setup Steps

### 1. Deploy CDK Infrastructure

First, deploy the CDK stack to create the IAM role and other resources:

```bash
cd cloud-brain/infrastructure
cdk deploy --context environment=dev
```

This creates:
- IAM role for Bedrock Agent
- DynamoDB tables
- S3 bucket for bundles
- Lambda functions
- API Gateway

### 2. Run Bedrock Agent Setup Script

```bash
cd cloud-brain
python scripts/setup_bedrock_agent.py --environment dev
```

This script will:
1. Retrieve the IAM role ARN from CloudFormation exports
2. Create the Bedrock Agent with Claude 3.5 Sonnet
3. Configure the agent with educational content instructions
4. Create all five action groups
5. Prepare the agent for use
6. Create an agent alias for the environment
7. Save configuration to `.bedrock-agent-{environment}.json`

### 3. Verify Setup

Check that the agent was created successfully:

```bash
aws bedrock-agent list-agents --region us-east-1
```

You should see an agent named `sikshya-sathi-content-generator-{environment}`.

### 4. Configure Environment Variables

Add the agent ID and alias ID to your Lambda environment variables:

```bash
# Get values from .bedrock-agent-dev.json
export BEDROCK_AGENT_ID="<agent-id>"
export BEDROCK_AGENT_ALIAS_ID="<alias-id>"
```

Or update the CDK stack to include these values.

## Action Groups

### 1. GenerateLesson

Generates personalized lesson content aligned with curriculum standards.

**Input:**
- topic: Topic name
- subject: Subject area (Mathematics, Science, etc.)
- grade: Grade level (6-8)
- difficulty: easy, medium, or hard
- student_context: Student performance data
- curriculum_standards: Target standard IDs

**Output:** Lesson object with sections (explanation, examples, practice)

### 2. GenerateQuiz

Creates assessment quizzes with questions and answers.

**Input:**
- topic: Topic name
- subject: Subject area
- grade: Grade level (6-8)
- difficulty: easy, medium, or hard
- question_count: Number of questions (5-10)
- learning_objectives: Target objectives

**Output:** Quiz object with questions, options, answers, explanations

### 3. GenerateHints

Generates progressive hints for quiz questions.

**Input:**
- question: Question text
- correct_answer: Correct answer
- student_error_patterns: Common errors (optional)

**Output:** List of 3 hints (general → specific)

### 4. GenerateRevisionPlan

Creates personalized revision plans based on knowledge gaps.

**Input:**
- student_id: Student identifier
- knowledge_gaps: Topic IDs with gaps
- time_available: Available hours
- subject: Subject area

**Output:** RevisionPlan with prioritized topics and content references

### 5. GenerateStudyTrack

Generates multi-week personalized study tracks.

**Input:**
- student_id: Student identifier
- knowledge_model: Current knowledge state
- learning_velocity: Topics per week
- curriculum_scope: Topics to cover
- weeks: Number of weeks

**Output:** StudyTrack with weekly plans

## Agent Instructions

The agent is configured with comprehensive instructions covering:

1. **Content Generation Guidelines**
   - Curriculum alignment requirements
   - Cultural appropriateness for Nepal
   - Age-appropriate language
   - Pedagogical best practices

2. **Personalization Strategy**
   - Adaptive difficulty based on performance
   - Pacing adjustments for learning velocity
   - Content mix (60% new, 30% practice, 10% review)

3. **Cultural Context**
   - Nepali examples and contexts
   - Devanagari script support
   - Metric system and NPR currency
   - Local geography and culture

4. **Quality Standards**
   - 100% curriculum alignment
   - Safety and content filtering
   - Technical constraints for offline delivery

## MCP Server Integration

The Bedrock Agent integrates with the MCP Server to access Nepal K-12 curriculum data:

```python
# Agent can call MCP tools:
- get_curriculum_standards(grade, subject)
- get_topic_details(topic_id)
- validate_content_alignment(content, standards)
- get_learning_progression(subject, grade_range)
```

This ensures all generated content is aligned with official curriculum standards.

## Knowledge Base (Optional)

To add pedagogical best practices:

1. Create a Bedrock Knowledge Base
2. Upload curriculum documents and pedagogy guides
3. Associate the knowledge base with the agent
4. Update the agent to use RAG for enhanced content generation

```bash
aws bedrock-agent create-knowledge-base \
  --name sikshya-sathi-pedagogy-kb \
  --description "Pedagogical best practices" \
  --role-arn <role-arn>
```

## Testing the Agent

Test the agent using the BedrockAgentService:

```python
from services.bedrock_agent import BedrockAgentService

# Initialize service
agent = BedrockAgentService(
    agent_id="<agent-id>",
    agent_alias_id="<alias-id>",
    region="us-east-1"
)

# Generate a lesson
lesson = agent.generate_lesson(
    topic="Fractions",
    subject="Mathematics",
    grade=6,
    difficulty="easy",
    student_context={"proficiency": 0.6},
    curriculum_standards=["MATH-6-NUM-1"]
)

print(lesson.title)
print(lesson.sections)
```

## Monitoring

Monitor agent performance in CloudWatch:

1. **Metrics:**
   - Invocation count
   - Latency (p50, p95, p99)
   - Error rate
   - Token usage

2. **Logs:**
   - Agent invocations
   - Action group executions
   - Errors and exceptions

3. **Alarms:**
   - High error rate (> 5%)
   - High latency (> 30s)
   - Token limit exceeded

## Cost Optimization

1. **Caching:** Cache curriculum data to reduce MCP calls
2. **Batching:** Batch content generation requests
3. **Monitoring:** Track token usage and optimize prompts
4. **Limits:** Set quotas for agent invocations

## Troubleshooting

### Agent Creation Fails

**Error:** "Role ARN not found"
**Solution:** Deploy CDK stack first to create the IAM role

### Action Group Creation Fails

**Error:** "Lambda function not found"
**Solution:** Ensure Lambda function is deployed and ARN is correct

### Agent Returns Empty Response

**Error:** Agent invocation succeeds but returns empty
**Solution:** Check agent logs in CloudWatch, verify action group configuration

### Permission Denied

**Error:** "User is not authorized to perform bedrock:InvokeModel"
**Solution:** Add Bedrock permissions to IAM role

## Environment-Specific Configuration

### Development
- Agent name: `sikshya-sathi-content-generator-dev`
- Alias: `dev-alias`
- Logging: DEBUG level
- Cost: Minimal (low usage)

### Staging
- Agent name: `sikshya-sathi-content-generator-staging`
- Alias: `staging-alias`
- Logging: INFO level
- Testing: Full integration tests

### Production
- Agent name: `sikshya-sathi-content-generator-production`
- Alias: `production-alias`
- Logging: WARN level
- Monitoring: Full CloudWatch alarms
- Cost: Optimized with caching

## Next Steps

After setting up the Bedrock Agent:

1. Implement action group Lambda handlers (Task 4.2)
2. Integrate with MCP Server (Task 4.3)
3. Test content generation pipeline
4. Implement validation and safety filtering
5. Deploy to staging for testing

## References

- [Amazon Bedrock Agent Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [Claude 3.5 Sonnet Model Card](https://www.anthropic.com/claude)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- Nepal K-12 Curriculum Standards (see MCP Server data)
