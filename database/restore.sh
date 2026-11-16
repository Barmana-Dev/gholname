#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--confirm" || -z "${2:-}" ]]; then
  printf '%s\n' "Usage: database/restore.sh --confirm /absolute/path/backup.tar.gz.enc" >&2
  exit 2
fi
: "${BACKUP_ENCRYPTION_PASSWORD:?BACKUP_ENCRYPTION_PASSWORD is required}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-archive.sh
source "$SCRIPT_DIR/lib-archive.sh"

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

# 1. The checksum sidecar is mandatory and is verified before anything is decrypted.
REG_SIDECAR="${REG_ARCHIVE%.tar.gz.enc}.sha256"
if [[ ! -f "$REG_SIDECAR" ]]; then
  printf '%s\n' "Checksum file $REG_SIDECAR is missing; restore aborted." >&2
  exit 4
fi
EXPECTED="$(awk 'NR==1{print $1}' "$REG_SIDECAR")"
ACTUAL="$(file_sha256 "$REG_ARCHIVE")"
if [[ -z "$EXPECTED" || "$EXPECTED" != "$ACTUAL" ]]; then
  printf '%s\n' "Checksum mismatch; the archive is corrupt or was modified. Restore aborted." >&2
  exit 5
fi

# 2. Authenticated decryption into a private staging directory.
if [[ "$(head -c 4 "$REG_ARCHIVE")" == "RBK2" ]]; then
  node "$SCRIPT_DIR/backup-crypto.mjs" decrypt "$REG_ARCHIVE" "$REG_TEMP_DIR/bundle.tar.gz"
elif [[ "${ALLOW_LEGACY_CBC:-0}" == "1" ]]; then
  printf '%s\n' "WARNING: legacy unauthenticated AES-CBC backup; only the checksum protects it." >&2
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$REG_ARCHIVE" -out "$REG_TEMP_DIR/bundle.tar.gz" \
    -pass env:BACKUP_ENCRYPTION_PASSWORD
else
  printf '%s\n' "Legacy AES-CBC backup detected. Re-run with ALLOW_LEGACY_CBC=1 only for a checksum-verified, trusted archive, then take a new backup." >&2
  exit 6
fi

# 3. Validate structure before extracting or touching the database.
gzip -t "$REG_TEMP_DIR/bundle.tar.gz"
validate_tar_archive "$REG_TEMP_DIR/bundle.tar.gz" "bundle"
EXPECTED_ENTRIES=$'database.sql.gz\nuploads.tar.gz'
ENTRIES="$(tar -tzf "$REG_TEMP_DIR/bundle.tar.gz" | sed 's#^\./##' | sort)"
if [[ "$ENTRIES" != "$EXPECTED_ENTRIES" ]]; then
  printf '%s\n' "Bundle must contain exactly database.sql.gz and uploads.tar.gz; restore aborted." >&2
  exit 7
fi
mkdir -p "$REG_TEMP_DIR/bundle"
tar -xzf "$REG_TEMP_DIR/bundle.tar.gz" -C "$REG_TEMP_DIR/bundle" --no-same-owner
gzip -t "$REG_TEMP_DIR/bundle/database.sql.gz"
validate_tar_archive "$REG_TEMP_DIR/bundle/uploads.tar.gz" "uploads"
mkdir -p "$REG_TEMP_DIR/uploads-staging"
tar -xzf "$REG_TEMP_DIR/bundle/uploads.tar.gz" -C "$REG_TEMP_DIR/uploads-staging" --no-same-owner --no-same-permissions
if [[ -n "$(find "$REG_TEMP_DIR/uploads-staging" ! -type f ! -type d -print -quit)" ]]; then
  printf '%s\n' "Uploads archive contains non-regular files; restore aborted." >&2
  exit 8
fi

