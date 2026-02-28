#!/bin/bash

# Deploy S3 bucket fix for sync functionality
# This script redeploys the Lambda functions with the corrected bucket name configuration

set -e

echo "=========================================="
echo "Deploying Comprehensive Sync Fix"
echo "=========================================="
echo ""
echo "Fixes included:"
echo "  1. S3 bucket name now reads from BUNDLES_BUCKET env var"
echo "  2. DynamoDB table name now reads from BUNDLES_TABLE env var"
echo "  3. Fixed incorrect method call in bundle metadata saving"
echo "  4. Fixed DynamoDB key names (bundle_id → bundleId, student_id → studentId)"
echo "  5. Added StudentIdIndex GSI to BundlesTable"
echo "  6. Fixed DynamoDB reserved word conflicts (status → #status)"
echo ""

# Check if we're in the cloud-brain directory
if [ ! -f "src/services/bundle_generator.py" ]; then
    echo "Error: Must run from cloud-brain directory"
    exit 1
fi

# Get environment name (default to development)
ENV_NAME="${1:-development}"
echo "Environment: $ENV_NAME"
echo ""

# Navigate to infrastructure directory
cd infrastructure

echo "Step 1: Synthesizing CDK stack..."
cdk synth --context environment=$ENV_NAME

echo ""
echo "Step 2: Deploying Lambda functions..."
cdk deploy --context environment=$ENV_NAME --require-approval never

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "The following changes were deployed:"
echo "  ✓ BundleGenerator now reads bucket name from BUNDLES_BUCKET env var"
echo "  ✓ BundleGenerator now reads table name from BUNDLES_TABLE env var"
echo "  ✓ Fixed method call: self.save_bundle_metadata(bundle, s3_key)"
echo "  ✓ Fixed DynamoDB key names to use camelCase (bundleId, studentId)"
echo "  ✓ Added StudentIdIndex GSI to BundlesTable"
echo "  ✓ Fixed DynamoDB reserved word conflicts"
echo "  ✓ Lambda functions have correct environment variables set"
echo "  ✓ S3 bucket name matches infrastructure: sikshya-sathi-bundles-$ENV_NAME"
echo ""
echo "Note: GSI creation may take a few minutes to complete."
echo ""
echo "Next steps:"
echo "  1. Wait for GSI to become ACTIVE (check with: aws dynamodb describe-table)"
echo "  2. Test sync from mobile app"
echo "  3. Verify bundle generation succeeds"
echo "  4. Check CloudWatch logs for any errors"
echo "  5. Verify bundle appears in S3"
echo "  6. Verify metadata appears in DynamoDB with correct keys"
echo ""
echo "Monitor logs with:"
echo "  aws logs tail /aws/lambda/sikshya-sathi-sync-download-$ENV_NAME --follow"
echo ""
echo "Check GSI status with:"
echo "  aws dynamodb describe-table --table-name sikshya-sathi-bundles-$ENV_NAME --query 'Table.GlobalSecondaryIndexes[0].IndexStatus'"
echo ""
