#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
COMPOSE=(docker compose -f hosting/staging/docker-compose.staging.yml)
case "${1:?usage: staging-stack.sh up|down}" in
  up)
    docker build -t colanode-server:staging -f apps/server/Dockerfile .
    docker build -t colanode-web:staging    -f apps/web/Dockerfile .
    "${COMPOSE[@]}" up -d --wait
    for i in $(seq 1 60); do
      curl -fsS http://localhost:55080/config >/dev/null && { echo "staging up: http://localhost:55080"; exit 0; }
      sleep 2
    done
    echo "staging failed to become healthy" >&2
    "${COMPOSE[@]}" logs --tail 50 server
    exit 1 ;;
  down)
    "${COMPOSE[@]}" down -v ;;
esac
