#!/bin/bash

# Stage 4 Metrics Collection Script
# Collects and analyzes metrics from Stage 4 implementation

REPORT_DIR=".holicode/analysis/reports"
METRICS_FILE="$REPORT_DIR/stage4-metrics-$(date +%Y%m%d).md"

echo "# Stage 4 Implementation Metrics" > "$METRICS_FILE"
echo "**Generated**: $(date -Iseconds)" >> "$METRICS_FILE"
echo "" >> "$METRICS_FILE"

# Function to count patterns
count_patterns() {
    echo "## Pattern Usage Metrics" >> "$METRICS_FILE"
    echo "" >> "$METRICS_FILE"
    
    for pattern in docs/patterns/*.md; do
        if [ -f "$pattern" ]; then
            pattern_name=$(basename "$pattern" .md)
            # Count references to this pattern in specs and workflows
            count=$(grep -r "$pattern_name" .holicode/specs/ workflows/ 2>/dev/null | wc -l)
            echo "- $pattern_name: $count references" >> "$METRICS_FILE"
        fi
    done
    echo "" >> "$METRICS_FILE"
}

# Function to analyze complexity scores
analyze_complexity() {
    echo "## Complexity Analysis" >> "$METRICS_FILE"
    echo "" >> "$METRICS_FILE"
    
    # Count tasks by complexity score
    for score in 1 2 3 4 5; do
        count=$(grep -r "Complexity Score.*$score" .holicode/specs/tasks/ 2>/dev/null | wc -l)
        echo "- Score $score: $count tasks" >> "$METRICS_FILE"
    done
    
    # Count SPIKEs
    spike_count=$(ls .holicode/specs/tasks/SPIKE-*.md 2>/dev/null | wc -l)
    echo "- SPIKEs created: $spike_count" >> "$METRICS_FILE"
    echo "" >> "$METRICS_FILE"
}

# Function to measure rationale coverage
measure_rationale() {
    echo "## Rationale Documentation Coverage" >> "$METRICS_FILE"
    echo "" >> "$METRICS_FILE"
    
    total_specs=$(find .holicode/specs -name "*.md" -type f | wc -l)
    with_rationale=$(grep -r "Design Rationale" .holicode/specs/ 2>/dev/null | wc -l)
    
    if [ $total_specs -gt 0 ]; then
        coverage=$((with_rationale * 100 / total_specs))
    else
        coverage=0
    fi
    
    echo "- Total specifications: $total_specs" >> "$METRICS_FILE"
    echo "- With rationale: $with_rationale" >> "$METRICS_FILE"
    echo "- Coverage: $coverage%" >> "$METRICS_FILE"
    echo "" >> "$METRICS_FILE"
}

# Function to check delegation usage
check_delegation() {
    echo "## Delegation Settings" >> "$METRICS_FILE"
    echo "" >> "$METRICS_FILE"
    
    if [ -f ".holicode/state/techContext.md" ]; then
        if grep -q "delegation_settings" .holicode/state/techContext.md; then
            echo "✅ Delegation framework configured" >> "$METRICS_FILE"
            
            # Count opt-outs
            business_delegated=$(grep -c "business_decisions:.*delegated_to_ai: true" .holicode/state/techContext.md 2>/dev/null || echo 0)
            tech_delegated=$(grep -c "technical_decisions:.*delegated_to_ai: true" .holicode/state/techContext.md 2>/dev/null || echo 0)
            
            echo "- Business decisions delegated: $business_delegated" >> "$METRICS_FILE"
            echo "- Technical decisions delegated: $tech_delegated" >> "$METRICS_FILE"
        else
            echo "❌ Delegation framework not configured" >> "$METRICS_FILE"
        fi
    fi
    
    if [ -f ".holicode/state/delegationContext.md" ]; then
        echo "✅ Delegation context file exists" >> "$METRICS_FILE"
        
        # Extract maturity indicators
        if grep -q "Quality Level: high" .holicode/state/delegationContext.md; then
            echo "- Business context maturity: high" >> "$METRICS_FILE"
        fi
        if grep -q "Maturity Level: mature" .holicode/state/delegationContext.md; then
            echo "- Technical architecture maturity: mature" >> "$METRICS_FILE"
        fi
    fi
    echo "" >> "$METRICS_FILE"
}

# Function to analyze review reports
analyze_reviews() {
    echo "## Technical Review Results" >> "$METRICS_FILE"
    echo "" >> "$METRICS_FILE"
    
    review_count=$(ls $REPORT_DIR/tech-review-*.md 2>/dev/null | wc -l)
    echo "- Reviews conducted: $review_count" >> "$METRICS_FILE"
    
    if [ $review_count -gt 0 ]; then
        # Extract alignment scores from latest review
        latest_review=$(ls -t $REPORT_DIR/tech-review-*.md 2>/dev/null | head -1)
        if [ -f "$latest_review" ]; then
            echo "- Latest review: $(basename $latest_review)" >> "$METRICS_FILE"
            grep "Alignment:" "$latest_review" >> "$METRICS_FILE" 2>/dev/null || true
        fi
    fi
    echo "" >> "$METRICS_FILE"
}

# Function to check SPIKE usage
check_spikes() {
    echo "## SPIKE Investigation Usage" >> "$METRICS_FILE"
    echo "" >> "$METRICS_FILE"
    
    # Check for SPIKE template
    if [ -f "templates/specs/SPIKE-template.md" ]; then
        echo "✅ SPIKE template available" >> "$METRICS_FILE"
    else
        echo "❌ SPIKE template missing" >> "$METRICS_FILE"
    fi
    
    # Check for SPIKE workflow
    if [ -f "workflows/spike-investigate.md" ]; then
        echo "✅ SPIKE investigation workflow available" >> "$METRICS_FILE"
    else
        echo "❌ SPIKE investigation workflow missing" >> "$METRICS_FILE"
    fi
    
    # Count SPIKE tasks
    spike_tasks=$(find .holicode/specs/tasks -name "SPIKE-*.md" 2>/dev/null | wc -l)
    echo "- SPIKE tasks created: $spike_tasks" >> "$METRICS_FILE"
    
    # Check for time-boxed SPIKEs
    if [ $spike_tasks -gt 0 ]; then
        timeboxed=$(grep -l "Time Box:" .holicode/specs/tasks/SPIKE-*.md 2>/dev/null | wc -l)
        echo "- Time-boxed SPIKEs: $timeboxed" >> "$METRICS_FILE"
    fi
    echo "" >> "$METRICS_FILE"
}

# Function to measure workflow enhancements
check_workflow_updates() {
    echo "## Workflow Enhancement Status" >> "$METRICS_FILE"
    echo "" >> "$METRICS_FILE"
    
    # Check for delegation checks in workflows
    workflows_with_delegation=$(grep -l "delegationContext" workflows/*.md 2>/dev/null | wc -l)
    echo "- Workflows with delegation checks: $workflows_with_delegation" >> "$METRICS_FILE"
    
    # Check for complexity scoring
    if grep -q "Complexity Score" workflows/implementation-plan.md 2>/dev/null; then
        echo "✅ Complexity scoring integrated" >> "$METRICS_FILE"
    else
        echo "❌ Complexity scoring not found" >> "$METRICS_FILE"
    fi
    
    # Check for security gates
    if grep -q "Security.*Assessment" workflows/technical-design.md 2>/dev/null; then
        echo "✅ Security assessment gates present" >> "$METRICS_FILE"
    else
        echo "❌ Security assessment gates missing" >> "$METRICS_FILE"
    fi
    
    # Check for Gate G3.5
    if grep -q "Gate G3.5" workflows/spec-workflow.md 2>/dev/null; then
        echo "✅ Technical Review Gate (G3.5) integrated" >> "$METRICS_FILE"
    else
        echo "❌ Technical Review Gate (G3.5) missing" >> "$METRICS_FILE"
    fi
    echo "" >> "$METRICS_FILE"
}

# Function to analyze problem resolution
analyze_problem_resolution() {
    echo "## Problem Resolution Metrics" >> "$METRICS_FILE"
    echo "" >> "$METRICS_FILE"
    
    # Check for tricky problem entries in retro-inbox
    tricky_problems=$(grep -c "Tricky Problem:" .holicode/state/retro-inbox.md 2>/dev/null || echo 0)
    echo "- Tricky problems encountered: $tricky_problems" >> "$METRICS_FILE"
    
    # Check for pattern updates
    pattern_updates=$(grep -c "Pattern.*updated" .holicode/state/retro-inbox.md 2>/dev/null || echo 0)
    echo "- Pattern library updates: $pattern_updates" >> "$METRICS_FILE"
    
    # Check for escalations
    escalations=$(grep -c "Escalation" .holicode/state/retro-inbox.md 2>/dev/null || echo 0)
    echo "- Escalations triggered: $escalations" >> "$METRICS_FILE"
    echo "" >> "$METRICS_FILE"
}

# Function to generate summary
generate_summary() {
    echo "## Summary" >> "$METRICS_FILE"
    echo "" >> "$METRICS_FILE"
    
    # Count total enhancements
    total_patterns=$(ls docs/patterns/*.md 2>/dev/null | wc -l)
    total_workflows=$(ls workflows/*.md 2>/dev/null | wc -l)
    
    echo "### Framework Statistics" >> "$METRICS_FILE"
    echo "- Total pattern documents: $total_patterns" >> "$METRICS_FILE"
    echo "- Total workflows: $total_workflows" >> "$METRICS_FILE"
    echo "- Report generated at: $(date)" >> "$METRICS_FILE"
    echo "" >> "$METRICS_FILE"
    
    echo "### Stage 4 Feature Adoption" >> "$METRICS_FILE"
    
    # Check key features
    features_adopted=0
    total_features=7
    
    if [ -f ".holicode/state/delegationContext.md" ]; then
        ((features_adopted++))
        echo "✅ Decision Delegation Framework" >> "$METRICS_FILE"
    else
        echo "❌ Decision Delegation Framework" >> "$METRICS_FILE"
    fi
    
    if [ -f "workflows/spike-investigate.md" ]; then
        ((features_adopted++))
        echo "✅ SPIKE Investigation Workflow" >> "$METRICS_FILE"
    else
        echo "❌ SPIKE Investigation Workflow" >> "$METRICS_FILE"
    fi
    
    if [ -f "workflows/tech-review-post-planning.md" ]; then
        ((features_adopted++))
        echo "✅ Technical Review Workflow" >> "$METRICS_FILE"
    else
        echo "❌ Technical Review Workflow" >> "$METRICS_FILE"
    fi
    
    if [ $total_patterns -ge 6 ]; then
        ((features_adopted++))
        echo "✅ Pattern Library (6+ patterns)" >> "$METRICS_FILE"
    else
        echo "❌ Pattern Library (currently $total_patterns patterns)" >> "$METRICS_FILE"
    fi
    
    if grep -q "Complexity Score" workflows/implementation-plan.md 2>/dev/null; then
        ((features_adopted++))
        echo "✅ Complexity Management" >> "$METRICS_FILE"
    else
        echo "❌ Complexity Management" >> "$METRICS_FILE"
    fi
    
    if grep -q "Gate G3.5" workflows/spec-workflow.md 2>/dev/null; then
        ((features_adopted++))
        echo "✅ Review Gate Integration" >> "$METRICS_FILE"
    else
        echo "❌ Review Gate Integration" >> "$METRICS_FILE"
    fi
    
    if grep -q "Tricky Problem Protocol" holicode.md 2>/dev/null; then
        ((features_adopted++))
        echo "✅ Tricky Problem Protocol" >> "$METRICS_FILE"
    else
        echo "❌ Tricky Problem Protocol" >> "$METRICS_FILE"
    fi
    
    echo "" >> "$METRICS_FILE"
    adoption_percentage=$((features_adopted * 100 / total_features))
    echo "**Feature Adoption Rate: $adoption_percentage% ($features_adopted/$total_features)**" >> "$METRICS_FILE"
    echo "" >> "$METRICS_FILE"
    
    echo "Metrics collection complete. Review the full report at: $METRICS_FILE" >> "$METRICS_FILE"
}

# Main execution
echo "Collecting Stage 4 metrics..."

# Ensure report directory exists
mkdir -p "$REPORT_DIR"

# Execute all metrics collection
count_patterns
analyze_complexity
measure_rationale
check_delegation
analyze_reviews
check_spikes
check_workflow_updates
analyze_problem_resolution
generate_summary

echo "✅ Metrics collected and saved to: $METRICS_FILE"

# Display summary
echo ""
echo "=== Quick Summary ==="
grep "Feature Adoption Rate:" "$METRICS_FILE"
echo ""
echo "Run 'cat $METRICS_FILE' to view the full report."
