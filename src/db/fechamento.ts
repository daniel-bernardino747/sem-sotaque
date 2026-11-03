// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The data layer of the end of the session (step 07): the founder's price, the
 * referrals, "pagaria?", the testimonial and the comment. Everything is
 * optional and only after the résumé was delivered (`pronto`); the first thing
 * sent, or leaving the section, moves the session to `encerrado`, which still
 * shows the résumé and still takes the rest of the answers.
 */
import { and, count, eq, isNull } from 'drizzle-orm';

import { db } from './client';
import { eventos, fechamento, indicacoes, sessoes } from './schema';

type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

export type Fechamento = typeof fechamento.$inferSelect;

/** What the end screen sends now (step 22). `pagaria` and `pagaria_quanto` stay in the table, unasked. */
export interface Opiniao {
  depoimento: string | null;
  /** Its own consent, never the entry one: true only when the person ticked it. */
  depoimentoPodeUsar: boolean;
  comentario: string | null;
}

export interface Indicacao {
  nome: string;
  contato: string;
}

/** What the person already sent at the end, for the screen to show. */
export async function fechamentoDaSessao(
  sessaoId: string,
): Promise<{ fechamento: Fechamento | null; indicacoes: number }> {
  const [[linha], [{ n }]] = await Promise.all([
    db().select().from(fechamento).where(eq(fechamento.sessaoId, sessaoId)),
    db().select({ n: count() }).from(indicacoes).where(eq(indicacoes.sessaoId, sessaoId)),
  ]);
  return { fechamento: linha ?? null, indicacoes: n };
}

/**
 * Locks the session for a write at the end. Only a delivered session that was
 * not erased takes one; returns false otherwise, and nothing is written.
 */
async function noFim(tx: Tx, sessaoId: string): Promise<boolean> {
  const [sessao] = await tx.select().from(sessoes).where(eq(sessoes.id, sessaoId)).for('update');
  if (!sessao || sessao.apagadaEm || (sessao.estado !== 'pronto' && sessao.estado !== 'encerrado')) return false;
  if (sessao.estado === 'pronto') await tx.update(sessoes).set({ estado: 'encerrado' }).where(eq(sessoes.id, sessaoId));
  return true;
}

/**
 * "Sai da seção" without sending: `pronto` → `encerrado`. Anything else
 * (still generating, already closed, erased) is left as it is.
 */
export async function encerrarSessao(sessaoId: string): Promise<void> {
  await db()
    .update(sessoes)
    .set({ estado: 'encerrado' })
    .where(and(eq(sessoes.id, sessaoId), eq(sessoes.estado, 'pronto'), isNull(sessoes.apagadaEm)));
}

/** One or more devs the person knows, and an `indicou` event with how many (never who). */
export async function registrarIndicacoes(sessaoId: string, lista: Indicacao[]): Promise<boolean> {
  if (lista.length === 0) return false;
  return db().transaction(async (tx) => {
    if (!(await noFim(tx, sessaoId))) return false;
    await tx.insert(indicacoes).values(lista.map((i) => ({ sessaoId, ...i })));
    await tx.insert(eventos).values({ sessaoId, tipo: 'indicou', dados: { quantas: lista.length } });
    return true;
  });
}

/** The testimonial with its own consent, and "algo deu errado?". Sent again, it replaces. */
export async function gravarOpiniao(sessaoId: string, dados: Opiniao): Promise<boolean> {
  return db().transaction(async (tx) => {
    if (!(await noFim(tx, sessaoId))) return false;
    await tx
      .insert(fechamento)
      .values({ sessaoId, ...dados })
      .onConflictDoUpdate({ target: fechamento.sessaoId, set: dados });
    return true;
  });
}

