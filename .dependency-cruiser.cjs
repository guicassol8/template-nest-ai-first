module.exports = {
  forbidden: [
    {
      name: 'no-cross-module-deep-import',
      severity: 'error',
      comment:
        'Módulos só se falam pelo *.public.ts do módulo alvo. ' +
        'Se você precisa de algo que não está no public, o dono do módulo decide expor.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/[^/]+\\.public\\.ts$'],
      },
    },
    {
      name: 'platform-never-imports-modules',
      severity: 'error',
      comment:
        'platform/ é infraestrutura genérica e não conhece domínio. Inverta a dependência.',
      from: { path: '^src/platform/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'prisma-service-only-in-repositories',
      severity: 'error',
      comment:
        'Só um *.repository.ts toca PrismaService — em modules/ ou em platform/.',
      from: {
        path: '^src/',
        pathNot: ['\\.repository\\.ts$', '^src/platform/database/'],
      },
      to: { path: '^src/platform/database/prisma\\.service\\.ts$' },
    },
    {
      name: 'prisma-client-only-in-repositories',
      severity: 'error',
      comment:
        'Tipo do Prisma é formato de persistência. Fora do repository (e do spec ' +
        'que trava o enum), use os tipos inferidos do Zod.',
      from: {
        path: '^src/',
        pathNot: [
          '\\.repository\\.ts$',
          // Só o spec que trava o enum — não *.spec.ts inteiro (P5).
          '^src/platform/auth/user-role\\.contracts\\.spec\\.ts$',
          '^src/platform/database/',
          '^src/generated/',
        ],
      },
      to: { path: '^src/generated/prisma' },
    },
    {
      name: 'contracts-are-leaves',
      severity: 'error',
      comment: 'Arquivo de contrato não importa service, repository nem controller.',
      from: { path: '\\.contracts\\.ts$' },
      to: { path: '\\.(service|repository|controller|module)\\.ts$' },
    },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '^src/main\\.ts$',
          '^src/generated/',
          // Infraestrutura para os switches exaustivos dos módulos futuros
          // (AGENTS.md §6). Sem a exceção, o warn dispara em toda execução e
          // ensina a ignorar warnings.
          '^src/platform/http-errors/never-reached\\.assert\\.ts$',
        ],
      },
      to: {},
    },
  ],
  options: {
    // O client gerado tem centenas de módulos e nenhuma regra nossa se aplica a
    // ele: seguir suas dependências só deixaria o arch:check lento.
    doNotFollow: { path: ['node_modules', '^src/generated/'] },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
