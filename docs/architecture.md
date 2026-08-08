# Arquitetura — o porquê

`AGENTS.md` diz o que fazer. Este arquivo diz por quê, para que ninguém "conserte"
uma decisão deliberada. Consulta rara, densidade alta.

---

## Por que `platform/` e não `shared/` ou `common/`

`shared/` é definido por "quem usa" e vira lixeira em três meses. `platform/` é
definido por **capacidade**: cada subpasta é uma capacidade nomeada — persistir,
autenticar, observar, reportar erro, documentar a API. Se algo não cabe em nenhuma
capacidade existente, ou é uma capacidade nova (crie a pasta com nome de
capacidade) ou não é platform.

`platform/utils/`, `platform/helpers/` e `platform/common/` são proibidos pelo
mesmo motivo.

## Por que não há barrel files

`export *` apaga os nomes que reexporta. O agente chega no `index.ts`, não descobre
nada, e volta a grepar dentro da pasta — a mesma busca que podia ter feito de cara,
três hops depois. A única exceção é `*.public.ts`, que usa re-export **nomeado**.

## Por que não há pastas `dto/`, `enums/`, `types/`

São pastas organizadas por *tipo de artefato*, não por conceito. Espalham um
conceito por cinco arquivos e forçam cinco leituras para entender uma coisa só.
`<ctx>.contracts.ts` contém todos os schemas do módulo juntos.

## Por que existe `*.repository.ts` mesmo em módulo trivial

Este é o único lugar onde P5 vence P2 conscientemente: no estágio `simples` o
repository é quase um passa-nada, um hop a mais. Ele fica porque é o que torna
"só o repository fala com o Prisma" **verificável por máquina** — sem ele, a
fronteira do banco vira sugestão. Não funda o repository no service para
economizar um arquivo.

Duas exceções, ambas declaradas nos três checkers: `platform/database/`, que é a
dona da capacidade de persistência (o `PrismaService` estende `PrismaClient`, então
o import é inevitável), e o spec que trava o enum `UserRole`.

## Por que não há path alias

Alias exige resolução em runtime (`tsc-alias`, `module-alias` ou bundler) e mais
uma config para divergir no Vitest, no SWC e no `nest build`. Import relativo
funciona em todo lugar sem config.

**Consequência que você precisa saber:** como os imports são relativos, uma regra
de ESLint `no-restricted-imports` com glob de caminho (`**/modules/*/...`) **não
casa nada** — ela compara a string literal do import, e
`'../notifications/notifications.service'` não contém `modules/`. Por isso a
fronteira entre módulos é enforçada **só** pelo dependency-cruiser. Não readicione
a regra de ESLint achando que ela protege alguma coisa: ela passa verde e não olha
nada (P5).

## Por que não há Passport

`@nestjs/passport` + `passport-jwt` adiciona uma camada de indireção
(strategy → guard → request) que custa dois arquivos e um hop extra para entregar
o que 40 linhas de guard entregam. Passport ganha quando você tem cinco provedores
OAuth. Com JWT próprio, ele só esconde a lógica.

## Por que não há `class-validator`

Duplica a fonte de verdade. Zod entrega tipo e validação juntos, e com `nestjs-zod`
entrega também o DTO e o OpenAPI do mesmo schema.

## Por que `platform/auth` é dono de `UserRole` e de `RefreshToken`

Papel é insumo do **mecanismo de autorização** (`RolesGuard`, `@RequireRoles`,
claim do token), não do domínio de cadastro. Se `UserRole` morasse em
`modules/identity`, `platform/auth` precisaria importar de `modules/` — o que viola
a direção de dependências e quebra o `arch:check`. Não é uma decisão adiada: o lint
decide.

O mesmo vale para o refresh token: sessão é capacidade de plataforma. Por isso
existe `platform/auth/refresh-token.repository.ts`, e a regra do repositório é "só
um arquivo `*.repository.ts`, em qualquer lugar de `src/`".

**A referência cruzada `User` ↔ `RefreshToken` no schema Prisma é declarada de
propósito.** O Prisma exige os dois lados de uma relação, então `identity.prisma`
cita `RefreshToken` e `auth.prisma` cita `User`. Isso não viola a direção de
dependências, que é sobre imports de TypeScript em `src/`. A alternativa (guardar
só `userId String` sem relação) custaria a FK e o `onDelete: Cascade`, o que é pior.

