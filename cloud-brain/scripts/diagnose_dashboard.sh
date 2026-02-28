#!/bin/bash

# Dashboard Diagnostic Script
# This script checks the current state of the API and identifies issues

echo "=========================================="
echo "Sikshya-Sathi Dashboard Diagnostics"
echo "=========================================="
echo ""

API_URL="https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development"

echo "Testing API Endpoints..."
echo ""

# Test 1: Health endpoint
echo "1. Testing /health endpoint..."
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/health")
if [ "$HEALTH_CODE" = "200" ]; then
    echo "   ✓ Health endpoint is working (HTTP 200)"
else
    echo "   ✗ Health endpoint returned HTTP $HEALTH_CODE"
fi
echo ""

# Test 2: Students endpoint
echo "2. Testing /educator/students endpoint..."
STUDENTS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/educator/students?limit=10")
STUDENTS_BODY=$(curl -s "${API_URL}/educator/students?limit=10")

if [ "$STUDENTS_CODE" = "200" ]; then
    echo "   ✓ Students endpoint is working (HTTP 200)"
    echo "   Response: ${STUDENTS_BODY:0:100}..."
elif [ "$STUDENTS_CODE" = "403" ]; then
    echo "   ✗ Students endpoint returned HTTP 403 (Forbidden)"
    echo "   Response: $STUDENTS_BODY"
    echo "   → This means the API Gateway route is not properly configured"
else
    echo "   ✗ Students endpoint returned HTTP $STUDENTS_CODE"
    echo "   Response: $STUDENTS_BODY"
fi
echo ""

# Test 3: Dashboard endpoint
echo "3. Testing /educator/dashboard endpoint..."
DASHBOARD_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/educator/dashboard?educator_id=EDU001&class_ids=CLASS001")
DASHBOARD_BODY=$(curl -s "${API_URL}/educator/dashboard?educator_id=EDU001&class_ids=CLASS001")

if [ "$DASHBOARD_CODE" = "200" ]; then
    echo "   ✓ Dashboard endpoint is working (HTTP 200)"
    echo "   Response: ${DASHBOARD_BODY:0:100}..."
elif [ "$DASHBOARD_CODE" = "403" ]; then
    echo "   ✗ Dashboard endpoint returned HTTP 403 (Forbidden)"
    echo "   Response: $DASHBOARD_BODY"
    echo "   → This means the API Gateway route is not properly configured"
else
    echo "   ✗ Dashboard endpoint returned HTTP $DASHBOARD_CODE"
    echo "   Response: $DASHBOARD_BODY"
fi
echo ""

# Test 4: CORS headers
echo "4. Checking CORS headers..."
CORS_HEADERS=$(curl -s -I "${API_URL}/educator/students?limit=10" | grep -i "access-control")

if [ -n "$CORS_HEADERS" ]; then
    echo "   ✓ CORS headers found:"
    echo "$CORS_HEADERS" | sed 's/^/     /'
else
    echo "   ✗ No CORS headers found"
    echo "   → The browser will block requests from the web app"
fi
echo ""

# Test 5: OPTIONS preflight
echo "5. Testing OPTIONS preflight request..."
OPTIONS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "${API_URL}/educator/students")
OPTIONS_HEADERS=$(curl -s -I -X OPTIONS "${API_URL}/educator/students" | grep -i "access-control")

if [ "$OPTIONS_CODE" = "200" ]; then
    echo "   ✓ OPTIONS request successful (HTTP 200)"
    if [ -n "$OPTIONS_HEADERS" ]; then
        echo "   ✓ CORS preflight headers present"
    else
        echo "   ✗ CORS preflight headers missing"
    fi
else
    echo "   ✗ OPTIONS request returned HTTP $OPTIONS_CODE"
    echo "   → CORS preflight will fail"
fi
echo ""

