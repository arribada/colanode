#!/usr/bin/env bash
set -euo pipefail
curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=🤖 bug-loop [colanode]: ${1:?message required}" \
  --data-urlencode "disable_web_page_preview=true" >/dev/null
