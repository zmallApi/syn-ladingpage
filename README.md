# Synapse — Landing Page

Landing page para validação de demanda do **Synapse**. Leads da lista de espera são enviados para o **Telegram**.

## Quick start

```bash
# Na raiz do monorepo
npm install

# Configure o Telegram (veja abaixo)
cp apps/landing/.env.example apps/landing/.env.local
# edite apps/landing/.env.local com TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID

npm run dev:landing
```

Abre em [http://localhost:5173](http://localhost:5173). A API local roda em `:3001` (proxy automático).

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
🆕 Novo lead — Synapse

Nome: João Silva
E-mail: joao@empresa.com
Empresa: Acme Ltda
Uso: Expor ERP para agentes no Cursor

📅 25/06/2026, 15:30:00
```

## Deploy (Vercel)

1. Importe o repo na [Vercel](https://vercel.com)
2. **Root Directory:** `apps/landing`
3. Adicione as variáveis de ambiente no painel:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
4. Deploy — a rota `/api/waitlist` funciona automaticamente

Build:

```bash
npm run build:landing
```

## Estrutura

```
apps/landing/
├── api/
│   ├── waitlist.ts       # Serverless → Telegram (produção)
│   └── lib/telegram.ts   # Formatação e envio
├── server/
│   └── dev-api.ts        # API local para desenvolvimento
├── src/
│   ├── components/
│   └── lib/waitlist.ts   # Cliente HTTP do modal
└── .env.example
```

## Fluxo de conversão

1. Usuário clica **Conectar banco de dados**
2. Modal coleta nome, e-mail, empresa e uso (opcionais)
3. `POST /api/waitlist` → API envia mensagem ao Telegram
4. Você recebe a notificação no celular/desktop

## Recuperar os dados

Os leads ficam no **histórico de mensagens do Telegram** (chat com o bot ou grupo configurado). Você pode:

- Buscar por "Novo lead" no Telegram
- Fixar o chat / ativar notificações
- Encaminhar leads para um canal de equipe
- Exportar manualmente ou usar um bot de logging (futuro: salvar em planilha via Apps Script)
