#!/usr/bin/env bash
# HoliCode AutoAgent improvement loop — Layer 2-3 scoring edition
#
# Usage: ./scripts/eval/improve.sh [iterations]
#
# Each iteration runs all 5 prompt variants (quality gradient from minimal
# to rubric-aware), scores with Layer 0-1 + Layer 2 NLP heuristics
# (and optionally Layer 3 LLM-as-judge via ENABLE_LLM_JUDGE=1).
# Keeps the best variant as seed for comparison in the next round.
#
# Score function: tests/score.py multi-layer validator.

set -euo pipefail

REPO=$(git rev-parse --show-toplevel)
ITERATIONS=${1:-3}
BRIEF="$REPO/test-resources/poc-task-tracker/business-brief.md"
SCORER="$REPO/test-resources/harbor-tasks/holicode-poc-task-tracker/tests/score.py"
LOG="$REPO/.holicode/analysis/reports/eval-improve-$(date +%Y%m%d-%H%M%S).json"

mkdir -p "$(dirname "$LOG")"

NUM_VARIANTS=5

# ── Prompt variants: quality gradient ─────────────────────────────────────────
# Each variant is a combined story+task prompt run in sequence.
# Variant 0 (minimal) through Variant 4 (full rubric-aware).

variant_prompt() {
    local v=$1
    case $v in
        0)
            echo "Run the functional-analyze workflow on the task-tracker project brief."
            ;;
        1)
            echo "Run the functional-analyze workflow on the task-tracker project brief. Use EARS format: Given/When/Then for each acceptance criterion. Include at least 3 acceptance criteria per user story."
            ;;
        2)
            echo "Run the functional-analyze workflow on the task-tracker project brief. Use EARS format for acceptance criteria. For every user story, include at least one AC covering the failure case or error condition (e.g., invalid input, missing permissions, network failure)."
            ;;
        3)
            echo "Run the functional-analyze workflow on the task-tracker project brief. Use EARS format. For every AC, include an expected concrete value, state, or error name — not just behaviour descriptions. Example: 'Then the system returns HTTP 422 with message due_date must be in YYYY-MM-DD format' not just 'Then the system returns an error'."
            ;;
        4)
            cat <<'PROMPT'
Run the functional-analyze workflow on the task-tracker project brief.
Quality requirements:
- EARS format (Given/When/Then) for all ACs
- Every story must have: at least 1 happy path AC, 1 error/failure AC, 1 boundary/edge case AC
- Every AC must be concretely testable: include specific values, states, or error names
- The "so that" clause must state a specific user outcome, not a generic capability
- Avoid weasel words: do not use "appropriate", "suitable", "flexible", "various", "etc."
- No two stories should share near-identical ACs
PROMPT
            ;;
    esac
}

task_prompt() {
    # Task generation prompt — same for all variants (Layer 2 mainly scores stories)
    echo "Read the user stories in .holicode/specs/stories/. Produce implementation tasks in .holicode/specs/tasks/ as TASK-{id}.md. Each must use a markdown table with: **Story**, **Status** (ready), **Size** (XS/S/M/L), **Components**. Required sections: ## Deliverables (checkboxes), ## Technical Requirements, ## Acceptance Validation (checkboxes)."
}

