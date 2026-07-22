# Synapsee IA

Monorepo: **landing** (marketing) + **admin** (operação do backend) + design tokens compartilhados.

## Quick start — Landing

```bash
# Na raiz do monorepo
npm install

# Configure o Telegram (veja abaixo)
cp apps/landing/.env.example apps/landing/.env.local
# edite apps/landing/.env.local com TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID

npm run dev:landing
```

Abre em [http://localhost:5173](http://localhost:5173). A API local do waitlist roda em `:3001` (proxy automático).

## Quick start — Admin

Painel operacional com wizard visual (conectar → schema → gerar → testar), mesmo design da landing.

```bash
npm install
cp apps/admin/.env.example apps/admin/.env   # VITE_USE_MOCK=true por padrão
npm run dev:admin
```

Abre em [http://localhost:5174](http://localhost:5174).

1. Login com qualquer API key (modo mock)
2. **Novo projeto** → preencha conexão → Conectar
3. Selecione recursos → Expor e gerar API
4. Teste GET no playground

### Variáveis do admin

| Variável | Default | Descrição |
|----------|---------|-----------|
| `VITE_USE_MOCK` | `true` | Mock em localStorage (sem backend) |
| `VITE_API_URL` | vazio | Base da API; vazio usa proxy Vite → `localhost:3000` |

Com API real:

```env
VITE_USE_MOCK=false
VITE_API_URL=http://localhost:3000
```

```bash
npm run build:admin
```

### Estrutura admin

```
apps/admin/
├── src/
│   ├── pages/          # Login, Projects, Wizard, Detail, Engines, Settings
│   ├── components/     # Shell, StageRail, ConnectionForm, ApiPlayground...
│   └── lib/            # api.ts, mock.ts, types.ts
packages/ui/
└── src/theme.css       # tokens Tailwind compartilhados (dark/cyan)
```

## Configurar Telegram

### 1. Criar o bot

1. No Telegram, fale com [@BotFather](https://t.me/BotFather)
2. Envie `/newbot` e siga as instruções
3. Copie o **token** (ex: `7123456789:AAH...`)

### 2. Obter o Chat ID

**Opção A — Mensagem direta (recomendado para testes):**

1. Envie qualquer mensagem para o seu bot
2. Abra no navegador:
   ```
   https://api.telegram.org/bot<SEU_TOKEN>/getUpdates
   ```
3. Copie o `"chat":{"id":123456789}` — esse número é o `TELEGRAM_CHAT_ID`

**Opção B — Grupo ou canal:**

1. Adicione o bot ao grupo/canal
2. Envie uma mensagem no grupo
3. Use o mesmo `getUpdates` — o `chat.id` de grupos começa com `-` (ex: `-1001234567890`)

### 3. Variáveis de ambiente

Crie `apps/landing/.env.local`:

```env
TELEGRAM_BOT_TOKEN=7123456789:AAH...
TELEGRAM_CHAT_ID=123456789
```

> **Importante:** use `.env.local` — **não** use prefixo `VITE_` no token. Variáveis `VITE_*` ficam expostas no JavaScript do browser.

### 4. Mensagem que você recebe

Cada cadastro chega assim no Telegram:

```
🆕 Novo lead — Synapsee IA

Nome: João Silva
E-mail: joao@empresa.com
Empresa: Acme Ltda
Uso: Expor ERP para agentes no Cursor

📅 25/06/2026, 15:30:00
```

## Deploy (Netlify)

Repositório: [github.com/zmallApi/syn-ladingpage](https://github.com/zmallApi/syn-ladingpage)

### Conectar o site

1. Acesse o [painel Netlify](https://app.netlify.com/teams/zmallapi/builds)
2. **Add new site → Import an existing project**
3. Conecte o GitHub e selecione `zmallApi/syn-ladingpage`
4. O `netlify.toml` na raiz já configura tudo — **não precisa alterar** Base directory, Build command ou Publish directory

### Variáveis de ambiente

Em **Site configuration → Environment variables**, adicione:

| Variável | Valor |
|----------|-------|
| `TELEGRAM_BOT_TOKEN` | Token do @BotFather |
| `TELEGRAM_CHAT_ID` | ID do chat/grupo |

Salve e faça **Trigger deploy** (ou push no `main` dispara automaticamente).

### O que o Netlify faz

| Config | Valor (via `netlify.toml`) |
|--------|---------------------------|
| Base directory | `apps/landing` |
| Build | `npm install && npm run build` |
| Publish | `dist` |
| Functions | `netlify/functions/waitlist.ts` |
| Rota API | `POST /api/waitlist` → function |

Build local:

```bash
npm run build:landing
```

## Estrutura

```
apps/landing/
├── netlify/functions/
│   └── waitlist.ts       # Serverless → Telegram (produção Netlify)
├── api/lib/
│   └── telegram.ts       # Formatação e envio (compartilhado)
├── server/
│   └── dev-api.ts        # API local para desenvolvimento
├── src/
│   ├── components/
│   └── lib/waitlist.ts   # Cliente HTTP do modal
└── .env.example
netlify.toml                # Config de deploy na raiz do repo
```

## Fluxo de conversão

1. Usuário clica **Conectar banco de dados**
2. Modal coleta nome, e-mail, empresa e uso (opcionais)
3. `POST /api/waitlist` → Netlify Function envia mensagem ao Telegram
4. Você recebe a notificação no celular/desktop

## Recuperar os dados

Os leads ficam no **histórico de mensagens do Telegram** (chat com o bot ou grupo configurado). Você pode:

- Buscar por "Novo lead" no Telegram
- Fixar o chat / ativar notificações
- Encaminhar leads para um canal de equipe
