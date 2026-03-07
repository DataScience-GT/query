#!/bin/bash

# sync-secrets.sh
# Pulls production secrets from GCP Secret Manager and populates local .env files.

PROJECT_ID="672446353769" # dsgt-website
TARGET_FILE="sites/mainweb/.env.local"

echo "Using GCP Project: $PROJECT_ID"
echo "Target: $TARGET_FILE"

# List of secrets to sync mapping (Secret Name in GCP -> Env Var Name)
declare -A SECRETS=(
  ["DATABASE_URL"]="DATABASE_URL"
  ["AUTH_SECRET"]="NEXTAUTH_SECRET"
  ["STRIPE_SECRET_KEY"]="STRIPE_SECRET_KEY"
  ["STRIPE_WEBHOOK_SECRET"]="STRIPE_WEBHOOK_SECRET"
  ["EMAIL_SERVER_PASSWORD"]="EMAIL_SERVER_PASSWORD"
  ["AUTH_GOOGLE_ID"]="GOOGLE_CLIENT_ID"
  ["AUTH_GOOGLE_SECRET"]="GOOGLE_CLIENT_SECRET"
)

# Ensure target file exists or create it
if [ ! -f "$TARGET_FILE" ]; then
    touch "$TARGET_FILE"
fi

for SECRET_NAME in "${!SECRETS[@]}"; do
    ENV_VAR="${SECRETS[$SECRET_NAME]}"
    echo "Fetching $SECRET_NAME..."

    # Try fetching the secret value
    VALUE=$(gcloud secrets versions access latest --secret="$SECRET_NAME" --project="$PROJECT_ID" 2>/dev/null)

    if [ $? -eq 0 ]; then
        # Check if var already exists in file
        if grep -q "^$ENV_VAR=" "$TARGET_FILE"; then
            # Update existing
            # Use a different delimiter for sed since secrets can have /
            sed -i "s|^$ENV_VAR=.*|$ENV_VAR=$VALUE|" "$TARGET_FILE"
        else
            # Append new
            echo "$ENV_VAR=$VALUE" >> "$TARGET_FILE"
        fi
        echo "Successfully synced $ENV_VAR"
    else
        echo "Warning: Could not fetch $SECRET_NAME. Ensure you have 'Secret Manager Secret Accessor' role."
    fi
done

echo "Secret synchronization complete."
