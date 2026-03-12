# Bedrock Agent Model Identifier Fix

## Issue Summary

The Bedrock Agent was not generating content due to an **incorrect model identifier**. The system was using:
```
anthropic.claude-3-5-sonnet-20241022-v2:0  ❌ INCORRECT
```

But should be using the **inference profile** format:
```
us.anthropic.claude-3-5-sonnet-20241022-v2:0  ✅ CORRECT
```

## What Changed

### 1. Model Identifier Format
Amazon Bedrock Agents require using **cross-region inference profiles** for foundation models. These profiles:
- Start with a region prefix (e.g., `us.`)
- Provide better availability across regions
- Enable automatic failover and load balancing
- Are required for Bedrock Agent integration

### 2. Files Updated

The following files have been corrected with the proper model identifier:

1. **`cloud-brain/src/services/bedrock_agent.py`**
   - Updated `create_agent()` default model parameter
   - Changed from `anthropic.claude-3-5-sonnet-20241022-v2:0`
   - To `us.anthropic.claude-3-5-sonnet-20241022-v2:0`

2. **`cloud-brain/src/config/bedrock_agent_config.py`**
   - Updated `BEDROCK_FOUNDATION_MODEL` constant
   - Added comment explaining inference profile usage

3. **`cloud-brain/infrastructure/stacks/cloud_brain_stack.py`**
   - Updated CDK stack `FoundationModel` property
   - Ensures correct model is used during deployment

4. **`cloud-brain/infrastructure/BEDROCK_AGENT.md`**
   - Updated documentation to reflect correct model identifier
   - Added note about inference profile benefits

## Why This Matters

### Without the `us.` Prefix:
- ❌ Bedrock Agent fails to invoke the model
- ❌ Content generation returns errors
- ❌ System falls back to mock content
- ❌ No real AI-generated lessons or quizzes

### With the `us.` Prefix:
- ✅ Bedrock Agent successfully invokes Claude 3.5 Sonnet
- ✅ Real AI-generated educational content
- ✅ Curriculum-aligned lessons and quizzes
- ✅ Personalized content based on student progress

## Deployment Instructions

### Step 1: Verify Current Configuration

Check if you have an existing Bedrock Agent deployed:

```bash
# Check if agent exists
aws bedrock-agent list-agents --region us-east-1

# If agent exists, check its model
python cloud-brain/scripts/check_agent_status.py --environment dev
```

### Step 2: Deploy Updated Configuration

If you need to create a new agent or update existing:

```bash
cd cloud-brain
./deploy_bedrock_agent.sh development
```

### Step 3: Update Existing Agent (if needed)

If you already have an agent deployed with the wrong model:

```bash
# Option A: Update to Claude 3.5 Sonnet (recommended)
python cloud-brain/scripts/update_agent_model.py --environment dev

# Option B: Redeploy the entire stack
cd cloud-brain
cdk destroy SikshyaSathiCloudBrain-development
./deploy_bedrock_agent.sh development
```

### Step 4: Verify the Fix

Test content generation:

```bash
# Run configuration test
python cloud-brain/test_bedrock_agent_config.py

# Test actual content generation
cd cloud-brain/scripts
python test_content_generation.py --environment dev --test lesson
```

## Alternative: Claude 3.5 Haiku

If you encounter issues with Claude 3.5 Sonnet, you can use Claude 3.5 Haiku instead:

```python
# In bedrock_agent_config.py
BEDROCK_FOUNDATION_MODEL = "us.anthropic.claude-3-5-haiku-20241022-v1:0"
```

**Benefits of Haiku:**
- ✅ Faster response times
- ✅ Lower cost
- ✅ Still produces high-quality educational content
- ✅ Better availability in some regions

**Trade-offs:**
- ⚠️ Slightly less sophisticated reasoning
- ⚠️ May need more specific prompts for complex content

## Verification Checklist

After deploying the fix, verify:

- [ ] Agent status shows `PREPARED` or `READY`
- [ ] Foundation model shows `us.anthropic.claude-3-5-sonnet-20241022-v2:0`
- [ ] Test content generation succeeds
- [ ] CloudWatch logs show "Generated lesson via Bedrock Agent"
- [ ] No fallback to mock content (unless intended)

## Troubleshooting

### Issue: "Model not found" error

**Cause**: The model may not be available in your region or account.

**Solution**:
1. Check model availability: `aws bedrock list-foundation-models --region us-east-1`
2. Request model access in AWS Bedrock console
3. Wait 5-10 minutes for access to be granted
4. Redeploy the agent

### Issue: "Access denied" error

**Cause**: IAM role lacks permissions for the model.

**Solution**:
```bash
# Run the permission fix script
python cloud-brain/scripts/fix_agent_permissions.py --environment dev
```

### Issue: Agent invocation times out

**Cause**: Model is taking too long to respond.

**Solution**:
1. Check if using inference profile (should have `us.` prefix)
2. Consider switching to Claude 3.5 Haiku for faster responses
3. Increase timeout in Lambda configuration

### Issue: Still getting mock content

**Cause**: Environment variables not set or agent not configured.

**Solution**:
```bash
# Check environment variables
aws lambda get-function-configuration \
  --function-name SikshyaSathiCloudBrain-development-SyncUploadHandler \
  --query 'Environment.Variables'

# Should show:
# BEDROCK_AGENT_ID: <actual-agent-id>
# BEDROCK_AGENT_ALIAS_ID: <actual-alias-id>
```

## Expected Behavior After Fix

### Before Fix:
```
INFO - Bedrock Agent not configured - using progressive mock content for MVP
INFO - Generated progressive mock content for Introduction (easy)
```

### After Fix:
```
INFO - Bedrock Agent is configured - attempting real content generation
INFO - Invoking Bedrock Agent action: GenerateLesson
INFO - Generated lesson via Bedrock Agent: Introduction to Fractions
INFO - Successfully generated content via Bedrock Agent: 1 lessons, 1 quizzes
```

## Summary

The fix changes the model identifier from the direct model ID to the inference profile format. This is **required** for Bedrock Agents to work correctly. After deploying this fix:

1. ✅ Bedrock Agent will successfully invoke Claude 3.5 Sonnet
2. ✅ Real AI-generated content will be created
3. ✅ Students will receive personalized, curriculum-aligned lessons
4. ✅ The system will work as designed

The progressive mock content fallback remains available for development and testing scenarios where Bedrock Agent is not accessible.
