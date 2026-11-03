// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { assinaturaDaConta, entrar, sessaoDaConta } from '@/db';
import { fecharDb } from '@/db/client';

import { assinarConta, cobrancaFalsa, daAssinatura } from './falso';
import { usarCobranca } from './stripe';
import { tratarEvento } from './webhook';

/** The browser's cookies, as `next/headers` would read them in a request. */
const navegador = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) => (navegador.has(nome) ? { name: nome, value: navegador.get(nome) } : undefined),
    delete: ({ name }: { name: string }) => navegador.delete(name),
  }),
}));

const { COOKIE_CONTA } = await import('@/conta/acesso');
const { apagarDados } = await import('@/app/casa/acoes');

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);
beforeEach(() => navegador.clear());
afterEach(() => usarCobranca(null));

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
async function entrou() {
  n += 1;
  const r = await entrar({ provedor: 'github', idNoProvedor: `apagar-${Date.now()}-${n}`, email: null, nome: 'Inventada' });
  if (r.tipo !== 'entrou') throw new Error(r.tipo);
  navegador.set(COOKIE_CONTA, r.acesso);
  return r.conta;
}

const apagar = () => destino(apagarDados({ erro: false }, new FormData()));

describe.skipIf(semBanco)('apagar a conta', () => {
  it('cancels the subscription at Stripe now, then erases', async () => {
    const conta = await entrou();
    const { ids, stripe } = await assinarConta(conta.id);
    usarCobranca(stripe);

    expect(await apagar()).toBe('redirect /apagado');
    expect(stripe.canceladas).toEqual([ids.sub]);
    expect(await sessaoDaConta(conta.id)).toBeNull();
    expect(await assinaturaDaConta(conta.id)).toBeNull();
  });

  it('Stripe down: nothing is erased, and the form says so', async () => {
    const conta = await entrou();
    const { stripe } = await assinarConta(conta.id);
    stripe.falhar = true;
    usarCobranca(stripe);

    expect(await apagar()).toEqual({ erro: true });
    expect(await sessaoDaConta(conta.id)).not.toBeNull();
  });

  it('an ended subscription is not canceled again', async () => {
    const conta = await entrou();
    const { ids, stripe } = await assinarConta(conta.id);
    stripe.assinaturas.set(ids.sub, { ...stripe.assinaturas.get(ids.sub)!, status: 'canceled' });
    await tratarEvento(daAssinatura('customer.subscription.deleted', ids), stripe);
    usarCobranca(stripe);

    expect(await apagar()).toBe('redirect /apagado');
    expect(stripe.canceladas).toEqual([]);
  });

  it('without a subscription, it erases without calling Stripe', async () => {
    const conta = await entrou();
    const stripe = cobrancaFalsa();
    stripe.falhar = true;
    usarCobranca(stripe);
    expect(await apagar()).toBe('redirect /apagado');
    expect(await sessaoDaConta(conta.id)).toBeNull();
  });
});
