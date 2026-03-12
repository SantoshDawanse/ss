#!/usr/bin/env python3
"""Quick test to generate a single lesson."""

import os
import sys
import json
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from src.services.bedrock_agent import BedrockAgentService

def load_agent_config():
    """Load agent config."""
    config_file = Path(__file__).parent / ".bedrock-agent-dev.json"
    if config_file.exists():
        with open(config_file) as f:
            return json.load(f)
    return {}

def main():
    print("Testing single lesson generation...")
    
    config = load_agent_config()
    service = BedrockAgentService(
        agent_id=config.get("agent_id"),
        agent_alias_id=config.get("alias_id"),
        region=config.get("region", "us-east-1")
    )
    
    print(f"Agent ID: {service.agent_id}")
    print(f"Alias ID: {service.agent_alias_id}")
    print()
    
    try:
        print("Generating lesson...")
        lesson = service.generate_lesson(
            topic="Basic Addition",
            subject="Mathematics",
            grade=6,
            difficulty="easy",
            student_context={"student_id": "test-001"},
            curriculum_standards=[]
        )
        
        print("✅ SUCCESS!")
        print(f"Lesson: {lesson.title}")
        print(f"Difficulty: {lesson.difficulty}")
        print(f"Sections: {len(lesson.sections)}")
        print(f"Duration: {lesson.estimated_minutes} minutes")
        
        return 0
        
    except Exception as e:
        print(f"❌ FAILED: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
