#!/usr/bin/env python3
"""
Verification script to check if the Bedrock Agent model identifier fix is applied correctly.
"""

import os
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

def check_file_content(file_path: str, expected_model: str, description: str) -> bool:
    """Check if a file contains the correct model identifier."""
    try:
        with open(file_path, 'r') as f:
            content = f.read()
            
        if expected_model in content:
            print(f"✅ {description}: CORRECT")
            return True
        else:
            print(f"❌ {description}: INCORRECT or NOT FOUND")
            return False
    except FileNotFoundError:
        print(f"⚠️  {description}: FILE NOT FOUND")
        return False

def main():
    print("="*70)
    print("Bedrock Agent Model Identifier Verification")
    print("="*70)
    print()
    
    # Expected model identifier (with inference profile)
    correct_model = "us.anthropic.claude-3-5-sonnet-20241022-v2:0"
    incorrect_model = "anthropic.claude-3-5-sonnet-20241022-v2:0"
    
    print(f"✅ Correct model: {correct_model}")
    print(f"❌ Incorrect model: {incorrect_model}")
    print()
    print("Checking files...")
    print("-"*70)
    
    results = []
    
    # Check each file
    files_to_check = [
        ("src/services/bedrock_agent.py", "Bedrock Agent Service"),
        ("src/config/bedrock_agent_config.py", "Bedrock Agent Config"),
        ("infrastructure/stacks/cloud_brain_stack.py", "CDK Stack"),
        ("infrastructure/BEDROCK_AGENT.md", "Documentation"),
        ("../.kiro/specs/curriculum-mcp-and-content-generation/design.md", "Design Spec"),
    ]
    
    for file_path, description in files_to_check:
        result = check_file_content(file_path, correct_model, description)
        results.append(result)
    
    print()
    print("="*70)
    
    # Summary
    passed = sum(results)
    total = len(results)
    
    if passed == total:
        print(f"🎉 SUCCESS: All {total} files have the correct model identifier!")
        print()
        print("Next steps:")
        print("1. Deploy the updated configuration:")
        print("   cd cloud-brain && ./deploy_bedrock_agent.sh development")
        print()
        print("2. Verify the deployment:")
        print("   python cloud-brain/test_bedrock_agent_config.py")
        print()
        print("3. Test content generation:")
        print("   python cloud-brain/scripts/test_content_generation.py --test lesson")
        return 0
    else:
        print(f"⚠️  WARNING: {total - passed} file(s) still have incorrect model identifier")
        print()
        print("Please review the files marked with ❌ above and update them manually.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
