<!--
template_type: handoff
recommended_model: medium
handoff_id: "{{task_id}}-{{from_role}}-to-{{to_role}}"
from_conversation: "{{from_conv_id}}"
to_conversation: "{{to_conv_id}}"
created: "{{timestamp}}"
status: "pending"
priority: "medium"
-->

# Task Handoff: {{task_title}}

## Context Summary
[Brief description of current state and what needs to be done]

## Success Criteria
- [ ] Specific, measurable outcome 1
- [ ] Specific, measurable outcome 2

## Files and Context Required
- State files: [list relevant .holicode/state files]
- Code files: [list relevant source files]
- External docs: [any external documentation needed]

## GitHub References
### Related Issues
- {{github_issue_url}}: {{issue_title}}

### Related PRs  
- {{github_pr_url}}: {{pr_title}}

### Project Board
- {{project_board_url}}

## Handoff Back Conditions
- Task completion: [when to consider done]
- Escalation needed: [when to hand back for help]
- Blocking issue: [when unable to proceed]
```

### **`/templates/validation/review-template.md`**
```markdown
# HoliCode State Review: {{date}}

## Project Status Overview
- According to [progress.md]: {{completion_summary}}
- According to [activeContext.md]: {{current_focus}}
- According to [projectbrief.md]: {{objectives_summary}}

## Recent Developments
- Most recent update: {{recent_file}} at {{timestamp}}
- Key changes: {{changes_summary}}
- Implementation milestone progress: {{milestone_status}}

## Documentation Quality Assessment
- Consistency rating: {{consistency_level}}
- Coverage completeness: {{coverage_assessment}}
- Update frequency: {{update_pattern}}

## Risk Assessment
- Technical risks: {{tech_risks}}
- Integration risks: {{integration_risks}}
- Documentation risks: {{doc_risks}}

## Recommended Next Steps
1. {{priority_1}}
2. {{priority_2}}
3. {{priority_3}}
