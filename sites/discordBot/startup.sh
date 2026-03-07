#!/bin/bash
set -e

echo "--- Smart Startup Script Initiated ---"

# Navigate to container directory
cd /home/container

# Check if node_modules exists, otherwise install
if [ ! -d "node_modules" ]; then
    echo "node_modules not found. Installing dependencies..."
    npm install --no-audit --no-fund --quiet
else
    echo "node_modules found. Skipping install."
fi

# Always rebuild to ensure latest changes are applied
echo "Building project..."
npm run build

# Start the bot
echo "Starting bot..."
exec node dist/index.js
