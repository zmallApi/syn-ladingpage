# Synapsee Edge — outbound-only worker

## Role

Runs inside the customer network. Holds DB credentials. Opens a WebSocket **out** to Synapsee Cloud. Never accepts inbound connections from Cloud.

## Quick start

```bash
docker run -d --name synapsee-edge \
  -e SYNAPSEE_TOKEN=syn_edge_... \
  -e SYNAPSEE_CLOUD_URL=https://api.example.com \
  -e SYNAPSEE_DB_ENGINE=postgresql \
  -e SYNAPSEE_DB_HOST=host.docker.internal \
  -e SYNAPSEE_DB_PORT=5432 \
  -e SYNAPSEE_DB_NAME=mydb \
  -e SYNAPSEE_DB_USER=myuser \
  -e SYNAPSEE_DB_PASSWORD=secret \
  synapsee/edge:latest
```

Generate token + snippets from Admin → projeto Edge → **Gerar Project Token**.

## Env

| Var | Required | Description |
|-----|----------|-------------|
| `SYNAPSEE_TOKEN` | yes | Project token (`syn_edge_…`) |
| `SYNAPSEE_CLOUD_URL` | yes | Cloud API base (`http://` or `https://`) |
| `SYNAPSEE_DB_ENGINE` | no | default `postgresql` |
| `SYNAPSEE_DB_HOST` | yes | DB host reachable from the container |
| `SYNAPSEE_DB_PORT` | no | default `5432` |
| `SYNAPSEE_DB_NAME` | yes | Database name |
| `SYNAPSEE_DB_USER` | yes | User |
| `SYNAPSEE_DB_PASSWORD` | yes | Password |
| `SYNAPSEE_DB_READ_ONLY` | no | default `true` |

## Local (without Docker)

```bash
npm install
cd apps/edge
SYNAPSEE_TOKEN=... SYNAPSEE_CLOUD_URL=http://localhost:3000 \
SYNAPSEE_DB_HOST=localhost SYNAPSEE_DB_NAME=... SYNAPSEE_DB_USER=... SYNAPSEE_DB_PASSWORD=... \
npm run dev
```

## Updates

Edge calls `GET /edge/version` on the Cloud. Rebuild/pull `synapsee/edge:latest` and restart the container. Optional: Watchtower.

## Build image

From monorepo root:

```bash
docker build -f apps/edge/Dockerfile -t synapsee/edge:latest .
```