## Por que a rotação de refresh token é assim

Com argon2 (salt aleatório) **não existe busca por hash** — `findUnique({ tokenHash })`
é impossível. Daí o algoritmo:

1. **Emissão:** gera `jti` e `familyId`, assina um JWT com os dois, grava a linha
   `RefreshToken` com `id = jti` e `tokenHash = argon2id(jwt)`.
2. **Uso:** valida a assinatura → extrai `jti` → `findUnique({ id: jti })` →
   `argon2.verify(row.tokenHash, jwt)`. A busca é por **id**; o hash só confirma.
3. Linha inexistente, expirada, ou hash que não bate → `401`.
4. **Reuse detection:** linha existe mas `revokedAt != null` → o token já foi usado,
   o que só acontece se vazou. Revoga a **família inteira**, loga `warn` com
   `userId` e `familyId`, devolve `401`. O legítimo e o atacante são deslogados
   juntos, de propósito.
5. **Caso feliz:** revoga a linha atual e emite um par novo na mesma família, dentro
   de uma transação.

`argon2` sobre um token de 256 bits é caro sem necessidade, mas mantém uma única
primitiva de hash no projeto. Se o custo aparecer em profiling, a alternativa
aceitável é `sha256` **só para refresh token** — a regra "nunca SHA" existe para
senha humana de baixa entropia, não para segredo aleatório. Não troque sem medir.

## Por que a ordem dos `APP_GUARD` importa

Nest executa guards globais **na ordem de registro**. `RolesGuard` lê
`request.authenticatedUser`, que só existe depois do `JwtAuthGuard`. Inverter faz
toda rota com `@RequireRoles` estourar `undefined`.

`AuthModule` é `@Global()` porque os guards são instanciados no escopo do
`AppModule` e dependem de `AccessTokenService`. Sem isso a aplicação não sobe —
falha de DI no boot, com mensagem confusa.

`RolesGuard` sem `@RequireRoles` na rota **libera qualquer usuário autenticado**:
autenticação é default-deny, autorização por papel é opt-in explícito. É
intencional e está escrito porque não é óbvio.

## Por que `/health` fica fora do `/v1`

Probe de load balancer e de orquestrador não deve mudar quando a API virar `v2`.
O prefixo é aplicado com `exclude` explícito para as duas rotas de health, e elas
levam `@PublicRoute()` — esquecer isso é o erro clássico: passa em desenvolvimento
e derruba o pod quando o guard global entra.

`configureApiPrefix` mora em `platform/openapi/openapi-document.factory.ts`, ao lado
de `buildOpenApiDocument`, porque as duas funções descrevem a mesma coisa: o formato
da superfície pública. Com o prefixo aplicado só no `main.ts`, o `openapi.json`
emitido saía sem `/v1` e mentia sobre a API servida.

## Por que o `openapi.json` é gerado com `tsc`, não com `tsx`

`tsx` roda sobre esbuild, que **não implementa `emitDecoratorMetadata`**. Sem
`design:paramtypes`, duas coisas quebram em silêncio:

- O Nest instancia todo controller com zero dependências. Não falha no boot —
  falha na primeira request, com `undefined` no lugar do service.
- O `@nestjs/swagger` não enxerga o tipo do `@Body()`, e o documento sai **sem
  nenhum `requestBody`**.

O segundo é pior, porque o `openapi.json` é commitado e o SDK do app é gerado dele:
o contrato mentia sem ninguém perceber. Por isso `openapi:generate` compila com
`tsconfig.openapi.json` (o mesmo compilador do build) e roda o JS resultante.

Os schemas de resposta saem com sufixo `_Output` (`AuthTokens_Output`). É a
convenção do `nestjs-zod` para separar formato de entrada e de saída; não é
configurável em `cleanupOpenApiDoc`, que só aceita `version`.

## Por que Prisma 6, e quando subir para 7

O Prisma 7 é a major atual, mas invalida quatro decisões deste repositório de uma
vez: `@prisma/client` deixa de ser um especificador válido (vira um caminho
gerado), o que transforma a regra do ESLint, a do dependency-cruiser e a do
`check-conventions.sh` em **checkers que não podem falhar** (P5); exige
`"type": "module"` e `module: ESNext`, contra o `module: commonjs` que o
`emitDecoratorMetadata` do NestJS 11 usa; e substitui o `package.json#prisma` por
`prisma.config.ts`.

