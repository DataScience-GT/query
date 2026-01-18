#!/bin/bash
set -e

echo "Starting project build with pnpm turbo build..."
pnpm turbo build

echo "Build complete."

echo "Automatically deploying to Firebase Hosting..."

# Deploy
firebase deploy --only hosting --project dsgt-website
echo "Deployment complete!"

echo "Starting development server with pnpm run dev..."
pnpm run dev
echo "Development server process has ended."


# Check if firebase is installed
if ! command -v firebase &> /dev/null; then
    echo "Firebase CLI not found. Installing..."
    pnpm add -g firebase-tools
fi

# Check if logged in (interactive check)
if ! firebase login:list | grep -q "Logged in"; then
    echo "Logging into Firebase..."
    firebase login
fi