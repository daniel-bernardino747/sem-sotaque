// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { caminhoDoErro, NOME_DO_CAMINHO } from '@/llm/caminho';

/** Where the person fixes the way to the model, in `MODO=local` (step 28). */
export const LINK_DA_CONFIGURACAO = '/casa/configuracao';

/**
 * Under a failed generation: when it failed through a subscription (M6),
 * which one, and where to fix it. The app never falls back to the API.
 */
export function AvisoDoCaminho({ erro }: { erro: string | null }) {
  const caminho = erro ? caminhoDoErro(erro) : null;
  if (!caminho) return null;
  return (
    <p className="motivo">
      Falhou pela {NOME_DO_CAMINHO[caminho]}. Confira se ela continua logada em{' '}
      <a href={LINK_DA_CONFIGURACAO}>Configuração</a>: eu não passo sozinho para a chave da API.
    </p>
  );
}
