// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The Vagas (step 15): the separate consent, the gate of "Achei uma vaga", the
 * limit per session, the reading's result and the checklist. A Vaga is never
 * deleted, only emptied (`esvaziar`), so the funnel and the cost per job
 * survive; every Vaga event carries `{ vaga_id }`.
 */
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull } from 'drizzle-orm';

import { db } from './client';
import {
  assinaturas,
  eventos,
  geracoes,
  mensagens,
  plano,
  requisitos,
  sessoes,
  testers,
  vagas,
  type EstagioVaga,
  type RespostaLacuna,
} from './schema';

export type Vaga = typeof vagas.$inferSelect;
export type Requisito = typeof requisitos.$inferSelect;
export type VagaComRequisitos = Vaga & { requisitos: Requisito[] };

/** Above this coverage, "Achei uma vaga" opens (P5). */
export const COBERTURA_PARA_VAGAS = 70;

type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether "Achei uma vaga" is open: the coverage passed 70% or a general résumé
 * was delivered. Once open it stays open (`vagas_liberadas_em`), even when a
 * skipped record comes back and the coverage drops.
 */
export async function vagasLiberadas(sessaoId: string): Promise<boolean> {
  const [sessao] = await db()
    .select({ liberadas: sessoes.vagasLiberadasEm, apagada: sessoes.apagadaEm })
    .from(sessoes)
    .where(eq(sessoes.id, sessaoId));
  if (!sessao || sessao.apagada) return false;
  if (sessao.liberadas) return true;

  const [[cobertura], [entregue]] = await Promise.all([
    db().select({ valor: plano.cobertura }).from(plano).where(eq(plano.sessaoId, sessaoId)),
    db()
      .select({ id: geracoes.id })
      .from(geracoes)
      .where(and(eq(geracoes.sessaoId, sessaoId), isNotNull(geracoes.selectionId), isNotNull(geracoes.terminadaEm)))
      .limit(1),
  ]);
  if ((cobertura?.valor ?? 0) <= COBERTURA_PARA_VAGAS && !entregue) return false;
  await db()
    .update(sessoes)
    .set({ vagasLiberadasEm: new Date() })
    .where(and(eq(sessoes.id, sessaoId), isNull(sessoes.vagasLiberadasEm)));
  return true;
}

/**
 * The answer to the Vagas consent (P19). Yes is kept for good; no is recorded
 * (`recusou_vagas_em`, the last one) and the next "Achei uma vaga" asks again.
 * An erased session changes nothing.
 */
export async function responderConsentimentoVagas(sessaoId: string, aceitou: boolean): Promise<void> {
  await db()
    .update(sessoes)
    .set(aceitou ? { vagasConsentiuEm: new Date() } : { recusouVagasEm: new Date() })
    .where(and(eq(sessoes.id, sessaoId), isNull(sessoes.apagadaEm), isNull(sessoes.vagasConsentiuEm)));
}

/** Every Vaga the session ever created, the emptied ones too (the spending cap per session counts them). */
export async function vagasCriadas(sessaoId: string): Promise<number> {
  const [linha] = await db().select({ n: count() }).from(vagas).where(eq(vagas.sessaoId, sessaoId));
  return linha?.n ?? 0;
}

/** Where the quota of the session stands (step 21). */
export interface CotaDeVagas {
  /** Vagas created in the paid period now, emptied ones included: erasing does not give the quota back. */
  usadas: number;
  /** `limite_vagas`: 15 a quarter; `SEM_LIMITE_DE_VAGAS` in `MODO=local`. */
  limite: number;
  /** When the count goes back to zero (the end of the paid period); null without a subscription. */
  zeraEm: Date | null;
}

/**
 * The quota, read inside `criarVaga`'s transaction too. With a subscription,
 * it counts what was created since the period began: a Vaga made after the
 * period ended but before the renewal's webhook arrived still counts, never
 * a free one. Without a subscription (`MODO=local`, a v0 Tester), every Vaga
 * ever counts, as before step 21.
 */
async function cota(tx: Tx | ReturnType<typeof db>, sessao: { id: string; testerId: string | null; limiteVagas: number }): Promise<CotaDeVagas> {
  const [periodo] = sessao.testerId
    ? await tx
        .select({ inicio: assinaturas.periodoInicio, fim: assinaturas.periodoFim })
        .from(testers)
        .innerJoin(assinaturas, eq(assinaturas.contaId, testers.contaId))
        .where(eq(testers.id, sessao.testerId))
    : [];
  const [{ n }] = await tx
    .select({ n: count() })
    .from(vagas)
    .where(and(eq(vagas.sessaoId, sessao.id), ...(periodo ? [gte(vagas.createdAt, periodo.inicio)] : [])));
  return { usadas: n, limite: sessao.limiteVagas, zeraEm: periodo?.fim ?? null };
}

