#!/usr/bin/env bash
#
# Provisions MONETAG_POSTBACK_SECRET on the production Convex deployment.
#
# Requirements before running:
#   export CONVEX_PROD_DEPLOY_KEY=...   # deploy key scoped to healthy-hound-245
#
# The secret is taken from $MONETAG_POSTBACK_SECRET when set, otherwise it is
# read (read-only) from the development deployment so production gets the same
# value. Neither the deploy key nor the secret is ever echoed, logged, or
# passed as a command-line argument.
#
# The script fails closed: every step before the write proves the key really
# addresses production. A development-scoped key can never reach the write.

set -euo pipefail

PROD="${PROD_CONVEX_DEPLOYMENT:-healthy-hound-245}"
SITE="https://${PROD}.convex.site/monetag/postback"
API="https://api.convex.dev/api/deployment/${PROD}/team_and_project"

say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# Convex command with the workspace's dev pinning removed, so the deploy key
# supplied for this run is the only thing selecting a deployment.
prod_convex() {
  env -u CONVEX_DEPLOYMENT \
    CONVEX_DEPLOY_KEY="${CONVEX_PROD_DEPLOY_KEY}" \
    bunx convex "$@"
}

http_status() {
  curl -s -o /dev/null -w '%{http_code}' "$1" || printf '000'
}

say "target: ${PROD}"
say "endpoint: ${SITE}"

# ---------------------------------------------------------------- idempotency
before="$(http_status "${SITE}")"
case "${before}" in
  403)
    say "already configured: the endpoint answers 403 (secret present, request unsigned)."
    say "no changes made."
    exit 0
    ;;
  503)
    say "pre-state: 503 (secret absent) — provisioning is required."
    ;;
  *)
    die "unexpected pre-state HTTP ${before}; refusing to continue."
    ;;
esac

# ----------------------------------------------------------------- preflight
[ -n "${CONVEX_PROD_DEPLOY_KEY:-}" ] \
  || die "CONVEX_PROD_DEPLOY_KEY is not set.

Create a deploy key scoped to ${PROD} from an account that can administer the
project (Convex dashboard -> ${PROD} -> Settings -> Deploy keys), or:

  npx convex deployment token create prod-provision --deployment ${PROD}

Then export it in a fresh shell and re-run. This workspace has no account
login, so no other credential can reach production."

# Prove the key addresses this deployment and not a development one. The CLI
# silently prefers CONVEX_DEPLOYMENT when both are present, so the REST probe
# below is the authoritative check: 200 means the key is valid for ${PROD},
# 401 means it is not. No response body is printed.
auth="$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer ${CONVEX_PROD_DEPLOY_KEY}" "${API}" || printf '000')"
case "${auth}" in
  200) say "preflight: deploy key is authorized for ${PROD}" ;;
  401) die "the supplied deploy key is not authorized for ${PROD} (HTTP 401).
Refusing to write. A development-scoped key cannot configure production." ;;
  000) die "could not reach api.convex.dev to confirm the key scope; refusing to write." ;;
  *) die "unexpected authorization probe response HTTP ${auth}; refusing to write." ;;
esac

# The REST probe above proves the key is valid for production. This second
# probe proves the CLI will actually use it: this workspace pins a deployment
# in its env file, and the CLI prefers that pin over a supplied key. The read is
# only accepted when the CLI reports the name of the production deployment.
cli_out="$(prod_convex env get MONETAG_POSTBACK_SECRET 2>&1 || true)"
case "${cli_out}" in
  *"not found"*"${PROD}"*)
    say "preflight: CLI now resolves to ${PROD}"
    ;;
  *401*|*Unauthorized*|*AccessTokenInvalid*)
    unset cli_out
    die "the Convex CLI rejected the deploy key for ${PROD}; refusing to write."
    ;;
  *)
    unset cli_out
    die "the Convex CLI is not resolving to ${PROD} — CONVEX_DEPLOYMENT is pinned
by this workspace, so a write here could target a development deployment.
Refusing to continue. Run this outside the pinned session (unset
CONVEX_DEPLOYMENT and remove its line from the workspace env file) so the
production deploy key is the only deployment selector."
    ;;
esac
unset cli_out

# ------------------------------------------------------------------- secret
if [ -n "${MONETAG_POSTBACK_SECRET:-}" ]; then
  secret="${MONETAG_POSTBACK_SECRET}"
  say "secret source: MONETAG_POSTBACK_SECRET"
else
  # Read-only: the development deployment already holds the intended value.
  # Captured into a variable, never printed.
  secret="$(env -u CONVEX_DEPLOYMENT bunx convex env get MONETAG_POSTBACK_SECRET 2>/dev/null || true)"
  [ -n "${secret}" ] \
    || die "no secret available. Set MONETAG_POSTBACK_SECRET for this run, or ensure the development deployment still holds it."
  say "secret source: existing development value"
fi

# --------------------------------------------------------------------- write
# Piped through stdin so the value never appears in argv or shell history.
# With CONVEX_DEPLOY_KEY set, the CLI scopes to that key's deployment.
out="$(printf '%s' "${secret}" | prod_convex env set MONETAG_POSTBACK_SECRET 2>&1 || true)"
unset secret

case "${out}" in
  *"${PROD}"*)
    say "write: accepted by ${PROD}"
    ;;
  *)
    die "the write did not confirm ${PROD}. Output:
$(printf '%s' "${out}" | sed -e 's/[A-Za-z0-9_-]\{16,\}/<redacted>/g')"
    ;;
esac

# ---------------------------------------------------------------- verification
after="$(http_status "${SITE}")"
if [ "${after}" != "403" ]; then
  die "verification failed: endpoint still answers ${after} (expected 403)."
fi
say "verified: ${SITE} returns 403 (configured, unsigned request rejected)."
say
say "Remaining checks are manual and need a signed-in Telegram client:"
say "  1. Reload the live app so the cached snapshot re-runs; Watch Ad must enable."
say "  2. Complete one real rewarded ad; progress must go 0 -> 1."
say "  3. Operator Console -> Reports -> Ads: exactly one verified completion,"
say "     one reward credited, no duplicate. A replayed postback must not pay again."
