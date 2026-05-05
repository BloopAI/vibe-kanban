#!/usr/bin/env bash
# HoliCode DevBench improvement loop — multi-scenario variant runner
#
# Usage: ./scripts/eval/devbench-improve.sh [iterations]
#
# Extends improve.sh to run all DevBench scenarios (S01, S02, ...)
# with 5 prompt variants per scenario. Scores with Layer 0-T rubric.
#
# Environment:
#   ENABLE_LLM_JUDGE=1   Enable Layer 3 + Layer T LLM scoring
#   SCENARIOS="S01 S02"   Override which scenarios to run (space-separated)

set -euo pipefail

REPO=$(git rev-parse --show-toplevel)
DEVBENCH="$REPO/devbench"
ITERATIONS=${1:-1}
LOG="$REPO/.holicode/analysis/reports/devbench-improve-$(date +%Y%m%d-%H%M%S).json"
HARNESS="$DEVBENCH/harness.py"

mkdir -p "$(dirname "$LOG")"

NUM_VARIANTS=5

# Discover scenarios from devbench/scenarios/
if [ -n "${SCENARIOS:-}" ]; then
    IFS=' ' read -ra SCENARIO_LIST <<< "$SCENARIOS"
else
    SCENARIO_LIST=()
    for d in "$DEVBENCH/scenarios"/S*/; do
        [ -d "$d" ] && SCENARIO_LIST+=("$(basename "$d")")
    done
fi

echo "HoliCode DevBench Improvement Loop"
echo "Iterations: $ITERATIONS | Variants: $NUM_VARIANTS | Scenarios: ${SCENARIO_LIST[*]}"
echo "LLM Judge: ${ENABLE_LLM_JUDGE:-disabled}"
echo ""

# ── Prompt variants: quality gradient ─────────────────────────────────────────

variant_prompt() {
    local v=$1
    case $v in
        0)
            echo "Run the functional-analyze workflow on the project brief."
            ;;
        1)
            echo "Run the functional-analyze workflow on the project brief. Use EARS format: Given/When/Then for each acceptance criterion. Include at least 3 acceptance criteria per user story."
            ;;
        2)
            echo "Run the functional-analyze workflow on the project brief. Use EARS format for acceptance criteria. For every user story, include at least one AC covering the failure case or error condition (e.g., invalid input, missing permissions, network failure)."
            ;;
        3)
            echo "Run the functional-analyze workflow on the project brief. Use EARS format. For every AC, include an expected concrete value, state, or error name — not just behaviour descriptions. Example: 'Then the system returns HTTP 422 with message due_date must be in YYYY-MM-DD format' not just 'Then the system returns an error'."
            ;;
        4)
            cat <<'PROMPT'
Run the functional-analyze workflow on the project brief.
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
    echo "Read the user stories in .holicode/specs/stories/. Produce implementation tasks in .holicode/specs/tasks/ as TASK-{id}.md. Each must use a markdown table with fields: **Story:**, **Status:** (ready), **Size:** (XS/S/M/L), **Components:**. Required sections: ## Deliverables (checkboxes), ## Technical Requirements, ## Acceptance Validation (checkboxes)."
}

