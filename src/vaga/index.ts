// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The reading of a Vaga runs in the background, in the server process, like the
 * generation (`src/geracao/segundo-plano.ts`): it takes tens of seconds, and the
 * Vaga's page polls for it. One run per Vaga; the set is in memory, enough for
 * one instance.
 *
 * A run that died with the process leaves the Vaga in `lendo`: the next time
 * its page is opened, `garantirLeitura` starts it again. A run that failed
 * moves it to `leitura_falhou`, and only "tentar de novo" starts it again.
 */
import { corpusDaSessao, gravarLeitura, marcarEstagioDaLeitura, vagaDaSessao } from '@/db';
import { llm, type ClienteLlm } from '@/llm/cliente';

import { lerVaga } from './leitura';

const rodando = new Set<string>();

/** Reads a Vaga still in `lendo` and writes the result; a failure moves it to `leitura_falhou`. */
export async function lerEGravar(sessaoId: string, vagaId: string, cliente: ClienteLlm = llm()): Promise<void> {
  const vaga = await vagaDaSessao(sessaoId, vagaId);
  if (!vaga?.texto || vaga.estagio !== 'lendo') return;
  try {
    const leitura = await lerVaga(vaga.texto, await corpusDaSessao(sessaoId), { sessaoId, vagaId, cliente });
    await gravarLeitura(vagaId, leitura);
  } catch (erro) {
    // The ids, never the token or the posting.
    console.error(`reading of vaga ${vagaId} failed for session ${sessaoId}:`, erro instanceof Error ? erro.message : erro);
    await marcarEstagioDaLeitura(vagaId, 'leitura_falhou');
  }
}

/** Starts the reading of a Vaga in `lendo` unless it is already running (`deNovo` clears a failure first). */
export async function garantirLeitura(sessaoId: string, vagaId: string, opcoes: { deNovo?: boolean } = {}): Promise<void> {
  if (rodando.has(vagaId)) return;
  if (opcoes.deNovo) await marcarEstagioDaLeitura(vagaId, 'lendo');
  if (rodando.has(vagaId)) return;
  rodando.add(vagaId);
  void lerEGravar(sessaoId, vagaId).finally(() => rodando.delete(vagaId));
}
