#!/usr/bin/env python3
"""Script to set up Bedrock Agent for Sikshya-Sathi."""

import argparse
import json
import logging
import sys
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from config.bedrock_agent_config import (
    ACTION_GROUPS,
    AGENT_INSTRUCTION,
    BEDROCK_AGENT_NAME,
    BEDROCK_FOUNDATION_MODEL,
    BEDROCK_REGION,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BedrockAgentSetup:
    """Setup and configure Bedrock Agent."""

    def __init__(self, environment: str, region: str = BEDROCK_REGION):
        """Initialize setup."""
        self.environment = environment
        self.region = region
        self.bedrock_agent = boto3.client("bedrock-agent", region_name=region)
        self.iam = boto3.client("iam", region_name=region)
        
        # Get AWS account ID
        sts = boto3.client("sts", region_name=region)
        self.account_id = sts.get_caller_identity()["Account"]

    def get_agent_role_arn(self) -> str:
        """Get or create IAM role ARN for Bedrock Agent."""
        # First try to get from CloudFormation exports
        try:
            cfn = boto3.client("cloudformation", region_name=self.region)
            export_name = f"sikshya-sathi-bedrock-role-{self.environment}"
            exports = cfn.list_exports()

            for export in exports.get("Exports", []):
                if export["Name"] == export_name:
                    logger.info(f"Found existing role from CloudFormation: {export['Value']}")
                    return export["Value"]
        except ClientError:
            pass

        # If not found, create the role directly
        logger.info("CloudFormation export not found, creating IAM role directly...")
        return self._create_iam_role()

    def _create_iam_role(self) -> str:
        """Create IAM role for Bedrock Agent."""
        iam = boto3.client("iam")
        role_name = f"sikshya-sathi-bedrock-agent-{self.environment}"
        
        # Trust policy for Bedrock
        trust_policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "Service": "bedrock.amazonaws.com"
                    },
                    "Action": "sts:AssumeRole"
                }
            ]
        }
        
        # Check if role exists
        try:
            response = iam.get_role(RoleName=role_name)
            logger.info(f"Role {role_name} already exists")
            role_arn = response["Role"]["Arn"]
        except iam.exceptions.NoSuchEntityException:
            # Create role
            logger.info(f"Creating IAM role: {role_name}")
            response = iam.create_role(
                RoleName=role_name,
                AssumeRolePolicyDocument=json.dumps(trust_policy),
                Description=f"Role for Sikshya-Sathi Bedrock Agent ({self.environment})"
            )
            role_arn = response["Role"]["Arn"]
            logger.info(f"Created role: {role_arn}")
        
        # Add Bedrock model invocation policy
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
                        f"arn:aws:bedrock:{self.region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0",
                        f"arn:aws:bedrock:{self.region}::foundation-model/anthropic.claude-*"
                    ]
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "bedrock:Retrieve",
                        "bedrock:RetrieveAndGenerate"
                    ],
                    "Resource": "*"
                }
            ]
        }
        
        try:
            iam.put_role_policy(
                RoleName=role_name,
                PolicyName="BedrockModelAccess",
                PolicyDocument=json.dumps(policy_document)
            )
            logger.info("Added Bedrock permissions to role")
        except ClientError as e:
            logger.warning(f"Could not add policy: {e}")
        
        return role_arn

    def create_agent(self, role_arn: str) -> dict:
        """Create Bedrock Agent."""
        agent_name = f"{BEDROCK_AGENT_NAME}-{self.environment}"

        try:
            # Check if agent already exists
            try:
                agents = self.bedrock_agent.list_agents()
                for agent in agents.get("agentSummaries", []):
                    if agent["agentName"] == agent_name:
                        logger.info(f"Agent {agent_name} already exists")
                        return {
                            "agent_id": agent["agentId"],
                            "agent_name": agent["agentName"],
                        }
            except Exception:
                pass

            # Create new agent
            logger.info(f"Creating Bedrock Agent: {agent_name}")

            response = self.bedrock_agent.create_agent(
                agentName=agent_name,
                foundationModel=BEDROCK_FOUNDATION_MODEL,
                instruction=AGENT_INSTRUCTION,
                agentResourceRoleArn=role_arn,
                description=f"Sikshya-Sathi content generator for {self.environment}",
                idleSessionTTLInSeconds=600,
            )

            agent_id = response["agent"]["agentId"]
            logger.info(f"Created agent with ID: {agent_id}")

            return {
                "agent_id": agent_id,
                "agent_name": agent_name,
            }

        except ClientError as e:
            logger.error(f"Failed to create agent: {e}")
            raise

    def create_action_groups(self, agent_id: str) -> list[dict]:
        """Create action groups for the agent."""
        created_groups = []

        # First, list existing action groups
        try:
            existing_groups = self.bedrock_agent.list_agent_action_groups(
                agentId=agent_id,
                agentVersion="DRAFT"
            )
            existing_group_names = {
                group["actionGroupName"] 
                for group in existing_groups.get("actionGroupSummaries", [])
            }
        except Exception:
            existing_group_names = set()

        for action_group_config in ACTION_GROUPS:
            try:
                # Skip if already exists
                if action_group_config["name"] in existing_group_names:
                    logger.info(f"Action group {action_group_config['name']} already exists, skipping")
                    continue

                logger.info(f"Creating action group: {action_group_config['name']}")

                # Build properties for the schema
                properties = {}
                required_fields = []
                
                for param in action_group_config["parameters"]:
                    param_schema = {
                        "type": param["type"],
                        "description": param["description"]
                    }
                    properties[param["name"]] = param_schema
                    
                    if param.get("required", False):
                        required_fields.append(param["name"])

                # Prepare action group schema
                openapi_schema = {
                    "openapi": "3.0.0",
                    "info": {
                        "title": f"{action_group_config['name']} API",
                        "version": "1.0.0",
                        "description": action_group_config["description"],
                    },
                    "paths": {
                        f"/{action_group_config['name'].lower()}": {
                            "post": {
                                "summary": action_group_config["description"],
                                "description": action_group_config["description"],
                                "operationId": action_group_config["name"],
                                "requestBody": {
                                    "required": True,
                                    "content": {
                                        "application/json": {
                                            "schema": {
                                                "type": "object",
                                                "properties": properties,
                                                "required": required_fields,
                                            }
                                        }
                                    }
                                },
                                "responses": {
                                    "200": {
                                        "description": "Successful response",
                                        "content": {
                                            "application/json": {
                                                "schema": {
                                                    "type": "object"
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                api_schema = {
                    "payload": json.dumps(openapi_schema)
                }

                response = self.bedrock_agent.create_agent_action_group(
                    agentId=agent_id,
                    agentVersion="DRAFT",
                    actionGroupName=action_group_config["name"],
                    description=action_group_config["description"],
                    actionGroupExecutor={
                        "lambda": f"arn:aws:lambda:{self.region}:{self.account_id}:function:sikshya-sathi-content-gen-{self.environment}"
                    },
                    apiSchema=api_schema,
                )

                created_groups.append({
                    "name": action_group_config["name"],
                    "id": response["agentActionGroup"]["actionGroupId"],
                })

                logger.info(f"Created action group: {action_group_config['name']}")

            except ClientError as e:
                logger.error(f"Failed to create action group {action_group_config['name']}: {e}")
                # Continue with other action groups

        return created_groups

    def prepare_agent(self, agent_id: str) -> None:
        """Prepare agent for use."""
        try:
            logger.info("Preparing agent...")

            self.bedrock_agent.prepare_agent(agentId=agent_id)

            # Wait for agent to be ready
            logger.info("Waiting for agent to be ready...")
            max_attempts = 30
            attempt = 0
            
            while attempt < max_attempts:
                response = self.bedrock_agent.get_agent(agentId=agent_id)
                status = response["agent"]["agentStatus"]
                
                if status == "PREPARED":
                    logger.info("Agent is ready")
                    break
                elif status == "FAILED":
                    raise Exception("Agent preparation failed")
                
                logger.info(f"Agent status: {status}, waiting...")
                time.sleep(10)
                attempt += 1
            
            if attempt >= max_attempts:
                raise Exception("Timeout waiting for agent to be ready")

        except ClientError as e:
            logger.error(f"Failed to prepare agent: {e}")
            raise

    def create_agent_alias(self, agent_id: str) -> dict:
        """Create agent alias."""
        alias_name = f"{self.environment}-alias"

        try:
            # Check if alias already exists
            try:
                aliases = self.bedrock_agent.list_agent_aliases(agentId=agent_id)
                for alias in aliases.get("agentAliasSummaries", []):
                    if alias["agentAliasName"] == alias_name:
                        logger.info(f"Agent alias {alias_name} already exists")
                        return {
                            "alias_id": alias["agentAliasId"],
                            "alias_name": alias["agentAliasName"],
                        }
            except Exception:
                pass

            logger.info(f"Creating agent alias: {alias_name}")

            response = self.bedrock_agent.create_agent_alias(
                agentId=agent_id,
                agentAliasName=alias_name,
                description=f"Alias for {self.environment} environment",
            )

            alias_id = response["agentAlias"]["agentAliasId"]
            logger.info(f"Created alias with ID: {alias_id}")

            return {
                "alias_id": alias_id,
                "alias_name": alias_name,
            }

        except ClientError as e:
            logger.error(f"Failed to create alias: {e}")
            raise

    def setup(self) -> dict:
        """Run complete setup."""
        logger.info(f"Setting up Bedrock Agent for environment: {self.environment}")

        # Get IAM role ARN
        role_arn = self.get_agent_role_arn()
        logger.info(f"Using IAM role: {role_arn}")

        # Create agent
        agent_info = self.create_agent(role_arn)

        # Create action groups
        action_groups = self.create_action_groups(agent_info["agent_id"])

        # Prepare agent
        self.prepare_agent(agent_info["agent_id"])

        # Create alias
        alias_info = self.create_agent_alias(agent_info["agent_id"])

        result = {
            "agent_id": agent_info["agent_id"],
            "agent_name": agent_info["agent_name"],
            "alias_id": alias_info["alias_id"],
            "alias_name": alias_info["alias_name"],
            "action_groups": action_groups,
            "region": self.region,
        }

        logger.info("Setup complete!")
        logger.info(f"Agent ID: {result['agent_id']}")
        logger.info(f"Alias ID: {result['alias_id']}")

        # Save configuration
        config_file = Path(__file__).parent.parent / f".bedrock-agent-{self.environment}.json"
        with open(config_file, "w") as f:
            json.dump(result, f, indent=2)

        logger.info(f"Configuration saved to: {config_file}")

        return result


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Setup Bedrock Agent for Sikshya-Sathi")
    parser.add_argument(
        "--environment",
        required=True,
        choices=["dev", "staging", "production"],
        help="Environment name",
    )
    parser.add_argument(
        "--region",
        default=BEDROCK_REGION,
        help=f"AWS region (default: {BEDROCK_REGION})",
    )

    args = parser.parse_args()

    setup = BedrockAgentSetup(args.environment, args.region)
    setup.setup()


if __name__ == "__main__":
    main()
