// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { assinarConta, daAssinatura } from '@/assinatura/falso';
import { tratarEvento } from '@/assinatura/webhook';
import { criarVaga, entrar, responderConsentimentoVagas, sessaoDaConta } from '@/db';
import { db, fecharDb } from '@/db/client';
import * as t from '@/db/schema';

/** The browser's cookies, as `next/headers` would read them in a request. */
const navegador = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) => (navegador.has(nome) ? { name: nome, value: navegador.get(nome) } : undefined),
    delete: () => {},
  }),
}));

const { COOKIE_CONTA } = await import('./acesso');
const { sessaoDaRota, vagaDaRota } = await import('@/app/casa/_sessao');
const { GET: pdfDaVaga } = await import('@/app/casa/vagas/[id]/pdf/route');
const { POST: chat } = await import('@/app/casa/chat/route');
const { POST: chatDaVaga } = await import('@/app/casa/vagas/[id]/chat/route');
const { POST: fim } = await import('@/app/casa/fim/route');
const { aceitarConsentimento } = await import('@/app/casa/acoes');

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);
beforeEach(() => navegador.clear());

/** What `redirect()` and `notFound()` throw: Next reads the digest. */
async function interrompe(promessa: Promise<unknown>): Promise<string> {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  );
  const digest = (erro as { digest?: string } | null)?.digest;
  if (!digest) throw new Error(`expected a redirect or a 404, got ${String(erro)}`);
  if (digest.startsWith('NEXT_REDIRECT')) return `redirect ${digest.split(';')[2]}`;
  if (digest === 'NEXT_HTTP_ERROR_FALLBACK;404') return '404';
  return digest;
}

let n = 0;
/**
 * An invented person, signed in, past the interrogation, with one Vaga made
 * while subscribed. `assinar: false` then takes the subscription away.
 */
async function pessoa() {
  n += 1;
  const r = await entrar({ provedor: 'github', idNoProvedor: `paywall-${Date.now()}-${n}`, email: null, nome: 'Inventada' });
  if (r.tipo !== 'entrou') throw new Error(r.tipo);
  const assinatura = await assinarConta(r.conta.id);
  const sessao = (await sessaoDaConta(r.conta.id))!;
  await db()
    .update(t.sessoes)
    .set({ estado: 'pronto', consentiuEm: new Date(), textoConsentimentoVersao: 'v2' })
    .where(eq(t.sessoes.id, sessao.id));
  await responderConsentimentoVagas(sessao.id, true);
  const criacao = await criarVaga(sessao.id, { texto: 'Acme is hiring a Backend Engineer.', empresa: null, cargo: null, link: null });
  if (criacao.tipo !== 'criada') throw new Error(criacao.tipo);
  navegador.set(COOKIE_CONTA, r.acesso);
  return { conta: r.conta, sessaoId: sessao.id, vagaId: criacao.vaga.id, ...assinatura };
}

/** Stripe ended the subscription and the webhook wrote it. */
async function terminar({ ids, stripe }: Awaited<ReturnType<typeof pessoa>>) {
  stripe.assinaturas.set(ids.sub, { ...stripe.assinaturas.get(ids.sub)!, status: 'canceled' });
  await tratarEvento(daAssinatura('customer.subscription.deleted', ids), stripe);
}

const pedido = (caminho: string) => new Request(`http://localhost:3000${caminho}`, { method: 'POST', body: '{}' });

describe.skipIf(semBanco)('o paywall', () => {
  it('subscribed, the routes open', async () => {
    const p = await pessoa();
    expect((await sessaoDaRota()).id).toBe(p.sessaoId);
    expect((await vagaDaRota(p.vagaId)).vaga.id).toBe(p.vagaId);
  });

  it('without a subscription, every route below the home sends to the home, which shows the paywall', async () => {
    const p = await pessoa();
    await terminar(p);
    expect(await interrompe(sessaoDaRota())).toBe('redirect /casa');
    expect(await interrompe(vagaDaRota(p.vagaId))).toBe('redirect /casa');
    expect(await interrompe(pdfDaVaga(new Request('http://localhost:3000/x'), { params: Promise.resolve({ id: p.vagaId }) }))).toBe(
      'redirect /casa',
    );
  });

  it('without a subscription, the chat and the end beacon are a 402', async () => {
    const p = await pessoa();
    await terminar(p);
    expect((await chat(pedido('/casa/chat'))).status).toBe(402);
    expect((await chatDaVaga(pedido(`/casa/vagas/${p.vagaId}/chat`), { params: Promise.resolve({ id: p.vagaId }) })).status).toBe(402);
    expect((await fim()).status).toBe(402);
  });

  it('without a subscription, an action sends to the home and changes nothing', async () => {
    const r = await entrar({ provedor: 'google', idNoProvedor: `paywall-acao-${Date.now()}`, email: null, nome: null });
    if (r.tipo !== 'entrou') throw new Error(r.tipo);
    navegador.set(COOKIE_CONTA, r.acesso);
    const form = new FormData();
    form.set('aceito', 'sim');
    expect(await interrompe(aceitarConsentimento(form))).toBe('redirect /casa');
    expect((await sessaoDaConta(r.conta.id))!.estado).toBe('novo');
  });

  it('a payment that did not go through (past_due) closes it too', async () => {
    const p = await pessoa();
    p.stripe.assinaturas.set(p.ids.sub, { ...p.stripe.assinaturas.get(p.ids.sub)!, status: 'past_due' });
    await tratarEvento(daAssinatura('customer.subscription.updated', p.ids), p.stripe);
    expect(await interrompe(sessaoDaRota())).toBe('redirect /casa');
  });
});
