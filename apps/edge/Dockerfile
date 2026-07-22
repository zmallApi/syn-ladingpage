FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/edge/package.json apps/edge/
COPY packages/core/package.json packages/core/
RUN npm install --workspace=@synapse/edge --include-workspace-root=false

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/core ./packages/core
COPY apps/edge ./apps/edge
WORKDIR /app/apps/edge
CMD ["npx", "tsx", "src/main.ts"]
