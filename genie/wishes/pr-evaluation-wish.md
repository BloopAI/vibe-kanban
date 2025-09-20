# 🧞 PR EVALUATION AND SHEET UPDATE WISH

**Status:** READY_FOR_REVIEW

## Executive Summary
Evaluate one PR implementation against the upstream-library migration requirements and update the Google Sheets evaluation framework with scores.

## Current State Analysis
**What exists:** PR implementation of foundation setup task to evaluate
**Gap identified:** Need to score implementation and update spreadsheet
**Solution approach:** Compare PR changes against wish requirements, score, and update sheet

## Success Criteria
✅ PR diff analyzed against task requirements
✅ Scores (0-25) entered for each of 4 criteria
✅ Google Sheets updated with scores and evidence
✅ Consensus/human columns left for manual entry
✅ Objective evidence documented for each score

## Never Do
❌ Modify PR code
❌ Give perfect scores without evidence
❌ Skip any evaluation criterion
❌ Overwrite human evaluator columns

## Task Decomposition

### Single Execution Flow

**STEP 1: Get PR Context**
```bash
# Identify current branch and PR
git branch --show-current
git log --oneline -1
git diff main...HEAD --stat
```

**STEP 2: Analyze Against Requirements**
@genie/wishes/restructure-upstream-library-wish.md [expected implementation]
@current PR diff [actual implementation]

Compare actual vs expected for 4 criteria:

**Criterion 1: Submodule Setup (25 points)**
```bash
# Check if upstream submodule exists
ls -la upstream/
cat .gitmodules
git submodule status

# Score based on:
- Submodule properly added (10 pts)
- .gitmodules correct (8 pts)
- Upstream untouched (7 pts)
```

**Criterion 2: Directory Structure (25 points)**
```bash
# Check directory structure
ls -la forge-extensions/
ls -la forge-app/
cat Cargo.toml | grep -A 10 workspace

# Score based on:
- forge-extensions/* created (10 pts)
- forge-app/ exists (8 pts)
- Workspace configured (7 pts)
```

**Criterion 3: Auxiliary Database (25 points)**
```bash
# Check auxiliary tables
find . -name "*.sql" | xargs grep forge_task_extensions
find . -name "*.rs" | xargs grep "CREATE TABLE forge"

# Score based on:
- forge_task_extensions table (10 pts)
- Migration scripts (8 pts)
- Foreign keys correct (7 pts)
```

**Criterion 4: Feature Preservation (25 points)**
```bash
# Check feature extraction
ls -la forge-extensions/omni/
ls -la forge-extensions/branch-templates/
ls -la forge-extensions/config/

# Score based on:
- Omni extracted (7 pts)
- Branch templates (6 pts)
- Config v7 (6 pts)
- Genie preserved (6 pts)
```

**STEP 3: Update Google Sheets**

Spreadsheet ID: `1liey0O2SLOY2Ire5so_U0Hoju3_NOOcn9d5KWbQpajA`
Sheet: `Task1_Foundation`

Update the row for this PR with scores:
- Column B: Submodule Setup score (0-25)
- Column C: Directory Structure score (0-25)
- Column D: Auxiliary DB score (0-25)
- Column E: Feature Preservation score (0-25)
- Column F: Formula auto-calculates total
- Column K: Formula auto-calculates final

**STEP 4: Document Evidence**

Add evaluation notes below the scoring table with:
- Specific evidence for each score
- Notable strengths
- Missing elements
- Unique features worth absorbing

## Implementation Pattern

```bash
# Example evaluation flow
AGENT="claude"  # or codex-medium, gemini, etc.

# 1. Get diff
git diff main...HEAD --name-status > pr_changes.txt

# 2. Score each criterion
SCORE_1=23  # Submodule (evidence: submodule exists, small issue with X)
SCORE_2=25  # Structure (evidence: all directories perfect)
SCORE_3=18  # Database (evidence: missing migration script)
SCORE_4=24  # Features (evidence: all extracted except Y)

# 3. Update sheet via MCP
mcp__google-sheets__update_cells(
  sheet="Task1_Foundation",
  range="B4:E4",  # Row for this agent
  data=[[23, 25, 18, 24]]
)

# 4. Add evidence notes
mcp__google-sheets__update_cells(
  sheet="Task1_Foundation",
  range="A35:B40",
  data=[
    ["Evidence for $AGENT:"],
    ["✓ Submodule: Added correctly, proper .gitmodules"],
    ["✓ Structure: All directories created as specified"],
    ["✗ Database: Missing data migration script"],
    ["✓ Features: Omni, templates, config extracted"],
    ["Unique approach: Clever use of traits for composition"]
  ]
)
```

## Validation Checklist
- [ ] Git diff reviewed completely
- [ ] Each criterion scored 0-25
- [ ] Evidence documented for scores
- [ ] Sheet updated correctly
- [ ] Total auto-calculated
- [ ] Absorption opportunities noted