# 4. Transactional restore: snapshot -> maintenance -> apply -> swap -> rollback on failure.
REG_DUMP_BIN="${MYSQLDUMP_BIN:-/Applications/XAMPP/xamppfiles/bin/mysqldump}"
REG_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REG_BACKUP_DIR="${BACKUP_DIR:-backups}"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REG_MAINTENANCE_FILE="${MAINTENANCE_FLAG_FILE:-$PROJECT_ROOT/.maintenance}"
REG_UPLOAD_PARENT="$(dirname "$REG_UPLOAD_DIR")"
REG_UPLOAD_NEW="${REG_UPLOAD_DIR%/}.restore-new-$REG_STAMP"
REG_UPLOAD_PREV="${REG_UPLOAD_DIR%/}.pre-restore-$REG_STAMP"
REG_ROLLBACK_SQL="$REG_BACKUP_DIR/pre-restore-$REG_STAMP.sql.gz"
mkdir -p "$REG_BACKUP_DIR" "$REG_UPLOAD_PARENT"

mysql_cli() { MYSQL_PWD="$REG_DB_PASSWORD" "$REG_MYSQL_BIN" --host="$REG_DB_HOST" --port="$REG_DB_PORT" --user="$REG_DB_USER" "$REG_DB_NAME"; }

# 4a. Stage the new uploads next to the live directory (same filesystem, so
#     the final swap is two atomic renames, not a file-by-file merge).
mkdir -p "$REG_UPLOAD_NEW"
cp -R "$REG_TEMP_DIR/uploads-staging/." "$REG_UPLOAD_NEW/"

# 4b. Snapshot the CURRENT database so any failure can be rolled back.
MYSQL_PWD="$REG_DB_PASSWORD" "$REG_DUMP_BIN" \
  --host="$REG_DB_HOST" --port="$REG_DB_PORT" --user="$REG_DB_USER" \
  --single-transaction --routines --events --triggers --default-character-set=utf8mb4 \
  "$REG_DB_NAME" | gzip -9 > "$REG_ROLLBACK_SQL"
gzip -t "$REG_ROLLBACK_SQL"
chmod 600 "$REG_ROLLBACK_SQL"

# 4c. Maintenance mode: the API answers 503 while the two halves are swapped.
: > "$REG_MAINTENANCE_FILE"
SWAPPED=0
rollback() {
  printf '%s\n' "Restore FAILED - rolling back to the pre-restore state." >&2
  if [[ "$SWAPPED" == "1" && -d "$REG_UPLOAD_PREV" ]]; then
    rm -rf "${REG_UPLOAD_DIR%/}.failed-$REG_STAMP"
    [[ -d "$REG_UPLOAD_DIR" ]] && mv "$REG_UPLOAD_DIR" "${REG_UPLOAD_DIR%/}.failed-$REG_STAMP"
    mv "$REG_UPLOAD_PREV" "$REG_UPLOAD_DIR"
  fi
  gzip -dc "$REG_ROLLBACK_SQL" | mysql_cli || printf '%s\n' "DATABASE ROLLBACK FAILED - restore it manually from $REG_ROLLBACK_SQL" >&2
  rm -rf "$REG_UPLOAD_NEW"
  rm -f "$REG_MAINTENANCE_FILE"
}
trap 'rc=$?; if [[ $rc -ne 0 ]]; then rollback; fi; rm -rf "$REG_TEMP_DIR"' EXIT

# 4d. Apply the database, then replace (not merge) the uploads directory.
gzip -dc "$REG_TEMP_DIR/bundle/database.sql.gz" | mysql_cli
if [[ -d "$REG_UPLOAD_DIR" ]]; then mv "$REG_UPLOAD_DIR" "$REG_UPLOAD_PREV"; fi
SWAPPED=1
mv "$REG_UPLOAD_NEW" "$REG_UPLOAD_DIR"

rm -f "$REG_MAINTENANCE_FILE"
printf '%s\n' "Restore completed; checksum, authenticated decryption and archive paths verified."
printf '%s\n' "Rollback material kept: $REG_ROLLBACK_SQL and $REG_UPLOAD_PREV (delete after you have verified the result)."
