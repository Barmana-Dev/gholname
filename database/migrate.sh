#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_DIR="${MIGRATION_DIR:-$PROJECT_ROOT/database}"

usage() {
  cat <<'USAGE'
Usage: database/migrate.sh [--status|--baseline]

Apply pending migration_*.sql files in lexical order and record their SHA-256
checksum in regbroker.schema_migrations. Use --baseline only immediately after
loading the canonical schema.sql and seed-base.sql (plus seed-dev-users.sql in development) into a fresh database.
USAGE
}

MODE="apply"
case "${1:-}" in
  "") ;;
  --status) MODE="status" ;;
  --baseline) MODE="baseline" ;;
  --help|-h) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

read_env_value() {
  local name="$1"
  local value
  [[ -f "$PROJECT_ROOT/.env" ]] || return 0
  value="$(awk -v wanted="$name" '
    $0 ~ "^[[:space:]]*" wanted "=" {
      sub("^[[:space:]]*" wanted "=", "", $0)
      sub("[[:space:]]*#.*$", "", $0)
      gsub("^[[:space:]]+|[[:space:]]+$", "", $0)
      if (($0 ~ /^\".*\"$/) || ($0 ~ /^\x27.*\x27$/)) {
        $0=substr($0, 2, length($0)-2)
      }
      print $0
      exit
    }
  ' "$PROJECT_ROOT/.env")"
  printf '%s' "$value"
}

DB_HOST="${DB_HOST:-$(read_env_value DB_HOST)}"
DB_PORT="${DB_PORT:-$(read_env_value DB_PORT)}"
DB_USER="${DB_USER:-$(read_env_value DB_USER)}"
DB_PASSWORD="${DB_PASSWORD:-$(read_env_value DB_PASSWORD)}"
DB_NAME="${DB_NAME:-$(read_env_value DB_NAME)}"
MYSQL_BIN="${MYSQL_BIN:-$(read_env_value MYSQL_BIN)}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-regbroker}"
MYSQL_BIN="${MYSQL_BIN:-/Applications/XAMPP/xamppfiles/bin/mysql}"

if [[ ! "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then
  printf '%s\n' "DB_NAME must contain only ASCII letters, numbers, and underscores." >&2
  exit 2
fi

if [[ "$MYSQL_BIN" != */* ]]; then
  MYSQL_BIN="$(command -v "$MYSQL_BIN" || true)"
fi
if [[ -z "$MYSQL_BIN" || ! -x "$MYSQL_BIN" ]]; then
  printf '%s\n' "MySQL client was not found. Set MYSQL_BIN to an executable mysql client." >&2
  exit 1
fi

mysql_command() {
  MYSQL_PWD="$DB_PASSWORD" "$MYSQL_BIN" \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USER" \
    "$@"
}

mysql_query() {
  mysql_command --database="$DB_NAME" --batch --skip-column-names --raw --execute="$1"
}

mysql_command --batch --skip-column-names --execute="SELECT 1" >/dev/null
if ! mysql_query "SELECT 1" >/dev/null 2>&1; then
  printf '%s\n' "Database '$DB_NAME' is not reachable or does not exist." >&2
  exit 1
fi

migration_files=()
while IFS= read -r migration_file; do
  migration_files[${#migration_files[@]}]="$migration_file"
done < <(find "$MIGRATION_DIR" -maxdepth 1 -type f -name 'migration_*.sql' -print | LC_ALL=C sort)
if ((${#migration_files[@]} == 0)); then
  printf '%s\n' "No migration files found in $MIGRATION_DIR." >&2
  exit 1
fi

for migration_file in "${migration_files[@]}"; do
  migration_version="$(basename "$migration_file")"
  if [[ ! "$migration_version" =~ ^migration_[0-9]{3}_[A-Za-z0-9_.-]+\.sql$ ]]; then
    printf '%s\n' "Invalid migration filename: $migration_version" >&2
    exit 2
  fi
done

schema_migrations_table_count="$(mysql_command --batch --skip-column-names --raw --execute="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME' AND table_name='schema_migrations';")"
if [[ "$MODE" == "status" && "$schema_migrations_table_count" == "0" ]]; then
  for migration_file in "${migration_files[@]}"; do
    printf 'pending %s\n' "$(basename "$migration_file")"
  done
  printf 'migration files: %d\n' "${#migration_files[@]}"
  exit 0
fi

mysql_query "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(128) NOT NULL PRIMARY KEY,
    checksum_sha256 CHAR(64) NOT NULL,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_by VARCHAR(64) NOT NULL DEFAULT 'database/migrate.sh'
  ) ENGINE=InnoDB;
" >/dev/null

checksum_for() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

sql_quote() {
  # Migration filenames are validated above; this also keeps the query safe if
  # this helper is reused for a future metadata field.
  printf "%s" "$1" | sed "s/'/''/g"
}

existing_checksum() {
  mysql_query "SELECT checksum_sha256 FROM schema_migrations WHERE version='$(sql_quote "$1")' LIMIT 1;"
}

if [[ "$MODE" == "baseline" ]]; then
  applied_count="$(mysql_query "SELECT COUNT(*) FROM schema_migrations;")"
  if [[ "$applied_count" != "0" ]]; then
    printf '%s\n' "Cannot baseline: schema_migrations already contains $applied_count row(s)." >&2
    exit 2
  fi
  table_count="$(mysql_query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$(sql_quote "$DB_NAME")';")"
  if [[ "$table_count" -lt 42 ]]; then
    printf '%s\n' "Cannot baseline: canonical schema is incomplete ($table_count tables; expected at least 42)." >&2
    exit 2
  fi
  baseline_sql="START TRANSACTION;"
  for migration_file in "${migration_files[@]}"; do
    migration_version="$(basename "$migration_file")"
    checksum="$(checksum_for "$migration_file")"
    baseline_sql+=" INSERT INTO schema_migrations (version,checksum_sha256,applied_by) VALUES ('$(sql_quote "$migration_version")','$checksum','baseline:schema.sql');"
  done
  baseline_sql+=" COMMIT;"
  mysql_query "$baseline_sql" >/dev/null
  for migration_file in "${migration_files[@]}"; do
    printf 'baselined %s\n' "$(basename "$migration_file")"
  done
  exit 0
fi

pending=0
for migration_file in "${migration_files[@]}"; do
  migration_version="$(basename "$migration_file")"
  checksum="$(checksum_for "$migration_file")"
  recorded="$(existing_checksum "$migration_version")"
  if [[ -n "$recorded" ]]; then
    if [[ "$recorded" != "$checksum" ]]; then
      printf '%s\n' "Checksum mismatch for applied migration $migration_version; restore the original file or create a new migration." >&2
      exit 2
    fi
    [[ "$MODE" == "status" ]] && printf 'applied %s\n' "$migration_version"
    continue
  fi
  if [[ "$MODE" == "status" ]]; then
    printf 'pending %s\n' "$migration_version"
    continue
  fi
  printf 'applying %s\n' "$migration_version"
  mysql_command --database="$DB_NAME" < "$migration_file"
  mysql_query "INSERT INTO schema_migrations (version,checksum_sha256) VALUES ('$(sql_quote "$migration_version")','$checksum');" >/dev/null
  pending=$((pending + 1))
done

if [[ "$MODE" == "status" ]]; then
  printf 'migration files: %d\n' "${#migration_files[@]}"
else
  printf 'applied migrations: %d\n' "$pending"
fi
