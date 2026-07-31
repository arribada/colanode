#!/usr/bin/env bash
# Ship staging-built images to dd prod. Keeps previous images as :prev for rollback.
set -euo pipefail
docker tag colanode-server:staging colanode-server:dd
docker tag colanode-web:staging    colanode-web:dd
ssh dd 'docker tag colanode-server:dd colanode-server:prev 2>/dev/null || true;
        docker tag colanode-web:dd    colanode-web:prev    2>/dev/null || true'
docker save colanode-server:dd colanode-web:dd | gzip | ssh dd 'gunzip | docker load'
ssh dd 'cd ~/colanode && docker compose -f docker-compose.prod.yml up -d'
for i in $(seq 1 30); do
  curl -fsS https://chat.kvotaflow.ru/config >/dev/null && { echo "prod deployed"; exit 0; }
  sleep 5
done
echo "prod unhealthy after deploy" >&2; exit 1
