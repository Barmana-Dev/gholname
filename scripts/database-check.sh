#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

bash -n database/setup-xampp.sh database/migrate.sh database/validate-schema.sh \
  database/backup.sh database/restore.sh

schema_table_count="$(grep -c '^CREATE TABLE' database/schema.sql)"
# The canonical schema grew past the original 42 tables (45 today). Pin a floor
# instead of an exact number: the check must catch a truncated schema file, not
# fail every time a legitimate table (or migration) is added.
MIN_SCHEMA_TABLES=42
if [[ "$schema_table_count" -lt "$MIN_SCHEMA_TABLES" ]]; then
  printf 'database check failed: schema.sql has %s CREATE TABLE statements; expected at least %s\n' \
    "$schema_table_count" "$MIN_SCHEMA_TABLES" >&2
  exit 1
fi

migration_files=()
while IFS= read -r migration_file; do
  migration_files[${#migration_files[@]}]="$migration_file"
done < <(find database -maxdepth 1 -type f -name 'migration_*.sql' -print | LC_ALL=C sort)
if [[ "${#migration_files[@]}" -lt 1 ]]; then
  printf '%s\n' 'database check failed: no migration files found' >&2
  exit 1
fi

previous=""
for migration_file in "${migration_files[@]}"; do
  migration_version="$(basename "$migration_file")"
  if [[ ! "$migration_version" =~ ^migration_[0-9]{3}_[A-Za-z0-9_.-]+\.sql$ ]]; then
    printf 'database check failed: invalid migration filename %s\n' "$migration_version" >&2
    exit 1
  fi
  if [[ -n "$previous" && "$migration_version" < "$previous" ]]; then
    printf '%s\n' 'database check failed: migrations are not lexically sorted' >&2
    exit 1
  fi
  previous="$migration_version"
done

if ! grep -q 'database/migrate.sh --baseline' database/setup-xampp.sh; then
  printf '%s\n' 'database check failed: XAMPP setup does not baseline migrations' >&2
  exit 1
fi
if ! grep -q 'database/validate-schema.sh' database/setup-xampp.sh; then
  printf '%s\n' 'database check failed: XAMPP setup does not validate the schema' >&2
  exit 1
fi

printf 'database static checks passed: %s schema tables (>= %s), %s migrations\n' \
  "$schema_table_count" "$MIN_SCHEMA_TABLES" "${#migration_files[@]}"
