#!/bin/bash
set -e

if [ ! -f .env ]; then
  echo ".env file not found!"
  exit 1
fi

docker compose -p hacklytics up -d --build

docker logs -f hacklytics-bot
