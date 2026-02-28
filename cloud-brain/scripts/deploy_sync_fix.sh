#!/bin/bash

# Deploy sync handler fixes
# This script redeploys the sync Lambda functions with corrected handler paths

set -e

echo "Deploying sync handler fixes..."
echo ""

cd "$(dirname "$0")/../infrastructure"

# Check if CDK is available
if ! command -v cdk &> /dev/null; then
    echo "Error: AWS CDK is not installed"
    echo "Install with: npm install -g aws-cdk"
    exit 1
fi

# Synthesize the stack to check for errors
echo "Synthesizing CloudFormation template..."
cdk synth

echo ""
echo "Deploying stack..."
cdk deploy --require-approval never

echo ""
echo "Deployment complete!"
echo ""
echo "Testing sync endpoints..."

# Get API Gateway URL
API_URL=$(aws cloudformation describe-stacks \
  --stack-name SikshyaSathiCloudBrainStack-development \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

if [ -z "$API_URL" ]; then
  echo "Warning: Could not retrieve API URL from CloudFormation"
  echo "You can find it in the AWS Console or CloudFormation outputs"
else
  echo "API URL: ${API_URL}"
  echo ""
  echo "Testing health endpoint..."
  curl -s "${API_URL}/health" | jq .
fi

echo ""
echo "Next steps:"
echo "1. Check CloudWatch logs: ./scripts/check_sync_logs.sh"
echo "2. Test sync from mobile app"
echo "3. Monitor for 502 errors"
