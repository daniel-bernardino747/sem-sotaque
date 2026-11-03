// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The data layer of the generation (steps 06, 14 and 17): the header the
 * person typed, one row per generation (a Version, numbered per session for the
 * general résumé and per Vaga for each Vaga's), each attempt (a `selections`
 * row with its violations and its `renders` row), the delivery and the
 * download. The session's `estado` only records how far the person got: the
 * first delivery of the general résumé moves `gerando` → `pronto` once and
 * never moves it back; a Vaga's delivery never moves it.
 *
 * What reads "the" résumé takes the Vaga (`vagaId`); null, the default, is the
 * general résumé.
 */
import { and, count, desc, eq, isNotNull, isNull, max, sql, type SQL } from 'drizzle-orm';

import { selectionSchema } from '../render/resume';

import { db } from './client';
import {
  accomplishments,
  affiliations,
  cabecalhos,
  eventos,
  geracoes,
  metrics,
  renders,
  selections,
  sessoes,
  vagas,
  type LinhaDoMapaGravada,
  type PerguntaDeEntrevista,
} from './schema';

export type Geracao = typeof geracoes.$inferSelect;
export type { LinhaDoMapaGravada, PerguntaDeEntrevista };
export type SelectionGravada = typeof selections.$inferSelect;

export interface Cabecalho {
  nome: string;
  email: string;
  linkedin: string;
  github: string | null;
  local: string;
}

export async function cabecalhoDaSessao(sessaoId: string): Promise<Cabecalho | null> {
  const [linha] = await db()
    .select({ nome: cabecalhos.nome, email: cabecalhos.email, linkedin: cabecalhos.linkedin, github: cabecalhos.github, local: cabecalhos.local })
    .from(cabecalhos)
    .where(eq(cabecalhos.sessaoId, sessaoId));
  return linha ?? null;
}

/**
 * The header form: asked before the first generation and editable before each
 * one after it; sent again, it replaces the one there. Returns false once the
 * session is erased.
 */
export async function gravarCabecalho(sessaoId: string, dados: Cabecalho): Promise<boolean> {
  return db().transaction(async (tx) => {
    const [sessao] = await tx.select().from(sessoes).where(eq(sessoes.id, sessaoId)).for('update');
    if (!sessao || sessao.apagadaEm) return false;
    await tx
      .insert(cabecalhos)
      .values({ sessaoId, ...dados })
      .onConflictDoUpdate({ target: cabecalhos.sessaoId, set: { ...dados, atualizadoEm: new Date() } });
    return true;
  });
}

/** Generations of a Vaga's résumé (P15). Emptying the Vaga does not give them back. */
export const GERACOES_POR_VAGA = 3;

/** The general résumé's generations (`vagaId` null) or a Vaga's. */
const doCurriculo = (vagaId: string | null): SQL => (vagaId ? eq(geracoes.vagaId, vagaId) : isNull(geracoes.vagaId));

/** The newest generation of a session's résumé (the general one, or a Vaga's), delivered or not. */
export async function ultimaGeracao(sessaoId: string, vagaId: string | null = null): Promise<Geracao | null> {
  const [linha] = await db()
    .select()
    .from(geracoes)
    .where(and(eq(geracoes.sessaoId, sessaoId), doCurriculo(vagaId)))
    .orderBy(desc(geracoes.versao))
    .limit(1);
  return linha ?? null;
}

/** A generation, only if it is this session's. */
export async function geracaoDaSessao(sessaoId: string, geracaoId: string): Promise<Geracao | null> {
  const [linha] = await db().select().from(geracoes).where(and(eq(geracoes.id, geracaoId), eq(geracoes.sessaoId, sessaoId)));
  return linha ?? null;
}

/** Not delivered and not failed: the run is going, or died with the process and is owed again. */
export const emAndamento = (g: Pick<Geracao, 'terminadaEm' | 'erro'>) => !g.terminadaEm && !g.erro;

/**
 * A new Version of the general résumé or of a Vaga's, numbered after its last.
 * Null when it cannot start: the session is erased, has no header yet, or a
 * generation of that résumé is still going (one at a time per résumé). A
 * Vaga's needs the Vaga live and confirmed, and stops at `GERACOES_POR_VAGA`.
 */
