#!/usr/bin/env bash
# Post-deploy smoke checks for the production API. Read-only requests, no credentials needed.
#
# Usage: scripts/smoke-production.sh BASE_URL [--engage | --no-engage] [--timeout SECONDS]
#
#   --engage     (default) engage must be mounted: its routes answer 401 without a login
#   --no-engage  engage must be absent: its routes answer 404
#   --timeout    how long to wait for a fresh deploy to start answering (default 180)
#
# Exit code 0 when every check passes, 1 otherwise. It checks things that must stay true after any deploy:
# the API is healthy, protected routes still need a login, a forged X-User-Id header gets nowhere, and the
# seed routes are not exposed.
set -u

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; }

BASE="${1:-}"
[ -n "$BASE" ] && shift
ENGAGE=yes
TIMEOUT=180
while [ $# -gt 0 ]; do
  case "$1" in
    --engage) ENGAGE=yes ;;
    --no-engage) ENGAGE=no ;;
    --timeout) TIMEOUT="${2:-}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done
[ -n "$BASE" ] || { usage >&2; exit 2; }
case "$TIMEOUT" in ''|*[!0-9]*) echo "--timeout needs a number of seconds" >&2; exit 2 ;; esac
BASE="${BASE%/}"

FAILED=0
FAILURES=""
RETRY_SECS=$TIMEOUT   # long wait for the first check (deploy may still be switching over), short afterwards
SHORT_RETRY=$(( TIMEOUT < 20 ? TIMEOUT : 20 ))

record_fail() {
  FAILED=$((FAILED + 1))
  FAILURES="${FAILURES}
  - $1"
}

# check NAME EXPECTED_CODE METHOD PATH [extra curl args...]
check() {
  name=$1; expected=$2; method=$3; path=$4; shift 4
  deadline=$(( $(date +%s) + RETRY_SECS ))
  last="000"
  while :; do
    code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' -X "$method" "$@" "$BASE$path") || code="000"
    if [ "$code" = "$expected" ]; then
      echo "PASS  $name  ($method $path -> $code)"
      RETRY_SECS=$SHORT_RETRY
      return 0
    fi
    last=$code
    [ "$(date +%s)" -ge "$deadline" ] && break
    sleep 5
  done
  echo "FAIL  $name  ($method $path -> $last, expected $expected)"
  record_fail "$name"
  return 1
}

# The readiness endpoint must be 200 and say so in the body (database and redis reachable).
check_ready() {
  deadline=$(( $(date +%s) + RETRY_SECS ))
  code="000"; body=""
  while :; do
    body=$(curl -s -m 15 -w '\n%{http_code}' "$BASE/health/ready") || body=$'\n000'
    code=${body##*$'\n'}
    body=${body%$'\n'*}
    if [ "$code" = "200" ] && printf '%s' "$body" | grep -q '"status":"ready"'; then
      echo "PASS  API is ready  (GET /health/ready -> 200, status ready)"
      RETRY_SECS=$SHORT_RETRY
      return 0
    fi
    [ "$(date +%s)" -ge "$deadline" ] && break
    sleep 5
  done
  echo "FAIL  API is ready  (GET /health/ready -> $code, body: $(printf '%s' "$body" | cut -c1-120))"
  record_fail "API is ready"
  return 1
}

FORGED='X-User-Id: 00000000-0000-0000-0000-000000000001'

echo "Smoke checks against $BASE (engage expected: $ENGAGE)"
check_ready || { echo; echo "The API is not answering, skipping the remaining checks."; echo "RESULT: FAILED$FAILURES"; exit 1; }

check "Liveness"                                   200 GET  /health/live
check "Protected route needs a login"              401 GET  /api/dashboard
check "Forged X-User-Id does not authenticate"     401 GET  /api/dashboard -H "$FORGED"
check "Seed routes are not exposed (GET)"          404 GET  /api/seed/finance
check "Seed routes are not exposed (POST)"         404 POST /api/seed/finance

if [ "$ENGAGE" = "yes" ]; then
  check "Engage mounted: user route needs a login"        401 GET  /api/engage/me
  check "Engage: forged X-User-Id does not authenticate"  401 GET  /api/engage/me -H "$FORGED"
  check "Engage: credentials list needs a login"          401 GET  /api/engage/channel-accounts
  check "Engage: credential create needs a login"         401 POST /api/engage/channel-accounts -H 'content-type: application/json' -d '{}'
  check "Engage: API key route needs a key"               401 GET  /api/engage/key/me
  check "Engage: tenant provisioning needs a login"       401 POST /api/engage/admin/organizations -H 'content-type: application/json' -d '{}'
else
  check "Engage is not mounted"                           404 GET  /api/engage/me
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "RESULT: all checks passed"
  exit 0
fi
echo "RESULT: $FAILED check(s) FAILED:$FAILURES"
exit 1
