#!/bin/bash

# Exit immediately if any command fails
set -e

echo "Running Turbo Build from root..."
(cd ../.. && pnpm turbo build)
(cd ../.. && pnpm turbo build)
(cd ../.. && pnpm turbo build)
clear
echo "Starting development server..."
pnpm run dev