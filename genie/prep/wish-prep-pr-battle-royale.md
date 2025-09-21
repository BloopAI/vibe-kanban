# Wish Preparation: PR Battle Royale - Multi-Agent Evaluation System
**Status:** READY_FOR_WISH
**Created:** 2025-01-20
**Last Updated:** 2025-01-20

<task_breakdown>
1. [Structure] Create evaluation framework and scoring system (Wish 1)
2. [Evaluation] Analyze Task 1 - Foundation Setup implementations (Wish 2)
3. [Evaluation] Analyze Task 2 - Dual Frontend implementations (Wish 3)
4. [Synthesis] Task 3 evaluation + Final Report + Lab Article (Wish 4)
</task_breakdown>

<context_gathering>
Goal: Understand existing PRs, tasks, and evaluation needs
Status: COMPLETE

Searches planned:
- [x] Review restructure-upstream-library-wish.md for requirements
- [x] Examine existing forge tasks for foundation setup
- [x] Find existing PRs from different agents (opencode, code-supernova, etc.)
- [x] Identify evaluation patterns in codebase

Found patterns:
- @genie/wishes/restructure-upstream-library-wish.md - Core migration requirements
- Foundation task PRs confirmed (6 implementations)
- zen consensus tools available (gemini-2.5-pro, grok-4)
- codex exec available for final review

### Upstream Diff Audit (pending)
- Command plan:
  - `git fetch upstream`
  - `git checkout origin/main`
- `git diff upstream/main...origin/main --stat`
- `git diff upstream/main...origin/main --name-status | tee docs/upstream-diff-latest.txt`
- Status: **PENDING** – blocked in sandbox (no outbound network); rerun on unrestricted machine and attach summary before evaluations proceed.
- Shortcut: run `./scripts/run-upstream-audit.sh` to execute the full sequence and save outputs under `docs/`.

### Regression Harness Prep (pending)
- Command plan:
  - Sanitize and copy `~/.automagik-forge/forge.sqlite` to `dev_assets_seed/forge-snapshot/forge.sqlite`
  - Establish initial baselines in `docs/regression/baseline/`
  - Run `./scripts/run-forge-regression.sh`
- Status: **PENDING** – requires sanitized snapshot; run after Task 2 extraction is complete.

Early stop: 100% patterns identified
</context_gathering>

## STATED REQUIREMENTS
- REQ-1: Create evaluation system for comparing coding agents/LLMs on same tasks
- REQ-2: Evaluate existing foundation setup PRs (opencode, code-supernova, etc.)
- REQ-3: Pick winner for each task phase (foundation, then 2 more tasks)
- REQ-4: Evaluate if winner is sufficient or need to absorb competitor features
- REQ-5: Use Zen consensus tool with gemini-2.5-pro and grok-4 for evaluation
- REQ-6: Final review using codex exec for comprehensive analysis
- REQ-7: Create scoring sheet with points per LLM/agent
- REQ-8: Include 3 columns for human evaluator scores
- REQ-9: Design comprehensive evaluation schema
- REQ-10: Generate 4 separate wishes for modular workflow execution
- REQ-11: Create material for lab article on multi-LLM coding performance

## CONFIRMED PR DATA

### Foundation Task PRs (Actual)
Found 6 implementations for evaluation:
1. **PR #7** - claude (branch: migrate/upstream-foundation-b9b2) - OPEN
2. **PR #8/9** - cursor-cli-grok (branch: forge-feat-found-a4a4) - CLOSED
3. **PR #6** - codex-medium (branch: forge-feat-found-aafd) - OPEN
4. **PR #10** - opencode-code-supernova (branch: forge-feat-found-21c8) - OPEN
5. **PR #12** - gemini (branch: forge-feat-found-cf50) - OPEN
6. **PR #11** - opencode-kimi-k2 (branch: forge-feat-found-3e6d) - OPEN

## EVALUATION APPROACH

### Scoring System
**Scale**: 1-100 points per category
**Reviewers**:
- Claude Opus 4.1
- Gemini 2.5-Pro
- GPT-5-Codex-High
- Human Evaluator (optional override)

### Evaluation Categories & Weights

