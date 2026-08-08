# modules/identity

**Possui:** usuário e credencial (tabela `User`, hash da senha, cadastro, login).

**NÃO possui:** o papel (`UserRole`) e o refresh token. Os dois moram em
`platform/auth/` porque são insumo do mecanismo de autorização, não do domínio
de cadastro. Este módulo importa `platform/auth`; nunca o contrário.

**Por que o arquivo é `identity.*` e a rota é `/auth/*`:** o nome do arquivo
segue o módulo (um `rg identity` acha tudo do módulo de uma vez); o prefixo da
rota segue o vocabulário do cliente que consome a API. É intencional — não
"conserte" renomeando nenhum dos dois.

**Estágio:** `simples`. Nenhuma invariante de negócio declarada, nenhum value
object, nenhum agregado. Se aparecer regra que não é validação de formato, leia
"Crescer quando doer" em `docs/architecture.md` antes de criar arquivo novo.

**Expõe em `identity.public.ts`:** `IdentityService` e os tipos `User` e
`AuthTokens`. `IdentityRepository` e `UserRecord` ficam de fora porque
`UserRecord` carrega `passwordHash` — hash de senha não atravessa fronteira de
módulo.

**Sem efeitos colaterais:** nenhum email, nenhum job, nenhuma fila. Registro e
login só escrevem no Postgres e emitem log.