export async function cotaDeVagas(sessaoId: string): Promise<CotaDeVagas> {
  const [sessao] = await db().select().from(sessoes).where(eq(sessoes.id, sessaoId));
  if (!sessao) throw new Error(`no session ${sessaoId}`);
  return cota(db(), sessao);
}

export type CriacaoVaga = { tipo: 'criada'; vaga: Vaga } | { tipo: 'limite' } | { tipo: 'recusada' };

/**
 * A new Vaga from what the person pasted, with the `vaga_criada` event. Refused
 * without the Vagas consent, for an erased session (`recusada`) and once the
 * quota is used (`limite`, `cotaDeVagas`). The session row is locked, so two
 * tabs cannot both take the last one.
 */
export async function criarVaga(
  sessaoId: string,
  dados: { texto: string; empresa: string | null; cargo: string | null; link: string | null },
): Promise<CriacaoVaga> {
  return db().transaction(async (tx) => {
    const [sessao] = await tx.select().from(sessoes).where(eq(sessoes.id, sessaoId)).for('update');
    if (!sessao || sessao.apagadaEm || !sessao.vagasConsentiuEm) return { tipo: 'recusada' };
    const { usadas, limite } = await cota(tx, sessao);
    if (usadas >= limite) return { tipo: 'limite' };
    const [vaga] = await tx
      .insert(vagas)
      .values({ sessaoId, ...dados })
      .returning();
    await tx.insert(eventos).values({ sessaoId, tipo: 'vaga_criada', dados: { vaga_id: vaga.id } });
    return { tipo: 'criada', vaga };
  });
}

/** The session's live Vagas, newest first, for the home. */
export async function vagasDaSessao(sessaoId: string): Promise<Vaga[]> {
  return db()
    .select()
    .from(vagas)
    .where(and(eq(vagas.sessaoId, sessaoId), isNull(vagas.apagadaEm)))
    .orderBy(desc(vagas.createdAt));
}

/**
 * A Vaga with its Requisitos, only if it is this session's and was not
 * emptied: anything else is null, and the route answers 404 (never 403).
 */
export async function vagaDaSessao(sessaoId: string, vagaId: string): Promise<VagaComRequisitos | null> {
  if (!UUID.test(vagaId)) return null;
  const [vaga] = await db()
    .select()
    .from(vagas)
    .where(and(eq(vagas.id, vagaId), eq(vagas.sessaoId, sessaoId), isNull(vagas.apagadaEm)));
  if (!vaga) return null;
  const lista = await db()
    .select()
    .from(requisitos)
    .where(eq(requisitos.vagaId, vagaId))
    .orderBy(asc(requisitos.ordem), asc(requisitos.createdAt));
  return { ...vaga, requisitos: lista };
}

/** What the reading of a Vaga gives, with every id already checked against the Corpus. */
export interface LeituraGravada {
  empresa: string | null;
  cargo: string | null;
  senioridade: string | null;
  lingua: NonNullable<Vaga['lingua']>;
  requisitos: { texto: string; tipo: Requisito['tipo']; accomplishmentIds: string[] }[];
  rascunhos: { accomplishmentId: string; motivo: string }[];
}

const AINDA_LENDO: EstagioVaga[] = ['lendo', 'leitura_falhou'];

/**
 * Writes the reading: the Requisitos (a gap is one with no record), what the
 * person left blank of the company and the role, and the stage `lida`. Only
 * once, for a live Vaga still being read; returns whether it wrote.
 */
export async function gravarLeitura(vagaId: string, leitura: LeituraGravada): Promise<boolean> {
  return db().transaction(async (tx) => {
    const [vaga] = await tx.select().from(vagas).where(eq(vagas.id, vagaId)).for('update');
    if (!vaga || vaga.apagadaEm || !AINDA_LENDO.includes(vaga.estagio)) return false;
    await tx
      .update(vagas)
      .set({
        empresa: vaga.empresa ?? leitura.empresa,
        cargo: vaga.cargo ?? leitura.cargo,
        senioridade: leitura.senioridade,
        lingua: leitura.lingua,
        rascunhos: leitura.rascunhos,
        estagio: 'lida',
      })
      .where(eq(vagas.id, vagaId));
    if (leitura.requisitos.length) {
      await tx.insert(requisitos).values(
        leitura.requisitos.map((r, ordem) => ({
          vagaId,
          sessaoId: vaga.sessaoId,
          texto: r.texto,
          tipo: r.tipo,
          accomplishmentIds: r.accomplishmentIds,
          lacuna: r.accomplishmentIds.length === 0,
          ordem,
        })),
      );
    }
    return true;
  });
}