#### 1. **Technical Correctness** (30%)
**Score 90-100**: All requirements met, works flawlessly, handles all edge cases
**Score 70-89**: Core requirements met, minor issues or missing edge cases
**Score 50-69**: Basic functionality works but significant gaps
**Score 30-49**: Partially works, major requirements missing
**Score 0-29**: Doesn't work or fundamentally broken

*Check for*:
- Submodule integration correctness
- Feature extraction completeness
- Build/compilation success
- Runtime behavior matches spec

#### 2. **Code Quality** (25%)
**Score 90-100**: Exemplary code, follows all patterns, exceptionally clean
**Score 70-89**: Good quality, minor style issues, mostly follows patterns
**Score 50-69**: Acceptable but inconsistent, some anti-patterns
**Score 30-49**: Poor quality, hard to maintain, many issues
**Score 0-29**: Unreadable, unmaintainable mess

*Check for*:
- Readability and clarity
- DRY principle adherence
- Error handling completeness
- Type safety (TypeScript/Rust idioms)
- Project pattern consistency

#### 3. **Architecture & Design** (20%)
**Score 90-100**: Excellent design, highly scalable, perfect separation
**Score 70-89**: Good architecture, minor coupling issues
**Score 50-69**: Adequate design, some architectural concerns
**Score 30-49**: Poor design choices, significant coupling
**Score 0-29**: No clear architecture, spaghetti code

*Check for*:
- Module boundaries
- Dependency management
- Future extensibility
- Performance considerations
- Integration cleanliness

#### 4. **Safety & Robustness** (15%)
**Score 90-100**: Bulletproof, handles all failure modes gracefully
**Score 70-89**: Safe with minor gaps in error handling
**Score 50-69**: Basic safety measures, some risks
**Score 30-49**: Unsafe operations, data loss possible
**Score 0-29**: Dangerous, corrupts data or breaks system

*Check for*:
- Migration rollback capability
- Data integrity preservation
- Graceful failure handling
- Recovery mechanisms
- State consistency

#### 5. **Documentation & Tests** (10%)
**Score 90-100**: Comprehensive tests and docs, excellent coverage
**Score 70-89**: Good coverage, minor gaps
**Score 50-69**: Basic tests/docs present
**Score 30-49**: Minimal documentation or tests
**Score 0-29**: No tests or documentation

*Check for*:
- Test coverage percentage
- Edge case testing
- Documentation completeness
- Code comments (where needed)
- Migration guides

## SUCCESS CRITERIA
✅ SC-1: Complete evaluation framework covering all agent implementations
✅ SC-2: Independent evaluation by multiple expert reviewers
✅ SC-3: Clear scoring sheet with transparent metrics
✅ SC-4: Actionable insights on winner selection and feature absorption
✅ SC-5: Repeatable process for future PR comparisons

## PR EVALUATION WORKFLOW

### Task 1: Foundation Setup (6 PRs)
**Implementations to evaluate**:
1. PR #7 - claude (migrate/upstream-foundation-b9b2)
2. PR #8/9 - cursor-cli-grok (forge-feat-found-a4a4)
3. PR #6 - codex-medium (forge-feat-found-aafd)
4. PR #10 - opencode-code-supernova (forge-feat-found-21c8)
5. PR #12 - gemini (forge-feat-found-cf50)
6. PR #11 - opencode-kimi-k2 (forge-feat-found-3e6d)

### Evaluation Process
1. **Independent Review**
   - Each reviewer scores all PRs independently
   - No discussion between reviewers
   - Focus on objective criteria

2. **Scoring**
   - Each category scored 1-100
   - Weighted total calculated automatically
   - Comments/notes for standout features or issues

3. **Winner Selection**
   - Highest weighted score wins
   - Document features worth absorbing from non-winners
   - Human can override with justification

## SCORING SHEET SCHEMA

### CSV Format
```csv
PR#, Agent, Tech_Opus, Tech_Gemini, Tech_Codex, Quality_Opus, Quality_Gemini, Quality_Codex, Arch_Opus, Arch_Gemini, Arch_Codex, Safety_Opus, Safety_Gemini, Safety_Codex, Docs_Opus, Docs_Gemini, Docs_Codex, Total_Opus, Total_Gemini, Total_Codex, Avg_Total, Human_Override, Final_Score, Rank, Winner, Absorb_Features, Notes
```

