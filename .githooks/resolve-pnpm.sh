#!/usr/bin/env bash
# Sourced por pre-commit e pre-push.
#
# O git roda hooks com um PATH mínimo — nvm, fnm, volta e asdf não são
# carregados. Resultado: `pnpm` some no hook mesmo funcionando no seu terminal, e
# some SEMPRE quando o commit/push sai da UI do VS Code, que não lê o rc do shell.
# Pior: o `node` que sobra costuma ser o do sistema, que pode nem ser a major que
# o projeto declara no .nvmrc.
#
# Quando não achar, o hook FALHA com instrução. Nunca pula a verificação: hook que
# se desliga sozinho é um checker que não pode falhar, e isso é pior que checker
# nenhum.

resolve_pnpm_on_path() {
  command -v pnpm >/dev/null 2>&1 && return 0

  local wanted='' candidate
  [ -f .nvmrc ] && wanted="$(tr -cd '0-9' < .nvmrc)"

  # A major do .nvmrc primeiro, qualquer uma depois: o objetivo é achar o pnpm,
  # mas de preferência ao lado do Node que o projeto pede.
  for candidate in \
    "$HOME/.local/share/nvm/v$wanted".*/bin \
    "${NVM_DIR:-$HOME/.nvm}/versions/node/v$wanted".*/bin \
    "$HOME/.local/share/fnm/node-versions/v$wanted".*/installation/bin \
    "$HOME/.asdf/installs/nodejs/$wanted".*/bin \
    "$HOME/.local/share/nvm"/v*/bin \
    "${NVM_DIR:-$HOME/.nvm}/versions/node"/v*/bin \
    "$HOME/.volta/bin" \
    "$HOME/.local/share/pnpm" \
    "$HOME/Library/pnpm"; do
    if [ -x "$candidate/pnpm" ]; then
      PATH="$candidate:$PATH"
      export PATH
      return 0
    fi
  done

  return 1
}

if ! resolve_pnpm_on_path; then
  printf '✗ pnpm não encontrado pelo hook do git.\n\n'
  printf '  Hooks rodam com PATH mínimo, sem carregar nvm/fnm/volta/asdf.\n'
  printf '  Habilite o pnpm uma vez, no Node que o projeto declara:\n\n'
  printf '    nvm use %s && corepack enable pnpm\n\n' "$(cat .nvmrc 2>/dev/null || echo 24)"
  printf '  Se você usa outro gerenciador de versão, basta que o `pnpm` exista\n'
  printf '  na pasta bin dele — este script procura nos caminhos usuais.\n\n'
  printf '  Não contorne com --no-verify.\n'
  exit 1
fi
