#!/usr/bin/env python3
"""Cleanup Bedrock Agent and related resources."""

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
        return None
    
    with open(config_file) as f:
        return json.load(f)


def cleanup_agent(agent_id: str, alias_id: str, region: str):
    """Delete agent alias and agent."""
    bedrock_agent = boto3.client("bedrock-agent", region_name=region)
    
    try:
        # Delete alias first
        if alias_id:
            print(f"🗑️  Deleting agent alias {alias_id}...")
            try:
                bedrock_agent.delete_agent_alias(
                    agentId=agent_id,
                    agentAliasId=alias_id
                )
                print("   ✅ Alias deleted")
            except ClientError as e:
                print(f"   ⚠️  Could not delete alias: {e}")
        
        # Delete agent
        print(f"🗑️  Deleting agent {agent_id}...")
        bedrock_agent.delete_agent(
            agentId=agent_id,
            skipResourceInUseCheck=True
        )
        print("   ✅ Agent deleted")
        
        return True
    except ClientError as e:
        print(f"❌ Failed to cleanup: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Cleanup Bedrock Agent")
    parser.add_argument(
        "--environment",
        default="dev",
        choices=["dev", "staging", "production"],
        help="Environment"
    )
    parser.add_argument(
        "--region",
        help="AWS region (overrides config)"
    )
    
    args = parser.parse_args()
    
    print("="*60)
    print("Cleanup Bedrock Agent")
    print("="*60)
    
    # Load configuration
    config = load_agent_config(args.environment)
    if not config:
        print("No configuration found. Nothing to cleanup.")
        sys.exit(0)
    
    agent_id = config.get("agent_id")
    alias_id = config.get("alias_id")
    region = args.region or config.get("region", "ap-south-1")
    
    print(f"Environment: {args.environment}")
    print(f"Agent ID: {agent_id}")
    print(f"Alias ID: {alias_id}")
    print(f"Region: {region}")
    
    if not agent_id:
        print("No agent ID found. Nothing to cleanup.")
        sys.exit(0)
    
    # Confirm
    response = input("\n⚠️  Are you sure you want to delete this agent? (yes/no): ")
    if response.lower() != "yes":
        print("Cleanup cancelled.")
        sys.exit(0)
    
    # Cleanup
    if cleanup_agent(agent_id, alias_id, region):
        print("\n✅ Cleanup completed successfully!")
        
        # Remove config file
        config_file = Path(__file__).parent.parent / f".bedrock-agent-{args.environment}.json"
        if config_file.exists():
            config_file.unlink()
            print(f"   Removed config file: {config_file.name}")
        
        print("\nYou can now set up the agent in a new region:")
        print(f"python cloud-brain/scripts/setup_bedrock_agent.py --environment {args.environment} --region us-east-1")
    else:
        print("\n❌ Cleanup failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
