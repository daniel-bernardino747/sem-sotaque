// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The data layer of the evaluator (step 10): a conversation's plan,
 * overwritten at every checkpoint, and one row per decision for the panel.
 * The general conversation's plan has no Vaga; each Vaga's conversation has
 * its own (step 16). The plan's shape lives in `src/avaliador/plano.ts`; here
 * it is only stored.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from './client';
import { decisoesAvaliador, plano } from './schema';

export type LinhaPlano = typeof plano.$inferSelect;
export type DecisaoAvaliador = typeof decisoesAvaliador.$inferSelect;

export async function planoDaSessao(sessaoId: string, vagaId: string | null = null): Promise<LinhaPlano | null> {
  const [linha] = await db()
    .select()
    .from(plano)
    .where(and(eq(plano.sessaoId, sessaoId), vagaId ? eq(plano.vagaId, vagaId) : isNull(plano.vagaId)));
  return linha ?? null;
}

export async function gravarPlano(
  sessaoId: string,
  dados: Omit<typeof plano.$inferInsert, 'id' | 'sessaoId' | 'vagaId' | 'createdAt' | 'atualizadoEm'>,
  vagaId: string | null = null,
): Promise<void> {
  const valores = { ...dados, atualizadoEm: new Date() };
  await db()
    .insert(plano)
    .values({ ...valores, sessaoId, vagaId })
    .onConflictDoUpdate({ target: [plano.sessaoId, plano.vagaId], set: valores });
}

/** The general conversation's coverage, after a Vaga's conversation recorded into the Corpus (step 16). */
export async function atualizarCobertura(sessaoId: string, cobertura: number): Promise<void> {
  await db()
    .update(plano)
    .set({ cobertura, atualizadoEm: new Date() })
    .where(and(eq(plano.sessaoId, sessaoId), isNull(plano.vagaId)));
}

export async function registrarDecisao(
  sessaoId: string,
  dados: Omit<typeof decisoesAvaliador.$inferInsert, 'id' | 'sessaoId' | 'createdAt'>,
): Promise<void> {
  await db().insert(decisoesAvaliador).values({ ...dados, sessaoId });
}

/** A conversation's evaluator timeline, oldest first: the general one, or a Vaga's. */
export async function decisoesDaSessao(sessaoId: string, vagaId: string | null = null): Promise<DecisaoAvaliador[]> {
  return db()
    .select()
    .from(decisoesAvaliador)
    .where(
      and(
        eq(decisoesAvaliador.sessaoId, sessaoId),
        vagaId ? eq(decisoesAvaliador.vagaId, vagaId) : isNull(decisoesAvaliador.vagaId),
      ),
    )
    .orderBy(asc(decisoesAvaliador.createdAt), asc(decisoesAvaliador.id));
}
