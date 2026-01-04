#!/bin/bash

# Exit immediately if any command fails
set -e

echo "Running Turbo Build from root..."
(cd ../.. && pnpm turbo run build --concurrency=2)
echo "Starting development server..."
pnpm run dev