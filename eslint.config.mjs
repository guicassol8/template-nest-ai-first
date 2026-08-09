// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Onde as regras duras valem. Config de ferramenta na raiz fica de fora. */
const SOURCE_FILES = ['src/**/*.ts', 'test/**/*.ts', 'scripts/**/*.ts', 'prisma/**/*.ts'];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-openapi/**',
      'coverage/**',
      'node_modules/**',
      // Client do Prisma: código gerado, não código do repositório.
      'src/generated/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Type-aware é obrigatório: metade das regras abaixo (no-unsafe-*,
        // no-unnecessary-condition, switch-exhaustiveness-check) simplesmente
        // não existe sem informação de tipo.
        projectService: {
          // prisma.config.ts é o único .ts da raiz e está no tsconfig: não pode entrar aqui.
          allowDefaultProject: ['*.mts', '*.mjs', '*.cjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: SOURCE_FILES,
    rules: {
      // — tipagem —
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        // `as const` continua permitido: a regra ignora const assertion.
        { assertionStyle: 'never' },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': 'allow-with-description' },
      ],
      'no-console': 'error', // use o logger do pino
      // error, não warn: warning que não derruba o verify é checker que não
      // pode falhar (P5) — e o lint roda com --max-warnings=0 pelo mesmo motivo.
      'max-lines': ['error', { max: 600, skipBlankLines: true, skipComments: true }],
      'no-restricted-imports': [
        'error',
        {
          // Caminho relativo, então aqui o glob CASA de verdade — diferente da
          // fronteira entre módulos, onde a string do import não contém
          // "modules/" e uma regra dessas passaria verde sem olhar nada.
          patterns: [
            {
              group: ['**/generated/prisma', '**/generated/prisma/*'],
              message:
                'Só em *.repository.ts (e no spec do enum). Use o tipo inferido do Zod.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Leia do ConfigService<Environment, true>. process.env não aparece em src/.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportAllDeclaration',
          message: 'export * apaga os nomes reexportados. Use re-export nomeado.',
        },
      ],
    },
  },
  {
    // O repository é a porta do Prisma, o spec do enum trava a sincronia e o
    // PrismaService estende PrismaClient: os três precisam do client gerado.
    // Só ESTE spec — isentar *.spec.ts inteiro deixaria qualquer teste futuro
    // importar o client sem ninguém reclamar, mais largo do que a regra escrita.
    files: [
      '**/*.repository.ts',
      'src/platform/auth/user-role.contracts.spec.ts',
      'src/platform/database/**',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Seed e scripts rodam fora do container de DI: não têm ConfigService nem
    // PrismaService, e escrevem no stdout porque não têm logger do Nest.
    files: ['prisma/**', 'scripts/**'],
    rules: {
      'no-restricted-properties': 'off',
      'no-console': 'off',
      'no-restricted-imports': 'off',
    },
  },
  {
    // Arquivos de configuração em JS não têm tipos para checar.
    files: ['**/*.mjs', '**/*.mts', '**/*.cjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // .dependency-cruiser.cjs é CommonJS: sem isto o `module.exports` vira
    // `no-undef` e derruba o lint do repositório inteiro.
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
  },
);
