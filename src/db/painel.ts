// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The data layer of Daniel's panel (step 08): read-only queries over every
 * session, plus his notes. The counting rules live in `src/admin/funil.ts`;
 * this only loads rows. Nothing here is reachable without the admin cookie
 * (the pages and routes under `/admin` check it).
 */
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import { PREFIXO_ASSINATURA } from '../llm/precos';

import { db } from './client';
import {
  accomplishments,
  affiliations,
  chamadasLlm,
  eventos,
  fechamento,
  geracoes,
  indicacoes,
  mensagens,
  metrics,
  renders,
  selections,
  sessoes,
  testers,
  type EstadoSessao,
} from './schema';

/** A session with no activity for this long, mid-interrogation, counts as stopped. */
export const PARADA_APOS_MS = 24 * 60 * 60 * 1000;

export interface LinhaDoPainel {
  id: string;
  apelido: string | null;
  origem: string | null;
  estado: EstadoSessao;
  createdAt: Date;
  consentiuEm: Date | null;
  terminouInterrogatorioEm: Date | null;
  apagadaEm: Date | null;
  eventos: { tipo: string; dados: unknown; createdAt: Date }[];
  fundador: boolean;
  pagaria: 'sim' | 'nao' | 'talvez' | null;
  indicacoes: number;
  revisar: boolean;
  erroGeracao: boolean;
  /** "Não sei" markers in the transcript. */
  naoSei: number;
  primeiraMensagem: Date | null;
  ultimaMensagem: Date | null;
  /** USD per `chamadas_llm.etapa`. */
  custo: Record<string, number>;
  /** Some call went through the subscription (step 12): the cost is not measured. */
  custoNaoMedido: boolean;
}

/** Every session, the erased ones included, oldest first, with what the list and the funnel need. */
export async function sessoesDoPainel(): Promise<LinhaDoPainel[]> {
  const [linhas, listaEventos, fechamentos, contagemIndicacoes, listaGeracoes, porMensagens, custos] =
    await Promise.all([
      db()
        .select({ sessao: sessoes, apelido: testers.apelido, origem: testers.origem })
        .from(sessoes)
        .leftJoin(testers, eq(testers.id, sessoes.testerId))
        .orderBy(asc(sessoes.createdAt), asc(sessoes.id)),
      db()
        .select({ sessaoId: eventos.sessaoId, tipo: eventos.tipo, dados: eventos.dados, createdAt: eventos.createdAt })
        .from(eventos)
        .orderBy(asc(eventos.createdAt)),
      db().select({ sessaoId: fechamento.sessaoId, fundador: fechamento.fundador, pagaria: fechamento.pagaria }).from(fechamento),
      db()
        .select({ sessaoId: indicacoes.sessaoId, n: sql<number>`count(*)::int` })
        .from(indicacoes)
        .groupBy(indicacoes.sessaoId),
      // The last generation of each session's general résumé: it is what the person has now.
      db()
        .selectDistinctOn([geracoes.sessaoId], { sessaoId: geracoes.sessaoId, revisar: geracoes.revisar, erro: geracoes.erro })
        .from(geracoes)
        .where(isNull(geracoes.vagaId))
        .orderBy(geracoes.sessaoId, desc(geracoes.versao)),
      db()
        .select({
          sessaoId: mensagens.sessaoId,
          naoSei: sql<number>`count(*) filter (where 'nao_sei' = any(${mensagens.marcadores}))::int`,
          primeira: sql<string>`min(${mensagens.createdAt})`,
          ultima: sql<string>`max(${mensagens.createdAt})`,
        })
        .from(mensagens)
        .groupBy(mensagens.sessaoId),
      db()
        .select({
          sessaoId: chamadasLlm.sessaoId,
          etapa: chamadasLlm.etapa,
          custo: sql<number>`sum(${chamadasLlm.custoUsd})::float`,
          naoMedidas: sql<number>`count(*) filter (where ${chamadasLlm.modelo} like ${`${PREFIXO_ASSINATURA}%`})::int`,
        })
        .from(chamadasLlm)
        .where(isNotNull(chamadasLlm.sessaoId))
        .groupBy(chamadasLlm.sessaoId, chamadasLlm.etapa),
    ]);

  const porSessao = <T extends { sessaoId: string | null }>(rows: T[]) => {
    const mapa = new Map<string, T[]>();
    for (const r of rows) if (r.sessaoId) mapa.set(r.sessaoId, [...(mapa.get(r.sessaoId) ?? []), r]);
    return mapa;
  };
  const eventosPor = porSessao(listaEventos);
  const fechamentoPor = new Map(fechamentos.map((f) => [f.sessaoId, f]));
  const indicacoesPor = new Map(contagemIndicacoes.map((i) => [i.sessaoId, i.n]));
  const geracaoPor = new Map(listaGeracoes.map((g) => [g.sessaoId, g]));
  const mensagensPor = new Map(porMensagens.map((m) => [m.sessaoId, m]));
  const custosPor = porSessao(custos);
  const data = (v: string | Date | null | undefined) => (v ? new Date(v) : null);

  return linhas.map(({ sessao, apelido, origem }) => {
    const m = mensagensPor.get(sessao.id);
    const f = fechamentoPor.get(sessao.id);
    const g = geracaoPor.get(sessao.id);
    return {
      id: sessao.id,
      apelido,
      origem,
      estado: sessao.estado,
      createdAt: sessao.createdAt,
      consentiuEm: sessao.consentiuEm,
      terminouInterrogatorioEm: sessao.terminouInterrogatorioEm,
      apagadaEm: sessao.apagadaEm,
      eventos: (eventosPor.get(sessao.id) ?? []).map(({ tipo, dados, createdAt }) => ({ tipo, dados, createdAt })),
      fundador: f?.fundador ?? false,
      pagaria: f?.pagaria ?? null,
      indicacoes: indicacoesPor.get(sessao.id) ?? 0,
      revisar: g?.revisar ?? false,
      erroGeracao: Boolean(g?.erro),
      naoSei: m?.naoSei ?? 0,
      primeiraMensagem: data(m?.primeira),
      ultimaMensagem: data(m?.ultima),
      custo: Object.fromEntries((custosPor.get(sessao.id) ?? []).map((c) => [c.etapa, c.custo])),
      custoNaoMedido: (custosPor.get(sessao.id) ?? []).some((c) => c.naoMedidas > 0),
    };
  });
}

