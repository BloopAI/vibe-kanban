# VK MCP Server Tutorial

## What is this?

Imagine you have a robot helper (that's Claude!) and you want to teach it how to manage your to-do list. The VK MCP Server is like a special translator that helps Claude talk to your task management app (iKanban).

**MCP** stands for "Model Context Protocol" - it's just a fancy way of saying "a way for AI to use tools."

---

## What Can This Do?

With this MCP server, Claude can:

- See all your teams (like different groups in school)
- See all your projects (like different subjects)
- Look at your tasks and issues (like homework assignments)
- Create new tasks for you
- Update tasks (mark them as done, change the title, etc.)

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

## Step 2: Set Up Claude Code

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
    "vibe_kanban": {
      "type": "stdio",
      "command": "python3",
      "args": ["/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/mcp/server.py"],
      "env": {
        "VIBE_API_TOKEN": "paste-your-token-here"
      }
    }
  }
}
```

**Remember to:**
- Replace `paste-your-token-here` with your actual token
- Keep the quotes around everything
- Make sure there's a comma after the previous entry if there is one

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
    "vibe_kanban": {
      "type": "stdio",
      "command": "python3",
      "args": ["/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/mcp/server.py"],
      "env": {
        "VIBE_API_TOKEN": "your-secret-token-here"
      }
    }
  }
}
```

---

## Step 3: Restart Claude Code

After saving the settings file:

1. Close Claude Code completely
2. Open it again
3. The MCP server should now be loaded!

---

## Step 4: Test It Out!

Now you can ask Claude to manage your tasks! Here are some things you can say:

### See Your Teams
```
Hey Claude, can you list all my teams using the vk MCP?
```

### See Your Projects
```
Claude, show me all projects in vibe-kanban
```

### See Tasks for a Team
```
What issues does the ikanban team have?
```

### Create a New Task
```
Create a new task called "Finish homework" in the ikanban team
```

### Update a Task
```
Mark task abc123 as done
```

---

## Available Tools

Here's a cheat sheet of all the tools:

| Tool Name | What It Does | Example |
|-----------|--------------|---------|
| `vk_list_teams` | Shows all your teams | "List my teams" |
| `vk_list_projects` | Shows all projects | "Show all projects" |
| `vk_list_issues` | Shows tasks for a team | "Show ikanban issues" |
| `vk_list_tasks` | Shows tasks in a project | "Show frontend tasks" |
| `vk_get_task` | Gets details of one task | "Get task abc123" |
| `vk_create_issue` | Creates a new task | "Create task 'Do laundry'" |
| `vk_update_task` | Changes a task | "Mark task as done" |

---

## Known Teams

These team names are shortcuts you can use:

| Short Name | What It Is |
|------------|------------|
| `vibe-kanban` | The main vibe-kanban team |
| `ikanban` | The iKanban team |
| `schild` | The Schild team |

---

## Known Projects

These project names are shortcuts:

| Short Name | What It Is |
|------------|------------|
| `frontend` | Frontend code project |
| `backend` | Backend code project |
| `integration` | Integration project |
| `database` | Database project |
| `ai` | AI-related project |

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

Make sure you're using the exact tool names like `vk_list_teams`, not just "list teams"

### "Invalid authorization token"

1. Make sure your API key is correct (should start with `vk_`)
2. Check if the API key was revoked in Settings
3. Create a new API key if needed

---

## How It Works (For Curious Kids!)

Here's what happens when you ask Claude to create a task:

```
You: "Create a task called 'Buy milk' in ikanban team"
  |
  v
Claude: "I'll use the vk_create_issue tool!"
  |
  v
MCP Server: *translates request to API call*
  |
  v
iKanban API: *creates the task in the database*
  |
  v
MCP Server: "Task created! Here's the ID: abc123"
  |
  v
Claude: "Done! I created your task 'Buy milk' with ID abc123"
```

It's like a game of telephone, but for computers!

---

## Quick Reference Card

Print this out and keep it handy:

```
+------------------------------------------+
|         VK MCP QUICK REFERENCE           |
+------------------------------------------+
| LIST TEAMS:     vk_list_teams            |
| LIST PROJECTS:  vk_list_projects         |
| LIST ISSUES:    vk_list_issues           |
| LIST TASKS:     vk_list_tasks            |
| GET TASK:       vk_get_task              |
| CREATE TASK:    vk_create_issue          |
| UPDATE TASK:    vk_update_task           |
+------------------------------------------+
| TEAMS: vibe-kanban, ikanban, schild      |
| PROJECTS: frontend, backend, ai          |
+------------------------------------------+
| API URL: https://api.scho1ar.com         |
+------------------------------------------+
```

---

## You Did It!

Congratulations! You've set up your very own AI-powered task manager. Now Claude can help you stay organized and get things done.

Remember:
- Keep your API key secret (never share it!)
- Be specific when asking Claude to do things
- You can revoke an API key anytime in Settings if you think it was compromised
- Have fun managing your tasks!

---

*Made with love for future programmers everywhere*
