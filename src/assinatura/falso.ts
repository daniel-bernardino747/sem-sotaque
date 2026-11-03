// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * For the tests: a fake of the Stripe port (`Cobranca`) and fixed webhook
 * events, shaped like what Stripe sends but with only the fields the app reads.
 */
import type Stripe from 'stripe';

import type { DadosDaAssinatura } from '@/db/assinaturas';

import type { Cobranca } from './stripe';

const DIA = 24 * 60 * 60 * 1000;

export interface CobrancaFalsa extends Cobranca {
  /** What `assinatura(id)` returns: Stripe's current state of each subscription. */
  assinaturas: Map<string, DadosDaAssinatura>;
  lidas: string[];
  canceladas: string[];
  checkouts: Parameters<Cobranca['checkout']>[0][];
  portais: string[];
  /** Makes every call fail, like Stripe being down. */
  falhar: boolean;
}

export function cobrancaFalsa(): CobrancaFalsa {
  const falsa: CobrancaFalsa = {
    assinaturas: new Map(),
    lidas: [],
    canceladas: [],
    checkouts: [],
    portais: [],
    falhar: false,
    async assinatura(id) {
      if (falsa.falhar) throw new Error('stripe is down');
      falsa.lidas.push(id);
      const a = falsa.assinaturas.get(id);
      if (!a) throw new Error(`no such subscription: ${id}`);
      return { ...a };
    },
    async cancelar(id) {
      if (falsa.falhar) throw new Error('stripe is down');
      falsa.canceladas.push(id);
      const a = falsa.assinaturas.get(id);
      if (a) falsa.assinaturas.set(id, { ...a, status: 'canceled' });
    },
    async checkout(dados) {
      if (falsa.falhar) throw new Error('stripe is down');
      falsa.checkouts.push(dados);
      return 'https://checkout.stripe.com/c/pay/cs_test_falso';
    },
    async portal(cliente) {
      if (falsa.falhar) throw new Error('stripe is down');
      falsa.portais.push(cliente);
      return 'https://billing.stripe.com/p/session/test_falso';
    },
  };
  return falsa;
}

let n = 0;
const unico = (prefixo: string) => `${prefixo}_${Date.now().toString(36)}${(n += 1)}`;

/** A subscription id and customer id nobody else in the test run has. */
export const novosIds = () => ({ sub: unico('sub'), cus: unico('cus') });

/** A quarter paid, starting `diasAtras` days ago. */
export function trimestre(diasAtras = 1): { inicio: Date; fim: Date } {
  const inicio = new Date(Date.now() - diasAtras * DIA);
  return { inicio, fim: new Date(inicio.getTime() + 91 * DIA) };
}

export function assinaturaNaStripe(
  ids: { sub: string; cus: string },
  contaId: string | null,
  mudar: Partial<DadosDaAssinatura> = {},
): DadosDaAssinatura {
  return { id: ids.sub, cliente: ids.cus, status: 'active', ...trimestre(), contaId, ...mudar };
}

const evento = (type: string, object: object) =>
  ({ id: unico('evt'), object: 'event', type, created: Math.floor(Date.now() / 1000), data: { object } }) as unknown as Stripe.Event;

export const checkoutConcluido = (ids: { sub: string; cus: string }, contaId: string) =>
  evento('checkout.session.completed', {
    id: unico('cs'),
    object: 'checkout.session',
    mode: 'subscription',
    client_reference_id: contaId,
    customer: ids.cus,
    subscription: ids.sub,
  });

export const daAssinatura = (
  tipo: 'customer.subscription.created' | 'customer.subscription.updated' | 'customer.subscription.deleted',
  ids: { sub: string; cus: string },
) => evento(tipo, { id: ids.sub, object: 'subscription', customer: ids.cus, metadata: {} });

export const daFatura = (tipo: 'invoice.paid' | 'invoice.payment_failed', ids: { sub: string; cus: string }) =>
  evento(tipo, {
    id: unico('in'),
    object: 'invoice',
    customer: ids.cus,
    parent: { type: 'subscription_details', quote_details: null, subscription_details: { subscription: ids.sub } },
  });

export const reembolso = (ids: { sub: string; cus: string }, integral = true) =>
  evento('charge.refunded', { id: unico('ch'), object: 'charge', customer: ids.cus, refunded: integral });

/**
 * For tests past the paywall: the account subscribes, as if through the
 * Checkout and the webhook. Returns the fake, to change what Stripe says next.
 */
export async function assinarConta(contaId: string, mudar: Partial<DadosDaAssinatura> = {}) {
  const { tratarEvento } = await import('./webhook');
  const ids = novosIds();
  const stripe = cobrancaFalsa();
  stripe.assinaturas.set(ids.sub, assinaturaNaStripe(ids, contaId, mudar));
  await tratarEvento(checkoutConcluido(ids, contaId), stripe);
  return { ids, stripe };
}
