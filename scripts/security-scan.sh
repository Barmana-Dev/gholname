#!/usr/bin/env bash
set -euo pipefail

REG_REPORT_DIR="${SECURITY_REPORT_DIR:-security-reports}"
REG_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$REG_REPORT_DIR"
REG_REPORT="$REG_REPORT_DIR/scan-${REG_STAMP}.log"

{
  printf 'RegBroker security scan %s\n' "$REG_STAMP"
  npm audit --audit-level=high
  npm run typecheck
  npm run lint
  npm test -- --run
  npm run db:check
  bash -n database/backup.sh database/restore.sh database/setup-xampp.sh database/migrate.sh database/validate-schema.sh
  rg -n --hidden -g '!node_modules/**' -g '!dist/**' "(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|api[_-]?key\\s*[:=]\\s*[\"'][^\"']{16,})" . && exit 1 || true
} > "$REG_REPORT" 2>&1

shasum -a 256 "$REG_REPORT" > "${REG_REPORT}.sha256"
printf '%s\n' "$REG_REPORT"
