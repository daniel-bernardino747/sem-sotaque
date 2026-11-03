// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * One session in Daniel's panel (step 22, Q19): the numbers always, the
 * content (transcript, Corpus, attempts, PDFs) only for a session that ticked
 * "pode ler para melhorar o produto". Every read of content in the panel goes
 * through here, the PDF route too.
 */
import {
  contagemDeMensagens,
  contagemDeTentativas,
  corpusDaSessao,
  curriculoEntregue,
  decisoesDaSessao,
  linhasDaSessao,
  mensagensDaSessao,
  pdfDaTentativa,
  sessaoPorId,
  tentativasParaPainel,
  type Sessao,
} from '@/db';

import { resumoDoAvaliador } from './linha-do-tempo';

/** Daniel may read this session: it said yes, and it was not erased. */
export const podeLer = (sessao: Pick<Sessao, 'podeLerEm' | 'apagadaEm'>) =>
  sessao.podeLerEm !== null && sessao.apagadaEm === null;

type Decisoes = Awaited<ReturnType<typeof decisoesDaSessao>>;

async function conteudo(sessaoId: string, decisoes: Decisoes) {
  const [mensagens, corpus, linhas, tentativas] = await Promise.all([
    mensagensDaSessao(sessaoId),
    corpusDaSessao(sessaoId),
    linhasDaSessao(sessaoId),
    tentativasParaPainel(sessaoId),
  ]);
  return { mensagens, corpus, linhas, tentativas, decisoes };
}

export type ConteudoDaSessao = Awaited<ReturnType<typeof conteudo>>;

async function metricas(sessaoId: string, decisoes: Decisoes) {
  const [mensagens, tentativas] = await Promise.all([contagemDeMensagens(sessaoId), contagemDeTentativas(sessaoId)]);
  return { ...mensagens, ...tentativas, avaliador: resumoDoAvaliador(decisoes) };
}

export type MetricasDaSessao = Awaited<ReturnType<typeof metricas>>;

/** The session, its numbers, and its content or null when the person did not let Daniel read. Null if there is no such session. */
export async function sessaoParaPainel(
  sessaoId: string,
): Promise<{ sessao: Sessao; metricas: MetricasDaSessao; conteudo: ConteudoDaSessao | null } | null> {
  const sessao = await sessaoPorId(sessaoId);
  if (!sessao) return null;
  // The evaluator's decisions feed the counts always; their reasons are shown only with the content.
  const decisoes = await decisoesDaSessao(sessaoId);
  const [numeros, legivel] = await Promise.all([
    metricas(sessaoId, decisoes),
    podeLer(sessao) ? conteudo(sessaoId, decisoes) : null,
  ]);
  return { sessao, metricas: numeros, conteudo: legivel };
}

/**
 * The delivered PDF, or one attempt's: `fechado` without the opt-in, before
 * the bytes are read; null when there is none.
 */
export async function pdfParaPainel(sessaoId: string, selectionId: string | null): Promise<Buffer | 'fechado' | null> {
  const sessao = await sessaoPorId(sessaoId);
  if (!sessao) return null;
  if (!podeLer(sessao)) return 'fechado';
  if (selectionId) return pdfDaTentativa(sessaoId, selectionId);
  return (await curriculoEntregue(sessaoId))?.pdf ?? null;
}
