#!/usr/bin/env bash
# Atualiza Synapsee (API + Admin) na VPS.
# Uso:
#   SYNAPSEE_DIR=/opt/synapsee bash /opt/script/update-synapsee.sh
#   cd /opt/synapsee && bash scripts/update-synapsee.sh
#
# Opções:
#   --no-build     só recreia containers (sem --build)
#   --backup       backup rápido do SQLite antes do deploy
#   --skip-health  não roda curl /health

set -euo pipefail

NO_BUILD=0
DO_BACKUP=0
SKIP_HEALTH=0
for arg in "$@"; do
  case "$arg" in
    --no-build) NO_BUILD=1 ;;
    --backup) DO_BACKUP=1 ;;
    --skip-health) SKIP_HEALTH=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Opção desconhecida: $arg" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Preferência: SYNAPSEE_DIR → pasta do script se tiver compose → /opt/synapsee → parent do scripts/
if [[ -n "${SYNAPSEE_DIR:-}" ]]; then
  DIR="$SYNAPSEE_DIR"
elif [[ -f "${SCRIPT_DIR}/docker-compose.prod.yml" ]]; then
  DIR="$SCRIPT_DIR"
elif [[ -f "/opt/synapsee/docker-compose.prod.yml" ]]; then
  DIR="/opt/synapsee"
elif [[ -f "${ROOT}/docker-compose.prod.yml" ]]; then
  DIR="$ROOT"
else
  DIR="${SYNAPSEE_DIR:-/opt/synapsee}"
fi

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"

cd "$DIR"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Erro: $COMPOSE_FILE não encontrado em $DIR" >&2
  echo "Defina SYNAPSEE_DIR=/opt/synapsee" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Erro: $ENV_FILE não encontrado. Copie de .env.prod.example e preencha." >&2
  exit 1
fi

echo "==> Diretório: $DIR"
echo "==> git pull (origin/main)"
git fetch origin
git pull --ff-only origin main

if [[ "$DO_BACKUP" -eq 1 ]]; then
  echo "==> Backup SQLite"
  VOL="$(docker volume ls -q | grep -E 'synapsee.*data' | head -n1 || true)"
  if [[ -n "$VOL" ]]; then
    OUT="synapsee-backup-$(date +%F-%H%M%S).sqlite"
    docker run --rm -v "${VOL}:/data" -v "${DIR}:/backup" alpine \
      cp /data/synapsee.sqlite "/backup/${OUT}"
    echo "    salvo: ${DIR}/${OUT}"
  else
    echo "    aviso: volume synapsee data não encontrado — backup ignorado"
  fi
fi

# Lê portas do .env.prod sem executar o arquivo (evita chars especiais).
env_get() {
  local key="$1" default="$2" line val
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 || true)"
  val="${line#*=}"
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  if [[ -n "$val" ]]; then echo "$val"; else echo "$default"; fi
}
API_PORT="$(env_get API_HOST_PORT 3100)"
ADMIN_PORT="$(env_get ADMIN_HOST_PORT 8180)"

echo "==> docker compose up"
if [[ "$NO_BUILD" -eq 1 ]]; then
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
else
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build
fi

echo "==> containers"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

if [[ "$SKIP_HEALTH" -eq 0 ]]; then
  echo "==> health"
  sleep 2
  curl -sfS "http://127.0.0.1:${API_PORT}/health" && echo
  curl -sfS "http://127.0.0.1:${ADMIN_PORT}/health" && echo
fi

echo "OK — Synapsee atualizado."
echo "Lembrete: após Sync GitHub full, rode de novo a história se mudou a KL."