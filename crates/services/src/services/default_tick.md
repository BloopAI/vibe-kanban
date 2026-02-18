# Tick Task

This file is executed periodically by the TickService.
You have access to the Vibe Kanban MCP tools. Use them to check and summarise issues assigned to the current user.

## Instructions

### Step 1: Identify the current user

Use `get_context` to check if a project/organization context is available.

Then call `list_organizations` to get all available organizations. For each organization, call `list_org_members` with the `organization_id` to retrieve the member list. Identify the current user by matching against the local git user email (run `git config user.email` to find it). This gives you the user's `user_id`.

### Step 2: Gather assigned issues

For each organization, call `list_projects` with the `organization_id` to get all projects.

For each project, call `list_issues` with:
- `project_id`: the project ID
- `assignee_user_id`: the user ID from step 1
- `limit`: 50

This returns issues with their `title`, `simple_id`, `status`, `priority`, and timestamps.

### Step 3: Get issue details

For any issues that look important (urgent/high priority, or in progress), call `get_issue` with the `issue_id` to retrieve the full description and details.

### Step 4: Write the summary

Create or update a file called `summary.md` in the repository root with the following structure:

```markdown
# Issue Summary for [User Name]

Generated: [current date and time]

## In Progress
- **[VIB-XXX]** Issue title (priority: high)
  Brief description or notes

## To Do
- **[VIB-XXX]** Issue title (priority: medium)
  Brief description or notes

## Statistics
- Total assigned: X
- In progress: X
- To do: X
- Urgent/High priority: X
```

Group issues by status. Within each group, sort by priority (urgent > high > medium > low > none).
Include the issue's `simple_id`, title, priority, and a one-line summary of the description if available.
Only include non-done issues unless there are recently completed ones (updated in the last 24 hours).
