#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

mysql_query() {
  MYSQL_PWD="$DB_PASSWORD" "$MYSQL_BIN" \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USER" \
    --database="$DB_NAME" \
    --batch --skip-column-names --raw --execute="$1"
}

mysql_query "SELECT 1" >/dev/null

required_tables=(
  roles users organization_profile services applications properties
  application_parties documents assignments status_history messages payments
  complaints audit_logs api_request_logs api_logs service_health support_tickets
  ticket_messages expert_reports notifications risk_reviews system_incidents
  announcements user_consents verification_otps retention_policies
  archive_access_requests assignment_transfer_requests refund_requests
  support_interactions complaint_attachments integration_jobs security_events
  backup_runs review_approvals staff_control_attestations periodic_case_reviews
  access_review_campaigns access_review_items internal_control_audits control_evidence
  schema_migrations
)

missing=0
for table_name in "${required_tables[@]}"; do
  table_count="$(mysql_query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME' AND table_name='$table_name';")"
  if [[ "$table_count" != "1" ]]; then
    printf 'missing table: %s\n' "$table_name" >&2
    missing=$((missing + 1))
  fi
done
if [[ "$missing" != "0" ]]; then
  printf 'schema validation failed: %d required table(s) missing\n' "$missing" >&2
  exit 1
fi

role_count="$(mysql_query "SELECT COUNT(*) FROM roles;")"
service_count="$(mysql_query "SELECT COUNT(*) FROM services;")"
migration_count="$(mysql_query "SELECT COUNT(*) FROM schema_migrations;")"
migration_files=()
while IFS= read -r migration_file; do
  migration_files[${#migration_files[@]}]="$migration_file"
done < <(find "$PROJECT_ROOT/database" -maxdepth 1 -type f -name 'migration_*.sql' -print | LC_ALL=C sort)

if [[ "$role_count" -lt 11 ]]; then
  printf 'schema validation failed: expected at least 11 roles, found %s\n' "$role_count" >&2
  exit 1
fi
if [[ "$service_count" -lt 9 ]]; then
  printf 'schema validation failed: expected at least 9 seeded services, found %s\n' "$service_count" >&2
  exit 1
fi
if [[ "$migration_count" != "${#migration_files[@]}" ]]; then
  printf 'schema validation failed: %s migration records for %s migration files\n' "$migration_count" "${#migration_files[@]}" >&2
  exit 1
fi

printf 'schema validation passed: %s tables, %s roles, %s services, %s migrations\n' \
  "${#required_tables[@]}" "$role_count" "$service_count" "$migration_count"
