#!/usr/bin/env bash
# Helpers shared by restore.sh. Sourced, not executed.

# sha256 of a file (first field only), portable across Linux/macOS.
file_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

# Aborts unless every entry of a .tar.gz is a regular file or directory whose
# path is relative and contains no ".." component. Rejects symlinks, hardlinks,
# devices and absolute paths before anything is extracted.
validate_tar_archive() {
  local archive="$1" label="${2:-archive}" line type
  while IFS= read -r line; do
    type="${line:0:1}"
    if [[ "$type" != "-" && "$type" != "d" ]]; then
      printf '%s\n' "Unsafe entry type '$type' in $label; restore aborted." >&2
      return 1
    fi
  done < <(tar -tvzf "$archive")
  local name
  while IFS= read -r name; do
    if [[ "$name" == /* || "$name" == ".." || "$name" == ../* || "$name" == */../* || "$name" == */.. ]]; then
      printf '%s\n' "Unsafe path '$name' in $label; restore aborted." >&2
      return 1
    fi
  done < <(tar -tzf "$archive")
}
