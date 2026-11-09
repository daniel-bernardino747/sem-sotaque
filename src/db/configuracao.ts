// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/** The instance's configuration (step 28): one row, read at every model call in `MODO=local`. */
import type { Configuracao } from '../llm/caminho';

import { db } from './client';
import { configuracao } from './schema';

/** The saved choice, or the API key when nothing was saved yet. */
export async function configuracaoDaInstancia(): Promise<Configuracao> {
  const [linha] = await db()
    .select({ caminho: configuracao.caminhoModelo, modeloCodex: configuracao.modeloCodex })
    .from(configuracao);
  return linha ?? { caminho: 'api', modeloCodex: null };
}

/** Saves the choice over the one there; a blank Codex model is the Codex default. */
export async function gravarConfiguracao(dados: Configuracao): Promise<void> {
  const valores = {
    caminhoModelo: dados.caminho,
    modeloCodex: dados.modeloCodex?.trim() || null,
    atualizadaEm: new Date(),
  };
  await db()
    .insert(configuracao)
    .values({ id: true, ...valores })
    .onConflictDoUpdate({ target: configuracao.id, set: valores });
}
