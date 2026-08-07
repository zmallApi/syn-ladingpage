# Deploy Synapsee na VPS (API + Admin)

Landing permanece no Netlify. Este guia sobe **API** e **Admin** com Docker Compose **ao lado** de outros stacks (ex.: pfit), sem roubar portas deles.

## Portas (convivência com pfit)

| Host | Uso típico na VPS | Synapsee |
|------|-------------------|----------|
| 4000 | pfit-api | — |
| 4100 | pfit-importador | — |
| 8080 | pfit-bff-edge | **não usar** |
| 5432 | proffitness_postgres | — |
| 3010 / 3001 / 3020 | pfit (localhost) | — |
| **3100** | livre | **API** (default) |
| **8180** | livre | **Admin** (default) |

Confirme antes de subir:

```bash
ss -tlnp | grep -E ':(3100|8180|3000|8080)\s' || true
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Se `3100`/`8180` estiverem ocupadas, mude `API_HOST_PORT` / `ADMIN_HOST_PORT` no `.env.prod`.

## Pré-requisitos na VPS

- Docker + Docker Compose plugin
- Git
- **Não** derrube containers do pfit — só o Synapsee usa o compose `docker-compose.prod.yml`

## 1. Clonar o repositório

```bash
git clone https://github.com/zmallApi/syn-ladingpage.git synapsee
cd synapsee
# ou: git pull se já existir
```

## 2. Configurar ambiente

```bash
cp .env.prod.example .env.prod
nano .env.prod   # ou vim
```

Preencha no mínimo:

| Variável | Exemplo |
|----------|---------|
| `PLATFORM_API_KEY` | chave longa aleatória (ops) |
| `ENCRYPTION_KEY` | chave longa aleatória |
| `JWT_SECRET` | chave longa aleatória |
| `PUBLIC_API_URL` | `http://SEU_IP:3100` ou `https://api.seudominio.com` |
| `API_HOST_PORT` | `3100` (default — não use 4000/8080 do pfit) |
| `ADMIN_HOST_PORT` | `8180` (default — **8080 é do pfit-bff**) |

`PUBLIC_API_URL` é bakeado no Admin no **build**. Se mudar o domínio/porta depois, rebuild do `admin`.

## 3. Subir (só o stack Synapsee)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Isso **não** para o pfit. Containers: `synapsee-api`, `synapsee-admin`.

## 4. Verificar

```bash
docker compose -f docker-compose.prod.yml ps
curl -s http://127.0.0.1:3100/health
curl -s http://127.0.0.1:8180/health

# pfit continua no ar
docker ps --filter name=pfit --format '{{.Names}} {{.Status}}'
```

- API: `http://SEU_IP:3100/health` → `{"ok":true}`
- Admin: `http://SEU_IP:8180` → login / criar conta

## 5. Primeiro acesso

1. Abra o Admin → **Criar conta** (tenant self-serve), **ou**
2. Entre com a `PLATFORM_API_KEY` (aba API key) para ops / projetos legados.

## Atualizar depois de um git pull

```bash
cd synapsee
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## Dados persistentes

SQLite da plataforma fica no volume Docker `synapsee_data` (`DATA_DIR=/data`).

```bash
# backup rápido
docker run --rm -v synapsee_synapsee_data:/data -v "$(pwd)":/backup alpine \
  cp /data/synapsee.sqlite /backup/synapsee-backup-$(date +%F).sqlite
```

(O nome do volume pode ser `synapsee_synapsee_data` ou similar — confira com `docker volume ls`.)

## HTTPS / domínio (recomendado) — synapsee.tec.br

Padrão sugerido:

| Host | Aponta para | Serviço |
|------|-------------|---------|
| [synapsee.tec.br](https://synapsee.tec.br/) | Netlify (já) | Landing |
| `api.synapsee.tec.br` | `127.0.0.1:3100` | API |
| `admin.synapsee.tec.br` | `127.0.0.1:8180` | Admin |

DNS: dois registros `A` (ou CNAME) para o IP da VPS — `api` e `admin`.

Exemplo **Caddy** na VPS:

```caddy
api.synapsee.tec.br {
  reverse_proxy 127.0.0.1:3100
}

admin.synapsee.tec.br {
  reverse_proxy 127.0.0.1:8180
}
```

Exemplo **Nginx** (site snippets):

```nginx
server {
  server_name api.synapsee.tec.br;
  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}

server {
  server_name admin.synapsee.tec.br;
  location / {
    proxy_pass http://127.0.0.1:8180;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

No `.env.prod`:

```env
PUBLIC_API_URL=https://api.synapsee.tec.br
API_HOST_PORT=3100
ADMIN_HOST_PORT=8180
```

Rebuild do Admin (URL da API entra no build):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build admin
```

Não reutilize hostnames/portas do pfit.

## O que NÃO sobe neste compose

- Landing (Netlify)
- Postgres/MySQL demo (`docker-compose.yml` local) — só para testes de ERP
- Edge agent — roda na rede do **cliente**, não na VPS Cloud

## Troubleshooting

| Sintoma | Ação |
|---------|------|
| Porta em uso | Não mate o pfit — mude `API_HOST_PORT` / `ADMIN_HOST_PORT` (evite 4000, 4100, 8080, 5432) |
| Admin chama API errada | `PUBLIC_API_URL` deve bater com a porta da API (`:3100` ou HTTPS) → `--build admin` |
| 401 no Admin | Use JWT (signup/login) ou `PLATFORM_API_KEY` / `syn_tk_…` |
| Volume vazio após recreate | Não use `-v` no `down` se quiser manter dados: `docker compose … down` **sem** `-v` |
