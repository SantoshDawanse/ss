#!/usr/bin/env python3
"""
Grant Lambda functions permission to invoke Bedrock Agent.
This adds bedrock:InvokeAgent permission to Lambda execution roles.
"""

import json
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError


def load_agent_config(environment: str = "dev") -> dict:
    """Load Bedrock Agent configuration."""
    config_file = Path(__file__).parent.parent / f".bedrock-agent-{environment}.json"
    if not config_file.exists():
        print(f"❌ Configuration file not found: {config_file}")
        sys.exit(1)
    
    with open(config_file) as f:
        return json.load(f)


def get_lambda_role(function_name: str, region: str) -> str:
    """Get the IAM role ARN for a Lambda function."""
    lambda_client = boto3.client("lambda", region_name=region)
    
    try:
        response = lambda_client.get_function(FunctionName=function_name)
        return response["Configuration"]["Role"]
    except ClientError as e:
        print(f"   ⚠️  Failed to get function {function_name}: {e}")
        return None


def add_bedrock_invoke_policy(role_arn: str, agent_id: str, alias_id: str, region: str) -> bool:
    """Add inline policy to allow invoking Bedrock Agent."""
    iam = boto3.client("iam")
    
    # Extract role name from ARN
    role_name = role_arn.split("/")[-1]
    
    # Extract account ID from role ARN
    account_id = role_arn.split(":")[4]
    
    # Policy document
    policy_document = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "bedrock:InvokeAgent"
                ],
                "Resource": [
                    f"arn:aws:bedrock:{region}:{account_id}:agent-alias/{agent_id}/{alias_id}"
                ]
            }
        ]
    }
    
    policy_name = "BedrockAgentInvokePolicy"
    
    try:
        # Put inline policy
        iam.put_role_policy(
            RoleName=role_name,
            PolicyName=policy_name,
            PolicyDocument=json.dumps(policy_document)
        )
        
        print(f"      ✅ Added {policy_name} to role {role_name}")
        return True
        
    except ClientError as e:
        print(f"      ❌ Failed to add policy to {role_name}: {e}")
        return False


def main():
    print("="*70)
    print("Grant Lambda Functions Permission to Invoke Bedrock Agent")
    print("="*70)
    print()
    
    # Load agent configuration
    print("📋 Loading Bedrock Agent configuration...")
    config = load_agent_config("dev")
    
    agent_id = config["agent_id"]
    alias_id = config["alias_id"]
    agent_name = config.get("agent_name", "unknown")
    region = config.get("region", "us-east-1")
    
    print(f"   Agent Name: {agent_name}")
    print(f"   Agent ID: {agent_id}")
    print(f"   Alias ID: {alias_id}")
    print(f"   Region: {region}")
    print()
    
    # Find all Lambda functions that need permissions
    print("🔍 Finding Lambda functions...")
    lambda_client = boto3.client("lambda", region_name=region)
    
    try:
        response = lambda_client.list_functions()
        lambda_functions = [
            f["FunctionName"] 
            for f in response["Functions"] 
            if "sikshya-sathi" in f["FunctionName"] and "development" in f["FunctionName"]
        ]
    except ClientError as e:
        print(f"❌ Failed to list functions: {e}")
        sys.exit(1)
    
    print(f"   Found {len(lambda_functions)} function(s)")
    for func in lambda_functions:
        print(f"   - {func}")
    print()
    
    # Add permissions to each Lambda function's role
    print("🔧 Adding Bedrock invoke permissions to Lambda roles...")
    success_count = 0
    processed_roles = set()  # Track roles we've already processed
    
    for function_name in lambda_functions:
        print(f"\n   Processing {function_name}...")
        
        # Get Lambda role
        role_arn = get_lambda_role(function_name, region)
        if not role_arn:
            continue
        
        # Skip if we've already processed this role
        if role_arn in processed_roles:
            print(f"      ℹ️  Role already processed (shared with another function)")
            success_count += 1
            continue
        
        print(f"      Role: {role_arn.split('/')[-1]}")
        
        # Add policy
        if add_bedrock_invoke_policy(role_arn, agent_id, alias_id, region):
            success_count += 1
            processed_roles.add(role_arn)
    
    print()
    print("="*70)
    
    if success_count == len(lambda_functions):
        print(f"🎉 SUCCESS: Added permissions for all {success_count} Lambda function(s)")
        print()
        print("Next steps:")
        print("1. Test content generation:")
        print("   python cloud-brain/test_bedrock_agent_config.py")
        print()
        print("2. Trigger a sync operation from the local-brain app")
        print()
        print("3. Check CloudWatch logs:")
        print(f"   aws logs tail /aws/lambda/sikshya-sathi-sync-download-development --follow")
        return 0
    else:
        print(f"⚠️  WARNING: Added permissions for {success_count}/{len(lambda_functions)} function(s)")
        return 1


if __name__ == "__main__":
    sys.exit(main())
