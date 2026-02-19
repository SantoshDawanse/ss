#!/usr/bin/env python3
"""Check current Bedrock Agent status and configuration."""

import argparse
import json
import sys
from pathlib import Path

import boto3

def load_agent_config(environment: str) -> dict:
    """Load Bedrock Agent configuration."""
    config_file = Path(__file__).parent.parent / f".bedrock-agent-{environment}.json"
    if not config_file.exists():
        print(f"❌ Configuration file not found: {config_file}")
        sys.exit(1)
    
    with open(config_file) as f:
        return json.load(f)


def main():
    parser = argparse.ArgumentParser(description="Check Bedrock Agent status")
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
    region = config.get("region", "ap-south-1")
    
    print("="*60)
    print("Bedrock Agent Status")
    print("="*60)
    print(f"Environment: {args.environment}")
    print(f"Agent ID: {agent_id}")
    print(f"Region: {region}")
    
    # Get agent details
    bedrock_agent = boto3.client("bedrock-agent", region_name=region)
    
    try:
        response = bedrock_agent.get_agent(agentId=agent_id)
        agent = response["agent"]
        
        print(f"\n✅ Agent found: {agent['agentName']}")
        print(f"   Status: {agent['agentStatus']}")
        print(f"   Foundation Model: {agent.get('foundationModel', 'N/A')}")
        print(f"   Created: {agent.get('createdAt', 'N/A')}")
        print(f"   Updated: {agent.get('updatedAt', 'N/A')}")
        
        # Check if model needs update
        current_model = agent.get('foundationModel', '')
        if 'anthropic.claude-3-5-sonnet-20241022-v2:0' in current_model and not current_model.startswith('us.'):
            print(f"\n⚠️  Model needs update!")
            print(f"   Current: {current_model}")
            print(f"   Should be: us.anthropic.claude-3-5-sonnet-20241022-v2:0")
            print(f"\n   Run: python cloud-brain/scripts/update_agent_model.py --environment {args.environment}")
        elif current_model.startswith('us.anthropic.claude-3-5-sonnet'):
            print(f"\n✅ Model is correctly configured with inference profile")
        
    except Exception as e:
        print(f"\n❌ Failed to get agent: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
