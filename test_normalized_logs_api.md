# Testing the Normalized Logs API

## Endpoint
`GET /api/projects/{project_id}/execution-processes/{process_id}/normalized-logs`

## Description
This endpoint takes executor logs in different formats (currently supports AMP and Claude) and converts them into a standard normalized format for easier consumption by the frontend.

## Example Usage

```bash
# Example API call to get normalized logs for an execution process
curl -X GET "http://localhost:3001/api/projects/{project_id}/execution-processes/{process_id}/normalized-logs" \
  -H "Content-Type: application/json"
```

## Response Format

```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "timestamp": "1751544747623",
        "entry_type": {
          "type": "user_message"
        },
        "content": "Task title: Create and start should open task\nTask description: When I press 'create & start' on task creation dialog it should then open the task in the sidebar"
      },
      {
        "timestamp": null,
        "entry_type": {
          "type": "thinking"
        },
        "content": "The user wants to implement a feature where pressing \"create & start\" on the task creation dialog should open the task in the sidebar."
      },
      {
        "timestamp": null,
        "entry_type": {
          "type": "assistant_message"
        },
        "content": "I'll help you implement the \"create & start\" functionality. Let me explore the codebase to understand the current task creation and sidebar structure."
      },
      {
        "timestamp": null,
        "entry_type": {
          "type": "tool_use",
          "tool_name": "todo_write",
          "action_type": {
            "action": "other",
            "description": "Tool: todo_write"
          }
        },
        "content": "Managing TODO list"
      }
    ],
    "session_id": "T-f8f7fec0-b330-47ab-b63a-b72c42f1ef6a",
    "executor_type": "amp"
  },
  "message": null
}
```

## Supported Action Types

The normalized format extracts specific action types for common tool operations:

- `file_read` - For reading files (content shows the file path)
- `file_write` - For writing/editing files (content shows the file path)
- `command_run` - For executing shell commands (content shows the command)
- `search` - For search operations (content shows the query)
- `web_fetch` - For web requests (content shows the URL)
- `task_create` - For creating tasks (content shows the description)
- `other` - For any other tool operations (content shows concise description)

## Content Format

The `content` field now provides concise, actionable information:

**Examples:**
- File operations: `"src/components/TaskDialog.tsx"` (just the path)
- Commands: `"npm run build"` (just the command)
- Search: `"authentication headers"` (just the query)
- Web fetch: `"https://api.example.com/data"` (just the URL)
- Other tools: `"Managing TODO list"` (concise description)

## Entry Types

- `user_message` - Messages from the user
- `assistant_message` - Text responses from the AI assistant
- `tool_use` - Tool usage with extracted action type and parameters
- `system_message` - System initialization and status messages
- `thinking` - Internal reasoning/thinking content (AMP format)

## Error Handling

- Returns 404 if the execution process or project is not found
- Returns an error response if the executor type is not supported
- Returns an error if logs are not available for the execution process
- Returns detailed error messages for normalization failures
