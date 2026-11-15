#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

ENV_MYSQL_BIN="${MYSQL_BIN-}"
MYSQL_BIN="${MYSQL_BIN:-/Applications/XAMPP/xamppfiles/bin/mysql}"
ENV_DB_HOST="${DB_HOST-}"
ENV_DB_PORT="${DB_PORT-}"
ENV_DB_USER="${DB_USER-}"
ENV_DB_PASSWORD="${DB_PASSWORD-}"
ENV_DB_PASSWORD_SET="${DB_PASSWORD+x}"
MYSQL_HOST="127.0.0.1"
MYSQL_PORT="3306"
MYSQL_USER="root"
MYSQL_PASSWORD=""

if [[ -f .env ]]; then
  while IFS='=' read -r key value; do
    case "$key" in
      DB_HOST) MYSQL_HOST="$value" ;;
      DB_PORT) MYSQL_PORT="$value" ;;
      DB_USER) MYSQL_USER="$value" ;;
      DB_PASSWORD) MYSQL_PASSWORD="$value" ;;
      MYSQL_BIN) MYSQL_BIN="$value" ;;
    esac
  done < <(grep -E '^(DB_(HOST|PORT|USER|PASSWORD)|MYSQL_BIN)=' .env)
fi

[[ -n "$ENV_DB_HOST" ]] && MYSQL_HOST="$ENV_DB_HOST"
[[ -n "$ENV_DB_PORT" ]] && MYSQL_PORT="$ENV_DB_PORT"
[[ -n "$ENV_DB_USER" ]] && MYSQL_USER="$ENV_DB_USER"
[[ -n "$ENV_DB_PASSWORD_SET" ]] && MYSQL_PASSWORD="$ENV_DB_PASSWORD"
[[ -n "$ENV_MYSQL_BIN" ]] && MYSQL_BIN="$ENV_MYSQL_BIN"

export MYSQL_PWD="$MYSQL_PASSWORD"

if [[ ! -x "$MYSQL_BIN" ]]; then
  echo "XAMPP MySQL client was not found at $MYSQL_BIN" >&2
  exit 1
fi

if ! "$MYSQL_BIN" -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -e "SELECT 1" >/dev/null 2>&1; then
  echo "XAMPP MySQL is not reachable. Start MySQL in XAMPP and verify the root password." >&2
  exit 1
fi

if "$MYSQL_BIN" -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -Nse "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='regbroker'" | grep -qv '^0$'; then
  echo "Database regbroker already contains tables; setup stopped to protect existing data." >&2
  exit 1
fi

if [[ "${NODE_ENV:-}" == "production" ]]; then
  echo "Refusing to load database/seed.sql with NODE_ENV=production: it creates well-known development accounts." >&2
  echo "Load schema.sql only, then run: npm run bootstrap:admin -w server" >&2
  exit 1
fi

"$MYSQL_BIN" -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" < database/schema.sql
"$MYSQL_BIN" -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" < database/seed.sql
MYSQL_BIN="$MYSQL_BIN" DB_HOST="$MYSQL_HOST" DB_PORT="$MYSQL_PORT" DB_USER="$MYSQL_USER" DB_PASSWORD="$MYSQL_PASSWORD" \
  bash database/migrate.sh --baseline
MYSQL_BIN="$MYSQL_BIN" DB_HOST="$MYSQL_HOST" DB_PORT="$MYSQL_PORT" DB_USER="$MYSQL_USER" DB_PASSWORD="$MYSQL_PASSWORD" \
  bash database/validate-schema.sh
