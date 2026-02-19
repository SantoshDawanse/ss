#!/usr/bin/env python3
"""Redeploy Lambda function with fixed packaging."""

import boto3
import json
import sys
from pathlib import Path

def main():
    """Redeploy the content generation Lambda function."""
    
    # Initialize AWS clients
    cloudformation = boto3.client('cloudformation')
    
    print("🚀 Redeploying Lambda function with fixed packaging...")
    print()
    
    # Get stack name
    stack_name = "CloudBrainStack-dev"
    
    try:
        # Check if stack exists
        response = cloudformation.describe_stacks(StackName=stack_name)
        stack = response['Stacks'][0]
        
        print(f"✓ Found stack: {stack_name}")
        print(f"  Status: {stack['StackStatus']}")
        print()
        
        # Trigger stack update by redeploying
        print("📦 Redeploying stack to update Lambda packaging...")
        print()
        print("Run the following command:")
        print()
        print("  cd infrastructure && cdk deploy --require-approval never")
        print()
        print("This will:")
        print("  1. Create a Lambda layer with all dependencies")
        print("  2. Package the Lambda with correct import structure")
        print("  3. Update the Lambda function with new code")
        print()
        
    except cloudformation.exceptions.ClientError as e:
        if 'does not exist' in str(e):
            print(f"❌ Stack {stack_name} not found")
            print("   Please deploy the stack first using: cd infrastructure && cdk deploy")
        else:
            print(f"❌ Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
