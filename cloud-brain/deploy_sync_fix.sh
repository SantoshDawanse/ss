#!/bin/bash

# Deploy Sync 400 Error Fix
# This script deploys the backend changes to fix the 400 Bad Request error

set -e

echo "=========================================="
echo "Deploying Sync 400 Error Fix"
echo "=========================================="
echo ""

# Find the infrastructure directory
if [ -d "infrastructure" ]; then
    INFRA_DIR="infrastructure"
elif [ -d "cloud-brain/infrastructure" ]; then
    INFRA_DIR="cloud-brain/infrastructure"
else
    echo "Error: infrastructure directory not found"
    exit 1
fi

# Check if virtual environment is activated
if [ -z "$VIRTUAL_ENV" ]; then
    echo "Activating virtual environment..."
    if [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
    elif [ -f "../venv/bin/activate" ]; then
        source ../venv/bin/activate
    fi
fi

# Run tests to ensure everything works
echo "Running sync API tests..."
if [ -d "tests" ]; then
    python -m pytest tests/test_sync_api.py -v --tb=short
elif [ -d "cloud-brain/tests" ]; then
    cd cloud-brain
    python -m pytest tests/test_sync_api.py -v --tb=short
    cd ..
fi

if [ $? -ne 0 ]; then
    echo ""
    echo "Error: Tests failed. Please fix the issues before deploying."
    exit 1
fi

echo ""
echo "All tests passed!"
echo ""

# Deploy to AWS
echo "Deploying to AWS..."
echo "This will update the Lambda functions with the sync fix."
echo ""

cd "$INFRA_DIR"
cdk deploy SikshyaSathiCloudBrain-development --require-approval never

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "Deployment successful!"
    echo "=========================================="
    echo ""
    echo "The sync fix has been deployed. Changes include:"
    echo "  ✓ Accept both camelCase and snake_case field names"
    echo "  ✓ Handle encrypted logs as base64 strings"
    echo "  ✓ Improved error messages"
    echo "  ✓ Better request logging"
    echo ""
    echo "Next steps:"
    echo "  1. Test sync from mobile app"
    echo "  2. Check CloudWatch logs for detailed request info"
    echo "  3. Verify no more 400 errors"
    echo ""
else
    echo ""
    echo "Deployment failed. Please check the error messages above."
    exit 1
fi
