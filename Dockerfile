FROM node:24-slim AS base
RUN corepack enable && apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# No Prisma 7 o generate emite TypeScript em src/generated/, que o build compila
# junto. Por isso ele vem antes do build — e some do estágio final.
RUN pnpm prisma generate && pnpm build

FROM base AS runner
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
# Sem `prisma generate` aqui: no Prisma 7 o client já está compilado dentro de
# dist/. O CLI está em devDependencies, então migration roda no CI
# (`pnpm db:deploy`), não a partir do container da aplicação.
COPY --from=builder /app/dist ./dist
USER node
CMD ["node", "dist/main.js"]