export async function criarGeracao(sessaoId: string, vagaId: string | null = null): Promise<Geracao | null> {
  return db().transaction(async (tx) => {
    const [sessao] = await tx.select().from(sessoes).where(eq(sessoes.id, sessaoId)).for('update');
    if (!sessao || sessao.apagadaEm) return null;
    const [cabecalho] = await tx.select({ id: cabecalhos.sessaoId }).from(cabecalhos).where(eq(cabecalhos.sessaoId, sessaoId));
    if (!cabecalho) return null;
    if (vagaId) {
      const [vaga] = await tx.select().from(vagas).where(and(eq(vagas.id, vagaId), eq(vagas.sessaoId, sessaoId)));
      if (!vaga || vaga.apagadaEm || vaga.estagio !== 'confirmada') return null;
    }
    const doResumo = and(eq(geracoes.sessaoId, sessaoId), doCurriculo(vagaId));
    const [ultima] = await tx.select().from(geracoes).where(doResumo).orderBy(desc(geracoes.versao)).limit(1);
    if (ultima && emAndamento(ultima)) return null;
    if (vagaId && (ultima?.versao ?? 0) >= GERACOES_POR_VAGA) return null;
    const [nova] = await tx
      .insert(geracoes)
      .values({ sessaoId, vagaId, versao: (ultima?.versao ?? 0) + 1 })
      .returning();
    return nova;
  });
}

/** How many generations a Vaga has left; a failed one that "tentar de novo" reruns counts once. */
export async function geracoesRestantes(sessaoId: string, vagaId: string): Promise<number> {
  const [{ n }] = await db()
    .select({ n: count() })
    .from(geracoes)
    .where(and(eq(geracoes.sessaoId, sessaoId), eq(geracoes.vagaId, vagaId)));
  return Math.max(0, GERACOES_POR_VAGA - n);
}

export async function atualizarGeracao(
  geracaoId: string,
  campos: Partial<Pick<Geracao, 'etapa' | 'iniciadaEm' | 'terminadaEm' | 'erro' | 'revisar'>>,
): Promise<void> {
  await db().update(geracoes).set(campos).where(eq(geracoes.id, geracaoId));
}

/** The number the next attempt of a generation takes: attempts keep counting across reruns of it. */
export async function proximaTentativa(geracaoId: string): Promise<number> {
  const [{ ultima }] = await db()
    .select({ ultima: max(selections.tentativa) })
    .from(selections)
    .where(eq(selections.geracaoId, geracaoId));
  return (ultima ?? 0) + 1;
}

/**
 * One attempt: the Selection (validated by the render's schema, as the step 02
 * notes ask, since the database does not), what was wrong with it, and its
 * PDF with the measure. Only into a generation of this session that has not
 * ended, of a session not erased.
 */
export async function gravarTentativa(
  sessaoId: string,
  geracaoId: string,
  dados: { json: unknown; tentativa: number; violacoes: unknown; aprovada: boolean; pdf: Buffer; medida: unknown },
): Promise<string> {
  const json = selectionSchema.parse(dados.json);
  return db().transaction(async (tx) => {
    // Erasure can happen while a run is in the background: nothing is written after it.
    const [sessao] = await tx.select().from(sessoes).where(eq(sessoes.id, sessaoId)).for('share');
    const [geracao] = await tx.select().from(geracoes).where(and(eq(geracoes.id, geracaoId), eq(geracoes.sessaoId, sessaoId)));
    if (!sessao || sessao.apagadaEm || !geracao || geracao.terminadaEm) {
      throw new Error(`generation ${geracaoId} of session ${sessaoId} is not open`);
    }
    const [selection] = await tx
      .insert(selections)
      .values({ sessaoId, geracaoId, json, tentativa: dados.tentativa, violacoes: dados.violacoes, aprovada: dados.aprovada })
      .returning({ id: selections.id });
    await tx.insert(renders).values({ selectionId: selection.id, pdf: dados.pdf, medida: dados.medida });
    return selection.id;
  });
}

/**
 * The end of a run: the chosen attempt goes to the person, the generation
 * ends, and the funnel gets `pdf_gerado` (the general résumé) or `vaga_gerada`
 * with the `vaga_id` (a Vaga's, with its map and interview questions). The
 * first delivery of the general résumé moves the session `gerando` → `pronto`;
 * nothing else moves the state. Returns whether it was delivered (an erased
 * session, an emptied Vaga or a generation already delivered is not).
 */
