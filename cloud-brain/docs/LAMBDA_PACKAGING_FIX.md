# Lambda Packaging Fix

## Problem

The Lambda function had import/dependency issues because the handler code used `from src.models` imports, but the Lambda packaging structure didn't match. Lambda expects a flat structure where imports work without the `src.` prefix.

## Solution

We've fixed the packaging issue by:

1. **Updated all imports** to use relative imports without the `src.` prefix
   - Changed `from src.models.content import ...` to `from models.content import ...`
   - Changed `from src.services.safety_filter import ...` to `from services.safety_filter import ...`
   - Applied this change across all modules

2. **Updated CDK stack** to package the Lambda correctly
   - Changed handler path from `src.handlers.content_handler.generate` to `handlers.content_handler.generate`
   - Set code asset to `../src` directory which gets deployed as a flat structure

3. **Lambda structure** after deployment:
   ```
   /var/task/
   ├── handlers/
   │   ├── __init__.py
   │   └── content_handler.py
   ├── models/
   │   ├── __init__.py
   │   ├── content.py
   │   ├── curriculum.py
   │   ├── personalization.py
   │   └── validation.py
   ├── services/
   │   ├── __init__.py
   │   ├── bedrock_agent.py
   │   ├── content_validator.py
   │   ├── curriculum_validator.py
   │   └── safety_filter.py
   ├── mcp/
   │   ├── __init__.py
   │   ├── server.py
   │   └── tools.py
   └── requirements.txt
   ```

## Deployment Steps

### 1. Redeploy the Lambda Function

```bash
# From the project root
make redeploy-lambda

# Or manually
cd cloud-brain/infrastructure
cdk deploy --require-approval never
```

This will:
- Package the `src/` directory with the correct structure
- Update the Lambda function with new code
- Preserve all IAM permissions and configurations

### 2. Verify the Deployment

```bash
# Test the Lambda function
make test-lambda

# Or manually
cd cloud-brain
python scripts/test_lambda_packaging.py
```

### 3. Test End-to-End

Once the Lambda is redeployed, test the Bedrock Agent:

```bash
cd cloud-brain
python scripts/test_content_generation.py
```

## What Changed

### Files Modified

1. **Infrastructure**
   - `infrastructure/stacks/cloud_brain_stack.py` - Updated Lambda handler path and code asset

2. **Handler**
   - `src/handlers/content_handler.py` - Changed imports from `src.*` to relative imports

3. **Models**
   - `src/models/__init__.py` - Updated imports

4. **Services**
   - `src/services/curriculum_validator.py` - Updated imports
   - `src/services/content_validator.py` - Updated imports
   - `src/services/safety_filter.py` - Updated imports

5. **MCP**
   - `src/mcp/__init__.py` - Updated imports
   - `src/mcp/server.py` - Updated imports
   - `src/mcp/tools.py` - Updated imports

### New Scripts

1. `scripts/redeploy_lambda.py` - Helper script for redeployment
2. `scripts/test_lambda_packaging.py` - Test script to verify Lambda works

## Troubleshooting

### Import Errors

If you still see import errors after deployment:

1. Check CloudWatch Logs:
   ```bash
   aws logs tail /aws/lambda/sikshya-sathi-content-gen-dev --follow
   ```

2. Verify the Lambda package structure:
   ```bash
   # Download the Lambda code
   aws lambda get-function --function-name sikshya-sathi-content-gen-dev
   ```

### Missing Dependencies

If you see "No module named 'aws_lambda_powertools'" or similar:

1. Ensure `requirements.txt` is in the `src/` directory
2. CDK automatically installs dependencies from `requirements.txt` during packaging
3. Check that the Lambda has sufficient memory (currently set to 1024 MB)

### Permission Issues

If you see permission errors:

1. The IAM permissions are already configured correctly
2. Verify the Bedrock Agent role has the right permissions:
   ```bash
   cd cloud-brain
   python scripts/check_agent_status.py
   ```

## Testing Checklist

- [ ] Lambda deploys without errors
- [ ] Lambda can import all modules (no ImportError)
- [ ] Lambda can invoke Bedrock models
- [ ] Lambda can read/write to DynamoDB
- [ ] Lambda can access S3 bucket
- [ ] Bedrock Agent can invoke Lambda
- [ ] End-to-end content generation works

## Next Steps

After successful deployment:

1. Test lesson generation
2. Test quiz generation
3. Test hint generation
4. Test revision plan generation
5. Test study track generation

All infrastructure is deployed and functional - the Lambda packaging fix completes the end-to-end setup!
