#!/usr/bin/env python3
"""Script to update Bedrock Agent model to use inference profile."""

import argparse
import json
import logging
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def load_agent_config(environment: str) -> dict:
    """Load Bedrock Agent configuration."""
    config_file = Path(__file__).parent.parent / f".bedrock-agent-{environment}.json"
    if not config_file.exists():
        logger.error(f"Configuration file not found: {config_file}")
        sys.exit(1)
    
    with open(config_file) as f:
        return json.load(f)


def update_agent_model(agent_id: str, region: str):
    """Update agent to use Claude 3.5 Haiku inference profile."""
    bedrock_agent = boto3.client("bedrock-agent", region_name=region)
    
    # Claude 3.5 Haiku inference profile - ACTIVE
    new_model = "us.anthropic.claude-3-5-haiku-20241022-v1:0"
    
    try:
        # Get current agent configuration
        logger.info(f"Getting current agent configuration for {agent_id}...")
        response = bedrock_agent.get_agent(agentId=agent_id)
        agent = response["agent"]
        
        logger.info(f"Current model: {agent.get('foundationModel', 'N/A')}")
        logger.info(f"Updating to: {new_model}")
        
        # Update agent with new model
        update_response = bedrock_agent.update_agent(
            agentId=agent_id,
            agentName=agent["agentName"],
            foundationModel=new_model,
            instruction=agent["instruction"],
            agentResourceRoleArn=agent["agentResourceRoleArn"],
            description=agent.get("description", ""),
            idleSessionTTLInSeconds=agent.get("idleSessionTTLInSeconds", 600),
        )
        
        logger.info("✅ Agent model updated successfully!")
        
        # Prepare the agent
        logger.info("Preparing agent...")
        bedrock_agent.prepare_agent(agentId=agent_id)
        
        logger.info("✅ Agent prepared successfully!")
        logger.info(f"\nNew model: {new_model}")
        logger.info("\nYou can now test the agent with:")
        logger.info(f"python cloud-brain/scripts/test_content_generation.py --environment {args.environment} --test lesson")
        
    except ClientError as e:
        logger.error(f"Failed to update agent: {e}")
        sys.exit(1)


def main():
    global args
    parser = argparse.ArgumentParser(description="Update Bedrock Agent model")
    parser.add_argument(
        "--environment",
        default="dev",
        choices=["dev", "staging", "production"],
        help="Environment"
    )
    
    args = parser.parse_args()
    
    logger.info("="*60)
    logger.info("Update Bedrock Agent Model")
    logger.info("="*60)
    
    # Load configuration
    config = load_agent_config(args.environment)
    agent_id = config["agent_id"]
    region = config.get("region", "ap-south-1")
    
    logger.info(f"Environment: {args.environment}")
    logger.info(f"Agent ID: {agent_id}")
    logger.info(f"Region: {region}")
    
    # Update agent
    update_agent_model(agent_id, region)


if __name__ == "__main__":
    main()
