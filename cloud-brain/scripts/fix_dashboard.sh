#!/bin/bash

# Dashboard Fix Deployment Script
# This script deploys the infrastructure changes to fix the dashboard connection issue

set -e

echo "=========================================="
echo "Sikshya-Sathi Dashboard Fix Deployment"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "infrastructure/app.py" ]; then
    echo "Error: Please run this script from the cloud-brain directory"
    exit 1
fi

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "Error: AWS CLI is not configured. Please run 'aws configure'"
    exit 1
fi

echo "Step 1: Checking CDK installation..."
if ! command -v cdk &> /dev/null; then
    echo "Error: AWS CDK is not installed. Please install it:"
    echo "  npm install -g aws-cdk"
    exit 1
fi
echo "✓ CDK is installed"
echo ""

echo "Step 2: Installing Python dependencies..."
cd infrastructure
pip install -q -r requirements.txt
echo "✓ Dependencies installed"
echo ""

echo "Step 3: Synthesizing CDK stack..."
cdk synth SikshyaSathiCloudBrain-development -c environment=development > /dev/null
echo "✓ Stack synthesized successfully"
echo ""

echo "Step 4: Deploying infrastructure changes..."
echo "This will update the API Gateway with proper CORS configuration"
echo ""
cdk deploy SikshyaSathiCloudBrain-development -c environment=development --require-approval never

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""

# Get the API endpoint from CDK outputs
API_URL=$(aws cloudformation describe-stacks \
    --stack-name SikshyaSathiCloudBrain-development \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -n "$API_URL" ]; then
    echo "API Endpoint: $API_URL"
    echo ""
    
    echo "Step 5: Verifying deployment..."
    echo ""
    
    # Test the students endpoint
    echo "Testing /educator/students endpoint..."
    STUDENTS_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}educator/students?limit=10")
    
    if [ "$STUDENTS_RESPONSE" = "200" ]; then
        echo "✓ Students endpoint is working (HTTP 200)"
    else
        echo "⚠ Students endpoint returned HTTP $STUDENTS_RESPONSE"
        echo "  This might be expected if the Lambda needs time to warm up"
    fi
    
    # Test the dashboard endpoint
    echo "Testing /educator/dashboard endpoint..."
    DASHBOARD_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}educator/dashboard?educator_id=EDU001&class_ids=CLASS001")
    
    if [ "$DASHBOARD_RESPONSE" = "200" ]; then
        echo "✓ Dashboard endpoint is working (HTTP 200)"
    else
        echo "⚠ Dashboard endpoint returned HTTP $DASHBOARD_RESPONSE"
        echo "  This might be expected if the Lambda needs time to warm up"
    fi
    
    echo ""
    echo "Step 6: Checking CORS headers..."
    CORS_HEADER=$(curl -s -I "${API_URL}educator/students?limit=10" | grep -i "access-control-allow-origin" || echo "")
    
    if [ -n "$CORS_HEADER" ]; then
        echo "✓ CORS headers are present"
        echo "  $CORS_HEADER"
    else
        echo "⚠ CORS headers not found in response"
        echo "  The Lambda might need a few moments to update"
    fi
fi

echo ""
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo ""
echo "1. Open the dashboard in your browser:"
echo "   cd cloud-brain/web"
echo "   npm run dev"
echo "   Open http://localhost:3000"
echo ""
echo "2. If the dashboard shows 'No Student Data':"
echo "   cd cloud-brain"
echo "   python scripts/seed_sample_data.py"
echo ""
echo "3. Monitor Lambda logs if issues persist:"
echo "   aws logs tail /aws/lambda/sikshya-sathi-educator-development --follow"
echo ""
echo "4. Check the detailed fix guide:"
echo "   cat cloud-brain/DASHBOARD_FIX.md"
echo ""
