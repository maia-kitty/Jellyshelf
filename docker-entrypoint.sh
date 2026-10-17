#!/bin/sh
# Starts as root only long enough to hand /config to the app's user (installs from before this ran everything as root,
# so some files there are root's), then runs the app as that user. PUID/PGID pick the user, to match the host folder.
set -e
uid="${PUID:-1000}"
gid="${PGID:-1000}"
if [ "$(id -u)" = 0 ]; then
  find "$CONFIG_DIR" \( ! -user "$uid" -o ! -group "$gid" \) -exec chown "$uid:$gid" {} +
  exec setpriv --reuid="$uid" --regid="$gid" --clear-groups "$@"
fi
exec "$@"
