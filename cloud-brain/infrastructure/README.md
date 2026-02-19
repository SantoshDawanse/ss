# Infrastructure Setup

This directory contains AWS infrastructure configuration for the Sikshya-Sathi Cloud Brain.

## Resources

- **Lambda Functions**: Content generation, sync handlers
- **API Gateway**: REST API for sync endpoints
- **DynamoDB**: Student data and bundle metadata
- **S3**: Learning bundle storage
- **CloudWatch**: Logging and monitoring

## Deployment

```bash
# Install AWS CDK (if not already installed)
npm install -g aws-cdk

# Deploy to development
cdk deploy --context environment=development

# Deploy to staging
cdk deploy --context environment=staging

# Deploy to production
cdk deploy --context environment=production
```

## Environments

- **Development**: For local testing and development
- **Staging**: Pre-production environment for validation
- **Production**: Live environment for students
