#!/usr/bin/env bash
set -e

PORT=80

if ! command -v tailscale >/dev/null 2>&1; then
    echo "Tailscale nie jest zainstalowany. Nic do wylaczenia."
    exit 0
fi

if ! tailscale funnel status >/dev/null 2>&1; then
    echo "Funnel nie jest aktywny."
    exit 0
fi

if tailscale funnel status 2>/dev/null | grep -q ":$PORT"; then
    echo "Wylaczanie Funnel na porcie $PORT..."
    sudo tailscale funnel $PORT off
    echo "Wylaczono."
else
    echo "Funnel na porcie $PORT nie byl wlaczony."
fi