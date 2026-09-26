#!/bin/sh
set -eu

pilot_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
healthcheck_file=${LIQUIDO_OPS_HEALTHCHECK_FILE:-/etc/liquido-pilot/ops-healthcheck-url}
ping_script="$pilot_dir/backup/healthcheck-ping.sh"

if [ ! -f "$healthcheck_file" ] || [ -L "$healthcheck_file" ]; then
  echo "Operations monitoring is not configured." >&2
  exit 1
fi
cleanup() {
  code=$?
  trap - EXIT
  if [ "$code" -ne 0 ]; then "$ping_script" "$healthcheck_file" /fail || true; fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

"$ping_script" "$healthcheck_file" /start || true
docker compose --project-directory "$pilot_dir" \
  -f "$pilot_dir/compose.yaml" -f "$pilot_dir/compose.database.yaml" \
  -f "$pilot_dir/compose.accounts.yaml" --profile ops \
  run --rm --no-deps ops --lookback-minutes=90 --check
"$ping_script" "$healthcheck_file" ''
echo "Operations check passed."
