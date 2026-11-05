// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The generation runs in the background, in the server process: it takes tens
 * of seconds, and the page polls for it. One run per résumé at a time (the
 * general one, and each Vaga's); the set is in memory, which is enough for one
 * instance in production (the same assumption as the interrogation's `trava.ts`).
 *
 * A run that died with the process (a deploy, a crash) leaves the last
 * generation with no error and no end: the next time the page is opened,
 * `garantirGeracao` starts it again. A run that failed records `erro`, and only
 * "tentar de novo" starts it again, so a broken run does not loop. "Gerar de
 * novo" (step 14) is a new generation, the next Version.
 */
import { atualizarGeracao, criarGeracao, ultimaGeracao } from '@/db';

import { gerarCurriculo } from './pipeline';
import { registrarErro } from '@/erros';

const rodando = new Set<string>();
const chave = (sessaoId: string, vagaId: string | null) => `${sessaoId}:${vagaId ?? 'geral'}`;

export const geracaoRodando = (sessaoId: string, vagaId: string | null = null) => rodando.has(chave(sessaoId, vagaId));

/**
 * Starts the last generation of a résumé (the general one, or the Vaga's)
 * unless it is running, delivered or failed (`deNovo` clears a failure).
 */
export async function garantirGeracao(sessaoId: string, opcoes: { deNovo?: boolean; vagaId?: string | null } = {}): Promise<void> {
  const vagaId = opcoes.vagaId ?? null;
  const k = chave(sessaoId, vagaId);
  if (rodando.has(k)) return;
  const geracao = await ultimaGeracao(sessaoId, vagaId);
  if (!geracao || geracao.terminadaEm || (geracao.erro && !opcoes.deNovo)) return;
  if (rodando.has(k)) return;
  rodando.add(k);
  void gerarCurriculo(sessaoId, geracao.id)
    .catch(async (erro) => {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      // The session id, never the token: the token is the person's credential.
      await registrarErro({
        origem: 'servidor',
        onde: 'geracao',
        erro,
        sessaoId,
        log: `generation ${geracao.versao}${vagaId ? ` of Vaga ${vagaId}` : ''} failed for session ${sessaoId}:`,
      });
      await atualizarGeracao(geracao.id, { erro: mensagem.slice(0, 500), etapa: null }).catch(() => {});
    })
    .finally(() => rodando.delete(k));
}

/**
 * A new Version in the background ("gerar meu currículo", "gerar de novo",
 * and a Vaga's "gerar agora"). Returns false when it cannot start: no header,
 * one is already going, or the Vaga has no generations left.
 */
export async function novaGeracao(sessaoId: string, vagaId: string | null = null): Promise<boolean> {
  if (rodando.has(chave(sessaoId, vagaId))) return false;
  const geracao = await criarGeracao(sessaoId, vagaId);
  if (!geracao) return false;
  await garantirGeracao(sessaoId, { vagaId });
  return true;
}
