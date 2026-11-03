// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The fixed rules of step 10 for education, applied right after the import:
 * what never earns a question is born skipped, and a degree closes with the
 * year the resume gives. No model call; the interrogation starts from here.
 *
 * - high school is skipped when there is a degree, a technical course or a job;
 * - bootcamps and free courses are skipped, with what was done in them;
 * - the record of the course itself is skipped: the course enters the résumé
 *   through its Affiliation;
 * - what was done in a degree (a TCC, an award) is skipped when the work adds
 *   up to 2 years or more.
 */
import type { CorpusImportado } from '@/db';
import { ehFormacao } from '@/interrogatorio/estado';

/** Work below this, and the interrogation asks once whether the degree had something notable. */
export const MESES_PARA_IGNORAR_FORMACAO = 24;

type AffiliationImportada = CorpusImportado['affiliations'][number];

const ANOS = /\b(?:19|20)\d{2}\b/g;
const ATUAL = /atual|present|hoje|momento|cursando|em andamento|previs|expected/i;
const PREVISAO = /(?:previs|expected|conclus)\D*((?:19|20)\d{2})/i;

const anosDe = (texto: string | null | undefined) => (texto?.match(ANOS) ?? []).map(Number);
const mesIndice = (ano: number, mes: number) => ano * 12 + mes - 1;
const doYyyyMm = (yyyymm: string) => mesIndice(Number(yyyymm.slice(0, 4)), Number(yyyymm.slice(5, 7)));

/** The months an Affiliation covers, by month when it has one, by whole years when not. */
function mesesDe(a: Pick<AffiliationImportada, 'periodoOriginal' | 'periodoInicio' | 'periodoFim'>, hoje: Date): number[] {
  const anos = anosDe(a.periodoOriginal);
  const inicio = a.periodoInicio ? doYyyyMm(a.periodoInicio) : anos.length ? mesIndice(anos[0], 1) : null;
  if (inicio === null) return [];
  const agora = mesIndice(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1);
  const fim = a.periodoFim
    ? doYyyyMm(a.periodoFim)
    : ATUAL.test(a.periodoOriginal ?? '')
      ? agora
      : mesIndice(anos.at(-1) ?? Math.floor(inicio / 12), 12);
  const meses: number[] = [];
  for (let m = inicio; m <= Math.min(fim, agora); m++) meses.push(m);
  return meses;
}

/** Months of work (jobs only), overlaps counted once. */
export function mesesDeExperiencia(
  affiliations: Pick<AffiliationImportada, 'tipo' | 'periodoOriginal' | 'periodoInicio' | 'periodoFim'>[],
  hoje = new Date(),
): number {
  const meses = new Set<number>();
  for (const a of affiliations) if ((a.tipo ?? 'emprego') === 'emprego') mesesDe(a, hoje).forEach((m) => meses.add(m));
  return meses.size;
}

/** The year a degree ended (or is expected to), from the period as the resume wrote it. */
function conclusao(periodoOriginal: string | null | undefined): { anoConclusao: number | null; cursando: boolean } {
  if (!periodoOriginal) return { anoConclusao: null, cursando: false };
  if (ATUAL.test(periodoOriginal)) {
    const previsao = PREVISAO.exec(periodoOriginal);
    return { anoConclusao: previsao ? Number(previsao[1]) : null, cursando: true };
  }
  return { anoConclusao: anosDe(periodoOriginal).at(-1) ?? null, cursando: false };
}

export function aplicarRegrasDeFormacao(corpus: CorpusImportado, hoje = new Date()): CorpusImportado {
  const temOutra = corpus.affiliations.some((a) => a.tipo !== 'ensino_medio' && a.tipo !== 'curso_livre');
  const experiente = mesesDeExperiencia(corpus.affiliations, hoje) >= MESES_PARA_IGNORAR_FORMACAO;

  const affiliations = corpus.affiliations.map((a) => {
    const pulado = Boolean(a.pulado) || a.tipo === 'curso_livre' || (a.tipo === 'ensino_medio' && temOutra);
    return { ...a, pulado, ...(ehFormacao(a) ? conclusao(a.periodoOriginal) : {}) };
  });
  const porRef = new Map(affiliations.map((a) => [a.ref, a]));

  const accomplishments = corpus.accomplishments.map((c) => {
    const lugar = c.affiliationRef ? porRef.get(c.affiliationRef) : undefined;
    const pulado =
      Boolean(c.pulado) ||
      Boolean(lugar?.pulado) ||
      (Boolean(lugar && ehFormacao(lugar)) && (c.tipo === 'education' || experiente));
    return { ...c, pulado };
  });
  return { ...corpus, affiliations, accomplishments };
}
