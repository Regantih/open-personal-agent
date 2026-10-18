#!/usr/bin/env bash
# One-shot deploy wiring for Open Personal Agent.
# Reads deploy/.secrets.env — every stage skips gracefully if its inputs are
# missing, so it can be re-run as credentials land.
#
# Stages: fly app → database → secrets → deploy → twilio → mailgun → smoke.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
SECRETS="$ROOT/deploy/.secrets.env"
FLY=/c/Users/hrega/.fly/bin/flyctl.exe

[ -f "$SECRETS" ] || { echo "create deploy/.secrets.env first"; exit 1; }
set -a; . "$SECRETS"; set +a
APP_NAME=${FLY_APP_NAME:-open-personal-agent}

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
have() { [ -n "${!1:-}" ]; }

# ---------- stage 1: fly app ----------
say "fly app"
if ! "$FLY" auth whoami >/dev/null 2>&1; then
  echo "not logged in — run: $FLY auth login  (or set FLY_API_TOKEN)"
  exit 1
fi
"$FLY" auth whoami
if ! "$FLY" apps list --json 2>/dev/null | grep -q "\"$APP_NAME\""; then
  "$FLY" apps create "$APP_NAME" --machines 2>/dev/null || {
    APP_NAME="open-personal-agent-$(python -c 'import secrets;print(secrets.token_hex(2))')"
    echo "name taken, using $APP_NAME"
    "$FLY" apps create "$APP_NAME" --machines
  }
fi
sed -i "s/^app = .*/app = \"$APP_NAME\"/" app/fly.toml
PUBLIC_BASE_URL=${PUBLIC_BASE_URL:-https://$APP_NAME.fly.dev}
echo "app: $APP_NAME  url: $PUBLIC_BASE_URL"

# ---------- stage 2: database ----------
say "database"
if have DATABASE_URL; then
  echo "DATABASE_URL provided (${DATABASE_URL%%@*}@…) — using external Postgres"
else
  echo "no DATABASE_URL — creating fly postgres (or paste Neon URL into .secrets.env)"
  if ! "$FLY" pg list --json 2>/dev/null | grep -q "$APP_NAME-db"; then
    "$FLY" pg create --name "$APP_NAME-db" --region dfw --vm-size shared-cpu-1x --volume-size 1 --initial-cluster-size 1
  fi
  "$FLY" pg attach "$APP_NAME-db" --app "$APP_NAME"  # sets DATABASE_URL secret
fi

# ---------- stage 3: secrets ----------
say "secrets"
SECRETS_ARGS=()
for kv in \
  "ANTHROPIC_API_KEY" "MASTER_KEY" "OPA_MULTI_USER" "PUBLIC_BASE_URL" \
  "TWILIO_ACCOUNT_SID" "TWILIO_AUTH_TOKEN" "RESEND_API_KEY" "EMAIL_FROM" \
  "MAILGUN_SIGNING_KEY" "EMAIL_CHANNEL_SECRET" "AGENT_EMAIL" "OPA_FREE_PLANNER_TURNS"; do
  have "$kv" && SECRETS_ARGS+=("$kv=${!kv}")
done
have EMAIL_CHANNEL_SECRET || SECRETS_ARGS+=("EMAIL_CHANNEL_SECRET=$(openssl rand -hex 16 2>/dev/null || python -c 'import secrets;print(secrets.token_hex(16))')")
"$FLY" secrets set "${SECRETS_ARGS[@]}" --app "$APP_NAME"

# ---------- stage 4: deploy ----------
say "deploy"
"$FLY" deploy -c app/fly.toml --app "$APP_NAME" --remote-only
curl -sf "$PUBLIC_BASE_URL/api/health" && echo "  health OK"

# ---------- stage 5: twilio ----------
say "twilio"
if have TWILIO_ACCOUNT_SID && have TWILIO_AUTH_TOKEN; then
  AUTH="$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN"
  API="https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID"
  NUM=${TWILIO_FROM_NUMBER:-}
  if [ -z "$NUM" ]; then
    NUM=$(curl -sf -u "$AUTH" "$API/IncomingPhoneNumbers.json?PageSize=1" | python -c 'import json,sys;d=json.load(sys.stdin);print(d["incoming_phone_numbers"][0]["phone_number"] if d["incoming_phone_numbers"] else "")')
  fi
  if [ -z "$NUM" ]; then
    echo "no number on account — buying one (voice+SMS capable, non-US ok)"
    CANDIDATE=$(curl -sf -u "$AUTH" "$API/../AvailablePhoneNumbers/US/Local.json?SmsEnabled=true&PageSize=1" | python -c 'import json,sys;d=json.load(sys.stdin);print(d["available_phone_numbers"][0]["phone_number"] if d["available_phone_numbers"] else "")' || true)
    [ -n "$CANDIDATE" ] && NUM=$(curl -sf -u "$AUTH" -X POST "$API/IncomingPhoneNumbers.json" -d "PhoneNumber=$CANDIDATE" | python -c 'import json,sys;print(json.load(sys.stdin)["phone_number"])')
  fi
  echo "using number $NUM — setting webhook → $PUBLIC_BASE_URL/api/channels/sms"
  curl -sf -u "$AUTH" -X POST "$API/IncomingPhoneNumbers.json" \
    -d "PhoneNumber=$NUM" --data-urlencode "SmsUrl=$PUBLIC_BASE_URL/api/channels/sms" >/dev/null || \
  curl -sf -u "$AUTH" -X POST "$API/IncomingPhoneNumbers/$(curl -sf -u "$AUTH" "$API/IncomingPhoneNumbers.json?PhoneNumber=$NUM" | python -c 'import json,sys;print(json.load(sys.stdin)["incoming_phone_numbers"][0]["sid"])').json" \
    --data-urlencode "SmsUrl=$PUBLIC_BASE_URL/api/channels/sms" >/dev/null
  "$FLY" secrets set TWILIO_FROM_NUMBER="$NUM" --app "$APP_NAME"
  echo "TEXT $NUM to reach the agent."
else
  echo "skipped — set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN in .secrets.env"
fi

# ---------- stage 6: mailgun inbound ----------
say "mailgun"
if have MAILGUN_API_KEY && have MAILGUN_DOMAIN; then
  # route: anything addressed to agent+*@domain → our webhook
  curl -sf -u "api:$MAILGUN_API_KEY" -X POST "https://api.mailgun.net/v3/routes" \
    -d "priority=1" \
    -d "description=opa agent inbound" \
    --data-urlencode "expression=match_recipient('.*@$MAILGUN_DOMAIN')" \
    --data-urlencode "action=forward('https://$APP_NAME.fly.dev/api/channels/email')" \
    --data-urlencode "action=stop()" >/dev/null && echo "inbound route created"
else
  echo "skipped — set MAILGUN_API_KEY + MAILGUN_DOMAIN"
fi

# ---------- stage 7: smoke ----------
say "smoke"
curl -sf "$PUBLIC_BASE_URL/api/auth/session" | head -c 200; echo
ML=$(curl -sf -X POST "$PUBLIC_BASE_URL/api/auth/magic-link" -H 'Content-Type: application/json' -d "{\"email\":\"$SMOKE_EMAIL\"}")
echo "$ML"
say "done — $PUBLIC_BASE_URL"
