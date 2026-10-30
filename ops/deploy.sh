#!/usr/bin/env bash
# One command to deploy or redeploy the hosted stack:   ./ops/deploy.sh
#
#   first run   creates ops/.env.prod, generates the secrets, then asks you to set
#               PUBLIC_URL / SITE_ADDRESS / ADMIN_ADDRESS / ACME_EMAIL and re-run
#   later runs  rebuild what changed, apply new migrations, restart what changed
#
# Other commands:   ./ops/deploy.sh seed      load demo data (refuses if data exists)
#                   ./ops/deploy.sh status    container state and health
#                   ./ops/deploy.sh logs [service]
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE=.env.prod
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)

if [ ! -f "$ENV_FILE" ]; then
  cp prod.env.example "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  created=1
fi

# Fill any empty secret with a fresh random value (never overwrites one you set).
fill() { # name, generator-command
  if ! grep -Eq "^$1=.+" "$ENV_FILE"; then
    value="$(eval "$2")"
    sed -i "s|^$1=.*|$1=$value|" "$ENV_FILE"
    echo "generated $1"
  fi
}
fill POSTGRES_PASSWORD "openssl rand -hex 24"
fill SETTLEMENT_INTERNAL_TOKEN "openssl rand -hex 32"
fill ACQUIRER_CALLBACK_SIGNING_SECRET "openssl rand -hex 32"
fill WEBHOOK_SECRET_ENCRYPTION_KEY "openssl rand -base64 32"

if [ "${created:-0}" = 1 ]; then
  echo
  echo "Created ops/$ENV_FILE with fresh secrets."
  echo "Edit PUBLIC_URL, SITE_ADDRESS, ADMIN_ADDRESS and ACME_EMAIL in it, then run ./ops/deploy.sh again."
  exit 0
fi

case "${1:-deploy}" in
  deploy)
    "${COMPOSE[@]}" build
    # Postgres first, then migrations (also run by the dependent services), then the rest.
    "${COMPOSE[@]}" up -d postgres
    "${COMPOSE[@]}" run --rm migrate
    "${COMPOSE[@]}" up -d --remove-orphans
    "${COMPOSE[@]}" ps
    ;;
  seed)   "${COMPOSE[@]}" --profile tools run --rm seed ;;
  status) "${COMPOSE[@]}" ps ;;
  logs)   shift; "${COMPOSE[@]}" logs --tail=200 -f "$@" ;;
  *)      echo "unknown command: $1" >&2; exit 2 ;;
esac
