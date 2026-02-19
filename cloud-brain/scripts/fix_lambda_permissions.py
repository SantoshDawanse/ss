#!/usr/bin/env python3
"""Fix Lambda function permissions to allow Bedrock Agent invocation."""

import argparse
import json
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError


def load_agent_config(environment: str) -> dict:
    """Load Bedrock Agent configuration."""
    config_file = Path(__file__).parent.parent / f".bedrock-agent-{environment}.json"
    if not config_file.exists():
        print(f"❌ Configuration file not found: {config_file}")
        sys.exit(1)
    
    with open(config_file) as f:
        return json.load(f)


def fix_lambda_permissions(agent_id: str, region: str):
    """Add permission for Bedrock Agent to invoke Lambda functions."""
    lambda_client = boto3.client("lambda", region_name=region)
    bedrock_agent = boto3.client("bedrock-agent", region_name=region)
    
    # Get agent details
    agent_response = bedrock_agent.get_agent(agentId=agent_id)
    agent_arn = agent_response["agent"]["agentArn"]
    
    # Get action groups to find Lambda functions
    action_groups_response = bedrock_agent.list_agent_action_groups(
        agentId=agent_id,
        agentVersion="DRAFT"
    )
    
    print(f"\n📋 Found {len(action_groups_response['actionGroupSummaries'])} action groups")
    
    for action_group in action_groups_response["actionGroupSummaries"]:
        action_group_id = action_group["actionGroupId"]
        action_group_name = action_group["actionGroupName"]
        
        # Get action group details
        ag_details = bedrock_agent.get_agent_action_group(
            agentId=agent_id,
            agentVersion="DRAFT",
            actionGroupId=action_group_id
        )
        
        executor_config = ag_details["agentActionGroup"].get("actionGroupExecutor", {})
        lambda_arn = executor_config.get("lambda")
        
        if not lambda_arn:
            print(f"   ⚠️  {action_group_name}: No Lambda function configured")
            continue
        
        # Extract function name from ARN
        function_name = lambda_arn.split(":")[-1]
        
        print(f"\n   🔧 Fixing permissions for {action_group_name}")
        print(f"      Lambda: {function_name}")
        
        try:
            # Add permission for Bedrock Agent to invoke Lambda
            lambda_client.add_permission(
                FunctionName=function_name,
                StatementId=f"AllowBedrockAgent-{agent_id}",
                Action="lambda:InvokeFunction",
                Principal="bedrock.amazonaws.com",
                SourceArn=agent_arn
            )
            print(f"      ✅ Permission added")
        except ClientError as e:
            if e.response["Error"]["Code"] == "ResourceConflictException":
                print(f"      ℹ️  Permission already exists")
            else:
                print(f"      ❌ Failed: {e}")


def main():
    parser = argparse.ArgumentParser(description="Fix Lambda permissions for Bedrock Agent")
    parser.add_argument(
        "--environment",
        default="dev",
        choices=["dev", "staging", "production"],
        help="Environment"
    )
    
    args = parser.parse_args()
    
    print("="*60)
    print("Fix Lambda Permissions for Bedrock Agent")
    print("="*60)
    
    # Load configuration
    config = load_agent_config(args.environment)
    agent_id = config["agent_id"]
    region = config.get("region", "us-east-1")
    
    print(f"Environment: {args.environment}")
    print(f"Agent ID: {agent_id}")
    print(f"Region: {region}")
    
    # Fix permissions
    fix_lambda_permissions(agent_id, region)
    
    print("\n" + "="*60)
    print("✅ Lambda permissions updated!")
    print("\nNow test the agent:")
    print(f"python cloud-brain/scripts/test_content_generation.py --environment {args.environment} --test lesson")
    print("="*60)


if __name__ == "__main__":
    main()
