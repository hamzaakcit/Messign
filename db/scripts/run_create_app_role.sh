#!/usr/bin/env bash
# Run create_app_role.sql with password from env or generate one.
# Usage:
#   MESSIGN_APP_PASSWORD='your-secure-password' ./db/scripts/run_create_app_role.sh
#   # Or let it generate (will print the password for DATABASE_URL)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="$SCRIPT_DIR/create_app_role.sql"

# Use env or generate a 32-char password
PASSWORD="${MESSIGN_APP_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)}"

# Database URL: prefer PUBLIC for external access (Railway), then DATABASE_URL
DB_URL="${DATABASE_PUBLIC_URL:-$DATABASE_URL}"
if [ -z "$DB_URL" ]; then
  echo "Error: DATABASE_URL or DATABASE_PUBLIC_URL required"
  exit 1
fi

# Substitute password in SQL and run
sed "s/YOUR_STRONG_PASSWORD/$PASSWORD/g" "$SQL_FILE" | psql "$DB_URL" -f -

echo ""
echo "=== Role created. Use this connection string (update host if needed): ==="
echo "postgresql://messign_app:${PASSWORD}@<host>:<port>/<dbname>?sslmode=require"
echo ""
echo "For Railway: Update DATABASE_URL in project variables."
echo "Save the password above — it won't be shown again."
