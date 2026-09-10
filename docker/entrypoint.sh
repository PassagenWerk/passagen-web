#!/bin/sh
set -eu

# db init is idempotent: it creates a missing database and migrates supported schemas.
passagen --data-dir /data db init

exec passagen-web serve \
  --data-dir /data \
  --host 0.0.0.0 \
  --port 8765 \
  --no-open \
  "$@"