/** The reading failed: the page offers "tentar de novo". `lendo` again starts it over. */
export async function marcarEstagioDaLeitura(vagaId: string, estagio: 'lendo' | 'leitura_falhou'): Promise<void> {
  await db()
    .update(vagas)
    .set({ estagio })
    .where(and(eq(vagas.id, vagaId), isNull(vagas.apagadaEm), inArray(vagas.estagio, AINDA_LENDO)));
}

/**
 * The person confirmed the company and the role and marked the gaps (P8, P9).
 * Fixing the role does not read the Vaga again: the Requisitos come from the
 * posting. Only a read, live Vaga of this session; returns whether it wrote.
 */
export async function confirmarVaga(
  sessaoId: string,
  vagaId: string,
  dados: { empresa: string | null; cargo: string | null; respostas: Map<string, RespostaLacuna> },
): Promise<boolean> {
  return db().transaction(async (tx) => {
    const [vaga] = await tx
      .select()
      .from(vagas)
      .where(and(eq(vagas.id, vagaId), eq(vagas.sessaoId, sessaoId), isNull(vagas.apagadaEm)))
      .for('update');
    if (!vaga || !['lida', 'confirmada'].includes(vaga.estagio)) return false;
    await tx
      .update(vagas)
      .set({ empresa: dados.empresa, cargo: dados.cargo, estagio: 'confirmada' })
      .where(eq(vagas.id, vagaId));
    for (const [requisitoId, resposta] of dados.respostas) {
      if (!UUID.test(requisitoId)) continue;
      await tx
        .update(requisitos)
        .set({ resposta })
        .where(and(eq(requisitos.id, requisitoId), eq(requisitos.vagaId, vagaId), eq(requisitos.lacuna, true)));
    }
    return true;
  });
}

/** Empties live Vagas (all of the session's, or the ones in `ids`) and records a `vaga_apagada` for each. */
async function esvaziar(tx: Tx, sessaoId: string, ids?: string[]): Promise<void> {
  const filtro = and(
    eq(vagas.sessaoId, sessaoId),
    isNull(vagas.apagadaEm),
    ...(ids ? [inArray(vagas.id, ids)] : []),
  );
  const esvaziadas = await tx
    .update(vagas)
    .set({ texto: null, empresa: null, cargo: null, link: null, senioridade: null, rascunhos: null, apagadaEm: new Date() })
    .where(filtro)
    .returning({ id: vagas.id });
  // Requisitos hold what the posting asked, in its words: they go, whatever the state.
  await tx
    .delete(requisitos)
    .where(ids ? and(eq(requisitos.sessaoId, sessaoId), inArray(requisitos.vagaId, ids)) : eq(requisitos.sessaoId, sessaoId));
  // The Vaga's conversation can name the company; what it became in the Corpus stays (step 16).
  if (ids) {
    await tx.delete(mensagens).where(and(eq(mensagens.sessaoId, sessaoId), inArray(mensagens.vagaId, ids)));
    await tx.delete(plano).where(and(eq(plano.sessaoId, sessaoId), inArray(plano.vagaId, ids)));
    // Its Versions, with the map and the interview questions (step 17); selections and renders by cascade.
    await tx.delete(geracoes).where(and(eq(geracoes.sessaoId, sessaoId), inArray(geracoes.vagaId, ids)));
  }
  if (esvaziadas.length) {
    await tx
      .insert(eventos)
      .values(esvaziadas.map((v) => ({ sessaoId, tipo: 'vaga_apagada' as const, dados: { vaga_id: v.id } })));
  }
}

/** For `apagarSessao`: empties every Vaga of the session inside its transaction. */
export const esvaziarVagasDaSessao = (tx: Tx, sessaoId: string) => esvaziar(tx, sessaoId);

/**
 * "Apagar esta vaga" (P21), in any stage: the posting and everything read from
 * it go, the row and its events stay, and the quota is not given back.
 * Idempotent; another session's Vaga is left alone.
 */
export async function apagarVaga(sessaoId: string, vagaId: string): Promise<void> {
  if (!UUID.test(vagaId)) return;
  await db().transaction((tx) => esvaziar(tx, sessaoId, [vagaId]));
}

/** The Vaga events, which survive an erasure (they hold only the `vaga_id`). */
export const EVENTOS_DE_VAGA = ['vaga_criada', 'vaga_apagada', 'vaga_gerada'] as const;
