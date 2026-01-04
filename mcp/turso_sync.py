#!/usr/bin/env python3
"""
Turso Sync MCP Server

MCP server for managing Turso distributed database sync operations.
Provides tools for exporting local SQLite data to Turso and checking sync status.

Usage:
    python3 mcp/turso_sync.py

MCP Tools:
    - turso_status: Check Turso connection and sync status
    - turso_export_schema: Export missing table schemas to Turso
    - turso_export_data: Export data from local SQLite to Turso
    - turso_export_migrations: Export SQLx migration records to Turso
    - turso_full_sync: Perform complete sync (schema + migrations + data)
"""

import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path
from typing import Any

# MCP protocol constants
JSONRPC_VERSION = "2.0"

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
DEV_ASSETS = PROJECT_ROOT / "dev_assets"
LOCAL_DB = DEV_ASSETS / "db.sqlite"
TURSO_CLI = Path.home() / ".turso" / "turso"

# Tables to export (order matters for foreign keys)
EXPORT_TABLES = [
    "teams",
    "projects",
    "team_projects",
    "team_members",
    "team_invitations",
    "tasks",
    "task_comments",
    "task_document_links",
    "document_folders",
    "documents",
    "github_connections",
    "github_repositories",
    "github_repo_sync_configs",
    "milestones",
    "project_dependencies",
    "project_labels",
    "project_label_assignments",
    "inbox_items",
]


def get_turso_db_name() -> str | None:
    """Get Turso database name from environment."""
    url = os.environ.get("TURSO_DATABASE_URL", "")
    if not url:
        return None
    # Extract db name from libsql://db-name.turso.io
    if url.startswith("libsql://"):
        parts = url[9:].split(".")
        if parts:
            return parts[0]
    return None


def run_turso_command(sql: str, db_name: str) -> tuple[bool, str]:
    """Run SQL command against Turso database."""
    if not TURSO_CLI.exists():
        return False, f"Turso CLI not found at {TURSO_CLI}"

    try:
        result = subprocess.run(
            [str(TURSO_CLI), "db", "shell", db_name],
            input=sql,
            capture_output=True,
            text=True,
            timeout=120
        )
        if result.returncode != 0:
            return False, result.stderr or "Unknown error"
        return True, result.stdout
    except subprocess.TimeoutExpired:
        return False, "Command timed out"
    except Exception as e:
        return False, str(e)


def get_local_tables() -> list[str]:
    """Get list of tables in local database."""
    conn = sqlite3.connect(LOCAL_DB)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = [row[0] for row in cursor.fetchall()]
    conn.close()
    return tables


def get_turso_tables(db_name: str) -> list[str]:
    """Get list of tables in Turso database."""
    success, output = run_turso_command(".tables", db_name)
    if not success:
        return []
    return output.split()


def export_value(val: Any) -> str:
    """Convert Python value to SQL literal."""
    if val is None:
        return "NULL"
    elif isinstance(val, bytes):
        return f"X'{val.hex()}'"
    elif isinstance(val, str):
        escaped = val.replace("'", "''")
        return f"'{escaped}'"
    elif isinstance(val, (int, float)):
        return str(val)
    else:
        return f"'{val}'"


# === MCP Tool Handlers ===

