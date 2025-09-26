# Enhanced Commit Messages with LLM Integration

This feature improves commit message generation in Vibe Kanban by using Large Language Models (LLMs) to create more informative, conventional commit messages based on the actual code changes and task context.

## Overview

Previously, Vibe Kanban generated simple commit messages like:
```
Add user authentication (vibe-kanban a1b2c3d4)

This task adds basic user login and registration functionality.
```

With LLM integration, commit messages are now generated following conventional commit standards and provide better context:
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

1. **Change Analysis**: When merging a task, the system analyzes the actual file changes (diffs) between the task branch and the base branch.

2. **Context Building**: The LLM receives:
   - Task title and description
   - Summary of file changes (added, modified, deleted files)
   - Change types (new features, bug fixes, etc.)

3. **Message Generation**: The LLM generates a conventional commit message following these guidelines:
   - Uses conventional commit format: `<type>[scope]: <description>`
   - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`
   - Keeps description concise (max 72 characters for first line)
   - Uses imperative mood ("add" not "adds" or "added")
   - Focuses on WHAT was changed and WHY

4. **Fallback**: If LLM generation fails or no API key is configured, falls back to the original simple format.

## Examples

### Before (Simple Format)
```
Add shopping cart functionality (vibe-kanban f8e7d6c5)

Implement basic shopping cart with add/remove items.
```

### After (LLM-Enhanced)
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
2. **Context**: Messages reflect actual changes, not just task descriptions
3. **History**: Better git history for debugging and code archaeology
4. **Automation**: No manual effort required - works automatically
5. **Fallback**: Graceful degradation when LLM services are unavailable

## Implementation Details

The feature is implemented in:
- `crates/services/src/services/commit_message_service.rs` - Core LLM integration
- `crates/server/src/routes/task_attempts.rs` - Integration into merge workflow

### Configuration Options

The service automatically detects and uses available API keys in this order:
1. Anthropic API key (preferred for quality and cost)
2. OpenAI API key (fallback option)
3. Simple format (when no API keys are configured)

### Error Handling

- Network timeouts (30 second limit)
- API rate limits and errors
- Invalid responses
- Missing API keys

All errors result in graceful fallback to the original commit message format with appropriate logging.

## Cost Considerations

Both Anthropic Claude Haiku and OpenAI GPT-4o-mini are cost-effective options:
- Typical cost: $0.001-$0.005 per commit message
- Messages are short (usually <500 tokens total)
- Only called during task merging (not every commit)

For a team making 100 task merges per month, the cost would be approximately $0.10-$0.50/month.

## Privacy and Security

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
INFO Generated commit message using LLM: feat(auth): implement user login system
WARN Failed to generate commit message using LLM: API rate limit exceeded, falling back to default
```