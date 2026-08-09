# AGENTS.md

Esqueleto de API NestJS com autenticação JWT. **Não há regra de negócio aqui** —
só `modules/identity` (usuário e credencial) e a infraestrutura ao redor. Módulos
de domínio são adicionados seguindo o padrão de `docs/recipes.md`.

O mantenedor principal deste repositório é um agente com `ripgrep`, não um humano
com IDE. Tudo abaixo existe por causa disso.

---

## 1. Na dúvida, pergunte

**Você tem permissão explícita e ilimitada de interromper.** Não existe limite de
perguntas, não existe "isso é básico demais para perguntar". Preferimos dez
perguntas a uma suposição. Uma pergunta custa 30 segundos; uma suposição errada
sobre contrato, banco ou segurança custa uma migration corretiva, um breaking
change num app já publicado na loja, ou um endpoint vazado.

### Gatilhos — pare e pergunte, sem exceção

- Este arquivo não cobre o caso, contradiz a realidade (biblioteca mudou, tipo não
  bate), ou deixa dois caminhos válidos em aberto.
- A tarefa só sai violando algo daqui, ou exige inventar um nome de conceito novo.
- Adicionar, remover ou trocar a major de uma dependência.
- Mudar um contrato que já está no `openapi.json` commitado.
- Migration destrutiva: `DROP`, `RENAME`, mudança de tipo de coluna, backfill.
- Qualquer decisão de segurança: segredo, TTL, permissão, política de token.
- O playbook de `docs/recipes.md` prevê N arquivos e você precisa do N+1.
- Um teste ou um checker falha e a correção "óbvia" seria afrouxá-lo.
- Você está prestes a escrever `any`, `as`, `@ts-expect-error`, `eslint-disable`
  ou `--no-verify`.

### Formato da pergunta

```
Contexto: <1 linha — onde você está e o que trava>
Opção A: <o que é> — <trade-off em 1 linha>
Opção B: <o que é> — <trade-off em 1 linha>
Recomendo: <A ou B> porque <1 linha>
Enquanto espero: <parado / sigo na tarefa X, que não depende disso>
```

### Proibido no lugar de perguntar

Implementar as duas opções "para escolherem depois"; deixar `TODO`, `FIXME`,
placeholder ou stub silencioso; seguir com a suposição e "reportar no fim" (no fim
já custou caro); perguntar e continuar codando a resposta que você supôs.

### Quando é permitido decidir sozinho

Só quando as três forem verdadeiras: (1) reversível editando um arquivo, (2) não
toca contrato de API, banco nem segurança, (3) não cria nome novo de domínio.
Mesmo assim, **liste as decisões assim tomadas ao fim da tarefa**, uma linha cada.

---

## 2. Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | sobe em watch |
| `pnpm build` | compila para `dist/main.js` (usa `tsconfig.build.json`) |
| `pnpm verify:fast` | lint + typecheck — roda no `pre-commit` |
| `pnpm verify` | `verify:fast` + test + arch + openapi — roda no `pre-push` |
| `pnpm test` / `pnpm test:e2e` | unit / E2E (E2E precisa do Postgres de pé) |
| `pnpm arch:check` | dependency-cruiser + `scripts/check-conventions.sh` |
| `pnpm openapi:generate` | regenera `openapi.json` (commitado) |
| `pnpm db:migrate --name x` | cria migration |
| `pnpm prisma generate` | (re)gera o client em `src/generated/` — não commitado |
| `pnpm db:deploy` / `pnpm db:seed` | aplica migrations / cria o admin |

Postgres local: `docker compose up -d`. Copie `.env.example` para `.env`. Porta
5432 ocupada? `docker-compose.override.yml` (gitignorado) com
`ports: !override ['5433:5432']`.

**`--no-verify` é proibido** em commit e em push. Se o hook trava, o problema é o
código ou a regra — nos dois casos, pergunte.

---

## 3. Commits

**Commitar é sua responsabilidade, não do mantenedor.** Sempre que fechar uma
unidade coerente, commite — sem pedir permissão e sem esperar o fim da tarefa.
Trabalho não commitado é trabalho que some no primeiro erro de sessão.

```
<type>(<scope>): <descrição no imperativo, em inglês, minúscula, sem ponto final>
```

Máximo 72 caracteres na primeira linha. Validado por `.githooks/commit-msg`.

`<type>`, lista fechada: `feat` (comportamento novo visível na API), `fix`,
`refactor` (mesmo comportamento), `test` (cobre algo que já existia), `docs`
(`AGENTS.md`, `docs/**`, README, `openapi.json`), `build` (Docker, dependência,
`tsconfig`), `ci` (workflow), `chore` (lint, hooks, scripts).

