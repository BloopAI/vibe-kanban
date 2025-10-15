# Enhanced Commit Messages with Agent Integration

This feature improves commit message generation in Vibe Kanban by leveraging the existing coding agent to create more informative, conventional commit messages. The agent has full context of the conversation history and can analyze code changes it made to generate better commit messages.

## Overview

Previously, Vibe Kanban generated simple commit messages like:
```
Add user authentication (vibe-kanban a1b2c3d4)

This task adds basic user login and registration functionality.
```

With agent integration, commit messages are now generated following conventional commit standards with full conversation context:
```
feat(auth): implement user authentication system

Add login/registration endpoints with JWT token support
- Added authentication middleware and user session management
- Implemented password hashing and validation
- Created user registration and login API routes
```

## Configuration

No configuration required! The feature automatically uses the agent when available.

## How It Works

1. **Agent Context**: When merging a task, the system first checks if there's an active agent session from the task execution.

2. **Agent-Based Generation (with Session Forking)**: If an agent session exists:
   - The system creates a **forked session** to generate the commit message
   - Session forking means: Agent has full conversation context but the commit message generation doesn't appear in the main conversation history
   - Agent analyzes the git diff of changes it made with complete context
   - Generates a contextual commit message based on what it actually implemented and why
   - Agent understands the full context: WHY changes were made, not just WHAT changed
   - The forked session is discarded after generating the commit message

3. **Simple Fallback**: If agent session unavailable or agent generation fails, uses the original simple format.

## Examples

### Before (Simple Format)
```
Add shopping cart functionality (vibe-kanban f8e7d6c5)

Implement basic shopping cart with add/remove items.
```

### After (Agent-Enhanced)
```
feat(cart): implement shopping cart functionality

Add item management with persistent storage
- Created cart service with add/remove/update operations
- Added cart state management and localStorage persistence
- Implemented cart UI components and quantity controls
```

### Bug Fix Example
```
fix(api): resolve user session timeout issue

Prevent premature session expiration in authentication middleware
- Extended JWT token lifetime from 1h to 24h
- Added refresh token mechanism for long-lived sessions
- Fixed session cleanup race condition
```

### Documentation Update
```
docs: update API documentation for v2 endpoints

Add comprehensive examples and error response formats
- Updated OpenAPI specs with request/response schemas
- Added authentication flow documentation
- Included rate limiting and error handling examples
```

## Benefits

1. **Consistency**: All commits follow conventional commit standards
2. **Context**: Messages reflect actual changes with full reasoning from agent conversations
3. **History**: Better git history for debugging and code archaeology
4. **Automation**: No manual effort required - works automatically
5. **Intelligence**: Agent understands WHY changes were made, not just WHAT changed
6. **Zero Cost**: Uses existing agent session - no additional API costs
7. **Privacy**: No additional data exposure beyond existing agent access
8. **Clean History**: Session forking keeps commit message generation separate from main conversation
9. **Fallback**: Graceful degradation to simple format when agent unavailable

## Implementation Details

The feature is implemented in:
- `crates/services/src/services/commit_message_service.rs` - Agent integration and commit message generation
- `crates/server/src/routes/task_attempts.rs` - Integration into merge workflow

### How It Works

The service uses a simple two-tier system:
1. **Agent-based generation** (when agent session exists from task execution)
2. **Simple format** (fallback when agent unavailable)

### Error Handling

**Agent execution**:
- 60 second timeout for agent response
- Automatic process cleanup
- Intelligent stdout parsing with filtering of log lines
- Clean markdown code block removal

All errors result in graceful fallback to simple format with appropriate logging.

## Cost Considerations

**Completely free!** Uses existing agent session with no additional API costs.

## Troubleshooting

### Common Issues

1. **No enhanced messages**: Agent session may not have been created during task execution
2. **Simple fallback used**: Check logs for agent execution errors
3. **Timeout errors**: Agent took too long to respond (>60s)

### Logs

Look for log messages like:
```
INFO Found executor session abc123 for task attempt, trying agent-based commit message generation
INFO Successfully generated commit message using agent: feat(auth): implement user login system
INFO Generated enhanced commit message: feat(auth): implement user login system
WARN Agent-based generation failed: Timeout waiting for agent response, falling back to simple format
INFO Using simple fallback format for commit message
```