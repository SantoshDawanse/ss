# Sikshya-Sathi Cloud Brain

AI-powered personalization and content generation engine for the Sikshya-Sathi system.

## Architecture

- **Runtime**: AWS Lambda (Python 3.11)
- **AI Engine**: Amazon Bedrock Agent with Claude 3.5 Sonnet
- **Storage**: S3 (learning bundles), DynamoDB (student data)
- **API**: API Gateway REST API

## Project Structure

```
cloud-brain/
├── src/
│   ├── handlers/          # Lambda function handlers
│   ├── services/          # Business logic services
│   ├── models/            # Data models
│   ├── utils/             # Utility functions
│   └── mcp/               # MCP Server implementation
├── tests/                 # Test files
├── infrastructure/        # AWS CDK/CloudFormation
└── requirements.txt       # Python dependencies
```

## Setup

```bash
# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Run tests
pytest

# Run property-based tests
pytest -m property_test
```

## Environment Variables

- `AWS_REGION`: AWS region for services
- `DYNAMODB_TABLE`: DynamoDB table name
- `S3_BUCKET`: S3 bucket for learning bundles
- `BEDROCK_AGENT_ID`: Bedrock Agent ID
- `BEDROCK_AGENT_ALIAS_ID`: Bedrock Agent alias ID
