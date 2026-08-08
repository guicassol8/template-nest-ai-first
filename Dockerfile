FROM node:24-slim AS base
RUN corepack enable && apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm prisma generate && pnpm build

# O runner gera o client ele mesmo. Copiar node_modules/.prisma do builder não
# funciona com pnpm: o client gerado mora dentro do store .pnpm e .prisma é
# link, não pasta copiável — a imagem subia e quebrava na primeira query.
FROM base AS runner
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --prod && pnpm prisma generate
COPY --from=builder /app/dist ./dist
USER node
CMD ["node", "dist/main.js"]
