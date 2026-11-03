// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, inject, it } from 'vitest';

import { cotaDeVagas, criarVaga, entrar, responderConsentimentoVagas, SEM_LIMITE_DE_VAGAS, sessaoDaConta } from '@/db';
import { db, fecharDb } from '@/db/client';
import * as t from '@/db/schema';

import { assinaturaNaStripe, checkoutConcluido, cobrancaFalsa, daFatura, novosIds, trimestre } from './falso';
import { tratarEvento } from './webhook';

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);

const COLADA = { texto: 'Acme is hiring a Backend Engineer.', empresa: null, cargo: null, link: null };
const DIA = 24 * 60 * 60 * 1000;

let n = 0;
/** A subscriber whose quarter began `diasAtras` days ago, with the Vagas consent given. */
async function assinanteComVagas(diasAtras: number) {
  n += 1;
  const r = await entrar({ provedor: 'google', idNoProvedor: `cota-${Date.now()}-${n}`, email: null, nome: 'Inventada' });
  if (r.tipo !== 'entrou') throw new Error(r.tipo);
  const sessao = (await sessaoDaConta(r.conta.id))!;
  await db().update(t.sessoes).set({ estado: 'pronto' }).where(eq(t.sessoes.id, sessao.id));
  await responderConsentimentoVagas(sessao.id, true);

  const ids = novosIds();
  const stripe = cobrancaFalsa();
  stripe.assinaturas.set(ids.sub, assinaturaNaStripe(ids, r.conta.id, trimestre(diasAtras)));
  await tratarEvento(checkoutConcluido(ids, r.conta.id), stripe);
  return { sessaoId: sessao.id, ids, stripe };
}

async function criarVarias(sessaoId: string, quantas: number) {
  for (let i = 0; i < quantas; i++) {
    const r = await criarVaga(sessaoId, COLADA);
    if (r.tipo !== 'criada') throw new Error(`vaga ${i + 1}: ${r.tipo}`);
  }
}

/** Moves the session's Vagas back in time, as if they were created `dias` days ago. */
const envelhecer = (sessaoId: string, dias: number) =>
  db()
    .update(t.vagas)
    .set({ createdAt: new Date(Date.now() - dias * DIA) })
    .where(eq(t.vagas.sessaoId, sessaoId));

describe.skipIf(semBanco)('a cota de vagas por trimestre', () => {
  it('refuses the 16th Vaga of the quarter, and the renewal gives the quota back', async () => {
    const { sessaoId, ids, stripe } = await assinanteComVagas(30);
    await criarVarias(sessaoId, 15);
    expect(await criarVaga(sessaoId, COLADA)).toEqual({ tipo: 'limite' });

    await envelhecer(sessaoId, 10);
    const proximo = trimestre(1);
    stripe.assinaturas.set(ids.sub, { ...stripe.assinaturas.get(ids.sub)!, ...proximo });
    await tratarEvento(daFatura('invoice.paid', ids), stripe);

    expect(await cotaDeVagas(sessaoId)).toEqual({ usadas: 0, limite: 15, zeraEm: proximo.fim });
    expect((await criarVaga(sessaoId, COLADA)).tipo).toBe('criada');
  });

  it('says how many are used and when the count goes back to zero', async () => {
    const { sessaoId, ids, stripe } = await assinanteComVagas(5);
    await criarVarias(sessaoId, 3);
    expect(await cotaDeVagas(sessaoId)).toEqual({ usadas: 3, limite: 15, zeraEm: stripe.assinaturas.get(ids.sub)!.fim });
  });

  it('Vagas of an earlier quarter do not count, and erased ones of this quarter do', async () => {
    const { sessaoId } = await assinanteComVagas(5);
    await criarVarias(sessaoId, 2);
    await envelhecer(sessaoId, 40);
    await criarVarias(sessaoId, 1);
    const [vaga] = await db().select().from(t.vagas).where(eq(t.vagas.sessaoId, sessaoId)).orderBy(t.vagas.createdAt).limit(1).offset(2);
    await db().update(t.vagas).set({ apagadaEm: new Date() }).where(eq(t.vagas.id, vaga.id));
    expect((await cotaDeVagas(sessaoId)).usadas).toBe(1);
  });

  it('MODO=local has no quota: no limit and no date', async () => {
    // contaLocal's session, without racing conta-local.test.ts for the one local account.
    const r = await entrar({ provedor: 'github', idNoProvedor: `cota-local-${Date.now()}`, email: null, nome: null });
    if (r.tipo !== 'entrou') throw new Error(r.tipo);
    const sessao = (await sessaoDaConta(r.conta.id))!;
    await db().update(t.sessoes).set({ limiteVagas: SEM_LIMITE_DE_VAGAS }).where(eq(t.sessoes.id, sessao.id));
    expect(await cotaDeVagas(sessao.id)).toEqual({ usadas: 0, limite: SEM_LIMITE_DE_VAGAS, zeraEm: null });
  });

  it('without a subscription (a v0 link), every Vaga ever counts, as before', async () => {
    const r = await entrar({ provedor: 'github', idNoProvedor: `cota-sem-${Date.now()}`, email: null, nome: null });
    if (r.tipo !== 'entrou') throw new Error(r.tipo);
    const sessao = (await sessaoDaConta(r.conta.id))!;
    await responderConsentimentoVagas(sessao.id, true);
    await criarVarias(sessao.id, 2);
    await envelhecer(sessao.id, 400);
    expect(await cotaDeVagas(sessao.id)).toEqual({ usadas: 2, limite: 15, zeraEm: null });
  });
});
