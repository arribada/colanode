#!/usr/bin/env bash
# Deterministic auto-merge envelope check. Exit 0 = inside envelope.
set -euo pipefail
BASE="${1:?base ref}"; HEAD="${2:?head ref}"
ALLOW='^(apps/web/|packages/ui/|packages/client/|tests/auto-repro/)'
DENY='(auth|migration|payment)'
LINES=$(git diff --numstat "$BASE".."$HEAD" | awk '{a+=$1+$2} END{print a+0}')
if [ "$LINES" -gt 150 ]; then echo "OUTSIDE: diff $LINES lines > 150"; exit 1; fi
BAD=$(git diff --name-only "$BASE".."$HEAD" | grep -Ev "$ALLOW" || true)
if [ -n "$BAD" ]; then echo "OUTSIDE: paths not in allowlist:"; echo "$BAD"; exit 1; fi
RISKY=$(git diff --name-only "$BASE".."$HEAD" | grep -Ei "$DENY" || true)
if [ -n "$RISKY" ]; then echo "OUTSIDE: risky paths:"; echo "$RISKY"; exit 1; fi
echo "INSIDE envelope: $LINES lines, all paths allowed"
