#!/usr/bin/env python3
"""
Create a new Bedrock Agent without action groups for direct invocation.
"""

import json
import sys
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError


def create_agent(region: str = "us-east-1") -> dict:
    """Create a new Bedrock Agent without action groups."""
    bedrock_agent = boto3.client("bedrock-agent", region_name=region)
    iam = boto3.client("iam", region_name=region)
    
    # Get the existing agent role ARN
    role_name = "sikshya-sathi-bedrock-agent-development"
    try:
        role_response = iam.get_role(RoleName=role_name)
        role_arn = role_response["Role"]["Arn"]
        print(f"✅ Using existing IAM role: {role_arn}")
    except ClientError as e:
        print(f"❌ Failed to get IAM role: {e}")
        return {}
    
    # Agent instructions
    instructions = """You are an expert educational content generator for the Sikshya-Sathi system, 
designed to create personalized learning materials for rural Nepali K-12 students (grades 6-8).

Your responsibilities:
1. Generate lessons aligned with Nepal K-12 curriculum standards
2. Create quizzes that assess understanding at appropriate cognitive levels
3. Provide progressive hints that guide without revealing answers
4. Use culturally appropriate examples relevant to Nepal
5. Ensure age-appropriate language and complexity
6. Support both Nepali and English languages
7. Incorporate metric system and Nepali currency (NPR) in examples

When generating content:
- Always respond with valid JSON in the exact format requested
- Include all required fields
- Make content engaging and pedagogically sound
- Adapt difficulty to student level
- Reference curriculum standards when provided"""
    
    agent_name = "sikshya-sathi-content-v2"
    
    try:
        print(f"\n🤖 Creating Bedrock Agent: {agent_name}")
        print(f"   Model: us.anthropic.claude-3-5-haiku-20241022-v1:0")
        print(f"   Region: {region}")
        
        response = bedrock_agent.create_agent(
            agentName=agent_name,
            foundationModel="us.anthropic.claude-3-5-haiku-20241022-v1:0",
            instruction=instructions,
            agentResourceRoleArn=role_arn,
            description="Bedrock Agent for generating curriculum-aligned educational content (no action groups)",
            idleSessionTTLInSeconds=600,
        )
        
        agent_id = response["agent"]["agentId"]
        print(f"✅ Agent created: {agent_id}")
        
        # Prepare the agent
        print("   Preparing agent...")
        bedrock_agent.prepare_agent(agentId=agent_id)
        
        # Wait for agent to be prepared
        print("   Waiting for agent to be ready...")
        max_attempts = 30
        for attempt in range(max_attempts):
            agent_response = bedrock_agent.get_agent(agentId=agent_id)
            status = agent_response["agent"]["agentStatus"]
            
            if status in ["PREPARED", "READY"]:
                print(f"✅ Agent is {status}")
                break
            elif status == "FAILED":
                print(f"❌ Agent preparation failed")
                return {}
            
            time.sleep(2)
            if attempt % 5 == 0:
                print(f"   Status: {status} (attempt {attempt + 1}/{max_attempts})")
        
        # Create alias
        print("\n📌 Creating agent alias...")
        alias_response = bedrock_agent.create_agent_alias(
            agentId=agent_id,
            agentAliasName="production",
            description="Production alias for content generation"
        )
        
        alias_id = alias_response["agentAlias"]["agentAliasId"]
        print(f"✅ Alias created: {alias_id}")
        
        return {
            "agent_id": agent_id,
            "agent_name": agent_name,
            "alias_id": alias_id,
            "alias_name": "production",
            "action_groups": [],
            "region": region
        }
        
    except ClientError as e:
        print(f"❌ Failed to create agent: {e}")
        return {}


def save_config(config: dict, environment: str = "dev"):
    """Save agent configuration."""
    config_file = Path(__file__).parent.parent / f".bedrock-agent-{environment}.json"
    
    # Backup old config
    if config_file.exists():
        backup_file = config_file.with_suffix('.json.backup')
        config_file.rename(backup_file)
        print(f"📦 Backed up old config to: {backup_file.name}")
    
    with open(config_file, 'w') as f:
        json.dump(config, f, indent=2)
    
    print(f"✅ Saved configuration to: {config_file.name}")


def main():
    print("="*70)
    print("Create Clean Bedrock Agent (No Action Groups)")
    print("="*70)
    print()
    
    # Create agent
    config = create_agent()
    
    if not config:
        print("\n❌ Failed to create agent")
        return 1
    
    # Save configuration
    print()
    save_config(config)
    
    print()
    print("="*70)
    print("🎉 SUCCESS: Clean agent created!")
    print("="*70)
    print()
    print(f"Agent ID: {config['agent_id']}")
    print(f"Alias ID: {config['alias_id']}")
    print()
    print("Next steps:")
    print("1. Configure Lambda functions:")
    print("   python cloud-brain/scripts/configure_lambda_bedrock.py")
    print()
    print("2. Test content generation:")
    print("   python cloud-brain/test_bedrock_agent_config.py")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
