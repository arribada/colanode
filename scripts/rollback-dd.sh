#!/usr/bin/env bash
set -euo pipefail
ssh dd 'docker tag colanode-server:prev colanode-server:dd &&
        docker tag colanode-web:prev    colanode-web:dd &&
        cd ~/colanode && docker compose -f docker-compose.prod.yml up -d'
# Retry like deploy-dd.sh: containers need a few seconds after recreate before
# Caddy/upstream is ready — a single immediate curl reliably hits a transient 502.
for i in $(seq 1 30); do
  curl -fsS https://chat.kvotaflow.ru/config >/dev/null && { echo "rolled back"; exit 0; }
  sleep 5
done
echo "rollback health check failed after retries — dd may still be unhealthy, check manually" >&2
exit 1
