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
4. **Reuse detection com janela de graça:** linha existe mas `revokedAt != null` →
   o token já foi usado. Dentro de `JWT_REFRESH_REUSE_GRACE_SECONDS` (60s por
   default) isso é lido como retry de rede — o app mandou o refresh, a resposta
   com o par novo se perdeu, e ele só tem o token antigo para reapresentar.
   Nasce outro token na mesma família e ninguém é deslogado. Fora da janela só
   sobra roubo: **apaga a família inteira** (deleta as linhas — `revokedAt`
   preenchido significa "revogado por rotação" e dá direito à graça, então
   família morta não pode ficar marcada, ou logout e roubo ressuscitariam por
   ela), loga `warn` com `userId` e `familyId`, devolve `401` — o legítimo e o
   atacante caem juntos, de propósito.
5. **Caso feliz:** revoga a linha atual e emite um par novo na mesma família, numa
   transação — e a revogação é **condicional** (`revokedAt: null` no where). Se
   nenhuma linha foi afetada, um refresh concorrente ganhou a corrida um instante
   atrás; por construção isso está dentro da janela de graça e vira retry também.
   Sem a condição, dois refreshes simultâneos com o mesmo token passariam calados
   e a reuse detection nunca dispararia.

A janela de graça é uma decisão de UX com custo declarado: um atacante que use o
token roubado nos primeiros 60s depois de uma rotação ganha um ramo válido sem
soar alarme. Na mesma linha, **a sessão não tem teto absoluto de propósito** —
cada rotação emite um refresh com TTL cheio, então quem abre o app pelo menos uma
vez por mês permanece logado indefinidamente (estilo rede social, não banco).
Forçar redigitar a senha a cada N dias foi considerado e recusado em favor da UX
do app mobile. Se a política mudar, o instante de nascimento da família pode
viajar como claim assinada no próprio JWT e virar `min(TTL, teto)` na emissão —
sem migration.

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

## Prisma 7: o que muda, e por que o CommonJS sobreviveu

O medo era que o Prisma 7 forçasse ESM e brigasse com o `emitDecoratorMetadata`
do NestJS. Não força: o generator `prisma-client` aceita
`moduleFormat = "cjs"`, e todo o resto do projeto continua CommonJS.

O que de fato mudou:

- **O client é código no repositório**, não um pacote em `node_modules`. Ele é
  gerado em `src/generated/prisma` (dentro de `src/` porque é TypeScript e o
  build precisa dele sob o `rootDir`), está no `.gitignore`, e é produzido por
  `pnpm prisma generate`.
- **`@prisma/client` deixou de ser um especificador de import.** Os três checkers
  foram reescritos para o caminho gerado. O import é relativo
  (`../../generated/prisma/client`) e, ao contrário da fronteira entre módulos, a
  string **contém** `generated/prisma/` — então aqui um glob de
  `no-restricted-imports` casa de verdade. Foi testado: os três reprovam um import
  fora de `*.repository.ts`, `*.spec.ts` e `platform/database/`.
- **A URL saiu do schema** e foi para `prisma.config.ts`. Em runtime quem conecta é
  o driver adapter (`@prisma/adapter-pg`) recebendo a URL do
  `ConfigService` validado — antes o `PrismaClient` lia `process.env` por baixo do
  pano, via `env()` no schema. É mais uma leitura de ambiente que passou a ser
  validada no boot.
- **O `prisma.config.ts` lê `process.env` direto, não o helper `env()` do Prisma.**
  O helper lança ao *carregar* o config quando a variável não existe, e isso
  quebraria `prisma generate` em qualquer lugar sem banco — o build do Docker, por
  exemplo. Generate não precisa de conexão.
- **`migrations.path` é explícito.** Com schema em pasta, o default oscila entre
  `prisma/migrations` e `prisma/schema/migrations`.
- **O runner do Docker ficou mais simples**: sem `prisma generate`, porque o client
  já está compilado em `dist/`. O CLI voltou a ser devDependency e migration roda
  no CI, não a partir do container da aplicação.

Custo conhecido: a imagem de produção passou de 1.6 GB para 1.9 GB. O CLI `prisma`
é peer **opcional** do `@prisma/client` e, com `autoInstallPeers`, volta para a
imagem mesmo estando em devDependencies. Cortar isso exige desligar
`autoInstallPeers` no lockfile inteiro — não fizemos, e fica registrado aqui.

## Por que TypeScript 5, não 7

`typescript-eslint` declara peer `typescript >=4.8.4 <6.1.0`. Com TS 7 o lint
type-aware simplesmente não roda — e ele é metade das regras de tipagem do
`AGENTS.md`. Subir só quando o `typescript-eslint` suportar.

`module`/`moduleResolution` são `node16`, não o antigo `node`/`node10`: o node10
está deprecado e **para de funcionar no TypeScript 7**. Sem `"type": "module"` no
`package.json`, o `node16` continua emitindo CommonJS — a saída e o `openapi.json`
saem byte a byte iguais.

O schema do Prisma é apontado por `prisma.config.ts` (`package.json#prisma`
morreu no Prisma 7), e a URL de conexão não mora mais no bloco `datasource` —
saiu do schema junto com a major 7; ver a seção "Prisma 7" acima.

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

## Por que os hooks resolvem o `pnpm` na mão

O git executa hooks com um PATH mínimo e não carrega nvm, fnm, volta nem asdf.
Como o `pnpm` deste projeto vem do corepack de dentro da instalação do Node
gerenciada, ele **some no hook** mesmo funcionando no terminal — e some sempre
quando o commit ou o push sai da UI do VS Code, que nem lê o rc do shell. O
sintoma é `pnpm: comando não encontrado` no `pre-push`.

`.githooks/resolve-pnpm.sh` procura o `pnpm` nos layouts usuais dos gerenciadores
de versão, dando preferência à major declarada no `.nvmrc`. Isso conserta um
segundo problema de tabela: sem ele, o `node` que sobrava no PATH era o do
sistema, que pode nem ser a major que o projeto declara.

Quando não encontra, o hook **falha com instrução** em vez de pular a
verificação. Hook que se desliga sozinho é um checker que não pode falhar.

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
