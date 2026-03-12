#!/usr/bin/env python3
"""
Remove action groups from Bedrock Agent so it can be invoked directly.
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


def save_agent_config(environment: str, config: dict):
    """Save updated agent configuration."""
    config_file = Path(__file__).parent.parent / f".bedrock-agent-{environment}.json"
    with open(config_file, 'w') as f:
        json.dump(config, f, indent=2)


def remove_action_groups(agent_id: str, region: str) -> bool:
    """Remove all action groups from the agent."""
    bedrock_agent = boto3.client("bedrock-agent", region_name=region)
    
    try:
        # List all action groups
        print("   Listing action groups...")
        response = bedrock_agent.list_agent_action_groups(
            agentId=agent_id,
            agentVersion="DRAFT"
        )
        
        action_groups = response.get("actionGroupSummaries", [])
        
        if not action_groups:
            print("   No action groups found")
            return True
        
        print(f"   Found {len(action_groups)} action group(s)")
        print()
        print("   ⚠️  Note: Action groups cannot be deleted while enabled.")
        print("   Recommendation: Create a new agent without action groups.")
        print()
        
        # Show action groups
        for ag in action_groups:
            ag_name = ag["actionGroupName"]
            ag_state = ag.get("actionGroupState", "UNKNOWN")
            print(f"   - {ag_name}: {ag_state}")
        
        return False
        
    except ClientError as e:
        print(f"❌ Failed to list action groups: {e}")
        return False


def main():
    print("="*70)
    print("Remove Bedrock Agent Action Groups")
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
    
    # Remove action groups
    print("🔧 Removing action groups from agent...")
    if remove_action_groups(agent_id, region):
        print()
        print("✅ Successfully removed all action groups")
        
        # Update config file
        config["action_groups"] = []
        save_agent_config("dev", config)
        print("✅ Updated configuration file")
        
        print()
        print("="*70)
        print("🎉 SUCCESS: Agent is now configured for direct invocation")
        print()
        print("Next steps:")
        print("1. Test content generation:")
        print("   python cloud-brain/test_bedrock_agent_config.py")
        print()
        print("2. The agent will now generate content directly without Lambda functions")
        return 0
    else:
        print()
        print("❌ Failed to remove action groups")
        return 1


if __name__ == "__main__":
    sys.exit(main())
