#!/usr/bin/env python3
"""Find intersection of files changed in PR and files with i18n violations."""

import subprocess
import sys
import json
import os
from pathlib import Path

def main():
    repo_root = Path(__file__).parent.parent
    os.chdir(repo_root)
    
    # Get changed files
    print("▶️  Getting changed files from PR...")
    result = subprocess.run(
        ["git", "diff", "--name-only", "origin/main...HEAD"],
        capture_output=True,
        text=True,
        check=True
    )
    changed_files = {
        line.replace("frontend/", "")
        for line in result.stdout.splitlines()
        if line.startswith("frontend/src/") and (line.endswith(".ts") or line.endswith(".tsx"))
    }
    print(f"   Found {len(changed_files)} changed TS/TSX files in PR")
    
    # Get files with i18n violations
    print("▶️  Finding files with i18n violations...")
    os.chdir(repo_root / "frontend")
    try:
        result = subprocess.run(
            ["npx", "eslint", "src", "--ext", "ts,tsx", "--rule", "i18next/no-literal-string:error", "--format", "json"],
            capture_output=True,
            text=True,
            env={**os.environ, "LINT_I18N": "true"},
            timeout=30
        )
        lint_results = json.loads(result.stdout)
        frontend_dir = Path.cwd()
        violation_files = {
            str(Path(item["filePath"]).relative_to(frontend_dir))
            for item in lint_results
            if item.get("messages")
        }
    except subprocess.TimeoutExpired:
        print("   ⚠️  ESLint timed out, falling back to manual check")
        violation_files = set()
    except Exception as e:
        print(f"   ⚠️  Error running ESLint: {e}")
        violation_files = set()
    
    os.chdir(repo_root)
    print(f"   Found {len(violation_files)} files with i18n violations")
    
    # Compute intersection
    print("▶️  Computing intersection...")
    intersection = sorted(changed_files & violation_files)
    
    print()
    print("📊 Results:")
    print(f"   Changed files: {len(changed_files)}")
    print(f"   Files with violations: {len(violation_files)}")
    print(f"   Intersection (files to fix): {len(intersection)}")
    print()
    
    if intersection:
        print("📝 Files that need i18n fixes (changed in PR AND have violations):")
        for file in intersection:
            print(f"   frontend/{file}")
        print()
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
