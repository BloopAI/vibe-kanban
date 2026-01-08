#!/usr/bin/env python3
"""
Supabase MCP Server - Direct database access for vibe-kanban.

This server provides tools to interact directly with the Supabase Postgres database.
It uses psycopg2 for connection and provides a structured interface for the AI agent.
"""

import json
import sys
import os
from supabase_db_util import get_connection

def handle_check_connection(params):
    """Verifies the database connection."""
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT version();")
            version = cur.fetchone()
            return {
                "success": True, 
                "message": "Connected successfully!", 
                "version": version[0]
            }
        conn.close()
    except Exception as e:
        return {"success": False, "error": str(e)}

def handle_list_tables(params):
    """Lists all tables in the public schema."""
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name;
            """)
            tables = [t[0] for t in cur.fetchall()]
            return {"success": True, "tables": tables}
        conn.close()
    except Exception as e:
        return {"success": False, "error": str(e)}

def handle_run_query(params):
    """Executes a raw SQL query."""
    query = params.get("query")
    if not query:
        return {"success": False, "error": "Query is required"}
    
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(query)
            if cur.description: # SELECT query
                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchall()
                # Convert rows to list of dicts for better readability in MCP
                data = [dict(zip(columns, row)) for row in rows]
                return {"success": True, "data": data}
            else: # INSERT, UPDATE, DELETE
                conn.commit()
                return {"success": True, "message": "Query executed and committed successfully."}
        conn.close()
    except Exception as e:
        return {"success": False, "error": str(e)}

def handle_get_table_schema(params):
    """Gets columns and types for a specific table."""
    table_name = params.get("table_name")
    if not table_name:
        return {"success": False, "error": "table_name is required"}
    
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = %s
                ORDER BY ordinal_position;
            """, (table_name,))
            columns = [
                {
                    "name": r[0],
                    "type": r[1],
                    "nullable": r[2],
                    "default": r[3]
                } for r in cur.fetchall()
            ]
            return {"success": True, "table": table_name, "columns": columns}
        conn.close()
    except Exception as e:
        return {"success": False, "error": str(e)}

# --- MCP Tool Definitions ---

TOOLS = [
    {
        "name": "supabase_check_connection",
        "description": "Verify connection to Supabase Postgres",
        "inputSchema": {"type": "object", "properties": {}}
    },
    {
        "name": "supabase_list_tables",
        "description": "List all tables in the Supabase public schema",
        "inputSchema": {"type": "object", "properties": {}}
    },
    {
        "name": "supabase_get_table_schema",
        "description": "Get detailed column information for a table",
        "inputSchema": {
            "type": "object",
            "properties": {
                "table_name": {"type": "string", "description": "Name of the table"}
            },
            "required": ["table_name"]
        }
    },
    {
        "name": "supabase_run_query",
        "description": "Execute a raw SQL query on Supabase (use with CAUTION)",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The SQL query to run"}
            },
            "required": ["query"]
        }
    }
]

TOOL_HANDLERS = {
    "supabase_check_connection": handle_check_connection,
    "supabase_list_tables": handle_list_tables,
    "supabase_get_table_schema": handle_get_table_schema,
    "supabase_run_query": handle_run_query,
}

# --- JSON-RPC / MCP Protocol Loop ---

def send_response(response):
    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()

def handle_mcp_request(request):
    method = request.get("method")
    params = request.get("params", {})
    req_id = request.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0", "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "supabase-mcp", "version": "1.0.0"}
            }
        }
    elif method == "tools/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}}
    elif method == "tools/call":
        tool_name = params.get("name")
        tool_args = params.get("arguments", {})
        handler = TOOL_HANDLERS.get(tool_name)
        if handler:
            try:
                result = handler(tool_args)
                return {
                    "jsonrpc": "2.0", "id": req_id,
                    "result": {
                        "content": [{"type": "text", "text": json.dumps(result, indent=2)}]
                    }
                }
            except Exception as e:
                return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32000, "message": str(e)}}
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Unknown tool: {tool_name}"}}
    elif method == "notifications/initialized":
        return None
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Method not found: {method}"}}

def main():
    for line in sys.stdin:
        if not line.strip(): continue
        try:
            req = json.loads(line)
            res = handle_mcp_request(req)
            if res: send_response(res)
        except Exception as e:
            send_response({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": str(e)}})

if __name__ == "__main__":
    main()
