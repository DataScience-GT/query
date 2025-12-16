#!/bin/bash
set -e

echo "Starting project build with pnpm turbo build..."
pnpm turbo build

echo "Build complete."

read -p "Do you want to deploy to Firebase Hosting now? (y/N): " DEPLOY_ANSWER

if [[ "$DEPLOY_ANSWER" =~ ^[Yy]$ ]]; then
    echo "Deploying to Firebase Hosting..."

    if ! command -v firebase &> /dev/null; then
        echo "Firebase CLI not found. Installing..."
        pnpm add -g firebase-tools
    fi

    if ! firebase login:list | grep -q "Logged in"; then
        echo "Logging into Firebase..."
        firebase login
    fi

    firebase deploy --only hosting --project dsgt-website
    echo "Deployment complete!"
else
    echo "Skipping Firebase deploy."
fi

echo "Starting development server with pnpm run dev..."
pnpm run dev
n
echo "Development server process has ended."
