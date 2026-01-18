#!/bin/bash
# Deploy script for Firebase with merged portal
# Usage: ./deploy.sh [portal|mainweb] or ./deploy.sh --all

set -e

# Setup directories
mkdir -p firebase-functions/dist

deploy_mainweb() {
  echo "🔨 Building static mainweb..."
  pnpm --filter web run build

  echo "🚀 Deploying mainweb..."
  firebase deploy --only hosting:dsgt-website
}

deploy_portal() {
  echo "🔨 Building SSR portal..."
  pnpm --filter portal run build

  echo "📦 Bundling portal for Cloud Functions..."
  # Clean previous build
  rm -rf firebase-functions/dist/portal
  mkdir -p firebase-functions/dist/portal

  # Copy standalone build to functions folder
  cp -r sites/portal/.next/standalone/* firebase-functions/dist/portal/

  # Copy .env file
  cp .env firebase-functions/dist/portal/.env

  # Ensure target directories exist
  mkdir -p firebase-functions/dist/portal/sites/portal/.next

  # Copy static and public files to specific nested location
  cp -r sites/portal/.next/static firebase-functions/dist/portal/sites/portal/.next/
  cp -r sites/portal/public firebase-functions/dist/portal/sites/portal/ 2>/dev/null || true

  echo "🚀 Deploying portal..."
  firebase deploy --only hosting:dsgt-portal,functions:portal
}

if [ "$1" == "mainweb" ]; then
  deploy_mainweb
elif [ "$1" == "portal" ]; then
  deploy_portal
elif [ "$1" == "--all" ] || [ -z "$1" ]; then
  deploy_mainweb
  deploy_portal
else
  echo "Usage: ./deploy.sh [portal|mainweb|--all]"
  exit 1
fi
