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
        "content": "Tool: todo_write with input: {\"todos\":[{\"id\":\"1\",\"content\":\"Explore task creation dialog component\",\"status\":\"todo\",\"priority\":\"high\"}]}"
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

- `file_read` - For reading files (includes the file path)
- `file_write` - For writing/editing files (includes the file path)
- `command_run` - For executing shell commands (includes the command)
- `search` - For search operations (includes the query)
- `web_fetch` - For web requests (includes the URL)
- `task_create` - For creating tasks (includes the description)
- `other` - For any other tool operations

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
