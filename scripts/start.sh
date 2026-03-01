#!/usr/bin/env bash
# scripts/start.sh
#
# Kompleksowy skrypt: buduje backend, frontend, obrazy Docker i uruchamia aplikację.
#
# Użycie:
#   ./scripts/start.sh              # build + start
#   ./scripts/start.sh --reset-db   # build + start + wyczyść bazę danych
#   ./scripts/start.sh --no-build   # pomiń budowanie obrazów (tylko restart)
#   ./scripts/start.sh --logs       # po uruchomieniu pokaż logi na żywo

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESET_DB="false"
NO_BUILD="false"
SHOW_LOGS="false"

# ── Parsowanie argumentów ──────────────────────────────────
for arg in "$@"; do
  case $arg in
    --reset-db)  RESET_DB="true" ;;
    --no-build)  NO_BUILD="true" ;;
    --logs)      SHOW_LOGS="true" ;;
    *)
      echo "Nieznany argument: $arg"
      echo "Użycie: $0 [--reset-db] [--no-build] [--logs]"
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"

# ── Kolory ────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
step()  { echo -e "\n${CYAN}==>${NC} $1"; }
ok()    { echo -e "${GREEN}✔${NC}  $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}   $1"; }

# ── Sprawdź zależności ────────────────────────────────────
for cmd in docker; do
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "${RED}Brak wymaganego narzędzia: $cmd${NC}"
    exit 1
  fi
done

if ! docker compose version &>/dev/null; then
  echo -e "${RED}Wymagany 'docker compose' (v2+)${NC}"
  exit 1
fi

# ── Budowanie obrazów Docker ──────────────────────────────
if [[ "$NO_BUILD" == "false" ]]; then
  step "Budowanie obrazów Docker (backend + frontend)..."
  docker compose build --parallel
  ok "Obrazy zbudowane"
else
  warn "Pomijam budowanie (--no-build)"
fi

# ── Zatrzymaj poprzednie kontenery ────────────────────────
step "Zatrzymywanie poprzednich kontenerów..."
docker compose down --remove-orphans 2>/dev/null || true
ok "Kontenery zatrzymane"

# ── Uruchom kontenery ─────────────────────────────────────
if [[ "$RESET_DB" == "true" ]]; then
  warn "RESET_DB=true — baza danych zostanie wyczyszczona!"
  step "Uruchamianie z czystą bazą..."
  RESET_DB=true docker compose up -d
  # Poczekaj chwilę, żeby backend zdążył zresetować bazę, potem restartujemy bez flagi
  echo "  Czekam na reset bazy (5s)..."
  sleep 5
  docker compose stop backend
  RESET_DB=false docker compose up -d backend
else
  step "Uruchamianie kontenerów..."
  RESET_DB=false docker compose up -d
fi

ok "Kontenery uruchomione"

# ── Status ────────────────────────────────────────────────
step "Status:"
docker compose ps

echo ""
echo -e "${GREEN}✅  Aplikacja działa na:${NC} http://localhost"
echo -e "    Backend API:  http://localhost/api"
echo ""
echo -e "Przydatne komendy:"
echo -e "  Logi:      docker compose logs -f"
echo -e "  Stop:      docker compose down"
echo -e "  Reset DB:  $0 --reset-db"
echo ""

# ── Opcjonalne live logi ───────────────────────────────────
if [[ "$SHOW_LOGS" == "true" ]]; then
  step "Logi na żywo (Ctrl+C aby wyjść)..."
  docker compose logs -f
fi
