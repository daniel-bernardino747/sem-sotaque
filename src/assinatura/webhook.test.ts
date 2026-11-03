// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, describe, expect, inject, it } from 'vitest';

import { entrar, type Conta } from '@/db';
import { assinaturaDaConta } from '@/db/assinaturas';
import { fecharDb } from '@/db/client';

import { temAcesso } from './acesso';
import {
  assinaturaNaStripe,
  checkoutConcluido,
  cobrancaFalsa,
  daAssinatura,
  daFatura,
  novosIds,
  reembolso,
  trimestre,
} from './falso';
import { tratarEvento } from './webhook';

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);

let n = 0;
async function contaInventada(): Promise<Conta> {
  n += 1;
  const r = await entrar({ provedor: 'github', idNoProvedor: `assina-${Date.now()}-${n}`, email: null, nome: 'Inventada' });
  if (r.tipo !== 'entrou') throw new Error(r.tipo);
  return r.conta;
}

/** An account that went through the Checkout: Stripe says active, the webhook wrote it. */
async function assinante() {
  const conta = await contaInventada();
  const ids = novosIds();
  const stripe = cobrancaFalsa();
  stripe.assinaturas.set(ids.sub, assinaturaNaStripe(ids, conta.id));
  await tratarEvento(checkoutConcluido(ids, conta.id), stripe);
  return { conta, ids, stripe };
}

