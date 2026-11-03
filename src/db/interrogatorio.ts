// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The data layer of the interrogation (step 05): what its tools write into the
 * Corpus, the messages and their markers, and the end of it. Every function
 * takes the session id and touches only that session's rows, so an id that
 * leaked from another session changes nothing.
 */
import { and, asc, eq, isNull, max, sql } from 'drizzle-orm';

import { PREFIXO_ASSINATURA } from '../llm/precos';

import { db } from './client';
import {
  accomplishments,
  affiliations,
  chamadasLlm,
  eventos,
  importacoes,
  linhasOriginais,
  mensagens,
  sessoes,
  type Marcador,
} from './schema';

type Affiliation = typeof affiliations.$inferSelect;
type Accomplishment = typeof accomplishments.$inferSelect;
type Mensagem = typeof mensagens.$inferSelect;
export type LinhaOriginal = typeof linhasOriginais.$inferSelect;

export class ErroRegistroNaoEncontrado extends Error {
  constructor(tipo: string, id: string) {
    super(`no ${tipo} ${id} in this session`);
    this.name = 'ErroRegistroNaoEncontrado';
  }
}

export async function sessaoPorId(sessaoId: string): Promise<typeof sessoes.$inferSelect | null> {
  const [linha] = await db().select().from(sessoes).where(eq(sessoes.id, sessaoId));
  return linha ?? null;
}

/** A conversation so far, oldest first: the general one, or a Vaga's (step 16). */
export async function mensagensDaSessao(sessaoId: string, vagaId: string | null = null): Promise<Mensagem[]> {
  return db()
    .select()
    .from(mensagens)
    .where(and(eq(mensagens.sessaoId, sessaoId), vagaId ? eq(mensagens.vagaId, vagaId) : isNull(mensagens.vagaId)))
    .orderBy(asc(mensagens.createdAt), asc(mensagens.id));
}

/**
 * Everything the person wrote in the session, in every conversation: a number
 * she said in the general one holds in a Vaga's (step 16), and the other way round.
 */
export async function falasDaSessao(sessaoId: string): Promise<string[]> {
  const linhas = await db()
    .select({ conteudo: mensagens.conteudo })
    .from(mensagens)
    .where(and(eq(mensagens.sessaoId, sessaoId), eq(mensagens.papel, 'pessoa')))
    .orderBy(asc(mensagens.createdAt), asc(mensagens.id));
  return linhas.map((l) => l.conteudo);
}

/** The original lines, in the order the import wrote them. */
export async function linhasDaSessao(sessaoId: string): Promise<LinhaOriginal[]> {
  return db()
    .select()
    .from(linhasOriginais)
    .where(eq(linhasOriginais.sessaoId, sessaoId))
    .orderBy(asc(linhasOriginais.createdAt), asc(linhasOriginais.id));
}

/** The text the person imported, for checking that a rewritten statement adds no number. */
export async function textoImportado(sessaoId: string): Promise<string> {
  const linhas = await db()
    .select({ texto: importacoes.textoExtraido })
    .from(importacoes)
    .where(eq(importacoes.sessaoId, sessaoId));
  return linhas.map((l) => l.texto).join('\n');
}

/** A new Affiliation goes after the ones already there. */
export async function criarAffiliationNoFim(
  sessaoId: string,
  dados: Omit<typeof affiliations.$inferInsert, 'id' | 'sessaoId' | 'createdAt' | 'ordem'>,
): Promise<Affiliation> {
  const [{ ultima }] = await db()
    .select({ ultima: max(affiliations.ordem) })
    .from(affiliations)
    .where(eq(affiliations.sessaoId, sessaoId));
  const [linha] = await db()
    .insert(affiliations)
    .values({ ...dados, sessaoId, ordem: (ultima ?? -1) + 1 })
    .returning();
  return linha;
}

export async function atualizarAffiliation(
  sessaoId: string,
  id: string,
  campos: Partial<
    Pick<
      Affiliation,
      | 'organizacao'
      | 'cargo'
      | 'periodoInicio'
      | 'periodoFim'
      | 'periodoConfirmado'
      | 'stack'
      | 'confidencial'
      | 'descricaoPublica'
      | 'pulado'
      | 'anoConclusao'
      | 'cursando'
    >
  >,
): Promise<Affiliation> {
  // Skipping the block is bookkeeping; anything else is what a résumé can say ("Seu Corpus mudou").
  const conteudo = Object.keys(campos).some((k) => k !== 'pulado');
  const [linha] = await db()
    .update(affiliations)
    .set(conteudo ? { ...campos, atualizadoEm: new Date() } : campos)
    .where(and(eq(affiliations.id, id), eq(affiliations.sessaoId, sessaoId)))
    .returning();
  if (!linha) throw new ErroRegistroNaoEncontrado('affiliation', id);
  return linha;
}

/**
 * What a résumé can say of an Accomplishment: a change to one of these moves
 * `atualizado_em` ("Seu Corpus mudou"). The evaluator's bookkeeping (strength,
 * postponed, skipped) does not.
 */
const CONTEUDO_DO_ACCOMPLISHMENT = new Set(['enunciado', 'importanciaParaPessoa', 'affiliationId', 'data']);

export async function atualizarAccomplishment(
  sessaoId: string,
  id: string,
  campos: Partial<
    Pick<
      Accomplishment,
      'enunciado' | 'importanciaParaPessoa' | 'pulado' | 'affiliationId' | 'data' | 'forca' | 'adiado' | 'adiadoVoltou'
    >
  >,
): Promise<Accomplishment> {
  const conteudo = Object.keys(campos).some((k) => CONTEUDO_DO_ACCOMPLISHMENT.has(k));
  const [linha] = await db()
    .update(accomplishments)
    .set(conteudo ? { ...campos, atualizadoEm: new Date() } : campos)
    .where(and(eq(accomplishments.id, id), eq(accomplishments.sessaoId, sessaoId)))
    .returning();
  if (!linha) throw new ErroRegistroNaoEncontrado('accomplishment', id);
  return linha;
}

