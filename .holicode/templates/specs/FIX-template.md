# FIX-{PR_NUMBER}-{TASK_NUMBER}: {Brief Description}

## Issue
{Detailed description of the issue from PR review feedback}

## Source
- **PR**: #{pr_number} - {pr_title}
- **Reviewer**: @{reviewer_username}
- **Comment**: [View on GitHub]({comment_url})
- **File**: {file_path}
- **Line**: {line_number}

## Priority
{High|Medium|Low} - {Justification}

## Category
{Bug|Enhancement|Style|Documentation|Performance|Security}

## Root Cause Analysis
{For bugs, describe the root cause if known}
- **Why it happened**: {Analysis}
- **Impact**: {What functionality is affected}
- **Scope**: {How widespread is the issue}

## Acceptance Criteria
- [ ] Issue resolved according to reviewer feedback
- [ ] All tests pass with the fix applied
- [ ] Reviewer approves the resolution
- [ ] No regression in existing functionality
- [ ] Documentation updated if needed
- [ ] {Additional criteria specific to the issue}

## Implementation Notes
{Specific guidance for implementing the fix}
- {Key consideration 1}
- {Key consideration 2}
- {Reference to patterns or best practices}

## Testing Requirements
- [ ] Unit test coverage for the fix
- [ ] Integration test if applicable
- [ ] Manual testing scenario: {description}
- [ ] Edge cases to verify: {list}

## Dependencies
- **Parent PR**: #{parent_pr_number}
- **Blocks Merge**: {Yes|No}
- **Related Issues**: {list of related issues}
- **Related Tasks**: {list of related FIX tasks}

## Estimated Effort
- **Size**: {XS|S|M|L|XL}
- **Time**: {estimated hours}
- **Complexity**: {Low|Medium|High}

## Implementation Approach
{Step-by-step approach to fix the issue}
1. {Step 1}
2. {Step 2}
3. {Step 3}

## Verification Steps
{How to verify the fix is working}
1. {Verification step 1}
2. {Verification step 2}
3. {Verification step 3}

## Risk Assessment
- **Risk Level**: {Low|Medium|High}
- **Potential Side Effects**: {list}
- **Mitigation Strategy**: {how to minimize risks}

## Status Tracking
- **Created**: {timestamp}
- **Assigned To**: {developer}
- **State**: {TODO|IN_PROGRESS|IN_REVIEW|DONE}
- **Started**: {timestamp when work began}
- **Completed**: {timestamp when done}
- **Review Passed**: {timestamp when approved}

## Review Response
{Once fixed, document the response to the reviewer}
```markdown
@{reviewer} The issue has been addressed in commit {sha}:
- {Summary of what was fixed}
- {Any trade-offs or decisions made}
- {Link to tests that verify the fix}
```

## Lessons Learned
{After completion, document any learnings}
- **What worked well**: {insight}
- **What could improve**: {insight}
- **Pattern to remember**: {reusable solution}
