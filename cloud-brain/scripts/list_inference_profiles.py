#!/usr/bin/env python3
"""List available Bedrock inference profiles."""

import argparse
import boto3
from botocore.exceptions import ClientError


def list_inference_profiles(region: str):
    """List available inference profiles."""
    bedrock = boto3.client("bedrock", region_name=region)
    
    try:
        response = bedrock.list_inference_profiles()
        profiles = response.get("inferenceProfileSummaries", [])
        
        print(f"\n📋 Found {len(profiles)} inference profiles:")
        for profile in profiles:
            print(f"\n   Profile ID: {profile['inferenceProfileId']}")
            print(f"   Name: {profile.get('inferenceProfileName', 'N/A')}")
            print(f"   Type: {profile.get('type', 'N/A')}")
            print(f"   Status: {profile.get('status', 'N/A')}")
            if 'models' in profile:
                print(f"   Models: {', '.join([m.get('modelId', 'N/A') for m in profile['models']])}")
        
        return profiles
    except ClientError as e:
        print(f"❌ Error listing inference profiles: {e}")
        return []


def main():
    parser = argparse.ArgumentParser(description="List Bedrock inference profiles")
    parser.add_argument(
        "--region",
        default="us-east-1",
        help="AWS region"
    )
    
    args = parser.parse_args()
    
    print("="*60)
    print("Bedrock Inference Profiles")
    print("="*60)
    print(f"Region: {args.region}")
    
    list_inference_profiles(args.region)


if __name__ == "__main__":
    main()
