#!/usr/bin/env python3
"""Enable Bedrock model access."""

import argparse
import boto3
from botocore.exceptions import ClientError


def check_model_access(region: str):
    """Check which models have access enabled."""
    bedrock = boto3.client("bedrock", region_name=region)
    
    try:
        # List foundation models
        response = bedrock.list_foundation_models()
        claude_models = [m for m in response.get("modelSummaries", []) 
                        if "claude" in m["modelId"].lower()]
        
        print("\n📋 Available Claude models:")
        for model in claude_models:
            print(f"   - {model['modelId']}")
            print(f"     Status: {model.get('modelLifecycle', {}).get('status', 'N/A')}")
        
        return claude_models
    except ClientError as e:
        print(f"❌ Error listing models: {e}")
        return []


def main():
    parser = argparse.ArgumentParser(description="Check Bedrock model access")
    parser.add_argument(
        "--region",
        default="us-east-1",
        help="AWS region"
    )
    
    args = parser.parse_args()
    
    print("="*60)
    print("Bedrock Model Access Check")
    print("="*60)
    print(f"Region: {args.region}")
    
    check_model_access(args.region)
    
    print("\n" + "="*60)
    print("Note: Model access must be enabled through the AWS Console:")
    print("https://console.aws.amazon.com/bedrock/home#/modelaccess")
    print("="*60)


if __name__ == "__main__":
    main()
