# Quick Fix Guide - Bedrock Agent Content Generation

## 🔴 Problem
Bedrock Agent not generating content - always falling back to mock content.

## 🎯 Root Cause
**Incorrect model identifier** - missing `us.` prefix for inference profile.

## ✅ Solution Applied

Changed model identifier in 5 files:
```diff
- anthropic.claude-3-5-sonnet-20241022-v2:0
+ us.anthropic.claude-3-5-sonnet-20241022-v2:0
```

## 🚀 Quick Deploy

```bash
# 1. Verify fix is applied
python cloud-brain/verify_model_fix.py

# 2. Deploy
cd cloud-brain
./deploy_bedrock_agent.sh development

# 3. Test
python test_bedrock_agent_config.py
```

## ✓ Success Indicators

After deployment, you should see:
- ✅ "Bedrock Agent is configured - attempting real content generation"
- ✅ "Generated lesson via Bedrock Agent: [title]"
- ✅ No "using progressive mock content" messages (unless Bedrock unavailable)

## 📊 Check Logs

```bash
aws logs tail /aws/lambda/SikshyaSathiCloudBrain-development-SyncUploadHandler --follow
```

## 🔧 Troubleshooting

### Still getting mock content?

1. **Check agent exists:**
   ```bash
   aws bedrock-agent list-agents --region us-east-1
   ```

2. **Check model access:**
   ```bash
   aws bedrock list-foundation-models --region us-east-1 | grep claude-3-5-sonnet
   ```

3. **Request model access:**
   - Go to AWS Bedrock console
   - Navigate to "Model access"
   - Request access to "Claude 3.5 Sonnet"
   - Wait 5-10 minutes

4. **Check environment variables:**
   ```bash
   aws lambda get-function-configuration \
     --function-name SikshyaSathiCloudBrain-development-SyncUploadHandler \
     --query 'Environment.Variables.{AgentId:BEDROCK_AGENT_ID,AliasId:BEDROCK_AGENT_ALIAS_ID}'
   ```

### Alternative: Use Claude 3.5 Haiku

If Sonnet is not available, edit `cloud-brain/src/config/bedrock_agent_config.py`:

```python
BEDROCK_FOUNDATION_MODEL = "us.anthropic.claude-3-5-haiku-20241022-v1:0"
```

Then redeploy.

## 📚 Full Documentation

- **Detailed Fix**: `cloud-brain/BEDROCK_MODEL_FIX.md`
- **Summary**: `BEDROCK_CONTENT_GENERATION_FIX.md`
- **Integration**: `BEDROCK_AGENT_INTEGRATION.md`

## 🎉 Expected Result

Real AI-generated educational content personalized for each student!
