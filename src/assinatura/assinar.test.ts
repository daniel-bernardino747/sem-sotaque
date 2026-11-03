// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { entrar } from '@/db';
import { fecharDb } from '@/db/client';

import { telaSemAcesso } from './acesso';
import { assinarConta, cobrancaFalsa, daAssinatura } from './falso';
import { usarCobranca } from './stripe';
import { tratarEvento } from './webhook';

/** The browser's cookies, as `next/headers` would read them in a request. */
const navegador = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) => (navegador.has(nome) ? { name: nome, value: navegador.get(nome) } : undefined),
  }),
}));
vi.mock('next/server', async (original) => ({ ...(await original<object>()), connection: async () => {} }));

const { COOKIE_CONTA } = await import('@/conta/acesso');
const { assinar, gerirAssinatura } = await import('@/app/casa/acoes');

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);
beforeEach(() => navegador.clear());
afterEach(() => {
  usarCobranca(null);
  vi.unstubAllEnvs();
});

/** What `redirect()` throws: Next reads the digest. */
async function destino(promessa: Promise<unknown>): Promise<string | unknown> {
  try {
    return await promessa;
  } catch (e) {
    const digest = (e as { digest?: string }).digest;
    if (digest?.startsWith('NEXT_REDIRECT')) return `redirect ${digest.split(';')[2]}`;
    throw e;
  }
}

let n = 0;
async function entrou(email: string | null = null) {
  n += 1;
  const r = await entrar({ provedor: 'github', idNoProvedor: `assinar-${Date.now()}-${n}`, email, nome: 'Inventada' });
  if (r.tipo !== 'entrou') throw new Error(r.tipo);
  navegador.set(COOKIE_CONTA, r.acesso);
  return r.conta;
}

const CHECKOUT = 'redirect https://checkout.stripe.com/c/pay/cs_test_falso';
const PORTAL = 'redirect https://billing.stripe.com/p/session/test_falso';

describe.skipIf(semBanco)('assinar e gerir', () => {
  it('"Assinar" sends to the Checkout, with the account as the reference and its e-mail', async () => {
    const conta = await entrou('inventada@exemplo.com');
    const stripe = cobrancaFalsa();
    usarCobranca(stripe);
    expect(await destino(assinar({ erro: false }, new FormData()))).toBe(CHECKOUT);
    expect(stripe.checkouts).toEqual([{ contaId: conta.id, email: 'inventada@exemplo.com', cliente: null }]);
  });

  it('after a subscription ended, the new Checkout reuses the Stripe customer', async () => {
    const conta = await entrou();
    const { ids, stripe } = await assinarConta(conta.id);
    stripe.assinaturas.set(ids.sub, { ...stripe.assinaturas.get(ids.sub)!, status: 'canceled' });
    await tratarEvento(daAssinatura('customer.subscription.deleted', ids), stripe);
    usarCobranca(stripe);
    expect(await destino(assinar({ erro: false }, new FormData()))).toBe(CHECKOUT);
    expect(stripe.checkouts).toMatchObject([{ cliente: ids.cus }]);
  });

  it('a live subscription, even one with a failed payment, never gets a second Checkout', async () => {
    const conta = await entrou();
    const { ids, stripe } = await assinarConta(conta.id);
    usarCobranca(stripe);
    expect(await destino(assinar({ erro: false }, new FormData()))).toBe('redirect /casa');

    stripe.assinaturas.set(ids.sub, { ...stripe.assinaturas.get(ids.sub)!, status: 'past_due' });
    await tratarEvento(daAssinatura('customer.subscription.updated', ids), stripe);
    expect(await destino(assinar({ erro: false }, new FormData()))).toBe('redirect /casa');
    expect(stripe.checkouts).toEqual([]);
  });

  it('Stripe down: the form says the payment did not open', async () => {
    await entrou();
    const stripe = cobrancaFalsa();
    stripe.falhar = true;
    usarCobranca(stripe);
    expect(await destino(assinar({ erro: false }, new FormData()))).toEqual({ erro: true });
  });

  it('"Gerenciar assinatura" sends to the portal of the account\'s customer', async () => {
    const conta = await entrou();
    const { ids, stripe } = await assinarConta(conta.id);
    usarCobranca(stripe);
    expect(await destino(gerirAssinatura())).toBe(PORTAL);
    expect(stripe.portais).toEqual([ids.cus]);
  });

  it('without a subscription there is no portal: back home', async () => {
    await entrou();
    usarCobranca(cobrancaFalsa());
    expect(await destino(gerirAssinatura())).toBe('redirect /casa');
  });

  it('signed out, both go to /entrar', async () => {
    expect(await destino(assinar({ erro: false }, new FormData()))).toBe('redirect /entrar');
    expect(await destino(gerirAssinatura())).toBe('redirect /entrar');
  });

  it('MODO=local has no payment: both go home', async () => {
    vi.stubEnv('MODO', 'local');
    const stripe = cobrancaFalsa();
    usarCobranca(stripe);
    expect(await destino(assinar({ erro: false }, new FormData()))).toBe('redirect /casa');
    expect(await destino(gerirAssinatura())).toBe('redirect /casa');
    expect(stripe.checkouts).toEqual([]);
  });
});

describe('a tela sem acesso', () => {
  it('never subscribed or ended: the paywall; back from the Checkout: the wait for the webhook', () => {
    expect(telaSemAcesso('sem', false)).toBe('assinar');
    expect(telaSemAcesso('sem', true)).toBe('esperando');
  });

  it('a payment that did not go through: the portal, never a second subscription', () => {
    expect(telaSemAcesso('pendente', false)).toBe('pendente');
    expect(telaSemAcesso('pendente', true)).toBe('pendente');
  });
});
