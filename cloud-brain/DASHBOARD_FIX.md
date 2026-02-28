# Dashboard Connection Fix

## Problem Identified

The educator dashboard is showing "Unable to Load Dashboard - Failed to fetch" because:

1. **API Gateway Route Issue**: The API Gateway is returning 403 "Missing Authentication Token" which indicates the routes aren't properly configured or deployed
2. **CORS Headers**: While CORS headers are in the Lambda code, they need to be properly configured in API Gateway as well
3. **Deployment Status**: The Lambda functions may not be deployed with the latest code

## Root Causes

### 1. API Gateway Configuration
The API Gateway endpoints at:
- `https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development/educator/dashboard`
- `https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development/educator/students`

Are returning 403 errors, which means:
- The routes might not exist in the deployed API Gateway
- The stage deployment might be incomplete
- The Lambda integration might not be properly configured

### 2. Missing CORS Preflight
The API Gateway needs explicit OPTIONS method handlers for CORS preflight requests from browsers.

## Solution

### Step 1: Update Infrastructure (Already Done)

The following changes have been made to `cloud-brain/infrastructure/stacks/cloud_brain_stack.py`:

1. **Enhanced CORS Configuration**:
   - Added `X-Requested-With` to allowed headers
   - Added `max_age` for CORS caching
   - Enabled logging and tracing for debugging

2. **Explicit CORS Response Parameters**:
   - Added integration responses with CORS headers
   - Added method responses with CORS headers
   - Added OPTIONS methods for preflight requests

### Step 2: Deploy the Infrastructure

```bash
cd cloud-brain/infrastructure

# Install dependencies if not already done
pip install -r requirements.txt

# Deploy the stack
cdk deploy SikshyaSathiCloudBrain-development -c environment=development --require-approval never
```

### Step 3: Verify Deployment

After deployment, verify the API Gateway:

```bash
# Check if the endpoint exists
curl -I "https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development/educator/students?limit=10"

# Should return 200 OK with CORS headers, not 403

# Test the dashboard endpoint
curl "https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development/educator/dashboard?educator_id=EDU001&class_ids=CLASS001"

# Should return JSON data, not "Missing Authentication Token"
```

### Step 4: Check CloudWatch Logs

If issues persist, check the Lambda logs:

```bash
# Educator Lambda logs
aws logs tail /aws/lambda/sikshya-sathi-educator-development --follow

# API Gateway logs
aws logs tail API-Gateway-Execution-Logs_<api-id>/development --follow
```

## Alternative: Quick Test with Local Proxy

If you need to test the dashboard immediately while waiting for deployment:

### Option 1: Use a Local Proxy Server

Create `cloud-brain/web/proxy-server.js`:

```javascript
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();

app.use(cors());

app.use('/api', createProxyMiddleware({
  target: 'https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '',
  },
}));

app.listen(3001, () => {
  console.log('Proxy server running on http://localhost:3001');
});
```

Install dependencies and run:

```bash
cd cloud-brain/web
npm install express http-proxy-middleware cors
node proxy-server.js
```

Update `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### Option 2: Use Browser Extension

Install a CORS extension like "CORS Unblock" or "Allow CORS: Access-Control-Allow-Origin" and enable it for localhost.

## Verification Checklist

After deployment, verify:

- [ ] API Gateway endpoint returns 200 (not 403)
- [ ] CORS headers are present in response
- [ ] OPTIONS requests return 200
- [ ] Dashboard loads without errors
- [ ] Student data appears in dashboard

## Expected Response Headers

After fix, the API should return these headers:

```
HTTP/2 200
content-type: application/json
access-control-allow-origin: *
access-control-allow-headers: Content-Type,Authorization,X-Requested-With
access-control-allow-methods: GET,POST,OPTIONS
```

## Troubleshooting

### Issue: Still getting 403 after deployment

**Solution**: The API Gateway stage might not have been redeployed. Force a new deployment:

```bash
aws apigateway create-deployment \
  --rest-api-id <api-id> \
  --stage-name development \
  --description "Force redeploy for CORS fix"
```

### Issue: CORS headers missing

**Solution**: Check that the Lambda is returning CORS headers:

```python
cors_headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}
```

### Issue: Dashboard shows empty data

**Solution**: This is expected if no students have synced data yet. Run the seed script:

```bash
cd cloud-brain
python scripts/seed_sample_data.py
```

## Next Steps

1. Deploy the infrastructure changes
2. Verify API endpoints are accessible
3. Test the dashboard in browser
4. If data is empty, seed sample data
5. Monitor CloudWatch logs for any errors

## Production Considerations

Before going to production:

1. **Restrict CORS Origins**: Change `Access-Control-Allow-Origin` from `*` to specific domain
2. **Add Authentication**: Implement API key or JWT authentication
3. **Rate Limiting**: Configure API Gateway throttling
4. **Monitoring**: Set up CloudWatch alarms for errors
5. **Caching**: Enable API Gateway caching for dashboard endpoints