`<scope>` é **módulo ou capacidade**, nunca arquivo nem pasta: `identity`, `auth`,
`database`, `http-errors`, `observability`, `openapi`, `config`, `platform`
(quando cruza várias), `repo` (quando é raiz).

Commite quando: uma capacidade nomeada passou a existir e compilar; uma decisão de
configuração fechou; um comportamento ganhou o teste dele (**mesmo commit**, nunca
um "add tests" depois); uma migration foi gerada; você vai começar algo diferente;
você vai perguntar algo e ficar parado esperando. Não commite meia refatoração,
arquivo com import quebrado, nem `WIP`.

Breaking change leva `!` depois do escopo e rodapé `BREAKING CHANGE:` — mas é
**gatilho de pergunta antes** de virar commit: o cliente é um app publicado em
loja e você não controla o rollout.

---

## 4. Mapa

```
docs/           architecture.md (o porquê) · api-conventions.md · recipes.md
prisma.config.ts  schema, migrations e datasource do Prisma
prisma/         schema/*.prisma · migrations/ · seed.ts
scripts/        emit-openapi-document.ts · check-conventions.sh
test/           identity.e2e-spec.ts · rate-limit.e2e-spec.ts
openapi.json    COMMITADO, gerado, verificado no CI
src/
├── main.ts · app.module.ts
├── modules/<ctx>/   9 arquivos: AGENTS.md, CLAUDE.md e <ctx>.{module,controller,
│                    contracts,service,repository,public}.ts + <ctx>.service.spec.ts
└── platform/        infraestrutura por CAPACIDADE, nunca por tipo de artefato
    ├── auth/        papéis, tokens, hashing, guards, decorators
    ├── config/      ambiente validado no boot
    ├── database/    PrismaService e readiness
    ├── http-errors/ problem details, filter e o decorator de erros
    ├── openapi/     prefixo /v1 e montagem do documento
    └── observability/  logging e health
```

O único módulo de domínio é `identity` (usuário e credencial). Cada módulo tem seu
próprio `AGENTS.md` — leia o do módulo antes de mexer nele.

### Papéis de arquivo — lista fechada

Todo `.ts` em `src/` se chama `<conceito>.<papel>.ts`, kebab-case, com `<papel>` em:
`module`, `controller`, `service`, `repository`, `contracts`, `public`, `guard`,
`decorator`, `filter`, `factory`, `assert`. `.spec` é permitido antes do `.ts`.
Única exceção: `src/main.ts`. Precisa de um papel novo? É gatilho de pergunta.

### Direção de dependências (verificada pelo `arch:check`)

```
modules/*  ──pode importar──▶  platform/*
platform/* ──NUNCA importa──▶  modules/*
modules/a  ──só importa──▶     modules/b/b.public.ts
```

`platform/` não conhece domínio. Nunca `platform/utils/`.

---

## 5. Princípios

- **P1** Otimize para busca textual, não para navegação em árvore.
- **P2** O custo é hop, não linha: 7 arquivos → 2 vale mais que 500 linhas → 300.
- **P3** Módulo profundo, não pequeno. Cinco arquivos que só re-exportam estão errados.
- **P4** Uma fonte de verdade por conceito — vale para documentação também.
- **P5** Fronteira sem checker não existe. E **checker que não pode falhar é pior
  que checker nenhum**: produz confiança falsa.
- **P6** O caminho feliz é escrito, não descoberto (`docs/recipes.md`).
- **P7** Perguntar é barato. Adivinhar custa refatoração.

---

## 6. Tipagem — o compilador é o primeiro revisor

A lista completa de proibições está na seção 8. O que precisa de explicação:

- **`unknown` na borda, tipo forte dentro.** Tudo que entra de fora do processo
  (HTTP, env, JWT decodificado, resposta de terceiro) passa por `Schema.parse()`
  antes de virar tipo. Se um tipo é desconhecido, ele é `unknown` — nunca `any`.
- **`catch (error: unknown)`** sempre, estreitado com `instanceof` antes de ler
  `.message`.
- **`switch` sobre union é exaustivo**, com `default` chamando
  `assertNeverReached(value)` — assim adicionar um valor novo à union quebra o
  build, que é o objetivo. O helper **ainda não existe**: hoje não há nenhum
  switch sobre union no código, e código morto é o que o P3 proíbe. Crie
  `platform/http-errors/never-reached.assert.ts` junto com o primeiro switch,
  seguindo a receita em `docs/recipes.md`.
