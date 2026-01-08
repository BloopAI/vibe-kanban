import os
import sys
import psycopg2
from psycopg2 import sql

# --- CONFIGURATION ---
# Database URL must be set in your environment as DATABASE_URL
# Example: export DATABASE_URL="postgresql://user:password@host:port/dbname"


def get_connection(db_url=None):
    """Establishes a connection to the Postgres database."""
    url = db_url or os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable is not set.")
        sys.exit(1)
    try:
        conn = psycopg2.connect(url)
        return conn
    except Exception as e:
        print(f"Error connecting to database: {e}")
        sys.exit(1)

def list_tables():
    """Lists all tables in the public schema."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)
        tables = cur.fetchall()
        print("\n--- Tables in Public Schema ---")
        for table in tables:
            print(f"- {table[0]}")
    conn.close()

def check_connection():
    """Verifies the database connection and prints the version."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT version();")
        version = cur.fetchone()
        print(f"\nConnected successfully!")
        print(f"Database version: {version[0]}")
    conn.close()

def run_query(query):
    """Runs a raw SQL query and prints the results."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query)
            if cur.description: # If it's a SELECT query
                rows = cur.fetchall()
                for row in rows:
                    print(row)
            else:
                conn.commit()
                print("Query executed and committed successfully.")
    except Exception as e:
        print(f"Query error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Supabase DB Utility")
    parser.add_argument("command", choices=["check", "list", "query"], help="Command to run")
    parser.add_argument("--sql", help="SQL query to run (for 'query' command)")
    
    args = parser.parse_args()
    
    if args.command == "check":
        check_connection()
    elif args.command == "list":
        list_tables()
    elif args.command == "query":
        if not args.sql:
            print("Error: --sql argument is required for 'query' command.")
        else:
            run_query(args.sql)
