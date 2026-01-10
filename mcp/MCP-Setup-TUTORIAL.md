# iKanban MCP Server Tutorial

## What is this?

Imagine you have a robot helper (that's Claude!) and you want to teach it how to manage your to-do list. The iKanban MCP Server is like a special translator that helps Claude talk to your task management app (iKanban).

**MCP** stands for "Model Context Protocol" - it's just a fancy way of saying "a way for AI to use tools."

---

## What Can This Do?

With this MCP server, Claude can:

- See all your teams (like different groups in school)
- See all your projects (like different subjects)
- Look at your tasks and issues (like homework assignments)
- Create new tasks for you
- Update tasks (mark them as done, change the title, etc.)
- **Delete tasks** you no longer need
- **Move tasks** between projects
- **Add comments** to tasks for notes and updates
- **Read comments** on any task

---

## Before You Start

You'll need:

1. **Claude Code** installed on your computer
2. **Python 3** installed (check by typing `python3 --version` in your terminal)
3. An **API key** from the iKanban app (this is like a secret password)

---

## Step 1: Create Your API Key

The API key is like a special password that lets the MCP server talk to your account.

### How to Get Your API Key

1. Go to your iKanban app at https://app.scho1ar.com
2. Log in with your account
3. Click on **Settings** (the gear icon)
4. Go to the **API Keys** section
5. Click **"Create New API Key"**
6. Give it a name like "Claude Code MCP"
7. Click **Create**

**IMPORTANT:** Copy the API key immediately! It looks like this:
```
vk_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456
```

You'll only see the full key once. After you close the dialog, only the first few characters will be shown (like `vk_aBcDeF...`).

**Keep this key secret!** Don't share it with anyone. It's like a password to your account.

---

## Step 2: Set Up the `ikanban` Command

The unified `ikanban.py` script handles both CLI commands and MCP server mode.

### Option A: Create an Alias (Recommended)

Add this to your `~/.bashrc` or `~/.zshrc`:

```bash
alias ikanban="python3 /Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/mcp/ikanban.py"
```

Then reload:
```bash
source ~/.zshrc  # or ~/.bashrc
```

### Option B: Create a Symlink

```bash
ln -s /Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/mcp/ikanban.py /usr/local/bin/ikanban
```

---

## Step 3: Set Up Claude Code

Now we need to tell Claude Code where to find our MCP server.

### Find the Settings File

Open your terminal and type:
```bash
open ~/.claude/settings.json
```

Or on Windows:
```bash
notepad %USERPROFILE%\.claude\settings.json
```

### Add the MCP Server

Find the `"mcpServers"` section and add this:

```json
{
  "mcpServers": {
    "ikanban": {
      "type": "stdio",
      "command": "python3",
      "args": ["/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/mcp/ikanban.py", "serve"],
      "env": {
        "VIBE_API_TOKEN": "paste-your-token-here"
      }
    }
  }
}
```

**Remember to:**
- Replace `paste-your-token-here` with your actual token
- Note the `"serve"` argument - this tells ikanban.py to run in MCP mode
- Keep the quotes around everything

### Example Complete Settings

Here's what your settings might look like:

```json
{
  "mcpServers": {
    "notion": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"]
    },
    "ikanban": {
      "type": "stdio",
      "command": "python3",
      "args": ["/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/mcp/ikanban.py", "serve"],
      "env": {
        "VIBE_API_TOKEN": "your-secret-token-here"
      }
    }
  }
}
```

---

## Step 4: Restart Claude Code

After saving the settings file:

1. Close Claude Code completely
2. Open it again
3. The MCP server should now be loaded!

---

## Step 5: Test It Out!

Now you can ask Claude to manage your tasks! Here are some things you can say:

### See Your Teams
```
Hey Claude, can you list all my teams using iKanban?
```

### See Your Projects
```
Claude, show me all projects in iKanban
```

### See Tasks for a Team
```
What issues does the IKA team have?
```

### Filter Tasks by Status
```
Show me all in-progress issues for the IKA team
```

### Create a New Task
```
Create a new task called "Finish homework" in the IKA team with high priority
```

### Create a Task with Due Date
```
Create task "Submit report" in IKA with due date 2026-01-15 and assign to user123
```

### Update a Task
```
Mark task abc123 as done
```

### Delete a Task
```
Delete task abc123
```

### Move a Task
```
Move task abc123 to the backend project
```

### Add a Comment
```
Add a comment "Started working on this" to task abc123
```

### View Comments
```
Show me all comments on task abc123
```

---

## Available Tools

Here's a cheat sheet of all the tools:

| Tool Name | What It Does | Example |
|-----------|--------------|---------|
| `ikanban_list_teams` | Shows all your teams | "List my teams" |
| `ikanban_list_projects` | Shows all projects | "Show all projects" |
| `ikanban_list_issues` | Shows tasks for a team (with optional status filter) | "Show IKA in-progress issues" |
| `ikanban_list_tasks` | Shows tasks in a project | "Show frontend tasks" |
| `ikanban_get_task` | Gets details of one task | "Get task abc123" |
| `ikanban_create_issue` | Creates a new task | "Create task 'Do laundry' with priority high" |
| `ikanban_update_task` | Changes a task | "Mark task as done" |
| `ikanban_delete_task` | Deletes a task permanently | "Delete task abc123" |
| `ikanban_move_task` | Moves task to another project | "Move task to backend project" |
| `ikanban_list_comments` | Shows comments on a task | "Show comments on task abc123" |
| `ikanban_add_comment` | Adds a comment to a task | "Add comment 'Done!' to task" |

---

## Task Fields

When creating or updating tasks, you can set these fields:

| Field | Description | Example Values |
|-------|-------------|----------------|
| `title` | Task title (required for create) | "Fix login bug" |
| `status` | Current status | `todo`, `inprogress`, `inreview`, `done`, `cancelled` |
| `priority` | Importance level | `urgent`, `high`, `medium`, `low` or `1`, `2`, `3`, `4` |
| `description` | Detailed description | "Need to fix the CSS alignment" |
| `assignee_id` | User ID to assign | "user_abc123" |
| `due_date` | Deadline | "2026-01-15" (YYYY-MM-DD format) |

---

## Known Teams

These team names are shortcuts you can use:

| Short Name | Full Name | Description |
|------------|-----------|-------------|
| `IKA` | iKanban | The iKanban team |
| `SCH` | Schild | The Schild team |

You can also use full names like `ikanban` or `schild` (case-insensitive).

---

## Known Projects

### iKanban Team (IKA) Projects

| Short Name | Description |
|------------|-------------|
| `frontend` | Frontend React/TypeScript (default) |
| `backend` | Backend Rust/Axum |
| `integration` | Integration/cross-cutting |

### Schild Team (SCH) Projects

| Short Name | Description |
|------------|-------------|
| `backend` | Backend services (default) |
| `frontend` | Frontend UI |
| `data-layer` | Data layer services |
| `temporal` | Temporal workflows |
| `elevenlabs` | ElevenLabs integration |
| `infra` | Infrastructure |

---

## CLI Commands

Once you've set up the `ikanban` alias (Step 2), you can use these commands directly:

```bash
# List teams and projects
ikanban teams
ikanban projects

# List issues (with optional filters)
ikanban issues IKA
ikanban issues IKA --status inprogress
ikanban issues SCH --status done

# Create a task
ikanban create IKA "Fix the bug"
ikanban create IKA "Urgent fix" -p urgent -s inprogress
ikanban create IKA "Report" --due-date 2026-01-15 --assignee user123

# Update a task
ikanban update <task-id> --status done
ikanban update <task-id> -s inprogress -d "Working on it"
ikanban update <task-id> --priority high

# Get task details
ikanban task <task-id>
ikanban task <task-id> --json

# Delete a task
ikanban delete <task-id>
ikanban delete <task-id> --force  # Skip confirmation

# Move a task
ikanban move <task-id> <project-id>

# Comments
ikanban comments <task-id>
ikanban comment <task-id> "This is my note"

# Start MCP server (for debugging)
ikanban serve
ikanban --mcp  # Alias for serve

# Check version
ikanban --version
```

---

## Troubleshooting

### "MCP server not loading"

1. Check that Python 3 is installed: `python3 --version`
2. Make sure the file path is correct
3. Restart Claude Code

### "Missing authorization token"

1. Make sure you added your API key to the settings
2. Check that the API key starts with `vk_`
3. Create a new API key from Settings > API Keys if needed

### "Failed to fetch teams"

1. Check your internet connection
2. Make sure the API server is running (https://api.scho1ar.com)
3. Your API key might have been revoked - create a new one in Settings

### "Unknown tool"

Make sure you're using the exact tool names like `ikanban_list_teams`, not just "list teams"

### "Invalid authorization token"

1. Make sure your API key is correct (should start with `vk_`)
2. Check if the API key was revoked in Settings
3. Create a new API key if needed

### "Failed to delete task"

1. Make sure the task ID is correct
2. Check if the task has running processes (must be stopped first)
3. Verify you have permission to delete the task

---

## How It Works (For Curious Kids!)

Here's what happens when you ask Claude to create a task:

```
You: "Create a task called 'Buy milk' in IKA team with high priority"
  |
  v
Claude: "I'll use the ikanban_create_issue tool!"
  |
  v
MCP Server: *translates request to API call*
  |
  v
iKanban API: *creates the task in the database*
  |
  v
MCP Server: "Task created! IKA-123: Buy milk"
  |
  v
Claude: "Done! I created IKA-123 'Buy milk' with high priority"
```

It's like a game of telephone, but for computers!

---

## Quick Reference Card

Print this out and keep it handy:

```
+--------------------------------------------------+
|          iKANBAN MCP QUICK REFERENCE             |
+--------------------------------------------------+
| CORE TOOLS                                       |
|   ikanban_list_teams      - List all teams       |
|   ikanban_list_projects   - List all projects    |
|   ikanban_list_issues     - List team issues     |
|   ikanban_list_tasks      - List project tasks   |
|   ikanban_get_task        - Get task details     |
+--------------------------------------------------+
| TASK MANAGEMENT                                  |
|   ikanban_create_issue    - Create new task      |
|   ikanban_update_task     - Update task          |
|   ikanban_delete_task     - Delete task          |
|   ikanban_move_task       - Move to project      |
+--------------------------------------------------+
| COMMENTS                                         |
|   ikanban_list_comments   - List task comments   |
|   ikanban_add_comment     - Add comment          |
+--------------------------------------------------+
| TEAMS: IKA (iKanban), SCH (Schild)               |
| STATUSES: todo, inprogress, inreview, done       |
| PRIORITIES: urgent, high, medium, low (1-4)      |
+--------------------------------------------------+
| API URL: https://api.scho1ar.com                 |
+--------------------------------------------------+
```

---

## Environment Variables

You can configure the MCP server with these environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `VIBE_API_TOKEN` | Your API key (required) | - |
| `VIBE_BACKEND_URL` | API server URL | `https://api.scho1ar.com` |

---

## You Did It!

Congratulations! You've set up your very own AI-powered task manager. Now Claude can help you stay organized and get things done.

Remember:
- Keep your API key secret (never share it!)
- Be specific when asking Claude to do things
- You can revoke an API key anytime in Settings if you think it was compromised
- Use team shortcuts like `IKA` and `SCH` for faster commands
- Have fun managing your tasks!

---

*Made with love for future programmers everywhere*
