#!/bin/sh
set -e

# Always copy seed database to volume (force sync from local)
if [ -f "/seed/db.sqlite" ]; then
    echo "Copying database from seed..."
    cp /seed/db.sqlite /data/db.sqlite
    echo "Database copied to /data/db.sqlite"
fi

# Run the server
exec /usr/local/bin/server "$@"
