#!/usr/bin/env bash
# Convenções textuais (P5). Falha se alguma busca encontrar algo.
#
# NÃO chame check() pelo lado direito de um pipe (`rg ... | check '...'`):
# em bash o último elemento do pipeline roda em subshell, o `fail=1` morre lá
# e o script sai 0 sempre. Passe a saída por substituição de comando.
set -u
fail=0

# Sem isto, um `src/` ou `test/` ausente faria o rg escrever no stderr e devolver
# stdout vazio — ou seja, TODAS as checagens abaixo passariam verdes olhando nada.
for required in src test; do
  if [ ! -d "$required" ]; then
    printf '✗ diretório obrigatório ausente: %s/\n' "$required"
    exit 1
  fi
done

check() {
  local desc="$1" out="$2"
  if [ -n "$out" ]; then
    printf '✗ %s\n%s\n\n' "$desc" "$out"
    fail=1
  else
    printf '✓ %s\n' "$desc"
  fi
}

check 'nenhum export *' \
  "$(rg -n 'export \*' src/ || true)"

# O client do Prisma é gerado a cada `prisma generate` e não segue convenção
# nenhuma deste repositório. Ele é excluído de todas as buscas abaixo.
GENERATED='^src/generated/'

check 'nenhum arquivo index/utils/helpers/constants' \
  "$(rg --files src/ | rg -v "$GENERATED" | rg '/(index|utils|helpers|constants)\.ts$' || true)"

check 'nenhuma pasta organizada por tipo de artefato' \
  "$(rg --files src/ | rg -v "$GENERATED" | rg '/(dto|interfaces|enums|types|shared|common)/' || true)"

check 'todo .ts usa um papel da lista fechada (AGENTS.md)' \
  "$(rg --files src/ -g '*.ts' \
     | rg -v "$GENERATED" \
     | rg -v '^src/main\.ts$' \
     | rg -v '\.(module|controller|service|repository|contracts|public|guard|decorator|filter|factory|assert)(\.spec)?\.ts$' || true)"

check 'process.env não aparece em src/' \
  "$(rg -n 'process\.env' src/ | rg -v "$GENERATED" || true)"

check 'client do Prisma só em *.repository.ts, no spec do enum e em platform/database/' \
  "$(rg -l "from '.*generated/prisma" src/ \
     | rg -v "$GENERATED" \
     | rg -v '\.repository\.ts$' \
     | rg -v '^src/platform/auth/user-role\.contracts\.spec\.ts$' \
     | rg -v '^src/platform/database/' || true)"

# -L em ripgrep é --follow (symlinks), NÃO --files-without-match: com -L o check
# reportava justamente os controllers que ESTÃO corretos.
check 'todo controller usa @ZodResponse (health é exceção)' \
  "$(rg -l '@(Get|Post|Put|Patch|Delete)\(' src/ \
     | rg -v "$GENERATED" \
     | rg -v 'health\.controller\.ts$' \
     | xargs -r rg --files-without-match '@ZodResponse' || true)"

check 'todo valor exportado tem 2+ palavras (type/interface não contam)' \
  "$(rg -n 'export (const|let|class|enum|(async )?function) ([a-z]+|[A-Z][a-z]+|[A-Z]+)\b' src/ \
     | rg -v "$GENERATED" || true)"

check 'nenhum escape de tipagem (AGENTS.md)' \
  "$(rg -n '@ts-ignore|\bas any\b|\bas unknown as\b' src/ test/ | rg -v "$GENERATED" || true)"

check 'nenhum TODO — se ficou pendência, é pergunta, não comentário' \
  "$(rg -n 'TODO|FIXME|XXX' src/ test/ | rg -v "$GENERATED" || true)"

check 'nenhum teste .only ou .skip' \
  "$(rg -n '\.(only|skip)\(' src/ test/ || true)"

missing=''
for dir in src/modules/*/; do
  # Sem glob expandido, $dir vem literal ("src/modules/*/") e a checagem
  # acusaria um módulo fantasma enquanto modules/ ainda não existe.
  [ -d "$dir" ] || continue
  [ -f "${dir}AGENTS.md" ] || missing="${missing}${dir}"$'\n'
done
check 'todo módulo tem AGENTS.md' "$missing"

exit "$fail"
