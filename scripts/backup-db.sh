#!/bin/bash
# Auto backup vibe-kanban database before starting dev server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DB_FILE="$PROJECT_DIR/dev_assets/db.sqlite"
BACKUP_DIR="$PROJECT_DIR/backups"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create timestamped backup if database exists
if [ -f "$DB_FILE" ]; then
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    cp "$DB_FILE" "$BACKUP_DIR/db.sqlite.backup.$TIMESTAMP"
    echo "Backed up database to: backups/db.sqlite.backup.$TIMESTAMP"

    # Keep only last 10 backups to save space
    ls -t "$BACKUP_DIR"/db.sqlite.backup.* 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null
    echo "Keeping last 10 backups"
else
    echo "No database found at $DB_FILE"
fi
