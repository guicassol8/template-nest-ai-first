<div align="center">

# template-nest-ai-first

**Esqueleto de API NestJS desenhado para ser mantido por agentes de IA — não por um humano com IDE.**

Autenticação JWT completa, fronteiras arquiteturais verificadas por máquina e zero regra de negócio.

[![ci](https://github.com/guicassol8/template-nest-ai-first/actions/workflows/ci.yml/badge.svg)](https://github.com/guicassol8/template-nest-ai-first/actions/workflows/ci.yml)
![node](https://img.shields.io/badge/node-24_LTS-5FA04E?logo=nodedotjs&logoColor=white)
![nestjs](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![typescript](https://img.shields.io/badge/TypeScript-5.9_strict-3178C6?logo=typescript&logoColor=white)
![zod](https://img.shields.io/badge/Zod-4-3E67B1)
![prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![license](https://img.shields.io/badge/license-MIT-black)

</div>

---

## A ideia

A maioria dos templates de NestJS otimiza para o humano que vai ler o código. Este
otimiza para o **agente que vai editá-lo**: alguém que não tem "go to definition",
que busca strings e lê janelas de arquivo, e cujo custo real não é a linha — é o
número de arquivos que precisa abrir para entender uma coisa só.

Três consequências práticas:

| | |
|---|---|
| 🧭 **Toda regra tem checker** | Fronteira que não é verificada por máquina não existe. E checker que não pode falhar é pior que checker nenhum — cada um deles tem um teste do próprio checker. |
| 📉 **Custo medido em hops** | Um conceito mora em um arquivo. Sem `dto/`, sem `interfaces/`, sem barrel file, sem path alias. Reduzir 7 arquivos lidos para 2 vale mais que reduzir 500 linhas para 300. |
| 📖 **O caminho feliz é escrito** | [`docs/recipes.md`](docs/recipes.md) tem um playbook por tarefa recorrente, **com a contagem de arquivos esperada**. Abriu mais que o previsto? Ou o playbook está errado, ou a estrutura está. |

---

## O que já vem pronto

**Autenticação**
- Registro, login, refresh, logout e `me` — JWT próprio, **sem Passport**
- Refresh token rotativo persistido com **reuse detection por família**: token
  reapresentado derruba a sessão inteira
- `argon2id` para senha, e o caminho do email inexistente gasta um hash falso para
  não vazar quais emails existem por timing
- RBAC com guard global default-deny (`@PublicRoute()` é opt-out explícito)
- Rate limit de 5 req/min nas rotas públicas que chamam argon2

**Contratos**
- Zod como fonte única: um schema gera tipo, DTO, validação e OpenAPI
- Erros em [RFC 9457 problem details](https://www.rfc-editor.org/rfc/rfc9457), com
  `x-request-id` propagado no campo `instance`
- `openapi.json` **commitado** e verificado no CI — quem mudar a superfície da API
  sem regenerar tem o build quebrado

**Infra**
- Prisma 7 com multi-file schema e driver adapter (a URL do banco passa pelo
  ambiente validado, não por `env()` dentro do schema), Postgres via Compose,
  imagem Docker que roda como usuário não-root
- Logs estruturados com `pino`, com redaction de `authorization`, `password` e
  tokens
- `/health` (liveness) e `/health/ready` (checa o Postgres), fora do prefixo `/v1`

**Disciplina**
- TypeScript `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- ESLint type-aware: `any`, `as`, `!` e `@ts-ignore` são **erro**, não aviso
- `dependency-cruiser` + `check-conventions.sh` para o que o lint não pega
- Hooks nativos de git: `verify:fast` no commit, `verify` no push, conventional
  commits validado por regex

---

## Começando

```bash
# 1. Node 24 e pnpm
nvm use 24 && corepack enable pnpm

# 2. Dependências e ambiente
pnpm install
cp .env.example .env

# 3. Postgres + client + schema + admin
docker compose up -d
pnpm prisma generate
pnpm db:deploy
pnpm db:seed

# 4. Subir
pnpm dev
```

`GET http://localhost:3000/health` responde `200`, e a documentação interativa fica
em `http://localhost:3000/docs`.

> **Porta 5432 ocupada?** Crie um `docker-compose.override.yml` (já gitignorado) com
> `services: { postgres: { ports: !override ['5433:5432'] } }` e ajuste a
> `DATABASE_URL`.

### Experimente o fluxo

```bash
curl -X POST localhost:3000/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"uma-senha-boa-123"}'
```

```jsonc
{ "accessToken": "eyJ…", "refreshToken": "eyJ…", "expiresInSeconds": 900 }
```

Um erro sai assim — e o cliente decide o comportamento pelo `type`, nunca pelo
`title`:

```jsonc
{
  "type": "https://api.example.app/problems/email-already-registered",
  "title": "Email já cadastrado",
  "status": 409,
  "instance": "0f1c8b2e-…"   // = x-request-id, é o que o suporte pede ao usuário
}
```

---

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | sobe em watch |
| `pnpm build` | compila para `dist/main.js` |
| `pnpm verify:fast` | lint + typecheck (roda no `pre-commit`) |
| `pnpm verify` | + testes, fronteiras e OpenAPI (roda no `pre-push`) |
| `pnpm test` / `pnpm test:e2e` | unit / E2E (E2E precisa do Postgres de pé) |
| `pnpm arch:check` | dependency-cruiser + convenções textuais |
| `pnpm openapi:generate` | regenera o `openapi.json` commitado |
| `pnpm db:migrate --name x` | cria uma migration |

---

## Estrutura

```
src/
├── main.ts
├── app.module.ts
├── modules/            domínio — um contexto por pasta
│   └── identity/       usuário e credencial (o único módulo deste esqueleto)
└── platform/           infraestrutura, organizada por CAPACIDADE
    ├── auth/           papéis, tokens, hashing, guards
    ├── config/         ambiente validado por Zod no boot
    ├── database/       PrismaService e readiness
    ├── http-errors/    problem details
    ├── openapi/        montagem do documento
    └── observability/  logging e health
```

Três regras, todas verificadas pelo `pnpm arch:check`:

```
modules/*  ──pode importar──▶  platform/*
platform/* ──NUNCA importa──▶  modules/*
modules/a  ──só importa──▶     modules/b/b.public.ts
```

E todo `.ts` em `src/` se chama `<conceito>.<papel>.ts`, com `<papel>` numa **lista
fechada**: `module`, `controller`, `service`, `repository`, `contracts`, `public`,
`guard`, `decorator`, `filter`, `factory`, `assert`. Só `src/main.ts` escapa.

---

## Como usar como template

Clique em **Use this template** e depois ajuste:

1. `package.json` → `name` e `description`
2. `PROBLEM_TYPE_BASE` em `src/platform/http-errors/problem-details.contracts.ts` →
   o domínio da sua API
3. `USER_ROLES` em `src/platform/auth/user-role.contracts.ts` → o vocabulário de
   papéis do seu produto (o padrão é `admin` e `user`) e o enum equivalente em
   `prisma/schema/auth.prisma`
4. Gere segredos de verdade: `openssl rand -hex 32`
5. Escreva o primeiro módulo seguindo
   [`docs/recipes.md` → *Adicionar um módulo de domínio novo*](docs/recipes.md)

---

## Documentação

| Arquivo | Para quem, e quando |
|---|---|
| [`AGENTS.md`](AGENTS.md) | O agente, **toda sessão**. Regras, comandos, proibições. `CLAUDE.md` é um ponteiro de uma linha para ele. |
| [`docs/recipes.md`](docs/recipes.md) | Antes de qualquer tarefa recorrente. Playbook com contagem de arquivos. |
| [`docs/architecture.md`](docs/architecture.md) | Quando você quiser mudar algo e precisar saber **por que** está assim. |
| [`docs/api-conventions.md`](docs/api-conventions.md) | Erro, paginação, versionamento, datas. |

O `AGENTS.md` abre com um **protocolo de dúvida**: o agente tem permissão explícita
e ilimitada de interromper, com uma lista de gatilhos em que ele deve parar e
perguntar em vez de adivinhar. Uma pergunta custa 30 segundos; uma suposição errada
sobre contrato ou banco custa uma migration corretiva.

---

## O que este repositório deliberadamente NÃO tem

Busca textual encontra código; não encontra a ausência de código. Sem isto escrito,
um agente propõe Redis na primeira tarefa de performance.

Não existe aqui, e é intencional: **regra de negócio**, módulos além de `identity`,
path alias, fila/worker/cron, email, storage de objeto, multi-tenancy, cadastro de
admin via API, soft delete, auditoria, i18n de mensagem de erro, refresh via cookie
`httpOnly` (o cliente é mobile e guarda no keychain), Passport, `class-validator` e
geradores de código.

O porquê de cada ausência está em [`docs/architecture.md`](docs/architecture.md).

---

<div align="center">
<sub>MIT</sub>
</div>