run_variant() {
    local iter=$1
    local variant=$2
    local ws="/tmp/holicode-eval-i${iter}-v${variant}"
    rm -rf "$ws" && mkdir -p "$ws"

    # Copy framework context
    cp "$REPO/CLAUDE.md" "$ws/"
    [ -f "$BRIEF" ] && cp "$BRIEF" "$ws/business-brief.md"
    cp -rL "$REPO/.clinerules" "$ws/.clinerules" 2>/dev/null || true
    cp -rL "$REPO/.claude" "$ws/.claude" 2>/dev/null || true
    mkdir -p "$ws/.holicode/specs/stories" "$ws/.holicode/specs/tasks" "$ws/.holicode/state"
    [ -f "$REPO/.holicode/specs/SCHEMA.md" ] && cp "$REPO/.holicode/specs/SCHEMA.md" "$ws/.holicode/specs/"
    for f in activeContext.md progress.md WORK_SPEC.md techContext.md productContext.md projectbrief.md; do
        [ -f "$REPO/.holicode/state/$f" ] && cp "$REPO/.holicode/state/$f" "$ws/.holicode/state/" 2>/dev/null || true
    done

    local sprompt
    sprompt=$(variant_prompt "$variant")
    local tprompt
    tprompt=$(task_prompt)

    echo "  [i${iter}/v${variant}] Running functional-analyze (variant $variant)..."
    (cd "$ws" && env -u CLAUDECODE claude --dangerously-skip-permissions --max-turns 15 -p "$sprompt" > /dev/null 2>&1) || true

    echo "  [i${iter}/v${variant}] Running implementation-plan..."
    (cd "$ws" && env -u CLAUDECODE claude --dangerously-skip-permissions --max-turns 15 -p "$tprompt" > /dev/null 2>&1) || true

    # Score
    local logs="$ws/logs/verifier"
    mkdir -p "$logs"
    STORIES_DIR="$ws/.holicode/specs/stories" \
    TASKS_DIR="$ws/.holicode/specs/tasks" \
    LOGS_DIR="$logs" \
    python3 "$SCORER" 2>/dev/null || true

    local score
    score=$(cat "$logs/reward.txt" 2>/dev/null || echo "0")
    echo "  [i${iter}/v${variant}] Score: $score"

    # Copy reward.json for detailed inspection
    local detail_dir="$REPO/.holicode/analysis/reports/eval-details/i${iter}-v${variant}"
    mkdir -p "$detail_dir"
    cp "$logs/reward.json" "$detail_dir/" 2>/dev/null || true

    echo "$score"
}

# ── main loop ─────────────────────────────────────────────────────────────────
echo "HoliCode AutoAgent Improvement Loop (Layer 2-3)"
echo "Iterations: $ITERATIONS | Variants per iteration: $NUM_VARIANTS"
echo "LLM Judge: ${ENABLE_LLM_JUDGE:-disabled}"
echo ""

declare -a all_results=()
best_score="0"
best_variant=-1

for (( i=0; i<ITERATIONS; i++ )); do
    echo "== Iteration $i ============================================="
    iter_best_score="0"
    iter_best_variant=-1

    for (( v=0; v<NUM_VARIANTS; v++ )); do
        echo "-- Variant $v --"
        score=$(run_variant "$i" "$v" | tail -1)
        all_results+=("{\"iter\": $i, \"variant\": $v, \"score\": $score}")

        # Track best in this iteration
        is_better=$(python3 -c "print(int($score > $iter_best_score))" 2>/dev/null || echo "0")
        if [ "$is_better" = "1" ]; then
            iter_best_score="$score"
            iter_best_variant=$v
        fi
        echo ""
    done

    echo "  Iteration $i best: variant $iter_best_variant = $iter_best_score"

    # Compare with global best
    is_global_better=$(python3 -c "print(int($iter_best_score > $best_score))" 2>/dev/null || echo "0")
    if [ "$is_global_better" = "1" ]; then
        echo "  IMPROVED over previous best ($best_score -> $iter_best_score)"
        best_score="$iter_best_score"
        best_variant=$iter_best_variant
    else
        echo "  No improvement over global best ($best_score)"
    fi
    echo ""
done

# Write log
{
    echo '{"config": {"iterations": '"$ITERATIONS"', "variants": '"$NUM_VARIANTS"', "llm_judge": "'"${ENABLE_LLM_JUDGE:-0}"'"},'
    echo ' "best_score": '"$best_score"','
    echo ' "best_variant": '"$best_variant"','
    echo ' "runs": ['
    local_first=1
    for r in "${all_results[@]}"; do
        if [ "$local_first" = "1" ]; then
            echo "  $r"
            local_first=0
        else
            echo ", $r"
        fi
    done
    echo ']}'
} > "$LOG"

echo "Results log: $LOG"
echo ""
echo "Final best: variant $best_variant with score $best_score"
echo ""
echo "Score progression:"
python3 -c "
import json
with open('$LOG') as f:
    d = json.load(f)
for r in d['runs']:
    marker = ' <-- best' if r['score'] == d['best_score'] and r['variant'] == d['best_variant'] else ''
    print(f\"  iter={r['iter']} variant={r['variant']} score={r['score']:.3f}{marker}\")
" 2>/dev/null || echo "(log parse failed)"