- **Tipo de retorno explícito** em todo método de service, repository e controller,
  e em toda função exportada.
- **Sem tipo estrutural anônimo repetido** — se o mesmo `{ a: string; b: number }`
  aparece duas vezes, vira schema Zod nomeado em `*.contracts.ts`.
- **`readonly` no que não muda.** Propriedade injetada é `private readonly`.

`getRequest()` sempre tipado: `getRequest<Request>()`, com a augmentation de
`platform/auth/authenticated-user.contracts.ts`. E não habilite
`consistent-type-imports` globalmente: converter `import { Foo }` em
`import type { Foo }` quebra a DI de classe injetada, que precisa existir em runtime
para o `emitDecoratorMetadata`.

### Nomes

Símbolo **exportado** tem 2–3 palavras, uma delas do domínio (`verifyAccessToken`,
`AccessTokenService`, `USER_ROLES`); nunca `create`, `handle`, `Data`, `Result`,
`Helper`. Vale para **valor** exportado, não para `type`/`interface` de entidade —
`export type User` está certo.

Um nome por conceito. **Código em inglês; documentação para humanos em português** —
inclui rota, valor de enum, campo de contrato, coluna e chave de log. Teste com o
nome do fonte, no mesmo diretório. Comentário de uma linha na definição, explicando
o **porquê**.

---

## 7. Ponteiros

- Tarefa recorrente (campo novo, rota nova, módulo novo, erro novo) →
  **`docs/recipes.md`**, sempre antes de começar.
- Por que a arquitetura é assim, o que já foi tentado, quando trocar de versão →
  **`docs/architecture.md`**.
- Formato de erro, paginação, versionamento, datas → **`docs/api-conventions.md`**.

---

## 8. O que NÃO fazer

```
NA DÚVIDA, PERGUNTE. Sempre, quantas vezes precisar. Nenhuma tarefa aqui
tem pressa que justifique um chute.

As regras das seções 1–7 valem por si e NÃO se repetem aqui: isto é o
complemento delas, não um resumo. Regra duplicada deriva.

NUNCA:
- usar any (nem "temporariamente", nem em teste, nem em mock)
- usar `as` (exceto `as const`), `as unknown as`, `!` de non-null ou @ts-ignore;
  @ts-expect-error só com descrição do porquê
- usar eslint-disable sem nomear a regra e justificar na linha
- desligar flag do tsconfig ou afrouxar checker para a tarefa passar — é pergunta
- criar index.ts / barrel file (exceção: nenhuma) ou usar export *
- criar pasta dto/, interfaces/, enums/, types/, constants/, utils/, helpers/,
  shared/ ou common/
- usar PrismaService ou o client gerado (src/generated/prisma) fora de um
  *.repository.ts (exceções: platform/database/ e o spec que trava o enum
  UserRole)
- expor tipo do Prisma em contrato de API
- usar class-validator, class-transformer ou z.date() em contrato
- empilhar @ZodSerializerDto + @ApiOkResponse (use @ZodResponse)
- ler process.env dentro de src/ (inclusive no main.ts)
- criar rota sem decidir explicitamente se ela leva @PublicRoute()
- reordenar os APP_GUARD (ThrottlerGuard → JwtAuthGuard → RolesGuard)
- colocar /health atrás do prefixo /v1 ou do guard global
- editar uma migration já commitada
- distinguir "email não existe" de "senha errada" na resposta de login
- fazer scaffold de agregado/eventos/CQRS sem invariante declarada
- criar endpoint público de promoção a admin
- adicionar Redis, fila, email ou storage sem necessidade concreta declarada
- adicionar path alias sem resolver a configuração de runtime

SEMPRE:
- schema Zod como fonte única de tipo + validação + doc, com .meta({ id })
- switch exaustivo sobre union, com assertNeverReached no default (ver receita)
- rodar `pnpm verify` antes de dizer que terminou
```

---

## 9. O que este repositório deliberadamente NÃO tem

Busca textual encontra código; não encontra a ausência de código. Um agente que
não lê isto propõe Redis na primeira tarefa de performance.

Não existe aqui, e é intencional: regra de negócio; módulos além de `identity`;
path alias; fila, worker, cron; email; storage; multi-tenancy; cadastro de admin via
API; soft delete; auditoria; i18n de erro; refresh via cookie httpOnly (o cliente é
mobile e guarda no keychain); Passport; `class-validator`; geradores de código;
`.claude/skills/` ou `.claude/rules/`. O porquê está em `docs/architecture.md`.
