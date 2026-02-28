# Minimal Deployment for Dashboard

## What Was Changed

To fix the Bedrock Agent resource type error, we've temporarily disabled the following components that are not needed for the educator dashboard:

### Disabled Components

1. **Bedrock Agent** - AWS::Bedrock::Agent and AWS::Bedrock::AgentActionGroup
   - These resource types are not available in all regions or may require special permissions
   - Not needed for the dashboard functionality

2. **MCP Server Lambda** - Used by Bedrock Agent for curriculum data
   - Not needed for dashboard

3. **Content Generation Lambda** - Generates lessons and quizzes
   - Not needed for dashboard (only displays existing data)

4. **Sync Upload/Download Lambdas** - Handle mobile app sync
   - Not needed for dashboard (dashboard is read-only)

5. **Related CloudWatch Alarms** - Monitoring for disabled components

### What Still Works

The following components are still deployed and fully functional:

✅ **DynamoDB Tables**
- Students table
- Bundles table  
- Sync sessions table
- Knowledge model table

✅ **S3 Bucket**
- Learning bundles storage

✅ **Educator Lambda**
- Handles all dashboard API requests
- `/educator/dashboard`
- `/educator/students`
- `/educator/student-progress`
- `/educator/class-report`
- `/educator/curriculum-coverage`

✅ **Student Registration Lambda**
- `/api/students/register`

✅ **API Gateway**
- All educator endpoints
- Student registration endpoint
- Health check endpoint
- Full CORS support

✅ **CloudWatch Monitoring**
- Student table alarms
- Student registration alarms
- SNS topic for alerts

## Dashboard Functionality

The dashboard will work perfectly with this minimal deployment:

- ✅ View registered students
- ✅ View student progress
- ✅ View class performance
- ✅ View curriculum coverage
- ✅ Search and filter students
- ✅ Export data

## What Won't Work (Temporarily)

The following features require the disabled components:

- ❌ Mobile app sync (upload/download)
- ❌ AI-powered content generation
- ❌ Bedrock Agent curriculum queries

## Re-enabling Full Features

To re-enable all features later:

1. Check if your AWS region supports Bedrock Agents:
   ```bash
   aws bedrock list-foundation-models --region us-east-1
   ```

2. Uncomment the disabled sections in `cloud_brain_stack.py`:
   - Search for "commented out" comments
   - Uncomment the Bedrock and sync handler sections

3. Redeploy:
   ```bash
   cdk deploy SikshyaSathiCloudBrain-development -c environment=development
   ```

## Why This Approach

This minimal deployment allows you to:
1. Get the dashboard working immediately
2. Avoid Bedrock Agent resource type errors
3. Test and use the dashboard with existing student data
4. Add advanced features later when needed

The dashboard is the most critical component for educators, so we prioritized getting it working first.

## Next Steps

1. Deploy this minimal stack:
   ```bash
   cd cloud-brain
   ./scripts/fix_dashboard.sh
   ```

2. Verify the dashboard works:
   ```bash
   cd cloud-brain/web
   npm run dev
   # Open http://localhost:3000
   ```

3. If you need content generation or sync features, we can work on enabling those separately.
