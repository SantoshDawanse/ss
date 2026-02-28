#!/bin/bash

# Check CloudWatch logs for sync download handler
# This helps diagnose 502 errors

SESSION_ID="${1:-sync_b2731906-9b9f-4e05-b487-5c14e39e85fb_1771939100702_w9pbfmwjb}"
FUNCTION_NAME="sikshya-sathi-sync-download-development"
LOG_GROUP="/aws/lambda/${FUNCTION_NAME}"

echo "Checking logs for sync download handler..."
echo "Session ID: ${SESSION_ID}"
echo "Log Group: ${LOG_GROUP}"
echo ""

# Get recent log streams
echo "Recent log streams:"
aws logs describe-log-streams \
  --log-group-name "${LOG_GROUP}" \
  --order-by LastEventTime \
  --descending \
  --max-items 5 \
  --query 'logStreams[*].[logStreamName,lastEventTime]' \
  --output table

echo ""
echo "Recent errors (last 30 minutes):"
aws logs filter-log-events \
  --log-group-name "${LOG_GROUP}" \
  --start-time $(($(date +%s) * 1000 - 1800000)) \
  --filter-pattern "ERROR" \
  --query 'events[*].[timestamp,message]' \
  --output text | tail -20

echo ""
echo "Recent logs for session (last 30 minutes):"
aws logs filter-log-events \
  --log-group-name "${LOG_GROUP}" \
  --start-time $(($(date +%s) * 1000 - 1800000)) \
  --filter-pattern "${SESSION_ID}" \
  --query 'events[*].[timestamp,message]' \
  --output text

echo ""
echo "Lambda function configuration:"
aws lambda get-function-configuration \
  --function-name "${FUNCTION_NAME}" \
  --query '{Timeout:Timeout,Memory:MemorySize,Runtime:Runtime,LastModified:LastModified}' \
  --output table
