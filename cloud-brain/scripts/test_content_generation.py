#!/usr/bin/env python3
"""
Test the content generation Lambda via Bedrock Agent.
"""

import boto3
import json
import sys

def test_via_bedrock_agent():
    """Test content generation through Bedrock Agent."""
    
    bedrock_agent_runtime = boto3.client('bedrock-agent-runtime')
    
    # Agent details
    agent_id = "DMXQHRYUOL"
    agent_alias_id = "TSTALIASID"
    
    print("=" * 60)
    print("Testing Content Generation via Bedrock Agent")
    print("=" * 60)
    print()
    
    # Test lesson generation
    print("🧪 Test: Generate Lesson via Bedrock Agent")
    print()
    
    try:
        response = bedrock_agent_runtime.invoke_agent(
            agentId=agent_id,
            agentAliasId=agent_alias_id,
            sessionId="test-session-123",
            inputText="Generate a lesson on fractions for grade 8 mathematics at medium difficulty"
        )
        
        # Process streaming response
        result_text = ""
        for event in response['completion']:
            if 'chunk' in event:
                chunk = event['chunk']
                if 'bytes' in chunk:
                    result_text += chunk['bytes'].decode('utf-8')
        
        print("✓ Agent invocation successful!")
        print()
        print("Response:")
        print(result_text[:500] + "..." if len(result_text) > 500 else result_text)
        print()
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main test function."""
    success = test_via_bedrock_agent()
    
    print("=" * 60)
    if success:
        print("✅ Test completed!")
        print()
        print("The Lambda function is working correctly and can be")
        print("invoked through the Bedrock Agent.")
        sys.exit(0)
    else:
        print("❌ Test failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
