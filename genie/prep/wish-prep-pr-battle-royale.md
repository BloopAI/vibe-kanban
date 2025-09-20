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

## CONFIRMED DECISIONS

DEC-1: **Multi-dimensional weighted scoring** (Option C confirmed)
- Technical implementation (30%)
- Architecture quality (25%)
- Safety & rollback (20%)
- Documentation (15%)
- Innovation (10%)

DEC-2: **Multi-round consensus with discussion** (Option C confirmed)
- Round 1: Individual scoring
- Round 2: Discussion and alignment
- Round 3: Final consensus

DEC-3: **1-100 percentage based** (Option B confirmed)
- Clear granularity
- Easy averaging
- Human-friendly

### Validated Assumptions
✓ ASM-1: Three tasks confirmed (foundation, dual-frontend, build-validation)
✓ ASM-2: 6 PRs exist for foundation task evaluation
✓ ASM-3: LLM consensus + human validation confirmed

## SUCCESS CRITERIA
✅ SC-1: Complete evaluation framework covering all agent implementations
✅ SC-2: Consensus-based evaluation using multiple LLMs
✅ SC-3: Scoring sheet with clear metrics and human evaluation columns
✅ SC-4: Actionable insights on winner selection and feature absorption
✅ SC-5: Repeatable process for future PR comparisons

## EVALUATION FRAMEWORK DESIGN (DRAFT)

### Phase 1: Foundation Setup Evaluation
**Task**: Upstream submodule integration and feature extraction
**Competitors**:
- opencode
- code-supernova
- [others to be identified]

### Evaluation Categories (Preliminary)
1. **Core Implementation Quality** (25%)
   - Correctness of submodule setup
   - Feature extraction completeness
   - Code organization

2. **Architecture Decisions** (20%)
   - Separation of concerns
   - Maintainability design
   - Scalability considerations

3. **Migration Safety** (20%)
   - Data preservation
   - Rollback capability
   - Risk mitigation

4. **Documentation & Clarity** (15%)
   - Code comments
   - README updates
   - Migration guides

5. **Testing & Validation** (10%)
   - Test coverage
   - Migration validation
   - Edge case handling

6. **Innovation & Extras** (10%)
   - Creative solutions
   - Additional helpful features
   - Performance optimizations

### Consensus Workflow Design
```
1. Individual Analysis (Each LLM)
   - Review PR against wish requirements
   - Score each category
   - Provide justification

2. Consensus Round 1 (Discussion)
   - Share individual scores
   - Discuss major differences
   - Identify standout features

3. Consensus Round 2 (Voting)
   - Final scores per category
   - Winner selection
   - Feature absorption recommendations

4. Human Validation
   - 3 independent human reviews
   - Override capability
   - Final decision
```

## SCORING SHEET SCHEMA (DRAFT)

```csv
Agent/LLM, Task, Cat1_LLM1, Cat1_LLM2, Cat1_Consensus, Cat2_LLM1, ..., Total_LLM, Human1, Human2, Human3, Final_Score, Winner, Features_to_Absorb
```

### Detailed Schema:
- **Agent/LLM**: Name of coding agent/model
- **Task**: Foundation/Task2/Task3
- **Category Scores**: Individual and consensus for each category
- **Total_LLM**: Weighted total from LLM evaluation
- **Human1-3**: Independent human evaluator scores (0-100)
- **Final_Score**: Combined LLM + Human weighted
- **Winner**: Boolean flag
- **Features_to_Absorb**: JSON list of valuable features from non-winners

## NEVER DO
❌ ND-1: Skip consensus building between LLMs
❌ ND-2: Ignore existing PR implementations
❌ ND-3: Create biased evaluation criteria
❌ ND-4: Exclude human validation step
❌ ND-5: Make evaluation non-repeatable

## INVESTIGATION LOG
- [10:45] Document created from user request
- [10:46] Reviewed restructure-upstream-library-wish.md
- [10:47] Identified need for multi-phase evaluation
- [10:48] Drafted initial evaluation framework
- [10:49] Designed consensus workflow
- [10:50] Created preliminary scoring schema

## 4-WISH WORKFLOW STRUCTURE

### WISH 1: Evaluation Framework & Scoring System
**Purpose**: Create the infrastructure for evaluation
**Outputs**:
- Evaluation framework documentation
- Scoring sheet template (CSV/JSON format)
- Category definitions and weights
- Consensus workflow documentation
- Human evaluation guidelines

### WISH 2: Task 1 - Foundation Setup Evaluation
**Purpose**: Evaluate all 6 foundation PRs
**Inputs**:
- PRs #6, #7, #8/9, #10, #11, #12
- @genie/wishes/restructure-upstream-library-wish.md requirements
**Process**:
1. zen consensus with gemini-2.5-pro and grok-4
2. Individual scoring per category
3. Consensus building rounds
4. Winner selection
5. Absorption opportunity identification
**Outputs**:
- Scored evaluation sheet for Task 1
- Winner declaration with rationale
- Feature absorption recommendations

### WISH 3: Task 2 - Dual Frontend Evaluation
**Purpose**: Evaluate Task 2 implementations
**Process**: Same as Wish 2 but for dual frontend task
**Outputs**:
- Scored evaluation sheet for Task 2
- Winner declaration
- Absorption opportunities

### WISH 4: Task 3 Evaluation + Final Report + Lab Article
**Purpose**: Complete evaluation and generate comprehensive insights
**Components**:
1. Task 3 evaluation (build validation)
2. Cross-task pattern analysis
3. Final codex exec review
4. Lab article generation
**Outputs**:
- Complete scoring sheet (all tasks)
- Final rankings and insights
- Lab article sections:
  - Methodology
  - Quantitative results
  - Qualitative analysis
  - Best practices synthesis
  - Recommendations by task type
  - Efficiency vs quality analysis

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
- [10:49] Designed consensus workflow
- [10:50] Created preliminary scoring schema
- [11:00] Enhanced with 4-wish structure
- [11:01] Added lab article outline
- [11:02] Status: READY_FOR_WISH