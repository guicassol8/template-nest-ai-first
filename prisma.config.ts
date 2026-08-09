import { defineConfig } from 'prisma/config';

// Lido direto do ambiente, e não pelo helper `env()` do Prisma: aquele lança na
// hora de CARREGAR o config quando a variável não existe, o que quebra
// `prisma generate` em qualquer lugar sem banco — o build do Docker, por exemplo.
// Generate não precisa de conexão; só migrate e introspect precisam.
const databaseUrl = process.env['DATABASE_URL'];

export default defineConfig({
  schema: 'prisma/schema',
  // Explícito de propósito: com schema em pasta, o default de onde as migrations
  // moram é ambíguo entre `prisma/migrations` e `prisma/schema/migrations`.
  migrations: { path: 'prisma/migrations' },
  // No Prisma 7 a URL sai do schema e vem para cá. O schema passa a descrever só
  // a forma dos dados; a conexão é configuração de ambiente. Em runtime quem
  // conecta é o driver adapter em platform/database/prisma.service.ts.
  ...(databaseUrl === undefined ? {} : { datasource: { url: databaseUrl } }),
});
