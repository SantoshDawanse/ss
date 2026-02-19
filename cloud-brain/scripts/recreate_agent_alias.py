#!/usr/bin/env python3
"""Recreate agent alias to use the latest prepared agent."""

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


def save_agent_config(environment: str, config: dict):
    """Save updated agent configuration."""
    config_file = Path(__file__).parent.parent / f".bedrock-agent-{environment}.json"
    with open(config_file, 'w') as f:
        json.dump(config, f, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Recreate Bedrock Agent alias")
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
    old_alias_id = config.get("alias_id")
    alias_name = config.get("alias_name", f"{args.environment}-alias")
    region = config.get("region", "ap-south-1")
    
    print("="*60)
    print("Recreate Bedrock Agent Alias")
    print("="*60)
    print(f"Environment: {args.environment}")
    print(f"Agent ID: {agent_id}")
    print(f"Old Alias ID: {old_alias_id}")
    print(f"Region: {region}")
    
    bedrock_agent = boto3.client("bedrock-agent", region_name=region)
    
    try:
        # Delete old alias
        if old_alias_id:
            print(f"\n🗑️  Deleting old alias {old_alias_id}...")
            try:
                bedrock_agent.delete_agent_alias(
                    agentId=agent_id,
                    agentAliasId=old_alias_id
                )
                print("   ✅ Old alias deleted")
                time.sleep(5)
            except ClientError as e:
                print(f"   ⚠️  Could not delete old alias: {e}")
        
        # Prepare agent first
        print("\n🔄 Preparing agent...")
        bedrock_agent.prepare_agent(agentId=agent_id)
        print("   Waiting for agent to be prepared...")
        time.sleep(20)
        
        # Create new alias pointing to DRAFT
        print(f"\n📦 Creating new alias '{alias_name}'...")
        alias_response = bedrock_agent.create_agent_alias(
            agentId=agent_id,
            agentAliasName=alias_name,
            description=f"Alias for {args.environment} environment"
        )
        
        new_alias_id = alias_response["agentAlias"]["agentAliasId"]
        print(f"   ✅ Created new alias: {new_alias_id}")
        
        # Update config file
        config["alias_id"] = new_alias_id
        config["alias_name"] = alias_name
        save_agent_config(args.environment, config)
        
        print(f"\n✅ Alias recreated successfully!")
        print(f"   New Alias ID: {new_alias_id}")
        print(f"\n   Test with:")
        print(f"   python cloud-brain/scripts/test_content_generation.py --environment {args.environment} --test lesson")
        
    except ClientError as e:
        print(f"\n❌ Failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
