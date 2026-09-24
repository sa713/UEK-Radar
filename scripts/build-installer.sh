#!/usr/bin/env bash
set -Eeuo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
out="${1:-$root/uek-radar-installer.run}"
archive="$(mktemp)"
trap 'rm -f -- "$archive"' EXIT
git -C "$root" archive --format=tar HEAD | gzip -9 > "$archive"
cat > "$out" <<'HEADER'
#!/usr/bin/env bash
set -Eeuo pipefail
bundle="$(readlink -f -- "$0")"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
start="$(awk '/^__ARCHIVE_BELOW__$/ { print NR+1; exit }' "$bundle")"
[[ -n "$start" ]] || { echo 'Повреждённый пакет установки' >&2; exit 1; }
tail -n +"$start" "$bundle" | tar -xz -C "$tmp"
bash "$tmp/install.sh" "$@"
exit $?
__ARCHIVE_BELOW__
HEADER
cat "$archive" >> "$out"
chmod 755 "$out"
printf '%s\n' "$out"
