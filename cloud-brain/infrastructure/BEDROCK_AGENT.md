# Bedrock Agent Configuration

## Overview

The Sikshya-Sathi Cloud Brain uses Amazon Bedrock Agent with Claude 3.5 Sonnet to generate curriculum-aligned educational content for rural Nepali K-12 students (grades 6-8).

## Agent Configuration

### Foundation Model
- **Model**: `us.anthropic.claude-3-5-sonnet-20241022-v2:0` (Cross-region inference profile)
- **Provider**: Anthropic Claude 3.5 Sonnet
- **Note**: Uses inference profile for better availability and performance across regions

### Agent Instructions

The agent is configured with specific instructions for generating personalized learning materials:

1. **Generate lessons** aligned with Nepal K-12 curriculum standards
2. **Create quizzes** assessing understanding at appropriate Bloom's taxonomy levels
3. **Provide progressive hints** guiding students without revealing answers
4. **Use culturally appropriate examples** relevant to Nepal
5. **Ensure age-appropriate language** and complexity
6. **Support both Nepali and English** languages
7. **Incorporate metric system and Nepali currency (NPR)** in examples

### Content Structure Requirements

**Lessons:**
- Include explanation, example, and practice sections
- Reference curriculum standard IDs

**Quizzes:**
- Mix question types (multiple-choice, true/false, short-answer)
- Reference curriculum standard IDs

## MCP Action Group

The Bedrock Agent connects to the MCP Server Lambda through an action group that exposes four curriculum tools:

### 1. get_curriculum_standards
Query curriculum standards by grade and subject.

**Parameters:**
- `grade` (integer, 6-8): Grade level
- `subject` (string): Subject name (Mathematics, Science, Social Studies)

**Returns:**
- List of curriculum standards with learning objectives, prerequisites, Bloom level, and estimated hours

### 2. get_topic_details
Get detailed information about a specific curriculum topic.

**Parameters:**
- `topic_id` (string): Unique topic identifier (e.g., "MATH-6-001")

**Returns:**
- Topic details including assessment criteria, subtopics, and resources

### 3. validate_content_alignment
Validate generated content alignment with curriculum standards.

**Parameters:**
- `content` (string): Generated lesson or quiz content
- `target_standards` (array of strings): List of target standard IDs

**Returns:**
- Alignment score (0-1)
- Matched standards
- Gaps (missing coverage)
- Recommendations for improvement

### 4. get_learning_progression
Get learning progression showing topic sequence and dependencies.

**Parameters:**
- `subject` (string): Subject name
- `grade_start` (integer, 6-8): Starting grade
- `grade_end` (integer, 6-8): Ending grade

**Returns:**
- Topic sequence
- Dependencies
- Difficulty progression

## IAM Permissions

The Bedrock Agent role has the following permissions:

1. **Bedrock Model Invocation**
   - `bedrock:InvokeModel`
   - `bedrock:InvokeModelWithResponseStream`
   - Access to foundation models and cross-region inference profiles

2. **AWS Marketplace** (for inference profiles)
   - `aws-marketplace:ViewSubscriptions`
   - `aws-marketplace:Subscribe`

3. **Knowledge Base Access**
   - `bedrock:Retrieve`
   - `bedrock:RetrieveAndGenerate`

4. **Lambda Invocation** (for MCP Server)
   - Permission to invoke the MCP Server Lambda function

## Deployment

The Bedrock Agent is deployed as part of the CDK stack:

```bash
cd cloud-brain/infrastructure
cdk deploy SikshyaSathiCloudBrain-development
```

## Outputs

After deployment, the following outputs are available:

- **BedrockAgentId**: Agent ID for invoking the agent
- **BedrockAgentArn**: Agent ARN for IAM policies
- **BedrockAgentRoleArn**: IAM role ARN used by the agent
- **MCPServerLambdaArn**: Lambda function ARN for the MCP Server

## Usage

The Bedrock Agent is invoked by the content generation Lambda function during sync operations:

1. Student uploads performance logs
2. Personalization engine analyzes gaps and selects topics
3. Content generation handler invokes Bedrock Agent
4. Agent queries MCP Server for curriculum standards
5. Agent generates lessons/quizzes with curriculum context
6. Content validator checks alignment (70% threshold)
7. Approved content is packaged into learning bundle

## Monitoring

CloudWatch metrics are emitted for:
- Content generation latency (p50, p95, p99)
- Validation pass rate
- MCP Server availability
- Content generation success rate

CloudWatch alarms are configured for:
- Content generation latency > 60 seconds (p95)
- Validation success rate < 95%
- Content generation errors > 5 in 5 minutes

## Validation Requirements

All generated content must:
- Achieve at least 70% curriculum alignment score
- Pass age-appropriateness checks
- Pass language appropriateness checks
- Pass safety filtering (Bedrock Guardrails)

Content failing validation is regenerated up to 3 times with adjusted prompts.
