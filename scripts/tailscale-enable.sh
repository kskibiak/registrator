#!/usr/bin/env bash
set -euo pipefail

PORT=80

echo "=== Tailscale FULL setup (sudo per command) ==="

# Instalacja
if ! command -v tailscale >/dev/null 2>&1; then
    echo "Installing Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sudo sh
else
    echo "Tailscale already installed."
fi

# Uruchomienie demona
if ! systemctl is-active --quiet tailscaled; then
    echo "Starting tailscaled..."
    sudo systemctl enable --now tailscaled
else
    echo "tailscaled already running."
fi

# Logowanie
if ! tailscale status >/dev/null 2>&1; then
    echo "Logging in to Tailscale..."
    sudo tailscale up
else
    echo "Already logged in."
fi

# Włączenie Funnel
if ! tailscale funnel status >/dev/null 2>&1; then
    echo "Enabling Funnel..."
    sudo tailscale funnel enable
else
    echo "Funnel subsystem already enabled."
fi

# Wystawienie portu
if ! tailscale funnel status 2>/dev/null | grep -q ":$PORT"; then
    echo "Exposing port $PORT..."
    sudo tailscale funnel --bg $PORT
else
    echo "Port $PORT already exposed."
fi

echo "=== Setup complete ==="
tailscale funnel status