/** What the model calls of erased sessions cost: their rows stay, unlinked (`sessao_id` null). */
export async function custoSemSessao(): Promise<number> {
  const [linha] = await db()
    .select({ total: sql<number>`coalesce(sum(${chamadasLlm.custoUsd}), 0)::float` })
    .from(chamadasLlm)
    .where(isNull(chamadasLlm.sessaoId));
  return linha?.total ?? 0;
}

/**
 * The anchor questions that led to an estimated number, most used first
 * (trimmed, case-folded). Only of sessions that let Daniel read (step 22).
 */
export async function ancorasMaisUsadas(limite = 15): Promise<{ ancora: string; n: number }[]> {
  const ancora = sql<string>`lower(btrim(${metrics.ancora}))`;
  return db()
    .select({ ancora, n: sql<number>`count(*)::int` })
    .from(metrics)
    .innerJoin(accomplishments, eq(accomplishments.id, metrics.accomplishmentId))
    .innerJoin(sessoes, eq(sessoes.id, accomplishments.sessaoId))
    .where(and(eq(metrics.origem, 'estimado'), isNotNull(metrics.ancora), isNotNull(sessoes.podeLerEm)))
    .groupBy(ancora)
    .orderBy(desc(sql`count(*)`), asc(ancora))
    .limit(limite);
}

/**
 * The last question of each session still `interrogando` with no message for
 * `PARADA_APOS_MS`: where people gave up. Newest first. The question and what
 * it was about are null for a session that did not let Daniel read (step 22).
 */
export async function ultimasPerguntasDasParadas(
  agora = new Date(),
): Promise<{ sessaoId: string; apelido: string | null; pergunta: string | null; em: Date; sobre: string | null }[]> {
  const ultimas = await db().execute<{
    sessao_id: string;
    apelido: string | null;
    conteudo: string | null;
    created_at: string;
    sobre: string | null;
  }>(sql`
    select distinct on (m.sessao_id) m.sessao_id, t.apelido, m.created_at,
      case when s.pode_ler_em is not null then m.conteudo end as conteudo,
      case when s.pode_ler_em is not null then coalesce(ac.enunciado, af.organizacao) end as sobre
    from ${mensagens} m
    join ${sessoes} s on s.id = m.sessao_id
    left join ${testers} t on t.id = s.tester_id
    left join ${accomplishments} ac on ac.id = m.accomplishment_id
    left join ${affiliations} af on af.id = m.affiliation_id
    where m.papel = 'assistente' and s.estado = 'interrogando' and s.apagada_em is null
      and (select max(m2.created_at) from ${mensagens} m2 where m2.sessao_id = m.sessao_id)
          < ${new Date(agora.getTime() - PARADA_APOS_MS).toISOString()}::timestamptz
    order by m.sessao_id, m.created_at desc, m.id desc`);
  return [...ultimas]
    .map((r) => ({
      sessaoId: r.sessao_id,
      apelido: r.apelido,
      pergunta: r.conteudo,
      em: new Date(r.created_at),
      sobre: r.sobre,
    }))
    .sort((a, b) => b.em.getTime() - a.em.getTime());
}

