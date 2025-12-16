#!/bin/bash

# A simple script to build a project using pnpm turbo
# and then start the development server.

# Exit immediately if a command exits with a non-zero status
set -e

echo "Starting project build with pnpm turbo build..."
# 1. Execute the build command
pnpm turbo build

echo "Build complete. Starting development server with pnpm run dev..."
# 2. Execute the development server command
# This command is expected to run indefinitely (until manually stopped)
pnpm run dev

# The script will only reach this point if the 'pnpm run dev' command
# exits for some reason (e.g., if it's not a continuous process)
echo "Development server process has ended."