# Convenções de API

O consumidor é um app de celular publicado em loja: versões antigas continuam
instaladas nos aparelhos e você não controla o rollout. Tudo aqui existe por causa
disso.

---

## Erro — RFC 9457 (problem details)

Toda resposta de erro sai com `Content-Type: application/problem+json` e o corpo
descrito por `ProblemDetailsSchema`
(`src/platform/http-errors/problem-details.contracts.ts`):

```jsonc
{
  "type": "https://api.example.app/problems/invalid-credentials",
  "title": "Credenciais inválidas",
  "status": 401,
  "detail": "opcional",
  "instance": "0f1c…",   // = x-request-id
  "errors": [            // só para validation-failed
    { "path": "email", "message": "Invalid email address" }
  ]
}
```

Regras:

- **O cliente decide o comportamento pelo `type`, nunca pela string de `title`.**
  `title` é para humano lendo log; `type` é contrato.
- `instance` sempre carrega o `x-request-id` — é o que o suporte pede ao usuário.
  Se o cliente mandar o header, ele é propagado; se não, é gerado.
- **Nenhuma mensagem de erro interno vaza**: para status ≥ 500 o filter loga o
  stack e devolve `internal-error` genérico.
- Adicionar um `type` novo é mudança de contrato: entra no `openapi.json` e é
  gatilho de pergunta.

Vocabulário atual (`PROBLEM_TYPES`): `validation-failed`, `invalid-credentials`,
`authentication-required`, `insufficient-role`, `resource-not-found`,
`email-already-registered`, `rate-limit-exceeded`, `internal-error`.

Um service que precisa de um `type` específico lança `ProblemDetailsException`.
Qualquer outra exceção cai no mapeamento por status do
`HttpProblemDetailsFilter`.

Toda rota leva `@ApiStandardErrorResponses()`, que documenta os seis status de erro
de uma vez — repetir `@ApiResponse` por rota é a duplicação que o P4 proíbe.

---

## Versionamento

Prefixo `/v1` em tudo, **menos** `/health` e `/health/ready`, que ficam fora
(`configureApiPrefix`). Sem versionamento por header e sem `@Version()` por rota
enquanto só existir `v1`.

---

## Paginação (convenção para os módulos futuros)

Cursor, nunca offset — offset quebra com inserção concorrente e é o padrão errado
para scroll infinito em mobile.

```
GET /v1/<recurso>?limit=20&cursor=<opaco>
→ { "items": [...], "nextCursor": "..." | null }
```

`limit` default 20, máximo 100, validado no schema.

---

## Datas e ids

Toda data em contrato é `z.iso.datetime()` (string ISO 8601 UTC). **Nunca
`z.date()`, nunca epoch.** Todo id é UUID em string.

---

## Respostas

Um decorator de resposta por rota: `@ZodResponse({ status, type })` já cobre
serialização, tipo e OpenAPI. Não empilhe `@ZodSerializerDto` + `@ApiOkResponse`.

Única rota sem `@ZodResponse` neste esqueleto é `POST /v1/auth/logout`, que
responde `204` sem corpo. O checker de `@ZodResponse` é por arquivo, não por rota.

O `ZodSerializerInterceptor` corta do corpo tudo que não está no schema — é o que
garante que `passwordHash` não vaza mesmo se um service devolver o registro
interno por engano.

---

## Nomes no `openapi.json`

`operationIdFactory` usa o nome do método, então o SDK gera `login()` e não
`authControllerLogin()`.

Schemas de resposta aparecem com sufixo `_Output` (`AuthTokens_Output`,
`User_Output`). É a convenção do `nestjs-zod` para separar formato de entrada e de
saída, e não é configurável — `cleanupOpenApiDoc` só aceita `version`.

O documento é emitido em OpenAPI **3.0** até confirmar que o gerador de client do
app lida com `const`/`anyOf` de 3.1.

---

## Autenticação

| Rota | Método | Público? | O que faz |
|---|---|---|---|
| `/v1/auth/register` | POST | Sim | Cria usuário `user`, retorna tokens |
| `/v1/auth/login` | POST | Sim | Valida credenciais, retorna tokens |
| `/v1/auth/refresh` | POST | Sim | Rotaciona o par de tokens |
| `/v1/auth/logout` | POST | Não | Apaga a família do refresh apresentado |
| `/v1/auth/me` | GET | Não | Retorna o usuário autenticado |
| `/health` | GET | Sim | Liveness (fora do `/v1`) |
| `/health/ready` | GET | Sim | Readiness: checa Postgres (fora do `/v1`) |

- Access token de 15 min; refresh rotativo persistido com reuse detection —
  reuso dentro da janela de graça (`JWT_REFRESH_REUSE_GRACE_SECONDS`, 60s) é
  retry de rede e recebe tokens novos; fora dela derruba a família inteira.
  Sessão sem teto absoluto, de propósito (ver `docs/architecture.md`).
- `argon2id` para senha. Nunca bcrypt, nunca SHA.
- Rate limit de 5 req/min por IP em `register`, `login` e `refresh` — são rotas
  públicas que chamam argon2.
- **A resposta de login não distingue "email não existe" de "senha errada"**: mesma
  mensagem, mesmo `type`, e o caminho do email inexistente executa um hash falso
  para não vazar por timing.
- Criação de `admin` não tem endpoint. É feita via `pnpm db:seed`. Intencional.
- Autorização de recurso ("este usuário pode ver X?") é do service do módulo dono
  de X. Guard resolve papel; service resolve posse.
