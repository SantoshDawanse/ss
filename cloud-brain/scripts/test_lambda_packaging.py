#!/usr/bin/env python3
"""Test Lambda function packaging and imports."""

import boto3
import json
import sys

def test_lambda_invocation():
    """Test the Lambda function with a sample event."""
    
    lambda_client = boto3.client('lambda')
    
    # Sample Bedrock Agent event for lesson generation
    test_event = {
        "messageVersion": "1.0",
        "agent": {
            "name": "sikshya-sathi-agent",
            "id": "test-agent-id",
            "alias": "TSTALIASID",
            "version": "DRAFT"
        },
        "sessionId": "test-session-123",
        "sessionAttributes": {},
        "promptSessionAttributes": {},
        "inputText": "Generate a lesson on fractions",
        "actionGroup": "ContentGenerationActions",
        "function": "GenerateLesson",
        "parameters": [
            {"name": "topic", "type": "string", "value": "Fractions"},
            {"name": "subject", "type": "string", "value": "Mathematics"},
            {"name": "grade", "type": "string", "value": "8"},
            {"name": "difficulty", "type": "string", "value": "medium"},
            {"name": "student_context", "type": "string", "value": '{"learning_style": "visual"}'},
            {"name": "curriculum_standards", "type": "string", "value": '["MATH-8-1", "MATH-8-2"]'}
        ]
    }
    
    function_name = "sikshya-sathi-content-gen-development"
    
    print(f"🧪 Testing Lambda function: {function_name}")
    print()
    
    try:
        # Invoke Lambda
        response = lambda_client.invoke(
            FunctionName=function_name,
            InvocationType='RequestResponse',
            Payload=json.dumps(test_event)
        )
        
        # Parse response
        status_code = response['StatusCode']
        payload = json.loads(response['Payload'].read())
        
        print(f"✓ Lambda invocation successful!")
        print(f"  Status Code: {status_code}")
        print()
        
        # Check for errors
        if 'FunctionError' in response:
            print(f"❌ Function Error: {response['FunctionError']}")
            print(f"   Payload: {json.dumps(payload, indent=2)}")
            return False
        
        # Check response structure
        if 'response' in payload:
            print("✓ Response structure is correct")
            
            function_response = payload['response'].get('functionResponse', {})
            response_body = function_response.get('responseBody', {})
            text_body = response_body.get('TEXT', {}).get('body', '{}')
            
            result = json.loads(text_body)
            
            if 'error' in result:
                print(f"❌ Lambda returned error: {result['error']}")
                return False
            
            print("✓ Lambda executed successfully!")
            print()
            print("Response preview:")
            print(f"  Lesson ID: {result.get('lesson_id', 'N/A')}")
            print(f"  Topic: {result.get('topic', 'N/A')}")
            print(f"  Sections: {len(result.get('sections', []))}")
            print()
            
            return True
        else:
            print(f"❌ Unexpected response format: {json.dumps(payload, indent=2)}")
            return False
            
    except lambda_client.exceptions.ResourceNotFoundException:
        print(f"❌ Lambda function not found: {function_name}")
        print("   Available functions:")
        try:
            funcs = lambda_client.list_functions()
            for f in funcs['Functions']:
                if 'sikshya' in f['FunctionName'].lower():
                    print(f"     - {f['FunctionName']}")
        except:
            pass
        return False
    except Exception as e:
        print(f"❌ Error invoking Lambda: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main test function."""
    print("=" * 60)
    print("Lambda Packaging Test")
    print("=" * 60)
    print()
    
    success = test_lambda_invocation()
    
    print()
    print("=" * 60)
    if success:
        print("✅ All tests passed!")
        sys.exit(0)
    else:
        print("❌ Tests failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
