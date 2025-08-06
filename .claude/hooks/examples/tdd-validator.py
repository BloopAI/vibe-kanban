#!/usr/bin/env python3
"""
Simple TDD Validator for automagik-forge
Validates that code changes follow Test-Driven Development principles
"""
import json
import sys
import os
import subprocess
from pathlib import Path

def run_tests():
    """Run tests using detected test framework"""
    try:
        # Try different test runners based on project structure
        if Path("pyproject.toml").exists() or Path("pytest.ini").exists():
            # Python with pytest
            cmd = ["pytest", "--tb=short", "-q"]
            if Path("uv.lock").exists():
                cmd = ["uv", "run"] + cmd
        elif Path("package.json").exists():
            # Node.js project
            if Path("jest.config.js").exists() or Path("jest.config.json").exists():
                cmd = ["npm", "run", "test"]
            else:
                cmd = ["npm", "test"]
        elif Path("Cargo.toml").exists():
            # Rust project
            cmd = ["cargo", "test"]
        elif Path("go.mod").exists():
            # Go project
            cmd = ["go", "test", "./..."]
        else:
            return {"success": True, "output": "No test configuration found", "has_failures": False}
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=Path.cwd()
        )
        return {
            "success": result.returncode == 0,
            "output": result.stdout + result.stderr,
            "has_failures": "FAILED" in result.stdout or "FAIL" in result.stdout
        }
    except Exception as e:
        return {"success": False, "output": str(e), "has_failures": False}

def validate_tdd_cycle(tool, file_path, content):
    """Simple TDD validation - ensure tests exist for implementation files"""
    
    # Allow test files - they should be created first in RED phase
    if any(pattern in file_path.lower() for pattern in ['test_', '_test.', 'spec_', '_spec.', '.test.', '.spec.']):
        return {"allowed": True, "reason": "Test file creation/modification allowed"}
    
    # Allow configuration files
    if any(file_path.endswith(ext) for ext in ['.json', '.yaml', '.yml', '.toml', '.md', '.txt', '.env']):
        return {"allowed": True, "reason": "Configuration file"}
    
    # For implementation files, just run tests to ensure they pass
    test_result = run_tests()
    if test_result["success"]:
        return {"allowed": True, "reason": "Tests passing"}
    else:
        return {
            "allowed": False, 
            "reason": f"Tests failing: {test_result['output'][:200]}..."
        }

def main():
    """Main hook entry point"""
    if len(sys.argv) < 4:
        print("Usage: tdd_validator.py <tool> <file_path> <content>")
        sys.exit(0)
    
    tool = sys.argv[1]
    file_path = sys.argv[2] 
    content = sys.argv[3] if len(sys.argv) > 3 else ""
    
    # Skip validation for certain tools or file types
    if tool in ['Read', 'LS', 'Glob', 'Grep'] or file_path.endswith('.md'):
        sys.exit(0)
    
    result = validate_tdd_cycle(tool, file_path, content)
    
    if not result["allowed"]:
        print(f"❌ TDD Guard: {result['reason']}")
        print("💡 Tip: Ensure tests are created first (RED phase) and pass (GREEN phase)")
        sys.exit(1)
    else:
        print(f"✅ TDD Guard: {result['reason']}")
        sys.exit(0)

if __name__ == "__main__":
    main()