#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_ENCRYPTION_PASSWORD:?BACKUP_ENCRYPTION_PASSWORD is required}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-archive.sh
source "$SCRIPT_DIR/lib-archive.sh"

REG_BACKUP_DIR="${BACKUP_DIR:-backups}"
REG_DB_HOST="${DB_HOST:-127.0.0.1}"
REG_DB_PORT="${DB_PORT:-3306}"
REG_DB_USER="${DB_USER:-root}"
REG_DB_NAME="${DB_NAME:-regbroker}"
REG_DB_PASSWORD="${DB_PASSWORD:-}"
REG_UPLOAD_DIR="${UPLOAD_DIR:-uploads}"
REG_DUMP_BIN="${MYSQLDUMP_BIN:-/Applications/XAMPP/xamppfiles/bin/mysqldump}"
REG_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REG_CODE="regbroker-${REG_STAMP}"
REG_TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$REG_TEMP_DIR"' EXIT

mkdir -p "$REG_BACKUP_DIR"

MYSQL_PWD="$REG_DB_PASSWORD" "$REG_DUMP_BIN" \
  --host="$REG_DB_HOST" \
  --port="$REG_DB_PORT" \
  --user="$REG_DB_USER" \
  --single-transaction \
  --routines \
  --events \
  --triggers \
  --default-character-set=utf8mb4 \
  "$REG_DB_NAME" | gzip -9 > "$REG_TEMP_DIR/database.sql.gz"

if [[ -d "$REG_UPLOAD_DIR" ]]; then
  tar -czf "$REG_TEMP_DIR/uploads.tar.gz" -C "$REG_UPLOAD_DIR" .
else
  tar -czf "$REG_TEMP_DIR/uploads.tar.gz" --files-from /dev/null
fi

tar -czf "$REG_TEMP_DIR/bundle.tar.gz" -C "$REG_TEMP_DIR" database.sql.gz uploads.tar.gz

# AES-256-GCM: confidentiality + integrity/authenticity in one pass.
ARCHIVE="$REG_BACKUP_DIR/${REG_CODE}.tar.gz.enc"
node "$SCRIPT_DIR/backup-crypto.mjs" encrypt "$REG_TEMP_DIR/bundle.tar.gz" "$ARCHIVE"

printf '%s  %s\n' "$(file_sha256 "$ARCHIVE")" "$(basename "$ARCHIVE")" > "$REG_BACKUP_DIR/${REG_CODE}.sha256"
chmod 600 "$ARCHIVE" "$REG_BACKUP_DIR/${REG_CODE}.sha256"
printf '%s\n' "$ARCHIVE"