# Test 6: Lambda function status
echo "6. Checking Lambda function status..."
if command -v aws &> /dev/null; then
    LAMBDA_STATUS=$(aws lambda get-function \
        --function-name sikshya-sathi-educator-development \
        --query 'Configuration.State' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$LAMBDA_STATUS" = "Active" ]; then
        echo "   ✓ Lambda function is Active"
        
        # Get last update time
        LAST_UPDATE=$(aws lambda get-function \
            --function-name sikshya-sathi-educator-development \
            --query 'Configuration.LastModified' \
            --output text 2>/dev/null)
        echo "   Last updated: $LAST_UPDATE"
    elif [ "$LAMBDA_STATUS" = "NOT_FOUND" ]; then
        echo "   ✗ Lambda function not found"
        echo "   → The infrastructure might not be deployed"
    else
        echo "   ⚠ Lambda function status: $LAMBDA_STATUS"
    fi
else
    echo "   ⚠ AWS CLI not available, skipping Lambda check"
fi
echo ""

# Test 7: DynamoDB tables
echo "7. Checking DynamoDB tables..."
if command -v aws &> /dev/null; then
    STUDENTS_TABLE=$(aws dynamodb describe-table \
        --table-name sikshya-sathi-students-development \
        --query 'Table.TableStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$STUDENTS_TABLE" = "ACTIVE" ]; then
        echo "   ✓ Students table is Active"
        
        # Count items
        ITEM_COUNT=$(aws dynamodb scan \
            --table-name sikshya-sathi-students-development \
            --select COUNT \
            --query 'Count' \
            --output text 2>/dev/null || echo "0")
        echo "   Student records: $ITEM_COUNT"
    else
        echo "   ✗ Students table status: $STUDENTS_TABLE"
    fi
else
    echo "   ⚠ AWS CLI not available, skipping DynamoDB check"
fi
echo ""

# Summary
echo "=========================================="
echo "Diagnosis Summary"
echo "=========================================="
echo ""

if [ "$STUDENTS_CODE" = "403" ] || [ "$DASHBOARD_CODE" = "403" ]; then
    echo "❌ CRITICAL ISSUE: API Gateway routes not configured"
    echo ""
    echo "The API Gateway is returning 403 'Missing Authentication Token'"
    echo "which means the routes don't exist or aren't properly deployed."
    echo ""
    echo "SOLUTION:"
    echo "  1. Deploy the infrastructure:"
    echo "     cd cloud-brain/infrastructure"
    echo "     cdk deploy CloudBrainStack -c environment=development"
    echo ""
    echo "  2. Or use the fix script:"
    echo "     cd cloud-brain"
    echo "     ./scripts/fix_dashboard.sh"
    echo ""
elif [ -z "$CORS_HEADERS" ]; then
    echo "⚠️  CORS ISSUE: CORS headers missing"
    echo ""
    echo "The API is responding but CORS headers are not present."
    echo "The browser will block requests from the web app."
    echo ""
    echo "SOLUTION:"
    echo "  1. Redeploy the Lambda with CORS headers:"
    echo "     cd cloud-brain/infrastructure"
    echo "     cdk deploy CloudBrainStack -c environment=development"
    echo ""
elif [ "$STUDENTS_CODE" = "200" ] && [ "$DASHBOARD_CODE" = "200" ]; then
    echo "✅ API is working correctly!"
    echo ""
    echo "All endpoints are responding with HTTP 200 and CORS headers are present."
    echo ""
    if [ "$ITEM_COUNT" = "0" ]; then
        echo "ℹ️  No student data found. To add sample data:"
        echo "   cd cloud-brain"
        echo "   python scripts/seed_sample_data.py"
    fi
    echo ""
    echo "You can now use the dashboard:"
    echo "  cd cloud-brain/web"
    echo "  npm run dev"
    echo "  Open http://localhost:3000"
else
    echo "⚠️  UNKNOWN ISSUE"
    echo ""
    echo "The API is not responding as expected."
    echo "Check the CloudWatch logs for more details:"
    echo "  aws logs tail /aws/lambda/sikshya-sathi-educator-development --follow"
fi
echo ""
