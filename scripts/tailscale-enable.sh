#!/bin/bash

# Kolory dla lepszej czytelności
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}>>> Rozpoczynam procedurę wystawiania aplikacji na świat...${NC}"

# 1. Sprawdzenie uprawnień root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}[Błąd] Uruchom skrypt z sudo! (sudo ./start-online.sh)${NC}"
  exit
fi

# 2. Sprawdzenie/Instalacja Tailscale
if ! command -v tailscale &> /dev/null; then
    echo -e "${BLUE}[1/4] Tailscale nieznaleziony. Instaluję...${NC}"
    curl -fsSL https://tailscale.com/install.sh | sh
else
    echo -e "${GREEN}[1/4] Tailscale jest już zainstalowany.${NC}"
fi

# 3. Uruchomienie usługi Tailscale jeśli nie działa
sudo systemctl enable --now tailscaled

# 4. Sprawdzenie logowania
STATUS=$(tailscale status --json | grep -oP '"BackendState":\s*"\K[^"]+')
if [ "$STATUS" != "Running" ]; then
    echo -e "${RED}[!] Wymagane logowanie. Kliknij w poniższy link:${NC}"
    tailscale up --accept-dns=true
else
    echo -e "${GREEN}[2/4] Tailscale jest połączony.${NC}"
fi

# 5. Konfiguracja przekierowania portu 80 (Lokalnie)
echo -e "${BLUE}[3/4] Konfiguruję lokalne serwowanie portu 80...${NC}"
tailscale serve reset > /dev/null 2>&1
tailscale serve 80

# 6. Włączenie Funnel (Publiczny HTTPS)
echo -e "${BLUE}[4/4] Otwieram bramę na świat (Funnel)...${NC}"
tailscale funnel 443 on

echo -e "\n${GREEN}==============================================${NC}"
echo -e "${GREEN}SUKCES! Twój system powinien być teraz online.${NC}"
echo -e "${BLUE}Twój publiczny adres URL to:${NC}"
tailscale funnel status | grep -oP 'https://[a-z0-9.-]+\.ts\.net' | head -1
echo -e "${GREEN}==============================================${NC}"