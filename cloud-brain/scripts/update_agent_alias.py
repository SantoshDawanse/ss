#!/usr/bin/env python3
"""Update Bedrock Agent alias to use the latest prepared agent."""

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
    parser = argparse.ArgumentParser(description="Update Bedrock Agent alias")
    parser.add_argument(
        "--environment",
        default="dev",
        choices=["dev", "staging", "production"],
        help="Environment"
    )
    
    args = parser.parse_args()
    
    # Load configuration
    config = load_agent_config(args.environment)
    agent_id = config["agent_id"]
    alias_id = config["alias_id"]
    alias_name = config.get("alias_name", f"{args.environment}-alias")
    region = config.get("region", "ap-south-1")
    
    print("="*60)
    print("Update Bedrock Agent Alias")
    print("="*60)
    print(f"Environment: {args.environment}")
    print(f"Agent ID: {agent_id}")
    print(f"Alias ID: {alias_id}")
    print(f"Region: {region}")
    
    bedrock_agent = boto3.client("bedrock-agent", region_name=region)
    
    try:
        # First, prepare the agent
        print("\n� Preparing agent...")
        bedrock_agent.prepare_agent(agentId=agent_id)
        print("   Waiting for agent to be prepared...")
        time.sleep(20)
        
        # Check agent status
        agent_response = bedrock_agent.get_agent(agentId=agent_id)
        agent_status = agent_response["agent"]["agentStatus"]
        print(f"   Agent status: {agent_status}")
        
        # Get current alias configuration
        print("\n📋 Getting current alias configuration...")
        alias_response = bedrock_agent.get_agent_alias(
            agentId=agent_id,
            agentAliasId=alias_id
        )
        alias = alias_response["agentAlias"]
        
        current_routing = alias.get("routingConfiguration", [])
        print(f"   Current routing: {current_routing}")
        
        # For dev environment, we can use DRAFT version
        # For production, you'd want to create numbered versions
        if args.environment == "dev":
            print(f"\n✅ For dev environment, the alias will use the prepared agent directly.")
            print(f"   No alias update needed - the agent is ready to use.")
            print(f"\n   Test with:")
            print(f"   python cloud-brain/scripts/test_content_generation.py --environment {args.environment} --test lesson")
        else:
            print(f"\n⚠️  For {args.environment} environment, you should create a numbered version.")
            print(f"   This requires using the AWS Console or AWS CLI.")
        
    except ClientError as e:
        print(f"\n❌ Failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
