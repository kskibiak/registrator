#!/bin/bash

RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${RED}>>> Zamykam dostęp zewnętrzny...${NC}"

if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}[Błąd] Uruchom skrypt z sudo!${NC}"
  exit
fi

# 1. Wyłączenie Funnel
tailscale funnel 443 off
echo -e "${BLUE}[1/2] Brama Funnel zamknięta.${NC}"

# 2. Resetowanie mapowania portów
tailscale serve reset
echo -e "${BLUE}[2/2] Mapowanie portów wyczyszczone.${NC}"

echo -e "\n${RED}System jest teraz NIEWIDOCZNY w internecie.${NC}"
tailscale funnel status