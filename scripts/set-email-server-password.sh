#!/usr/bin/env bash
# Add a Secret Manager version for EMAIL_SERVER_PASSWORD (Resend API key).
# Usage:
#   EMAIL_SERVER_PASSWORD='re_…' ./scripts/set-email-server-password.sh
#   printf '%s' 're_…' | ./scripts/set-email-server-password.sh
set -euo pipefail

PROJECT="${GCP_PROJECT:-dsgt-website}"
SECRET="${EMAIL_SERVER_SECRET:-EMAIL_SERVER_PASSWORD}"

if [[ -n "${EMAIL_SERVER_PASSWORD:-${RESEND_API_KEY:-}}" ]]; then
  KEY="${EMAIL_SERVER_PASSWORD:-$RESEND_API_KEY}"
elif [[ ! -t 0 ]]; then
  KEY="$(cat)"
else
  echo "Set EMAIL_SERVER_PASSWORD or RESEND_API_KEY, or pipe the key on stdin." >&2
  exit 1
fi

KEY="${KEY//$'\n'/}"
KEY="${KEY//$'\r'/}"
if [[ ! "$KEY" =~ ^re_ ]]; then
  echo "That value does not look like a Resend API key." >&2
  exit 1
fi

if ! command -v gcloud >/dev/null; then
  echo "gcloud is not installed. Install the Google Cloud SDK, then:" >&2
  echo "  gcloud auth login && gcloud config set project $PROJECT" >&2
  exit 1
fi

printf '%s' "$KEY" | gcloud secrets versions add "$SECRET" \
  --data-file=- \
  --project="$PROJECT"

echo "Added a new version of $SECRET in $PROJECT."
echo "App Hosting picks it up on the next rollout after apphosting.yaml points SMTP at Resend."