export async function entregarSelection(
  sessaoId: string,
  geracaoId: string,
  dados: {
    selectionId: string;
    revisar: boolean;
    evento: Record<string, unknown>;
    mapa?: LinhaDoMapaGravada[] | null;
    perguntas?: PerguntaDeEntrevista[] | null;
  },
): Promise<boolean> {
  return db().transaction(async (tx) => {
    const [sessao] = await tx.select().from(sessoes).where(eq(sessoes.id, sessaoId)).for('update');
    if (!sessao || sessao.apagadaEm) return false;
    const [entregue] = await tx
      .update(geracoes)
      .set({
        selectionId: dados.selectionId,
        revisar: dados.revisar,
        terminadaEm: new Date(),
        etapa: null,
        erro: null,
        mapa: dados.mapa ?? null,
        perguntasEntrevista: dados.perguntas ?? null,
      })
      .where(and(eq(geracoes.id, geracaoId), eq(geracoes.sessaoId, sessaoId), isNull(geracoes.terminadaEm)))
      .returning({ versao: geracoes.versao, vagaId: geracoes.vagaId });
    if (!entregue) return false;
    if (entregue.vagaId) {
      await tx.insert(eventos).values({ sessaoId, tipo: 'vaga_gerada', dados: { ...dados.evento, vaga_id: entregue.vagaId, versao: entregue.versao } });
      return true;
    }
    if (sessao.estado === 'gerando') await tx.update(sessoes).set({ estado: 'pronto' }).where(eq(sessoes.id, sessaoId));
    await tx.insert(eventos).values({ sessaoId, tipo: 'pdf_gerado', dados: { ...dados.evento, versao: entregue.versao } });
    return true;
  });
}

/** The attempts of a session, every generation's, newest first. */
export async function tentativasDaSessao(sessaoId: string): Promise<SelectionGravada[]> {
  return db().select().from(selections).where(eq(selections.sessaoId, sessaoId)).orderBy(desc(selections.createdAt), desc(selections.tentativa));
}

/**
 * A delivered Version of the general résumé or of a Vaga's: its Selection, its
 * PDF and, for a Vaga, its map. Without `versao`, the newest delivered. Null if
 * there is none.
 */
export async function curriculoEntregue(
  sessaoId: string,
  versao?: number,
  vagaId: string | null = null,
): Promise<{ selection: SelectionGravada; renderId: string; pdf: Buffer; versao: number; mapa: LinhaDoMapaGravada[] | null } | null> {
  const [linha] = await db()
    .select({ selection: selections, renderId: renders.id, pdf: renders.pdf, versao: geracoes.versao, mapa: geracoes.mapa })
    .from(geracoes)
    .innerJoin(selections, eq(selections.id, geracoes.selectionId))
    .innerJoin(renders, eq(renders.selectionId, selections.id))
    .where(and(eq(geracoes.sessaoId, sessaoId), doCurriculo(vagaId), versao === undefined ? undefined : eq(geracoes.versao, versao)))
    .orderBy(desc(geracoes.versao), desc(renders.createdAt))
    .limit(1);
  return linha ?? null;
}

/** The history: every delivered Version of a résumé, newest first. */
export async function versoesEntregues(sessaoId: string, vagaId: string | null = null): Promise<{ versao: number; terminadaEm: Date }[]> {
  const linhas = await db()
    .select({ versao: geracoes.versao, terminadaEm: geracoes.terminadaEm })
    .from(geracoes)
    .where(and(eq(geracoes.sessaoId, sessaoId), doCurriculo(vagaId), isNotNull(geracoes.selectionId), isNotNull(geracoes.terminadaEm)))
    .orderBy(desc(geracoes.versao));
  return linhas.map((l) => ({ versao: l.versao, terminadaEm: l.terminadaEm! }));
}

/**
 * "Seu Corpus mudou": something a résumé can say (an Accomplishment, a Metric,
 * an Affiliation) changed after the last generation started. False while there
 * is no generation.
 */
export async function corpusMudou(sessaoId: string): Promise<boolean> {
  const ultima = await ultimaGeracao(sessaoId);
  if (!ultima) return false;
  const desde = ultima.iniciadaEm ?? ultima.createdAt;
  const [linha] = await db().execute<{ mudou: boolean }>(sql`
    select greatest(
      (select max(${affiliations.atualizadoEm}) from ${affiliations} where ${affiliations.sessaoId} = ${sessaoId}),
      (select max(${accomplishments.atualizadoEm}) from ${accomplishments} where ${accomplishments.sessaoId} = ${sessaoId}),
      (select max(m.atualizado_em) from ${metrics} m join ${accomplishments} a on a.id = m.accomplishment_id where a.sessao_id = ${sessaoId})
    ) > ${desde.toISOString()}::timestamptz as mudou`);
  return Boolean(linha?.mudou);
}

/** "Baixar o PDF": the render's first download time and a `pdf_baixado` event per download, with the Vaga's id for a Vaga's. */
export async function registrarDownload(sessaoId: string, renderId: string, vagaId: string | null = null): Promise<void> {
  await db().transaction(async (tx) => {
    await tx.update(renders).set({ baixadoEm: new Date() }).where(and(eq(renders.id, renderId), isNull(renders.baixadoEm)));
    await tx.insert(eventos).values({ sessaoId, tipo: 'pdf_baixado', ...(vagaId ? { dados: { vaga_id: vagaId } } : {}) });
  });
}
