# Receitas

Playbook por tarefa recorrente, com a **lista exata de arquivos e a contagem
esperada**. Consulte antes de começar — estrutura boa reduz o custo de achar,
receita elimina a busca (P6).

**Se o playbook prevê N arquivos e você precisa do N+1: pare e reporte.** Ou o
playbook está errado, ou a estrutura está. Os dois são bugs.

Todo playbook termina com `pnpm verify` — não só `verify:fast`. Playbook é tarefa
fechada, não commit intermediário.

---

## Adicionar um campo a uma entidade existente

1. `prisma/schema/<ctx>.prisma` — coluna nova
2. `src/modules/<ctx>/<ctx>.contracts.ts` — campo no schema da entidade (e no
   schema de request, se entra pela API)
3. `src/modules/<ctx>/<ctx>.repository.ts` — mapeamento linha → contrato
4. `<ctx>.service.spec.ts` — só se o campo for **obrigatório**: os fixtures
   tipados como `<Ctx>Record` deixam de compilar sem ele
5. `pnpm db:migrate --name add_<ctx>_<campo>` e `pnpm openapi:generate`

**Arquivos editados: 3, ou 4 se o campo for obrigatório.** Abriu um a mais? Pare
e reporte.

O service **não** entra na conta: a tradução `<Ctx>Record → <Ctx>` usa
`<Ctx>Schema.parse`, que não enumera campos. Se você precisou editar o service,
alguém reintroduziu uma segunda tradução — isso é o bug, não o playbook.

Campo obrigatório em tabela com dados exige default ou backfill — isso é
**migration destrutiva**, que é gatilho de pergunta.

---

## Adicionar uma rota a um módulo existente

1. `<ctx>.contracts.ts` — schema de request/response + DTOs
2. `<ctx>.controller.ts` — handler com `@ZodResponse` e `@ApiStandardErrorResponses`
3. `<ctx>.service.ts` — caso de uso
4. `<ctx>.repository.ts` — só se precisar de query nova
5. `<ctx>.service.spec.ts` — teste, no mesmo commit
6. `pnpm openapi:generate`

**Arquivos editados: 4–5.**

Decida explicitamente se a rota leva `@PublicRoute()`. Se ela exige papel, leva
`@RequireRoles('admin')` — e aí o 403 vai para o E2E do módulo.

---

## Adicionar um módulo de domínio novo

Crie estes 9 arquivos em `src/modules/<ctx>/`:

1. `AGENTS.md` — ~25 linhas: o que o módulo possui, o que **não** possui, o estágio,
   o que expõe no `.public.ts` e por quê
2. `CLAUDE.md` — uma linha: `@AGENTS.md`
3. `<ctx>.module.ts` — importa `DatabaseModule`
4. `<ctx>.contracts.ts` — todos os schemas Zod, DTOs e tipos do módulo
5. `<ctx>.controller.ts`
6. `<ctx>.service.ts`
7. `<ctx>.repository.ts` — **único** arquivo do módulo que toca `PrismaService`
8. `<ctx>.public.ts` — **única** superfície importável por outro módulo
9. `<ctx>.service.spec.ts`

Mais: `prisma/schema/<ctx>.prisma`, registrar o módulo em `src/app.module.ts`,
`pnpm db:migrate --name create_<ctx>` e `pnpm openapi:generate`.

**Arquivos criados: 9 + 1 de schema. Editados: 1, ou 2 se houver relação com uma
entidade de outro módulo** — o Prisma exige os dois lados, então
`prisma/schema/identity.prisma` também ganha a lista (como já ganhou
`refreshTokens RefreshToken[]`). Isso não viola a direção de dependências, que é
sobre imports de TypeScript.

Não crie o décimo `.ts` sem um motivo que caiba em uma frase — e o papel dele tem
que estar na lista fechada.

O módulo nasce no estágio `simples`. Não faça scaffold de agregado, evento ou CQRS
sem invariante declarada.

---

## Expor algo de um módulo para outro

1. `src/modules/<dono>/<dono>.public.ts` — re-export **nomeado** do símbolo
2. `src/modules/<consumidor>/<consumidor>.module.ts` — importar o módulo dono
3. `src/modules/<dono>/<dono>.module.ts` — garantir que o símbolo está em `exports`

**Arquivos editados: 2–3.**

Nunca importe direto de `../<dono>/<dono>.service` — o dependency-cruiser reprova.
Se o que você precisa não está no `.public.ts`, **o dono do módulo decide expor**:
isso é conversa, não edição unilateral.

Nunca exponha o tipo interno de persistência (`<Ctx>Record`) nem tipo do Prisma.

---

## Adicionar um tipo de erro novo

1. `src/platform/http-errors/problem-details.contracts.ts` — nova chave em
   `PROBLEM_TYPES`
2. `src/platform/http-errors/http-problem-details.filter.ts` — só se o erro precisar
   de mapeamento por status (o padrão é o service lançar `ProblemDetailsException`)
3. o service que lança
4. `pnpm openapi:generate`

**Arquivos editados: 2–3.**

`type` novo é **mudança de contrato**: o app decide comportamento por ele. Pergunte
antes.

---

## Adicionar um papel novo

1. `src/platform/auth/user-role.contracts.ts` — valor em `USER_ROLES`
2. `prisma/schema/auth.prisma` — valor no `enum UserRole`
3. `pnpm db:migrate --name add_user_role_<papel>` e `pnpm openapi:generate`

**Arquivos editados: 2.**

`user-role.contracts.spec.ts` trava a sincronia entre o Zod e o Prisma: se você
mexer em um só, o teste quebra. Valor de enum é **em inglês** e vaza no JWT, no
`openapi.json` e no SDK do app — é mudança de contrato.

---

## Adicionar uma variável de ambiente

1. `src/platform/config/environment.contracts.ts` — campo no `EnvironmentSchema`
2. `.env.example` — chave com valor fake **válido**
3. `.github/workflows/ci.yml` — só se o CI precisar dela
4. o seu `.env` local

**Arquivos editados: 2–3.**

Sem default, o app não sobe sem a variável — que é o comportamento desejado.
Nunca leia `process.env` em `src/`: use `ConfigService<Environment, true>`.

---

## Investigar um erro em produção

1. Pegue o `x-request-id` que o usuário reportou (é o campo `instance` do corpo do
   erro).
2. `rg <request-id>` nos logs — todo log da request carrega o mesmo id.
3. O `type` do problem details diz qual caminho falhou; o log de nível `error`
   carrega o stack, que nunca é devolvido ao cliente.

Campos redigidos no log e que você **não** vai encontrar lá:
`authorization`, `password`, `refreshToken`, `accessToken`, `token`, `tokenHash`.