**Critério de saída:** subir quando o NestJS documentar ESM oficialmente — o
candidato natural é a major 12. Aí a migração é uma tarefa própria, com os três
checkers reescritos junto.

## Por que TypeScript 5, não 7

`typescript-eslint` declara peer `typescript >=4.8.4 <6.1.0`. Com TS 7 o lint
type-aware simplesmente não roda — e ele é metade das regras de tipagem do
`AGENTS.md`. Subir só quando o `typescript-eslint` suportar.

`esModuleInterop` está ligado porque `supertest` e `argon2` são CommonJS puro: sem
ele o import resolve para um tipo desconhecido e a família `no-unsafe-*` estoura no
arquivo inteiro. Não afrouxa checagem nenhuma — só ensina o compilador a ler CJS.

## Por que Node 24

v22 entrou em maintenance em 2025-10-21 e morre em 2027-04-30; v24 é o LTS ativo
até 2028-04-30. Local, Dockerfile e CI usam a mesma major de propósito: divergir aí
produz bug que só aparece no container.

## Por que `tsconfig.build.json` existe

Sem ele, o `include` amplo do `tsconfig.json` (que precisa cobrir `test/`,
`scripts/` e `prisma/` para o typecheck) faz o `rootDir` inferido subir para a raiz,
e o build sai em **`dist/src/main.js`** — enquanto o script `start` e o `CMD` do
Dockerfile apontam para `dist/main.js`. `pnpm build` verde, container que não sobe.

## Por que o runner do Docker gera o client do Prisma

`COPY --from=builder /app/node_modules/.prisma` **não funciona com pnpm**: o client
gerado fica dentro do store `node_modules/.pnpm/...` e `.prisma` é link, não pasta
copiável. A imagem subia e quebrava na primeira query. Por isso o `prisma` (CLI) é
dependência de **produção**, não de dev — e de quebra o mesmo binário permite
`prisma migrate deploy` dentro do container.

## Por que `allowBuilds` no `pnpm-workspace.yaml`

pnpm 10+ não roda script de install sem autorização, e no pnpm 11 um build ignorado
e não declarado é **erro** — `pnpm install --frozen-lockfile` falha no Docker e no
CI. `allowBuilds` é o nome atual; `onlyBuiltDependencies` e
`ignoredBuiltDependencies` são grafias do pnpm 10 que ainda aparecem no
`pnpm config list` mas não têm efeito nenhum.

## Por que o E2E está dividido em dois arquivos

Todos os requests da suíte saem do mesmo IP e consomem a cota de `register` e
`login` (5/min) antes de chegar no teste de 429 — resultado: intermitência.
`identity.e2e-spec.ts` desliga o `ThrottlerGuard` na construção do módulo de teste;
`rate-limit.e2e-spec.ts` não desliga e testa só o 429. Com `fileParallelism: false`
os dois não competem.

Os corpos de resposta são parseados com os mesmos schemas Zod que as rotas
declaram: assim a suíte checa o contrato, não só o status code — e o `body: any` do
supertest não contamina o teste.

Não teste o repository isoladamente com Prisma mockado: o mock testa o mock.
Cobertura de persistência vem do E2E.

## Crescer quando doer, não antes

| Estágio | Quando | O que aparece |
|---|---|---|
| **1. simples** | CRUD, sem regra além de validação de formato | os 7 arquivos do padrão |
| **2. regras** | regras de negócio vazando para dentro do service | value objects em `<ctx>.domain.ts` |
| **3. agregado** | invariantes que cruzam campos, transições de estado, edição concorrente | agregado + eventos + `version` para optimistic locking |

`identity` nasce e permanece no estágio **simples**. O estágio 2 introduz o papel
`domain`, que hoje **não** está na lista fechada de papéis — quem chegar lá
pergunta antes.

## O que não é verificável por máquina

Três coisas não têm checker, e isso é escolha consciente em vez de promessa vaga.
São os três itens de checklist de PR:

1. "Uma das palavras do símbolo é do domínio" — o script checa contagem de
   palavras, não semântica. `DataProcessor` passa no script e é ruim.
2. "Comentário explica o porquê, não o quê."
3. "O módulo está no estágio certo" (simples / regras / agregado).

Qualquer outra regra que aparecer sem checker é bug — abra issue.
