#!/usr/bin/env python3
"""Fix Bedrock Agent action groups to point to correct Lambda function."""

import argparse
import json
import sys
import time
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


def main():
    parser = argparse.ArgumentParser(description="Fix action group Lambda ARNs")
    parser.add_argument(
        "--environment",
        default="dev",
        choices=["dev", "staging", "production"],
        help="Environment"
    )
    parser.add_argument(
        "--lambda-suffix",
        default="development",
        help="Lambda function name suffix (e.g., 'development', 'dev')"
    )
    
    args = parser.parse_args()
    
    # Load configuration
    config = load_agent_config(args.environment)
    agent_id = config["agent_id"]
    region = config.get("region", "us-east-1")
    
    print("="*60)
    print("Fix Bedrock Agent Action Group Lambda ARNs")
    print("="*60)
    print(f"Environment: {args.environment}")
    print(f"Agent ID: {agent_id}")
    print(f"Lambda Suffix: {args.lambda_suffix}")
    print(f"Region: {region}")
    
    bedrock_agent = boto3.client("bedrock-agent", region_name=region)
    
    # Get AWS account ID
    sts = boto3.client("sts")
    account_id = sts.get_caller_identity()["Account"]
    
    # Construct correct Lambda ARN
    correct_lambda_arn = f"arn:aws:lambda:{region}:{account_id}:function:sikshya-sathi-content-gen-{args.lambda_suffix}"
    print(f"\n📝 Target Lambda ARN: {correct_lambda_arn}")
    
    try:
        # Get DRAFT version action groups
        print("\n🔍 Getting action groups...")
        action_groups = bedrock_agent.list_agent_action_groups(
            agentId=agent_id,
            agentVersion="DRAFT"
        )
        
        for ag_summary in action_groups["actionGroupSummaries"]:
            ag_name = ag_summary["actionGroupName"]
            ag_id = ag_summary["actionGroupId"]
            
            print(f"\n   Updating {ag_name}...")
            
            # Get full action group details
            ag_details = bedrock_agent.get_agent_action_group(
                agentId=agent_id,
                agentVersion="DRAFT",
                actionGroupId=ag_id
            )
            
            ag = ag_details["agentActionGroup"]
            
            # Update the action group with correct Lambda ARN
            bedrock_agent.update_agent_action_group(
                agentId=agent_id,
                agentVersion="DRAFT",
                actionGroupId=ag_id,
                actionGroupName=ag_name,
                actionGroupState="ENABLED",
                actionGroupExecutor={
                    "lambda": correct_lambda_arn
                },
                apiSchema=ag.get("apiSchema", {}),
                description=ag.get("description", "")
            )
            
            print(f"   ✅ Updated {ag_name}")
        
        # Prepare the agent
        print("\n🔄 Preparing agent...")
        bedrock_agent.prepare_agent(agentId=agent_id)
        print("   Waiting for agent to be prepared...")
        time.sleep(15)
        
        # Check status
        agent_response = bedrock_agent.get_agent(agentId=agent_id)
        agent_status = agent_response["agent"]["agentStatus"]
        print(f"   Agent status: {agent_status}")
        
        print("\n✅ Action groups updated successfully!")
        print(f"\nTest with:")
        print(f"python scripts/test_content_generation.py --environment {args.environment} --test lesson")
        
    except ClientError as e:
        print(f"\n❌ Failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
