#!/usr/bin/env python3
"""
Configure Lambda functions with Bedrock Agent credentials from .bedrock-agent-dev.json
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


def find_lambda_functions(stack_name: str) -> list[str]:
    """Find all Lambda functions in the CloudFormation stack."""
    cf = boto3.client("cloudformation")
    
    try:
        response = cf.describe_stack_resources(StackName=stack_name)
        
        lambda_functions = []
        for resource in response["StackResources"]:
            if resource["ResourceType"] == "AWS::Lambda::Function":
                lambda_functions.append(resource["PhysicalResourceId"])
        
        return lambda_functions
    except ClientError as e:
        print(f"❌ Failed to describe stack resources: {e}")
        return []


def update_lambda_env_vars(function_name: str, agent_id: str, alias_id: str, region: str):
    """Update Lambda function environment variables with Bedrock Agent credentials."""
    lambda_client = boto3.client("lambda", region_name=region)
    
    try:
        # Get current configuration
        response = lambda_client.get_function_configuration(FunctionName=function_name)
        
        # Update environment variables
        env_vars = response.get("Environment", {}).get("Variables", {})
        
        # Set Bedrock Agent credentials
        env_vars["BEDROCK_AGENT_ID"] = agent_id
        env_vars["BEDROCK_AGENT_ALIAS_ID"] = alias_id
        
        # Update function
        lambda_client.update_function_configuration(
            FunctionName=function_name,
            Environment={"Variables": env_vars}
        )
        
        print(f"✅ Updated {function_name}")
        print(f"   BEDROCK_AGENT_ID: {agent_id}")
        print(f"   BEDROCK_AGENT_ALIAS_ID: {alias_id}")
        return True
        
    except ClientError as e:
        print(f"❌ Failed to update {function_name}: {e}")
        return False


def main():
    print("="*70)
    print("Configure Lambda Functions with Bedrock Agent Credentials")
    print("="*70)
    print()
    
    # Load agent configuration
    print("📋 Loading Bedrock Agent configuration...")
    config = load_agent_config("dev")
    
    agent_id = config["agent_id"]
    alias_id = config["alias_id"]
    region = config.get("region", "us-east-1")
    agent_name = config.get("agent_name", "unknown")
    
    print(f"   Agent Name: {agent_name}")
    print(f"   Agent ID: {agent_id}")
    print(f"   Alias ID: {alias_id}")
    print(f"   Region: {region}")
    print()
    
    # Find Lambda functions in the stack
    stack_name = "SikshyaSathiCloudBrain-development"
    print(f"🔍 Finding Lambda functions in stack: {stack_name}...")
    
    lambda_functions = find_lambda_functions(stack_name)
    
    # Also find sync Lambda functions by name pattern (they might be in a different stack)
    print()
    print("💡 Also finding sync Lambda functions by name pattern...")
    
    lambda_client = boto3.client("lambda", region_name=region)
    try:
        response = lambda_client.list_functions()
        sync_functions = [
            f["FunctionName"] 
            for f in response["Functions"] 
            if "sikshya-sathi" in f["FunctionName"] and "development" in f["FunctionName"]
        ]
        
        # Merge with stack functions (remove duplicates)
        all_functions = list(set(lambda_functions + sync_functions))
        lambda_functions = all_functions
        
    except ClientError as e:
        print(f"⚠️  Warning: Failed to list functions by pattern: {e}")
    
    if not lambda_functions:
        print("❌ No Lambda functions found")
        sys.exit(1)
    
    if not lambda_functions:
        print("❌ No Lambda functions found")
        sys.exit(1)
    
    print(f"   Found {len(lambda_functions)} function(s)")
    for func in lambda_functions:
        print(f"   - {func}")
    print()
    
    # Update each Lambda function
    print("🔧 Updating Lambda functions...")
    success_count = 0
    
    for function_name in lambda_functions:
        if update_lambda_env_vars(function_name, agent_id, alias_id, region):
            success_count += 1
        print()
    
    # Summary
    print("="*70)
    if success_count == len(lambda_functions):
        print(f"🎉 SUCCESS: Updated all {success_count} Lambda function(s)")
        print()
        print("Next steps:")
        print("1. Test content generation:")
        print("   python cloud-brain/test_bedrock_agent_config.py")
        print()
        print("2. Check CloudWatch logs:")
        print(f"   aws logs tail /aws/lambda/{lambda_functions[0]} --follow")
        print()
        print("3. Trigger a sync operation from the local-brain app")
        return 0
    else:
        print(f"⚠️  WARNING: Updated {success_count}/{len(lambda_functions)} function(s)")
        return 1


if __name__ == "__main__":
    sys.exit(main())
