# Supabase MCP Server

This MCP server provides tools to interact directly with the Supabase Postgres database used by Vibe Kanban.

## Tools Available

- `supabase_check_connection`: Verifies the database connection.
- `supabase_list_tables`: Lists all tables in the public schema.
- `supabase_get_table_schema`: Retrieves detailed column information for a table.
- `supabase_run_query`: Executes a raw SQL query (use with caution).

## Setup for Claude Desktop / Agent

Add the following to your MCP configuration (e.g., in `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "supabase": {
      "command": "/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/mcp/.venv/bin/python3",
      "args": [
        "/Users/rupeshpanwar/Documents/AI-Projects/ai-pack/vibe-kanban/mcp/supabase_server.py"
      ],
      "env": {
        "DATABASE_URL": "your-supabase-connection-string"
      }
    }
  }
}
```

> [!NOTE]
> The server uses the local `.venv` in the `mcp/` directory to manage the `psycopg2-binary` dependency.