def handle_turso_status(params: dict) -> dict:
    """Check Turso connection and sync status."""
    db_name = get_turso_db_name()
    if not db_name:
        return {
            "connected": False,
            "error": "TURSO_DATABASE_URL not set in environment"
        }

    # Check if Turso CLI exists
    if not TURSO_CLI.exists():
        return {
            "connected": False,
            "error": f"Turso CLI not found at {TURSO_CLI}"
        }

    # Get tables from both databases
    local_tables = set(get_local_tables())
    turso_tables = set(get_turso_tables(db_name))

    missing_tables = local_tables - turso_tables

    # Get row counts
    local_counts = {}
    turso_counts = {}

    conn = sqlite3.connect(LOCAL_DB)
    cursor = conn.cursor()
    for table in EXPORT_TABLES:
        if table in local_tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            local_counts[table] = cursor.fetchone()[0]
    conn.close()

    for table in EXPORT_TABLES:
        if table in turso_tables:
            success, output = run_turso_command(f"SELECT COUNT(*) FROM {table};", db_name)
            if success:
                try:
                    # Parse count from output
                    lines = [l.strip() for l in output.strip().split('\n') if l.strip()]
                    if len(lines) >= 2:
                        turso_counts[table] = int(lines[-1])
                except:
                    turso_counts[table] = 0

    return {
        "connected": True,
        "database": db_name,
        "local_db": str(LOCAL_DB),
        "missing_tables": list(missing_tables),
        "local_row_counts": local_counts,
        "turso_row_counts": turso_counts,
        "sync_status": "synced" if not missing_tables and local_counts == turso_counts else "needs_sync"
    }


def handle_turso_export_schema(params: dict) -> dict:
    """Export missing table schemas to Turso."""
    db_name = get_turso_db_name()
    if not db_name:
        return {"success": False, "error": "TURSO_DATABASE_URL not set"}

    local_tables = set(get_local_tables())
    turso_tables = set(get_turso_tables(db_name))
    missing_tables = local_tables - turso_tables

    if not missing_tables:
        return {"success": True, "message": "All tables already exist in Turso", "tables_created": []}

    # Get schema for missing tables
    conn = sqlite3.connect(LOCAL_DB)
    cursor = conn.cursor()

    schemas = []
    for table in missing_tables:
        cursor.execute(f"SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,))
        row = cursor.fetchone()
        if row and row[0]:
            schemas.append(row[0] + ";")

    conn.close()

    if not schemas:
        return {"success": True, "message": "No schemas to export", "tables_created": []}

    # Push to Turso
    sql = "\n".join(schemas)
    success, output = run_turso_command(sql, db_name)

    if success:
        return {
            "success": True,
            "message": f"Created {len(missing_tables)} tables in Turso",
            "tables_created": list(missing_tables)
        }
    else:
        return {"success": False, "error": output}


def handle_turso_export_data(params: dict) -> dict:
    """Export data from local SQLite to Turso."""
    db_name = get_turso_db_name()
    if not db_name:
        return {"success": False, "error": "TURSO_DATABASE_URL not set"}

    tables = params.get("tables", EXPORT_TABLES)

    conn = sqlite3.connect(LOCAL_DB)
    cursor = conn.cursor()

    total_rows = 0
    exported_tables = []
    errors = []

    for table in tables:
        try:
            cursor.execute(f"SELECT * FROM {table}")
            rows = cursor.fetchall()

            if not rows:
                continue

            # Get column names
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [col[1] for col in cursor.fetchall()]

            # Build INSERT statements
            statements = []
            for row in rows:
                values = [export_value(val) for val in row]
                stmt = f"INSERT OR REPLACE INTO {table} ({', '.join(columns)}) VALUES ({', '.join(values)});"
                statements.append(stmt)

            # Push to Turso in batches
            batch_size = 50
            for i in range(0, len(statements), batch_size):
                batch = "\n".join(statements[i:i+batch_size])
                success, output = run_turso_command(batch, db_name)
                if not success:
                    errors.append(f"{table}: {output}")
                    break

            total_rows += len(rows)
            exported_tables.append({"table": table, "rows": len(rows)})

        except Exception as e:
            errors.append(f"{table}: {str(e)}")

    conn.close()

    return {
        "success": len(errors) == 0,
        "total_rows": total_rows,
        "tables": exported_tables,
        "errors": errors if errors else None
    }


def handle_turso_export_migrations(params: dict) -> dict:
    """Export SQLx migration records to Turso."""
    db_name = get_turso_db_name()
    if not db_name:
        return {"success": False, "error": "TURSO_DATABASE_URL not set"}

    conn = sqlite3.connect(LOCAL_DB)
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM _sqlx_migrations")
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        return {"success": True, "message": "No migrations to export", "count": 0}

    statements = []
    for row in rows:
        version, description, installed_on, success, checksum, execution_time = row
        checksum_hex = checksum.hex() if checksum else ''
        success_int = 1 if success else 0
        description = description.replace("'", "''")
        stmt = f"INSERT OR REPLACE INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time) VALUES ({version}, '{description}', '{installed_on}', {success_int}, X'{checksum_hex}', {execution_time});"
        statements.append(stmt)

    sql = "\n".join(statements)
    success, output = run_turso_command(sql, db_name)

    if success:
        return {"success": True, "message": f"Exported {len(rows)} migration records", "count": len(rows)}
    else:
        return {"success": False, "error": output}


def handle_turso_full_sync(params: dict) -> dict:
    """Perform complete sync: schema + migrations + data."""
    results = {
        "schema": handle_turso_export_schema({}),
        "migrations": handle_turso_export_migrations({}),
        "data": handle_turso_export_data({})
    }

    all_success = all(r.get("success", False) for r in results.values())

    return {
        "success": all_success,
        "results": results
    }


# === MCP Protocol Handling ===

TOOLS = [
    {
        "name": "turso_status",
        "description": "Check Turso connection status and compare local vs remote data",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "turso_export_schema",
        "description": "Export missing table schemas from local SQLite to Turso",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "turso_export_data",
        "description": "Export data from local SQLite tables to Turso",
        "inputSchema": {
            "type": "object",
            "properties": {
                "tables": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of tables to export (default: all main tables)"
                }
            },
            "required": []
        }
    },
    {
        "name": "turso_export_migrations",
        "description": "Export SQLx migration records to Turso",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "turso_full_sync",
        "description": "Perform complete sync: schema + migrations + data",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }
]