/**
 * Links an original line to an Accomplishment. A row holds one accomplishment,
 * so a line already linked to another one is written again for this one (as
 * the import does for a line that became two).
 */
export async function ligarLinhaOriginal(
  sessaoId: string,
  linhaId: string,
  accomplishmentId: string,
): Promise<void> {
  const [linha] = await db()
    .select()
    .from(linhasOriginais)
    .where(and(eq(linhasOriginais.id, linhaId), eq(linhasOriginais.sessaoId, sessaoId)));
  if (!linha) throw new ErroRegistroNaoEncontrado('original line', linhaId);
  const [alvo] = await db()
    .select({ id: accomplishments.id })
    .from(accomplishments)
    .where(and(eq(accomplishments.id, accomplishmentId), eq(accomplishments.sessaoId, sessaoId)));
  if (!alvo) throw new ErroRegistroNaoEncontrado('accomplishment', accomplishmentId);

  if (linha.accomplishmentId === accomplishmentId) return;
  if (linha.accomplishmentId === null) {
    await db().update(linhasOriginais).set({ accomplishmentId }).where(eq(linhasOriginais.id, linhaId));
    return;
  }
  const [jaExiste] = await db()
    .select({ id: linhasOriginais.id })
    .from(linhasOriginais)
    .where(
      and(
        eq(linhasOriginais.sessaoId, sessaoId),
        eq(linhasOriginais.texto, linha.texto),
        eq(linhasOriginais.accomplishmentId, accomplishmentId),
      ),
    );
  if (jaExiste) return;
  await db().insert(linhasOriginais).values({
    sessaoId,
    texto: linha.texto,
    affiliationId: linha.affiliationId,
    accomplishmentId,
  });
}

/** Adds markers to a message, keeping the ones it has. */
export async function marcarMensagem(sessaoId: string, id: string, novos: Marcador[]): Promise<void> {
  await db()
    .update(mensagens)
    .set({
      marcadores: sql`(select coalesce(array_agg(distinct m), '{}') from unnest(${mensagens.marcadores} || ${sql.param(novos)}::text[]) as m)`,
    })
    .where(and(eq(mensagens.id, id), eq(mensagens.sessaoId, sessaoId)));
}

/** Whether the funnel already has this event for the session (for once-only events). */
export async function temEvento(
  sessaoId: string,
  tipo: (typeof eventos.$inferSelect)['tipo'],
): Promise<boolean> {
  const [linha] = await db()
    .select({ id: eventos.id })
    .from(eventos)
    .where(and(eq(eventos.sessaoId, sessaoId), eq(eventos.tipo, tipo)))
    .limit(1);
  return Boolean(linha);
}

/**
 * The end of the interrogation, by "terminei", the model, the evaluator (nothing
 * left, or the offer to stop accepted) or the spending cap: `interrogando`
 * → `gerando`, the time it ended and the `terminou` event with how many things
 * were left open. Only from `interrogando`; returns whether it moved.
 */
export async function terminarInterrogatorio(
  sessaoId: string,
  dados: { abertos: number; total: number; por: 'pessoa' | 'modelo' | 'teto' | 'avaliador' },
): Promise<boolean> {
  return db().transaction(async (tx) => {
    const [movida] = await tx
      .update(sessoes)
      .set({ estado: 'gerando', terminouInterrogatorioEm: new Date() })
      .where(
        and(eq(sessoes.id, sessaoId), eq(sessoes.estado, 'interrogando'), isNull(sessoes.apagadaEm)),
      )
      .returning({ id: sessoes.id });
    if (!movida) return false;
    await tx.insert(eventos).values({ sessaoId, tipo: 'terminou', dados });
    return true;
  });
}


/** What a session's model calls cost so far, in USD (the spending cap reads it before each call). */
export async function gastoDaSessao(sessaoId: string): Promise<number> {
  const [linha] = await db()
    .select({ custoUsd: sql<number>`coalesce(sum(${chamadasLlm.custoUsd}), 0)::float` })
    .from(chamadasLlm)
    .where(eq(chamadasLlm.sessaoId, sessaoId));
  return linha?.custoUsd ?? 0;
}

/** What a session's model calls cost, per stage. */
export async function custoDaSessao(sessaoId: string) {
  return db()
    .select({
      etapa: chamadasLlm.etapa,
      chamadas: sql<number>`count(*)::int`,
      custoUsd: sql<number>`coalesce(sum(${chamadasLlm.custoUsd}), 0)::float`,
      tokensEntrada: sql<number>`coalesce(sum(${chamadasLlm.tokensEntrada}), 0)::int`,
      tokensSaida: sql<number>`coalesce(sum(${chamadasLlm.tokensSaida}), 0)::int`,
      tokensCacheLeitura: sql<number>`coalesce(sum(${chamadasLlm.tokensCacheLeitura}), 0)::int`,
      tokensCacheEscrita: sql<number>`coalesce(sum(${chamadasLlm.tokensCacheEscrita}), 0)::int`,
      /** Calls through the subscription (step 12): their cost is not measured. */
      naoMedidas: sql<number>`count(*) filter (where ${chamadasLlm.modelo} like ${`${PREFIXO_ASSINATURA}%`})::int`,
    })
    .from(chamadasLlm)
    .where(eq(chamadasLlm.sessaoId, sessaoId))
    .groupBy(chamadasLlm.etapa);
}