describe.skipIf(semBanco)('o webhook do Stripe', () => {
  it('without a subscription, nothing opens', async () => {
    expect(await temAcesso(await contaInventada())).toBe(false);
  });

  it('checkout.session.completed writes active, with the period, and the home opens', async () => {
    const { conta, ids, stripe } = await assinante();
    const periodo = stripe.assinaturas.get(ids.sub)!;
    expect(await assinaturaDaConta(conta.id)).toMatchObject({
      stripeCustomerId: ids.cus,
      stripeSubscriptionId: ids.sub,
      status: 'active',
      periodoInicio: periodo.inicio,
      periodoFim: periodo.fim,
    });
    expect(await temAcesso(conta)).toBe(true);
  });

  it('a subscription event that arrives before the checkout one finds the account by the metadata', async () => {
    const conta = await contaInventada();
    const ids = novosIds();
    const stripe = cobrancaFalsa();
    stripe.assinaturas.set(ids.sub, assinaturaNaStripe(ids, conta.id));
    await tratarEvento(daAssinatura('customer.subscription.created', ids), stripe);
    expect(await temAcesso(conta)).toBe(true);
  });

  it('canceling in the portal keeps the access until the end of the period; deleted cuts it', async () => {
    const { conta, ids, stripe } = await assinante();
    // Canceled at the end of the period: Stripe keeps the status active until then.
    await tratarEvento(daAssinatura('customer.subscription.updated', ids), stripe);
    expect(await temAcesso(conta)).toBe(true);

    stripe.assinaturas.set(ids.sub, { ...stripe.assinaturas.get(ids.sub)!, status: 'canceled' });
    await tratarEvento(daAssinatura('customer.subscription.deleted', ids), stripe);
    expect(await assinaturaDaConta(conta.id)).toMatchObject({ status: 'canceled' });
    expect(await temAcesso(conta)).toBe(false);
  });

  it('reads the subscription from Stripe, so events out of order end in the current state', async () => {
    const { conta, ids, stripe } = await assinante();
    stripe.assinaturas.set(ids.sub, { ...stripe.assinaturas.get(ids.sub)!, status: 'canceled' });
    await tratarEvento(daAssinatura('customer.subscription.deleted', ids), stripe);
    // The older "updated" arrives late: Stripe now says canceled, and so does the row.
    await tratarEvento(daAssinatura('customer.subscription.updated', ids), stripe);
    expect(await temAcesso(conta)).toBe(false);
  });

  it('the same event delivered twice changes nothing', async () => {
    const conta = await contaInventada();
    const ids = novosIds();
    const stripe = cobrancaFalsa();
    stripe.assinaturas.set(ids.sub, assinaturaNaStripe(ids, conta.id));
    const evento = checkoutConcluido(ids, conta.id);
    await tratarEvento(evento, stripe);
    const antes = await assinaturaDaConta(conta.id);

    stripe.assinaturas.set(ids.sub, { ...stripe.assinaturas.get(ids.sub)!, status: 'canceled' });
    await tratarEvento(evento, stripe);
    expect(await assinaturaDaConta(conta.id)).toEqual(antes);
    expect(stripe.lidas).toHaveLength(1);
  });

  it('invoice.paid of the renewal moves the period forward', async () => {
    const { conta, ids, stripe } = await assinante();
    const proximo = trimestre(-90);
    stripe.assinaturas.set(ids.sub, { ...stripe.assinaturas.get(ids.sub)!, ...proximo });
    await tratarEvento(daFatura('invoice.paid', ids), stripe);
    expect(await assinaturaDaConta(conta.id)).toMatchObject({ periodoInicio: proximo.inicio, periodoFim: proximo.fim });
  });

  it('invoice.payment_failed with the subscription past_due cuts the access', async () => {
    const { conta, ids, stripe } = await assinante();
    stripe.assinaturas.set(ids.sub, { ...stripe.assinaturas.get(ids.sub)!, status: 'past_due' });
    await tratarEvento(daFatura('invoice.payment_failed', ids), stripe);
    expect(await temAcesso(conta)).toBe(false);
  });

  it('a full refund cuts the access and cancels the subscription, so it does not charge again', async () => {
    const { conta, ids, stripe } = await assinante();
    await tratarEvento(reembolso(ids), stripe);
    expect(await temAcesso(conta)).toBe(false);
    expect(stripe.canceladas).toEqual([ids.sub]);
  });

  it('a partial refund changes nothing', async () => {
    const { conta, ids, stripe } = await assinante();
    await tratarEvento(reembolso(ids, false), stripe);
    expect(await temAcesso(conta)).toBe(true);
    expect(stripe.canceladas).toEqual([]);
  });

  it('a new subscription after the old one ended opens again, and a late event of the old one does not close it', async () => {
    const { conta, ids, stripe } = await assinante();
    stripe.assinaturas.set(ids.sub, { ...stripe.assinaturas.get(ids.sub)!, status: 'canceled' });
    await tratarEvento(daAssinatura('customer.subscription.deleted', ids), stripe);

    const nova = { sub: novosIds().sub, cus: ids.cus };
    stripe.assinaturas.set(nova.sub, assinaturaNaStripe(nova, conta.id));
    await tratarEvento(checkoutConcluido(nova, conta.id), stripe);
    expect(await temAcesso(conta)).toBe(true);

    await tratarEvento(daAssinatura('customer.subscription.updated', ids), stripe);
    expect(await assinaturaDaConta(conta.id)).toMatchObject({ stripeSubscriptionId: nova.sub, status: 'active' });
  });

  it('a second live subscription of the same account (two Checkouts paid) does not replace the first', async () => {
    const { conta, ids, stripe } = await assinante();
    const segunda = novosIds();
    stripe.assinaturas.set(segunda.sub, assinaturaNaStripe(segunda, conta.id));
    await tratarEvento(checkoutConcluido(segunda, conta.id), stripe);
    expect(await assinaturaDaConta(conta.id)).toMatchObject({ stripeSubscriptionId: ids.sub });
  });

  it('an event for no account of this app is ignored', async () => {
    const ids = novosIds();
    const stripe = cobrancaFalsa();
    stripe.assinaturas.set(ids.sub, assinaturaNaStripe(ids, null));
    await expect(tratarEvento(daAssinatura('customer.subscription.created', ids), stripe)).resolves.toBeUndefined();
  });
});