TOOL_HANDLERS = {
    "turso_status": handle_turso_status,
    "turso_export_schema": handle_turso_export_schema,
    "turso_export_data": handle_turso_export_data,
    "turso_export_migrations": handle_turso_export_migrations,
    "turso_full_sync": handle_turso_full_sync,
}


def handle_request(request: dict) -> dict:
    """Handle incoming MCP request."""
    method = request.get("method", "")
    req_id = request.get("id")
    params = request.get("params", {})

    if method == "initialize":
        return {
            "jsonrpc": JSONRPC_VERSION,
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {
                    "name": "turso-sync",
                    "version": "1.0.0"
                }
            }
        }

    elif method == "notifications/initialized":
        return None  # No response for notifications

    elif method == "tools/list":
        return {
            "jsonrpc": JSONRPC_VERSION,
            "id": req_id,
            "result": {"tools": TOOLS}
        }

    elif method == "tools/call":
        tool_name = params.get("name", "")
        tool_args = params.get("arguments", {})

        handler = TOOL_HANDLERS.get(tool_name)
        if not handler:
            return {
                "jsonrpc": JSONRPC_VERSION,
                "id": req_id,
                "error": {"code": -32601, "message": f"Unknown tool: {tool_name}"}
            }

        try:
            result = handler(tool_args)
            return {
                "jsonrpc": JSONRPC_VERSION,
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": json.dumps(result, indent=2)}]
                }
            }
        except Exception as e:
            return {
                "jsonrpc": JSONRPC_VERSION,
                "id": req_id,
                "error": {"code": -32000, "message": str(e)}
            }

    else:
        return {
            "jsonrpc": JSONRPC_VERSION,
            "id": req_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"}
        }


def main():
    """Main MCP server loop."""
    # Load environment from .env if present
    env_file = PROJECT_ROOT / ".env"
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ[key] = value

    # Also load .env.local
    env_local = PROJECT_ROOT / ".env.local"
    if env_local.exists():
        with open(env_local) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ[key] = value

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break

            request = json.loads(line)
            response = handle_request(request)

            if response:
                sys.stdout.write(json.dumps(response) + "\n")
                sys.stdout.flush()

        except json.JSONDecodeError:
            continue
        except KeyboardInterrupt:
            break
        except Exception as e:
            sys.stderr.write(f"Error: {e}\n")
            sys.stderr.flush()


if __name__ == "__main__":
    main()
