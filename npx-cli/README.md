# iKanban

> A visual project management tool for developers that integrates with git repositories and coding agents like Claude Code and Amp.

## Quick Start

Run iKanban instantly without installation:

```bash
npx ikanban
```

This will launch the application locally and open it in your browser automatically.

## What is iKanban?

iKanban is a modern project management tool designed specifically for developers. It helps you organize your coding projects with kanban-style task management while providing powerful integrations with git repositories and AI coding agents.

### Key Features

**Project Management**
- Add git repositories as projects (existing or create new ones)
- Automatic git integration and repository validation
- Project search functionality across all files
- Custom setup and development scripts per project

**Task Management**
- Create and manage tasks with kanban-style boards
- Task status tracking (Todo, In Progress, Done)
- Rich task descriptions and notes
- Task execution with multiple AI agents

**AI Agent Integration**
- **Claude**: Advanced AI coding assistant
- **Amp**: Powerful development agent
- **Echo**: Simple testing/debugging agent
- Create tasks and immediately start agent execution
- Follow-up task execution for iterative development

**Development Workflow**
- Create isolated git worktrees for each task attempt
- View diffs of changes made by agents
- Merge successful changes back to main branch
- Rebase task branches to stay up-to-date
- Manual file editing and deletion
- Integrated development server support

**Developer Tools**
- Browse and validate git repositories from filesystem
- Open task worktrees in your preferred editor (VS Code, Cursor, Windsurf, IntelliJ, Zed)
- Real-time execution monitoring and process control
- Stop running processes individually or all at once
- Sound notifications for task completion

## How It Works

1. **Add Projects**: Import existing git repositories or create new ones
2. **Create Tasks**: Define what needs to be built or fixed
3. **Execute with AI**: Let coding agents work on your tasks in isolated environments
4. **Review Changes**: See exactly what was modified using git diffs
5. **Merge Results**: Incorporate successful changes into your main codebase

## Core Functionality

iKanban provides a complete project management experience with these key capabilities:

**Project Repository Management**
- Full CRUD operations for managing coding projects
- Automatic git repository detection and validation
- Initialize new repositories or import existing ones
- Project-wide file search functionality

**Task Lifecycle Management**
- Create, update, and delete tasks with rich descriptions
- Track task progress through customizable status workflows
- One-click task creation with immediate AI agent execution
- Task attempt tracking with detailed execution history

**AI Agent Execution Environment**
- Isolated git worktrees for safe code experimentation
- Real-time execution monitoring and activity logging
- Process management with ability to stop individual or all processes
- Support for follow-up executions to iterate on solutions

**Code Change Management**
- View detailed diffs of all changes made during task execution
- Branch status monitoring to track divergence from main
- One-click merging of successful changes back to main branch
- Automatic rebasing to keep task branches up-to-date
- Manual file deletion and cleanup capabilities

**Development Integration**
- Open task worktrees directly in your preferred code editor
- Start and manage development servers for testing changes
- Browse local filesystem to add new projects
- Health monitoring for service availability

## Configuration

iKanban supports customization through its configuration system:

- **Editor Integration**: Choose your preferred code editor
- **Sound Notifications**: Customize completion sounds
- **Project Defaults**: Set default setup and development scripts

## Technical Architecture

- **Backend**: Rust with Axum web framework
- **Frontend**: React with TypeScript
- **Database**: SQLite for local data storage
- **Git Integration**: Native git operations for repository management
- **Process Management**: Tokio-based async execution monitoring

## Requirements

- Node.js (for npx execution)
- Git (for repository operations)
- Your preferred code editor (optional, for opening task worktrees)

## Supported Platforms

- Linux x64
- Linux ARM64
- Windows x64
- Windows ARM64
- macOS x64 (Intel)
- macOS ARM64 (Apple Silicon)

## Use Cases

**Bug Fixes**
- Create a task describing the bug
- Let an AI agent analyze and fix the issue
- Review the proposed changes
- Merge if satisfied, or provide follow-up instructions

**Feature Development**
- Break down features into manageable tasks
- Use agents for initial implementation
- Iterate with follow-up executions
- Test using integrated development servers

**Project Setup**
- Bootstrap new projects with AI assistance
- Set up development environments
- Configure build and deployment scripts

**Code Documentation**
- Generate documentation for existing code
- Create README files and API documentation
- Maintain up-to-date project information

---

**Ready to supercharge your development workflow?**

```bash
npx ikanban
```

*Start managing your projects with the power of AI coding agents today!*
