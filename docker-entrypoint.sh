#!/bin/sh
set -e

# Copy seed database to volume if it doesn't exist
if [ ! -f "/data/db.sqlite" ] && [ -f "/seed/db.sqlite" ]; then
    echo "Initializing database from seed..."
    cp /seed/db.sqlite /data/db.sqlite
    echo "Database initialized at /data/db.sqlite"
fi

# Run the server
exec server "$@"
