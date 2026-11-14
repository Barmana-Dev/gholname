#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--confirm" || -z "${2:-}" ]]; then
  printf '%s\n' "Usage: database/restore.sh --confirm /absolute/path/backup.tar.gz.enc" >&2
  exit 2
fi
: "${BACKUP_ENCRYPTION_PASSWORD:?BACKUP_ENCRYPTION_PASSWORD is required}"

REG_ARCHIVE="$2"
REG_DB_HOST="${DB_HOST:-127.0.0.1}"
REG_DB_PORT="${DB_PORT:-3306}"
REG_DB_USER="${DB_USER:-root}"
REG_DB_NAME="${DB_NAME:-regbroker}"
REG_DB_PASSWORD="${DB_PASSWORD:-}"
REG_UPLOAD_DIR="${UPLOAD_DIR:-uploads}"
REG_MYSQL_BIN="${MYSQL_BIN:-/Applications/XAMPP/xamppfiles/bin/mysql}"
REG_TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$REG_TEMP_DIR"' EXIT

if [[ ! -f "$REG_ARCHIVE" ]]; then
  printf '%s\n' "Backup archive not found." >&2
  exit 3
fi

openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "$REG_ARCHIVE" \
  -out "$REG_TEMP_DIR/bundle.tar.gz" \
  -pass env:BACKUP_ENCRYPTION_PASSWORD
tar -xzf "$REG_TEMP_DIR/bundle.tar.gz" -C "$REG_TEMP_DIR"
gzip -t "$REG_TEMP_DIR/database.sql.gz"
tar -tzf "$REG_TEMP_DIR/uploads.tar.gz" >/dev/null

MYSQL_PWD="$REG_DB_PASSWORD" "$REG_MYSQL_BIN" \
  --host="$REG_DB_HOST" \
  --port="$REG_DB_PORT" \
  --user="$REG_DB_USER" \
  "$REG_DB_NAME" < <(gzip -dc "$REG_TEMP_DIR/database.sql.gz")

mkdir -p "$REG_UPLOAD_DIR"
tar -xzf "$REG_TEMP_DIR/uploads.tar.gz" -C "$REG_UPLOAD_DIR"
printf '%s\n' "Restore completed and archive integrity verified."