setup_workspace() {
    local ws=$1
    local scenario_dir=$2
    rm -rf "$ws" && mkdir -p "$ws"

    # Copy framework context
    cp "$REPO/CLAUDE.md" "$ws/"
    cp -rL "$REPO/.clinerules" "$ws/.clinerules" 2>/dev/null || true
    cp -rL "$REPO/.claude" "$ws/.claude" 2>/dev/null || true
    mkdir -p "$ws/.holicode/specs/stories" "$ws/.holicode/specs/tasks" "$ws/.holicode/state"
    [ -f "$REPO/.holicode/specs/SCHEMA.md" ] && cp "$REPO/.holicode/specs/SCHEMA.md" "$ws/.holicode/specs/"

    # Copy state files
    for f in activeContext.md progress.md WORK_SPEC.md techContext.md productContext.md projectbrief.md; do
        [ -f "$REPO/.holicode/state/$f" ] && cp "$REPO/.holicode/state/$f" "$ws/.holicode/state/" 2>/dev/null || true
    done

    # Copy scenario inputs as business brief
    for input_file in "$scenario_dir"/input/*; do
        [ -f "$input_file" ] && cp "$input_file" "$ws/"
    done
}

run_variant() {
    local iter=$1
    local scenario=$2
    local variant=$3
    local scenario_dir="$DEVBENCH/scenarios/$scenario"
    local ws="/tmp/devbench-eval-${scenario}-i${iter}-v${variant}"

    setup_workspace "$ws" "$scenario_dir"

    local sprompt
    sprompt=$(variant_prompt "$variant")
    local tprompt
    tprompt=$(task_prompt)

    echo "  [${scenario}/i${iter}/v${variant}] Running functional-analyze..."
    (cd "$ws" && env -u CLAUDECODE claude --dangerously-skip-permissions --max-turns 15 -p "$sprompt" > /dev/null 2>&1) || true

    echo "  [${scenario}/i${iter}/v${variant}] Running implementation-plan..."
    (cd "$ws" && env -u CLAUDECODE claude --dangerously-skip-permissions --max-turns 15 -p "$tprompt" > /dev/null 2>&1) || true

    # Score using the DevBench harness (scores the workspace)
    local score_output="/tmp/devbench-eval-${scenario}-i${iter}-v${variant}-scores.json"
    python3 "$HARNESS" \
        --scenario "$scenario" \
        --workspace-dir "$ws" \
        --output "$score_output" 2>/dev/null || true

    # Extract composite score
    local score
    score=$(python3 -c "
import json, sys
try:
    d = json.load(open('$score_output'))
    s = list(d.get('scenarios', {}).values())
    print(s[0]['composite']['total'] if s else '0')
except: print('0')
" 2>/dev/null || echo "0")

    echo "  [${scenario}/i${iter}/v${variant}] Score: $score"

    # Copy detailed results
    local detail_dir="$REPO/.holicode/analysis/reports/devbench-details/${scenario}/i${iter}-v${variant}"
    mkdir -p "$detail_dir"
    cp "$score_output" "$detail_dir/scores.json" 2>/dev/null || true

    echo "$score"
}

# ── main loop ─────────────────────────────────────────────────────────────────

declare -a all_results=()
best_score="0"
best_variant=-1
best_scenario=""

for (( i=0; i<ITERATIONS; i++ )); do
    echo "== Iteration $i ============================================="

    for scenario in "${SCENARIO_LIST[@]}"; do
        echo "-- Scenario: $scenario --"
        scenario_best_score="0"
        scenario_best_variant=-1

        for (( v=0; v<NUM_VARIANTS; v++ )); do
            echo "  Variant $v:"
            score=$(run_variant "$i" "$scenario" "$v" | tail -1)
            all_results+=("{\"iter\": $i, \"scenario\": \"$scenario\", \"variant\": $v, \"score\": $score}")

            is_better=$(python3 -c "print(int($score > $scenario_best_score))" 2>/dev/null || echo "0")
            if [ "$is_better" = "1" ]; then
                scenario_best_score="$score"
                scenario_best_variant=$v
            fi
        done

        echo "  $scenario best: variant $scenario_best_variant = $scenario_best_score"

        # Compare with global best
        is_global_better=$(python3 -c "print(int($scenario_best_score > $best_score))" 2>/dev/null || echo "0")
        if [ "$is_global_better" = "1" ]; then
            best_score="$scenario_best_score"
            best_variant=$scenario_best_variant
            best_scenario="$scenario"
        fi
    done
    echo ""
done

# Write consolidated log
{
    echo '{'
    echo '  "config": {'
    echo "    \"iterations\": $ITERATIONS,"
    echo "    \"variants\": $NUM_VARIANTS,"
    echo "    \"scenarios\": [$(printf '"%s",' "${SCENARIO_LIST[@]}" | sed 's/,$//' )],"
    echo "    \"llm_judge\": \"${ENABLE_LLM_JUDGE:-0}\""
    echo '  },'
    echo "  \"best_score\": $best_score,"
    echo "  \"best_variant\": $best_variant,"
    echo "  \"best_scenario\": \"$best_scenario\","
    echo '  "runs": ['
    local_first=1
    for r in "${all_results[@]}"; do
        if [ "$local_first" = "1" ]; then
            echo "    $r"
            local_first=0
        else
            echo "  , $r"
        fi
    done
    echo '  ]'
    echo '}'
} > "$LOG"

echo "Results log: $LOG"
echo ""
echo "Final best: scenario=$best_scenario variant=$best_variant score=$best_score"
echo ""
echo "Score progression:"
python3 -c "
import json
with open('$LOG') as f:
    d = json.load(f)
for r in d['runs']:
    marker = ' <-- best' if r['score'] == d['best_score'] and r['variant'] == d['best_variant'] and r['scenario'] == d.get('best_scenario', '') else ''
    print(f\"  {r['scenario']} iter={r['iter']} variant={r['variant']} score={r['score']:.3f}{marker}\")
" 2>/dev/null || echo "(log parse failed)"
