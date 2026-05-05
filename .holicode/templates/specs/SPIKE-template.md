# SPIKE-{{ID}}: {{Investigation Title}}

<!-- NOTE: This is a LOCAL REFERENCE template. 
     Primary SPIKE tracking happens in the configured issue tracker.
     Use this template only when creating local investigation details. -->

**Issue:** [GIF-xxx or #xxx - Link to tracker SPIKE issue]  
**Related Task:** [GIF-yyy or #yyy - Link to blocked tracker task issue]  
**Status:** investigation  
**Created:** {{ISO_DATE}}  
**Complexity:** unknown  
**Time-box:** {{HOURS}} hours  

## Problem Statement
<!-- Detailed description - mirrors GitHub issue description -->
{{Detailed description of the issue that needs investigation}}

## Investigation Trigger
- **Original Task**: {{TASK_ID}}
- **Blocker Type**: {{technical|design|requirements}}
- **Failed Attempts**: {{Number}} attempts made
- **Approaches Tried**:
  1. {{Approach 1}} - Failed because: {{reason}}
  2. {{Approach 2}} - Failed because: {{reason}}
  3. {{Approach 3}} - Failed because: {{reason}}

## Investigation Scope
### Questions to Answer
- [ ] What is the root cause?
- [ ] What are viable solutions?
- [ ] What are the trade-offs?
- [ ] What is the recommended approach?

### Success Criteria
- [ ] Root cause identified
- [ ] At least 2 solutions evaluated
- [ ] Clear recommendation provided
- [ ] Implementation approach documented

## Research Log
### {{Timestamp}}
- **Hypothesis**: {{current theory}}
- **Test**: {{what will be tested}}
- **Result**: {{outcome}}
- **Learning**: {{what was learned}}

## Findings
### Root Cause
{{Determined root cause}}

### Viable Solutions
1. **Solution A**: {{description}}
   - Pros: {{benefits}}
   - Cons: {{drawbacks}}
   - Effort: {{estimate}}

2. **Solution B**: {{description}}
   - Pros: {{benefits}}
   - Cons: {{drawbacks}}
   - Effort: {{estimate}}

## Recommendation
**Recommended Approach**: {{Solution A|B|C}}
**Reasoning**: {{why this solution}}
**Implementation Notes**: {{specific guidance}}

## Pattern Documentation
**Reusable Learning**: {{pattern that can be applied elsewhere}}
**Prevention Strategy**: {{how to avoid this issue in future}}

---
*Primary SPIKE tracking happens in the configured issue tracker. This template is for local investigation details only.*
*Run `issue-sync` skill to sync tracker state to this local cache.*
