#!/bin/bash
set -e

# Fix permissions for data directories (handling mounted volumes)
chown -R appuser:appgroup /data /repos /seed

# Always copy seed database to volume (force sync from local)
if [ -f "/seed/db.sqlite" ]; then
    echo "Copying database from seed..."
    cp /seed/db.sqlite /data/db.sqlite
    # Ensure copied file is owned by appuser
    chown appuser:appgroup /data/db.sqlite
    echo "Database copied to /data/db.sqlite"
fi

# Run the server as appuser
exec runuser -u appuser -- /usr/local/bin/server "$@"
