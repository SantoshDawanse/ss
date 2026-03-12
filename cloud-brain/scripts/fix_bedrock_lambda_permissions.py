#!/usr/bin/env python3
"""
Fix Lambda permissions for Bedrock Agent to invoke action group Lambda functions.
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


def get_agent_role_arn(agent_id: str, region: str) -> str:
    """Get the IAM role ARN for the Bedrock Agent."""
    bedrock_agent = boto3.client("bedrock-agent", region_name=region)
    
    try:
        response = bedrock_agent.get_agent(agentId=agent_id)
        return response["agent"]["agentResourceRoleArn"]
    except ClientError as e:
        print(f"❌ Failed to get agent: {e}")
        sys.exit(1)


def add_lambda_permission(function_name: str, agent_role_arn: str, region: str):
    """Add permission for Bedrock Agent role to invoke Lambda function."""
    lambda_client = boto3.client("lambda", region_name=region)
    
    # Extract account ID from role ARN
    account_id = agent_role_arn.split(":")[4]
    
    # Statement ID for the permission
    statement_id = "AllowBedrockAgentInvoke"
    
    try:
        # Remove existing permission if it exists
        try:
            lambda_client.remove_permission(
                FunctionName=function_name,
                StatementId=statement_id
            )
            print(f"   Removed existing permission for {function_name}")
        except ClientError:
            pass  # Permission doesn't exist, that's fine
        
        # Add new permission
        lambda_client.add_permission(
            FunctionName=function_name,
            StatementId=statement_id,
            Action="lambda:InvokeFunction",
            Principal="bedrock.amazonaws.com",
            SourceAccount=account_id,
            SourceArn=f"arn:aws:bedrock:{region}:{account_id}:agent/*"
        )
        
        print(f"✅ Added permission for Bedrock Agent to invoke {function_name}")
        return True
        
    except ClientError as e:
        print(f"❌ Failed to add permission for {function_name}: {e}")
        return False


def main():
    print("="*70)
    print("Fix Bedrock Agent Lambda Permissions")
    print("="*70)
    print()
    
    # Load agent configuration
    print("📋 Loading Bedrock Agent configuration...")
    config = load_agent_config("dev")
    
    agent_id = config["agent_id"]
    agent_name = config.get("agent_name", "unknown")
    region = config.get("region", "us-east-1")
    
    print(f"   Agent Name: {agent_name}")
    print(f"   Agent ID: {agent_id}")
    print(f"   Region: {region}")
    print()
    
    # Get agent role ARN
    print("🔍 Getting Bedrock Agent IAM role...")
    agent_role_arn = get_agent_role_arn(agent_id, region)
    print(f"   Role ARN: {agent_role_arn}")
    print()
    
    # Find Lambda functions that need permissions
    # These are the action group Lambda functions
    lambda_functions = [
        "sikshya-sathi-content-gen-development",  # Main content generation function
    ]
    
    print(f"🔧 Adding Lambda permissions for Bedrock Agent...")
    success_count = 0
    
    for function_name in lambda_functions:
        print(f"\n   Processing {function_name}...")
        if add_lambda_permission(function_name, agent_role_arn, region):
            success_count += 1
    
    print()
    print("="*70)
    
    if success_count == len(lambda_functions):
        print(f"🎉 SUCCESS: Added permissions for all {success_count} Lambda function(s)")
        print()
        print("Next steps:")
        print("1. Test content generation:")
        print("   python cloud-brain/test_bedrock_agent_config.py")
        print()
        print("2. The Bedrock Agent should now be able to invoke Lambda functions")
        return 0
    else:
        print(f"⚠️  WARNING: Added permissions for {success_count}/{len(lambda_functions)} function(s)")
        return 1


if __name__ == "__main__":
    sys.exit(main())
