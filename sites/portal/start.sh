#!/bin/bash

# Exit immediately if any command fails
set -e

pnpm turbo build
pnpm run dev
