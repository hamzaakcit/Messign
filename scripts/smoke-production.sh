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

# check_header NAME PATH PATTERN: the response headers of GET PATH must match the (case-insensitive) pattern.
check_header() {
  name=$1; path=$2; pattern=$3
  headers=$(curl -s -D - -o /dev/null -m 15 "$BASE$path" | tr -d '\r') || headers=""
  if printf '%s' "$headers" | grep -qiE "$pattern"; then
    echo "PASS  $name  (GET $path)"
    return 0
  fi
  echo "FAIL  $name  (GET $path: header not found: $pattern)"
  record_fail "$name"
  return 1
}

# A token signed with the placeholder secret from the repository. If production still used it (NODE_ENV not production, or
# JWT_SECRET missing) the signature would verify, and the user lookup would answer 403 "User not provisioned"; a server with
# its own secret ignores the token and answers 401.
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
forged_token() {
  now=$(date +%s)
  head=$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | b64url)
  body=$(printf '{"sub":"smoke-forged","type":"access","role":"admin","organizationId":"00000000-0000-0000-0000-000000000001","iat":%s,"exp":%s}' "$now" "$((now + 600))" | b64url)
  sig=$(printf '%s.%s' "$head" "$body" | openssl dgst -sha256 -hmac 'messign-access-secret-change-in-production' -binary | b64url)
  printf '%s.%s.%s' "$head" "$body" "$sig"
}

FORGED='X-User-Id: 00000000-0000-0000-0000-000000000001'

echo "Smoke checks against $BASE (engage expected: $ENGAGE)"
check_ready || { echo; echo "The API is not answering, skipping the remaining checks."; echo "RESULT: FAILED$FAILURES"; exit 1; }

check "Liveness"                                   200 GET  /health/live
check_header "API sends a deny-all content security policy" /health/live "^content-security-policy: default-src 'none'"
check_header "API sends nosniff"                            /health/live "^x-content-type-options: nosniff"
check "Protected route needs a login"              401 GET  /api/dashboard
check "Forged X-User-Id does not authenticate"     401 GET  /api/dashboard -H "$FORGED"
check "Seed routes are not exposed (GET)"          404 GET  /api/seed/finance
check "Seed routes are not exposed (POST)"         404 POST /api/seed/finance

if [ "$ENGAGE" = "yes" ]; then
  check "Engage mounted: user route needs a login"        401 GET  /api/engage/me
  check "Engage: forged X-User-Id does not authenticate"  401 GET  /api/engage/me -H "$FORGED"
  check "Engage: token signed with the placeholder secret is refused" 401 GET /api/engage/me -H "Authorization: Bearer $(forged_token)"
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
