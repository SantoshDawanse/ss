#!/usr/bin/env python3
"""Show deployment status and next steps."""

import boto3
import sys
from datetime import datetime

def check_lambda_status():
    """Check Lambda function status."""
    lambda_client = boto3.client('lambda')
    function_name = "sikshya-sathi-content-gen-development"
    
    try:
        response = lambda_client.get_function(FunctionName=function_name)
        config = response['Configuration']
        
        print("📦 Lambda Function Status")
        print(f"   Name: {config['FunctionName']}")
        print(f"   Runtime: {config['Runtime']}")
        print(f"   Handler: {config['Handler']}")
        print(f"   Memory: {config['MemorySize']} MB")
        print(f"   Timeout: {config['Timeout']} seconds")
        print(f"   Last Modified: {config['LastModified']}")
        print(f"   State: {config['State']}")
        
        if config['Handler'] == "handlers.content_handler.generate":
            print("   ✅ Handler path is correct (fixed)")
        else:
            print(f"   ⚠️  Handler path needs update: {config['Handler']}")
            return False
            
        return True
        
    except lambda_client.exceptions.ResourceNotFoundException:
        print("❌ Lambda function not found")
        return False
    except Exception as e:
        print(f"❌ Error checking Lambda: {e}")
        return False

def check_bedrock_agent():
    """Check Bedrock Agent status."""
    bedrock_agent = boto3.client('bedrock-agent')
    
    try:
        # List agents
        response = bedrock_agent.list_agents()
        agents = [a for a in response.get('agentSummaries', []) 
                 if 'sikshya-sathi' in a.get('agentName', '').lower()]
        
        if not agents:
            print("\n⚠️  Bedrock Agent")
            print("   No agent found")
            return False
        
        agent = agents[0]
        print("\n🤖 Bedrock Agent Status")
        print(f"   Name: {agent['agentName']}")
        print(f"   ID: {agent['agentId']}")
        print(f"   Status: {agent['agentStatus']}")
        print(f"   Updated: {agent['updatedAt']}")
        
        return agent['agentStatus'] in ['PREPARED', 'NOT_PREPARED']
        
    except Exception as e:
        print(f"\n⚠️  Bedrock Agent: {e}")
        return False

def check_infrastructure():
    """Check infrastructure status."""
    cloudformation = boto3.client('cloudformation')
    stack_name = "CloudBrainStack-dev"
    
    try:
        response = cloudformation.describe_stacks(StackName=stack_name)
        stack = response['Stacks'][0]
        
        print("\n🏗️  Infrastructure Stack")
        print(f"   Name: {stack['StackName']}")
        print(f"   Status: {stack['StackStatus']}")
        
        if 'LastUpdatedTime' in stack:
            print(f"   Last Updated: {stack['LastUpdatedTime']}")
        
        return stack['StackStatus'] in ['CREATE_COMPLETE', 'UPDATE_COMPLETE']
        
    except Exception as e:
        print(f"\n⚠️  Infrastructure: {e}")
        return False

def main():
    """Main status check."""
    print("=" * 60)
    print("Sikshya-Sathi Deployment Status")
    print("=" * 60)
    print()
    
    # Check components
    infra_ok = check_infrastructure()
    lambda_ok = check_lambda_status()
    agent_ok = check_bedrock_agent()
    
    print()
    print("=" * 60)
    print("Summary")
    print("=" * 60)
    
    status = []
    status.append(("Infrastructure", "✅" if infra_ok else "❌"))
    status.append(("Lambda Function", "✅" if lambda_ok else "❌"))
    status.append(("Bedrock Agent", "✅" if agent_ok else "⚠️"))
    
    for component, state in status:
        print(f"{state} {component}")
    
    print()
    
    # Next steps
    if not lambda_ok:
        print("🔧 Next Steps:")
        print("   1. Deploy the Lambda fix:")
        print("      make redeploy-lambda")
        print()
        print("   2. Test the Lambda:")
        print("      make test-lambda")
        print()
    elif lambda_ok and agent_ok:
        print("✅ All systems ready!")
        print()
        print("🎯 Next Steps:")
        print("   1. Test Lambda function:")
        print("      make test-lambda")
        print()
        print("   2. Test end-to-end:")
        print("      cd cloud-brain && python scripts/test_content_generation.py")
        print()
    else:
        print("⚠️  Some components need attention")
        print()
    
    print("=" * 60)

if __name__ == "__main__":
    main()
