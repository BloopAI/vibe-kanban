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

### Environment Variables

Set one of the following environment variables to enable LLM-generated commit messages:

#### Anthropic Claude (Recommended)
```bash
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

#### OpenAI GPT
```bash
export OPENAI_API_KEY="your-openai-api-key"
```

### Default Models

- **Anthropic**: `claude-3-haiku-20240307` (fast, cost-effective)
- **OpenAI**: `gpt-4o-mini` (fast, cost-effective)

## How It Works

1. **Agent Context**: When merging a task, the system first checks if there's an active agent session from the task execution.

2. **Agent-Based Generation**: If an agent session exists:
   - The agent has full access to the conversation history and understands the reasoning behind changes
   - Agent analyzes the git diff of changes it made
   - Generates a contextual commit message based on what it actually implemented and why

3. **LLM API Fallback**: If no agent session exists or agent generation fails:
   - Falls back to direct LLM API calls (Anthropic Claude or OpenAI GPT)
   - Analyzes file diffs and task description
   - Generates conventional commit message based on changes alone

4. **Simple Fallback**: If both enhanced methods fail or no API keys are configured, uses the original simple format.

The agent-based approach is superior because:
- Agent understands the full context of what was implemented
- Has access to conversation history explaining decisions
- Can better explain WHY changes were made, not just WHAT changed

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
6. **Fallback**: Multiple levels of graceful degradation (agent → LLM API → simple format)

## Implementation Details

The feature is implemented in:
- `crates/services/src/services/commit_message_service.rs` - Core LLM integration
- `crates/server/src/routes/task_attempts.rs` - Integration into merge workflow

### Configuration Options

The service uses a priority system for commit message generation:
1. **Agent-based generation** (when agent session exists from task execution)
2. **Anthropic API** (preferred LLM fallback with API key)
3. **OpenAI API** (alternative LLM fallback with API key)
4. **Simple format** (final fallback when no enhanced options available)

### Error Handling

- Network timeouts (30 second limit)
- API rate limits and errors
- Invalid responses
- Missing API keys

All errors result in graceful fallback through the priority system with appropriate logging.

## Cost Considerations

**Agent-based generation**: Free! Uses existing agent session with no additional API costs.

**LLM API fallback** (when agent session unavailable):
- Anthropic Claude Haiku and OpenAI GPT-4o-mini are cost-effective
- Typical cost: $0.001-$0.005 per commit message
- Messages are short (usually <500 tokens total)
- Only called during task merging when agent session unavailable

For a team making 100 task merges per month with 20% requiring LLM fallback, the cost would be approximately $0.02-$0.10/month.

## Privacy and Security

**Agent-based generation**: Maximum privacy since agent already has access to full context - no additional data exposure.

**LLM API fallback**:
- Only file paths and change types are sent to the LLM (no file contents)
- Task titles and descriptions are included (ensure no sensitive data)
- All API calls use HTTPS encryption
- No data is stored by the LLM providers (as per their API terms)

## Troubleshooting

### Common Issues

1. **No enhanced messages**: Check if API key environment variable is set
2. **Fallback messages**: Check logs for LLM API errors
3. **Rate limits**: LLM providers may have rate limits; messages will fall back to simple format

### Logs

Look for log messages like:
```
INFO Found executor session abc123 for task attempt, trying agent-based commit message generation
INFO Generated enhanced commit message: feat(auth): implement user login system
WARN Agent-based generation failed: not yet implemented, falling back to LLM API
WARN Enhanced commit message generation failed: API rate limit exceeded, using fallback
```