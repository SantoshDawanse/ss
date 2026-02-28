# Cloud Brain Scripts

Utility scripts for managing and troubleshooting the Sikshya-Sathi cloud-brain infrastructure.

## Dashboard Management

### diagnose_dashboard.sh

Diagnoses issues with the educator dashboard API connectivity.

**Usage**:
```bash
./scripts/diagnose_dashboard.sh
```

**What it checks**:
- API endpoint availability (health, students, dashboard)
- HTTP response codes
- CORS headers presence
- OPTIONS preflight requests
- Lambda function status
- DynamoDB table status and record count

**Output**:
- Detailed test results for each endpoint
- Diagnosis summary with actionable recommendations
- Specific solutions based on identified issues

### fix_dashboard.sh

Deploys infrastructure changes to fix dashboard connectivity issues.

**Usage**:
```bash
./scripts/fix_dashboard.sh
```

**What it does**:
1. Checks prerequisites (AWS CLI, CDK)
2. Installs Python dependencies
3. Synthesizes CDK stack
4. Deploys infrastructure changes
5. Verifies deployment
6. Tests endpoints
7. Checks CORS headers
8. Provides next steps

**Requirements**:
- AWS CLI configured with valid credentials
- AWS CDK installed (`npm install -g aws-cdk`)
- Python 3.11+ with pip
- Appropriate AWS permissions

## Data Management

### seed_sample_data.py

Seeds the DynamoDB tables with sample student data for testing.

**Usage**:
```bash
python scripts/seed_sample_data.py
```

**What it creates**:
- Sample student records
- Sample performance data
- Sample curriculum coverage data

## Deployment

### package_lambda.sh

Packages Lambda functions with dependencies for manual deployment.

**Usage**:
```bash
./scripts/package_lambda.sh
```

**Output**:
- Lambda deployment package in `dist/` directory

## Troubleshooting

### Common Issues

#### Issue: "AWS CLI is not configured"

**Solution**:
```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, and region
```

#### Issue: "CDK is not installed"

**Solution**:
```bash
npm install -g aws-cdk
```

#### Issue: "Permission denied" when running scripts

**Solution**:
```bash
chmod +x scripts/*.sh
```

#### Issue: API returns 403 after deployment

**Solution**:
```bash
# Force a new API Gateway deployment
aws apigateway create-deployment \
  --rest-api-id <api-id> \
  --stage-name development \
  --description "Force redeploy"
```

#### Issue: Lambda function not found

**Solution**:
```bash
# Deploy the entire stack
cd infrastructure
cdk deploy CloudBrainStack -c environment=development
```

### Checking Logs

**Lambda logs**:
```bash
aws logs tail /aws/lambda/sikshya-sathi-educator-development --follow
```

**API Gateway logs**:
```bash
aws logs tail API-Gateway-Execution-Logs_<api-id>/development --follow
```

## Development Workflow

### Making Infrastructure Changes

1. **Edit the CDK stack**:
   ```bash
   vim infrastructure/stacks/cloud_brain_stack.py
   ```

2. **Test locally** (optional):
   ```bash
   cd infrastructure
   cdk synth CloudBrainStack
   ```

3. **Deploy changes**:
   ```bash
   ./scripts/fix_dashboard.sh
   ```

4. **Verify deployment**:
   ```bash
   ./scripts/diagnose_dashboard.sh
   ```

### Testing the Dashboard

1. **Start the web app**:
   ```bash
   cd web
   npm run dev
   ```

2. **Open in browser**:
   ```
   http://localhost:3000
   ```

3. **Check browser console** for errors

4. **Check API responses**:
   ```bash
   curl https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development/educator/students?limit=10
   ```

## Script Dependencies

### diagnose_dashboard.sh
- `curl` - for HTTP requests
- `aws` CLI (optional) - for Lambda and DynamoDB checks
- `grep` - for parsing responses

### fix_dashboard.sh
- `aws` CLI - required
- `cdk` CLI - required
- `pip` - for Python dependencies
- `curl` - for verification

### seed_sample_data.py
- `boto3` - AWS SDK for Python
- `python-dotenv` - for environment variables
- Valid AWS credentials

## Environment Variables

The scripts use these environment variables:

- `AWS_PROFILE` - AWS CLI profile to use (optional)
- `AWS_REGION` - AWS region (default: us-east-1)
- `ENVIRONMENT` - Deployment environment (default: development)

**Example**:
```bash
export AWS_PROFILE=sikshya-sathi
export AWS_REGION=us-east-1
export ENVIRONMENT=development

./scripts/fix_dashboard.sh
```

## Best Practices

1. **Always run diagnostics first**:
   ```bash
   ./scripts/diagnose_dashboard.sh
   ```

2. **Test in development before production**:
   ```bash
   cdk deploy CloudBrainStack -c environment=development
   ```

3. **Monitor logs during deployment**:
   ```bash
   aws logs tail /aws/lambda/sikshya-sathi-educator-development --follow
   ```

4. **Verify changes with curl before browser**:
   ```bash
   curl -v https://api-url/endpoint
   ```

5. **Keep scripts executable**:
   ```bash
   chmod +x scripts/*.sh
   ```

## Getting Help

If you encounter issues:

1. Run the diagnostic script:
   ```bash
   ./scripts/diagnose_dashboard.sh
   ```

2. Check the documentation:
   - [DASHBOARD_FIX.md](../DASHBOARD_FIX.md)
   - [DASHBOARD_ISSUE_ANALYSIS.md](../../DASHBOARD_ISSUE_ANALYSIS.md)
   - [DASHBOARD_STATUS.md](../../DASHBOARD_STATUS.md)

3. Check CloudWatch logs:
   ```bash
   aws logs tail /aws/lambda/sikshya-sathi-educator-development --follow
   ```

4. Verify AWS credentials:
   ```bash
   aws sts get-caller-identity
   ```

## Contributing

When adding new scripts:

1. Make them executable: `chmod +x script.sh`
2. Add usage documentation in this README
3. Include error handling and helpful messages
4. Test in development environment first
5. Add to version control
