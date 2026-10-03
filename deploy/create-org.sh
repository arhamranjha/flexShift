#!/usr/bin/env bash
# Onboards a customer on the server: an organization, its first branch, an organization admin and (optionally) a
# branch manager.   Run it in a normal Terminal window (it asks questions):
#   SSH_OPTS="-i ~/.ssh/flexshift -o IdentitiesOnly=yes" deploy/create-org.sh root@<server-ip>
# One-time temporary passwords are printed at the end; each person must change theirs at first sign-in.
set -euo pipefail
TARGET="${1:?usage: deploy/create-org.sh user@server}"
command -v python3 >/dev/null || { echo "python3 is needed on this machine to build the request"; exit 1; }

ask() { # ask "Label" [default]  -> sets REPLY
  local label="$1" default="${2:-}"
  if [ -n "$default" ]; then read -r -p "$label [$default]: " REPLY; REPLY="${REPLY:-$default}"; else read -r -p "$label: " REPLY; fi
}

echo "--- Organization"
ask "Organization name (e.g. Kiwi Care Pharmacies)"; ORG_NAME="$REPLY"
ask "Organization admin email (the owner who will sign in)"; ADMIN_EMAIL="$REPLY"
ask "Organization phone"; PHONE="$REPLY"
ask "Billing email" "$ADMIN_EMAIL"; BILLING="$REPLY"
echo "--- First branch"
ask "Branch name (e.g. Ponsonby Pharmacy)"; BRANCH_NAME="$REPLY"
ask "Branch code (short and unique, e.g. KIWI-PON-01)"; BRANCH_CODE="$REPLY"
ask "Street address"; ADDRESS="$REPLY"
ask "City"; CITY="$REPLY"
ask "Postcode"; POSTCODE="$REPLY"
ask "Country" "NZ"; COUNTRY="$REPLY"
ask "Branch phone" "$PHONE"; BRANCH_PHONE="$REPLY"
ask "Branch manager email (leave empty for none)" ""; MANAGER="$REPLY"

JSON=$(ORG_NAME="$ORG_NAME" ADMIN_EMAIL="$ADMIN_EMAIL" PHONE="$PHONE" BILLING="$BILLING" BRANCH_NAME="$BRANCH_NAME" \
  BRANCH_CODE="$BRANCH_CODE" ADDRESS="$ADDRESS" CITY="$CITY" POSTCODE="$POSTCODE" COUNTRY="$COUNTRY" \
  BRANCH_PHONE="$BRANCH_PHONE" MANAGER="$MANAGER" python3 - <<'PY'
import json, os
e = os.environ
d = {
  "orgName": e["ORG_NAME"], "adminEmail": e["ADMIN_EMAIL"], "billingEmail": e["BILLING"], "phone": e["PHONE"],
  "branchName": e["BRANCH_NAME"], "branchCode": e["BRANCH_CODE"], "addressLine1": e["ADDRESS"], "city": e["CITY"],
  "postcode": e["POSTCODE"], "country": e["COUNTRY"], "branchPhone": e["BRANCH_PHONE"],
}
if e["MANAGER"].strip():
    d["managerEmail"] = e["MANAGER"]
print(json.dumps(d))
PY
)

echo
echo "Creating on $TARGET ..."
# The request travels on stdin (JSON), not in a command line.
printf '%s' "$JSON" | ssh ${SSH_OPTS:-} "$TARGET" \
  "cd /opt/flexshift && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T -w /repo/apps/backend-api api node dist/cli/create-org.js"