### Column Definitions
- **PR#**: Pull request number
- **Agent**: Coding agent/model that created the PR
- **[Category]_[Reviewer]**: Individual scores (1-100) for each category by each reviewer
- **Total_[Reviewer]**: Weighted total for each reviewer
- **Avg_Total**: Average of all reviewer totals
- **Human_Override**: Optional human score override (blank if not used)
- **Final_Score**: Human_Override if present, else Avg_Total
- **Rank**: Position (1st, 2nd, etc.)
- **Winner**: TRUE/FALSE
- **Absorb_Features**: Features worth adopting from non-winners
- **Notes**: Additional observations

## NEVER DO
❌ ND-1: Allow reviewers to discuss scores before submitting
❌ ND-2: Ignore existing PR implementations
❌ ND-3: Create biased evaluation criteria
❌ ND-4: Skip documenting valuable features from non-winners
❌ ND-5: Make evaluation non-repeatable

## INVESTIGATION LOG
- [10:45] Document created from user request
- [10:46] Reviewed restructure-upstream-library-wish.md
- [10:47] Identified need for multi-phase evaluation
- [10:48] Drafted initial evaluation framework
- [10:49] Designed consensus workflow
- [10:50] Created preliminary scoring schema

## 4-WISH WORKFLOW STRUCTURE

### WISH 1: Evaluation Framework & Scoring Sheet
**Purpose**: Create the evaluation infrastructure
**Outputs**:
- Evaluation framework with scoring rubrics
- CSV scoring sheet template
- Review guidelines for each reviewer
- Automated calculation formulas

### WISH 2: Task 1 - Foundation Setup Evaluation
**Purpose**: Evaluate all 6 foundation PRs
**Inputs**:
- PRs #6, #7, #8/9, #10, #11, #12
- @genie/wishes/restructure-upstream-library-wish.md requirements
**Process**:
1. Each reviewer independently evaluates all PRs
2. Scores entered into sheet (no discussion)
3. Automatic weighted total calculation
4. Winner selection based on highest score
5. Document valuable features from non-winners
**Outputs**:
- Completed scoring sheet for Task 1
- Winner declaration
- Feature absorption recommendations

### WISH 3: Task 2 - Dual Frontend Evaluation
**Purpose**: Evaluate dual frontend implementations
**Process**: Same independent review process as Task 1
**Outputs**:
- Completed scoring sheet for Task 2
- Winner declaration
- Absorption opportunities

### WISH 4: Task 3 + Final Analysis + Lab Article
**Purpose**: Complete evaluation and generate insights
**Components**:
1. Task 3 evaluation (build validation)
2. Cross-task pattern analysis
3. Final comprehensive review
4. Lab article generation
**Outputs**:
- Complete scoring sheets (all tasks)
- Final rankings and insights
- Lab article with:
  - Methodology
  - Quantitative results
  - Performance patterns by agent
  - Recommendations by task type
  - Efficiency vs quality tradeoffs

## LAB ARTICLE STRUCTURE

### Title: "Multi-Agent Coding Competition: Empirical Analysis of LLM Performance on Complex Migration Tasks"

### Sections:
1. **Abstract**: Competition methodology and key findings
2. **Introduction**: Problem space and motivation
3. **Methodology**: Consensus-based evaluation framework
4. **Task Descriptions**: Foundation, Dual Frontend, Build Validation
5. **Quantitative Analysis**: Scores, rankings, statistical insights
6. **Qualitative Insights**: Code patterns, architectural decisions
7. **Absorption Strategy**: Combining best features from multiple agents
8. **Performance Profiles**: Which agent for which task type
9. **Conclusions**: Recommendations for multi-agent development
10. **Future Work**: Scaling evaluation framework

## INVESTIGATION LOG
- [10:45] Document created from user request
- [10:46] Reviewed restructure-upstream-library-wish.md
- [10:47] Identified need for multi-phase evaluation
- [10:48] Drafted initial evaluation framework
- [10:49] ~~Designed consensus workflow~~ Removed per feedback
- [10:50] Created preliminary scoring schema
- [11:00] Enhanced with 4-wish structure
- [11:01] Added lab article outline
- [11:02] Status: READY_FOR_WISH
- [11:15] UPDATED: Removed consensus approach, implemented independent review system
- [11:16] Added detailed scoring rubrics for each category
- [11:17] Simplified to direct scoring by 3 reviewers + human override
