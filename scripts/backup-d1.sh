#!/usr/bin/env bash
# Export the production D1 database (musawara-ads) to a dated .sql file and keep the newest 30.
# The file holds real user and client data: it stays on this machine (default ~/musawara-backups), never in git.
# Usage: scripts/backup-d1.sh            (set BACKUP_DIR to store elsewhere)
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
DIR="${BACKUP_DIR:-$HOME/musawara-backups}"
mkdir -p "$DIR"
FILE="$DIR/musawara-ads-$(date +%Y%m%d-%H%M).sql"
npx wrangler d1 export musawara-ads --remote -c wrangler.noR2.jsonc --output "$FILE"
echo "Saved $FILE ($(wc -c < "$FILE" | tr -d ' ') bytes)"
# keep the newest 30
ls -1t "$DIR"/musawara-ads-*.sql | tail -n +31 | while read -r old; do rm -f "$old"; done
