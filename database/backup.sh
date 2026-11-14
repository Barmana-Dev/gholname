#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_ENCRYPTION_PASSWORD:?BACKUP_ENCRYPTION_PASSWORD is required}"

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
openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "$REG_TEMP_DIR/bundle.tar.gz" \
  -out "$REG_BACKUP_DIR/${REG_CODE}.tar.gz.enc" \
  -pass env:BACKUP_ENCRYPTION_PASSWORD

shasum -a 256 "$REG_BACKUP_DIR/${REG_CODE}.tar.gz.enc" > "$REG_BACKUP_DIR/${REG_CODE}.sha256"
chmod 600 "$REG_BACKUP_DIR/${REG_CODE}.tar.gz.enc" "$REG_BACKUP_DIR/${REG_CODE}.sha256"
printf '%s\n' "$REG_BACKUP_DIR/${REG_CODE}.tar.gz.enc"
