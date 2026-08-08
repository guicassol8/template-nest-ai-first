// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'prisma/generated/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Type-aware é obrigatório: metade das regras de tipagem do AGENTS.md
        // (no-unsafe-*, no-unnecessary-condition, switch-exhaustiveness-check)
        // simplesmente não existe sem informação de tipo.
        projectService: {
          allowDefaultProject: ['*.ts', '*.mjs', '*.cjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Arquivos de configuração em JS não têm tipos para checar.
    files: ['**/*.mjs', '**/*.cjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
