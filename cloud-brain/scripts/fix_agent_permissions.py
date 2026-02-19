#!/usr/bin/env python3
"""Fix Bedrock Agent IAM role permissions to allow inference profiles."""

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


def get_agent_role_name(agent_id: str, region: str) -> str:
    """Get the IAM role name for the agent."""
    bedrock_agent = boto3.client("bedrock-agent", region_name=region)
    
    response = bedrock_agent.get_agent(agentId=agent_id)
    role_arn = response["agent"]["agentResourceRoleArn"]
    
    # Extract role name from ARN: arn:aws:iam::account:role/role-name
    role_name = role_arn.split("/")[-1]
    return role_name


def update_role_policy(role_name: str, region: str):
    """Update IAM role policy to allow Claude 3 Sonnet and inference profiles."""
    iam = boto3.client("iam")
    
    # Policy to allow Claude 3 Sonnet and all inference profiles (including cross-region)
    policy_document = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream"
                ],
                "Resource": [
                    f"arn:aws:bedrock:{region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0",
                    f"arn:aws:bedrock:{region}::foundation-model/anthropic.claude-*",
                    "arn:aws:bedrock:*:*:inference-profile/*",
                    "arn:aws:bedrock:*::foundation-model/*"
                ]
            }
        ]
    }
    
    policy_name = "BedrockClaude3Access"
    
    try:
        # Try to create inline policy
        print(f"📝 Adding Claude 3 Sonnet and inference profile permissions to role {role_name}...")
        iam.put_role_policy(
            RoleName=role_name,
            PolicyName=policy_name,
            PolicyDocument=json.dumps(policy_document)
        )
        print(f"✅ Successfully added policy {policy_name}")
        return True
    except ClientError as e:
        print(f"❌ Failed to update role policy: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Fix Bedrock Agent IAM permissions")
    parser.add_argument(
        "--environment",
        default="dev",
        choices=["dev", "staging", "production"],
        help="Environment"
    )
    
    args = parser.parse_args()
    
    print("="*60)
    print("Fix Bedrock Agent IAM Permissions")
    print("="*60)
    
    # Load configuration
    config = load_agent_config(args.environment)
    agent_id = config["agent_id"]
    region = config.get("region", "ap-south-1")
    
    print(f"Environment: {args.environment}")
    print(f"Agent ID: {agent_id}")
    print(f"Region: {region}")
    
    # Get role name
    print("\n🔍 Getting agent IAM role...")
    role_name = get_agent_role_name(agent_id, region)
    print(f"   Role: {role_name}")
    
    # Update policy
    if update_role_policy(role_name, region):
        print("\n✅ Permissions updated successfully!")
        print("\nNow update the agent model:")
        print(f"python cloud-brain/scripts/update_agent_model.py --environment {args.environment}")
    else:
        print("\n❌ Failed to update permissions")
        sys.exit(1)


if __name__ == "__main__":
    main()