// ---- uma sessão -------------------------------------------------------------

/**
 * The numbers of a session's messages, every conversation (the Vagas' too),
 * without a word of them: what the panel shows of a session that did not let
 * Daniel read (step 22).
 */
export async function contagemDeMensagens(sessaoId: string) {
  const [linha] = await db()
    .select({
      perguntas: sql<number>`count(*) filter (where ${mensagens.papel} = 'assistente')::int`,
      respostas: sql<number>`count(*) filter (where ${mensagens.papel} = 'pessoa')::int`,
      naoSei: sql<number>`count(*) filter (where 'nao_sei' = any(${mensagens.marcadores}))::int`,
      primeira: sql<string | null>`min(${mensagens.createdAt})`,
      ultima: sql<string | null>`max(${mensagens.createdAt})`,
    })
    .from(mensagens)
    .where(eq(mensagens.sessaoId, sessaoId));
  const data = (v: string | null | undefined) => (v ? new Date(v) : null);
  return {
    perguntas: linha?.perguntas ?? 0,
    respostas: linha?.respostas ?? 0,
    naoSei: linha?.naoSei ?? 0,
    primeira: data(linha?.primeira),
    ultima: data(linha?.ultima),
  };
}

/** How many Selection attempts the session has (the Vagas' too), and how many passed. */
export async function contagemDeTentativas(sessaoId: string) {
  const [linha] = await db()
    .select({
      tentativas: sql<number>`count(*)::int`,
      aprovadas: sql<number>`count(*) filter (where ${selections.aprovada})::int`,
    })
    .from(selections)
    .where(eq(selections.sessaoId, sessaoId));
  return { tentativas: linha?.tentativas ?? 0, aprovadas: linha?.aprovadas ?? 0 };
}

/** The attempts of a session with their measure, without the PDF bytes, oldest first. */
export async function tentativasParaPainel(sessaoId: string) {
  return db()
    .select({
      id: selections.id,
      tentativa: selections.tentativa,
      json: selections.json,
      violacoes: selections.violacoes,
      aprovada: selections.aprovada,
      createdAt: selections.createdAt,
      renderId: renders.id,
      medida: renders.medida,
      baixadoEm: renders.baixadoEm,
    })
    .from(selections)
    .leftJoin(renders, eq(renders.selectionId, selections.id))
    .where(eq(selections.sessaoId, sessaoId))
    .orderBy(asc(selections.tentativa), asc(selections.createdAt));
}

/** The PDF of one attempt of the session (or null when it is not this session's). */
export async function pdfDaTentativa(sessaoId: string, selectionId: string): Promise<Buffer | null> {
  const [linha] = await db()
    .select({ pdf: renders.pdf })
    .from(renders)
    .innerJoin(selections, eq(selections.id, renders.selectionId))
    .where(and(eq(selections.sessaoId, sessaoId), eq(selections.id, selectionId)))
    .orderBy(desc(renders.createdAt))
    .limit(1);
  return linha?.pdf ?? null;
}

export async function fechamentoParaPainel(sessaoId: string) {
  const [f] = await db().select().from(fechamento).where(eq(fechamento.sessaoId, sessaoId));
  const lista = await db()
    .select()
    .from(indicacoes)
    .where(eq(indicacoes.sessaoId, sessaoId))
    .orderBy(asc(indicacoes.createdAt));
  return { fechamento: f ?? null, indicacoes: lista };
}

export async function eventosDaSessao(sessaoId: string) {
  return db().select().from(eventos).where(eq(eventos.sessaoId, sessaoId)).orderBy(asc(eventos.createdAt));
}

export async function testerDaSessao(sessaoId: string) {
  const [linha] = await db()
    .select({ tester: testers })
    .from(sessoes)
    .innerJoin(testers, eq(testers.id, sessoes.testerId))
    .where(eq(sessoes.id, sessaoId));
  return linha?.tester ?? null;
}

/** The testers that can still be named as having referred someone (not erased). */
export async function testersAtivos(): Promise<{ id: string; apelido: string; origem: string }[]> {
  return db()
    .select({ id: testers.id, apelido: testers.apelido, origem: testers.origem })
    .from(testers)
    .orderBy(asc(testers.apelido));
}

/** Daniel's notes on a session. Refused (false) once it is erased: an erased session keeps no content. */
export async function salvarNotasDaniel(sessaoId: string, notas: string): Promise<boolean> {
  const texto = notas.trim();
  const atualizadas = await db()
    .update(sessoes)
    .set({ notasDaniel: texto === '' ? null : texto })
    .where(and(eq(sessoes.id, sessaoId), isNull(sessoes.apagadaEm)))
    .returning({ id: sessoes.id });
  return atualizadas.length > 0;
}

