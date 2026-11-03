// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import Stripe from 'stripe';
import { afterAll, afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { entrar, eventoStripeVisto } from '@/db';
import { fecharDb } from '@/db/client';

import { temAcesso } from './acesso';
import { assinaturaNaStripe, checkoutConcluido, cobrancaFalsa, novosIds } from './falso';
import { daStripe, usarCobranca } from './stripe';

const { POST } = await import('@/app/api/stripe/webhook/route');

const SEGREDO = 'whsec_teste_inventado';
const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);
beforeEach(() => vi.stubEnv('STRIPE_WEBHOOK_SECRET', SEGREDO));
afterEach(() => {
  vi.unstubAllEnvs();
  usarCobranca(null);
});

/** What Stripe posts: the raw body and its signature header. */
function entrega(evento: object, segredo = SEGREDO, assinar = true): Request {
  const corpo = JSON.stringify(evento);
  const headers = new Headers({ 'content-type': 'application/json' });
  if (assinar) headers.set('stripe-signature', Stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: segredo }));
  return new Request('http://localhost:3000/api/stripe/webhook', { method: 'POST', body: corpo, headers });
}

describe('a rota do webhook', () => {
  it('a signature made with another secret is a 400, and nothing is handled', async () => {
    const evento = checkoutConcluido(novosIds(), 'conta-qualquer');
    const resposta = await POST(entrega(evento, 'whsec_de_outro'));
    expect(resposta.status).toBe(400);
  });

  it('no signature at all is a 400', async () => {
    expect((await POST(entrega(checkoutConcluido(novosIds(), 'x'), SEGREDO, false))).status).toBe(400);
  });

  it('a body changed after signing is a 400', async () => {
    const corpo = JSON.stringify(checkoutConcluido(novosIds(), 'x'));
    const assinatura = Stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: SEGREDO });
    const adulterado = new Request('http://localhost:3000/api/stripe/webhook', {
      method: 'POST',
      body: corpo.replace('"x"', '"outra-conta"'),
      headers: { 'stripe-signature': assinatura },
    });
    expect((await POST(adulterado)).status).toBe(400);
  });

  it('in MODO=local there is no webhook: 404', async () => {
    vi.stubEnv('MODO', 'local');
    expect((await POST(entrega(checkoutConcluido(novosIds(), 'x')))).status).toBe(404);
  });

  it.skipIf(semBanco)('a signed event is handled and answered 200', async () => {
    const r = await entrar({ provedor: 'github', idNoProvedor: `rota-stripe-${Date.now()}`, email: null, nome: 'Inventada' });
    if (r.tipo !== 'entrou') throw new Error(r.tipo);
    const ids = novosIds();
    const stripe = cobrancaFalsa();
    stripe.assinaturas.set(ids.sub, assinaturaNaStripe(ids, r.conta.id));
    usarCobranca(stripe);

    const evento = checkoutConcluido(ids, r.conta.id);
    expect((await POST(entrega(evento))).status).toBe(200);
    expect(await eventoStripeVisto(evento.id)).toBe(true);
    expect(await temAcesso(r.conta)).toBe(true);
  });

  it.skipIf(semBanco)('Stripe down while handling is a 500, so Stripe sends it again', async () => {
    const stripe = cobrancaFalsa();
    stripe.falhar = true;
    usarCobranca(stripe);
    const evento = checkoutConcluido(novosIds(), 'x');
    expect((await POST(entrega(evento))).status).toBe(500);
    expect(await eventoStripeVisto(evento.id)).toBe(false);
  });
});

describe('daStripe', () => {
  it('reads the period from the item (API basil and later) and the account from the metadata', () => {
    const s = {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      metadata: { conta_id: 'conta-1' },
      items: { data: [{ current_period_start: 1_790_000_000, current_period_end: 1_797_862_400 }] },
    } as unknown as Stripe.Subscription;
    expect(daStripe(s)).toEqual({
      id: 'sub_1',
      cliente: 'cus_1',
      status: 'active',
      inicio: new Date(1_790_000_000_000),
      fim: new Date(1_797_862_400_000),
      contaId: 'conta-1',
    });
  });

  it('a subscription made outside the Checkout has no account', () => {
    const s = {
      id: 'sub_2',
      customer: { id: 'cus_2' },
      status: 'trialing',
      metadata: {},
      items: { data: [{ current_period_start: 1, current_period_end: 2 }] },
    } as unknown as Stripe.Subscription;
    expect(daStripe(s)).toMatchObject({ cliente: 'cus_2', contaId: null });
  });
});
