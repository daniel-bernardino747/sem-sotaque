// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The app's only door to Stripe (step 21): four calls, in the app's terms. The
 * webhook, the Checkout, the portal and erasing an account go through
 * `cobranca()`; the tests swap it for `cobrancaFalsa()` (`./falso.ts`).
 *
 * Every price, card form and invoice lives at Stripe (Checkout and the
 * Customer Portal are Stripe's pages); the app only turns the access on and
 * off from what the webhook says.
 */
import Stripe from 'stripe';

import type { DadosDaAssinatura } from '@/db/assinaturas';

export interface Cobranca {
  /** The subscription as Stripe has it now. */
  assinatura(id: string): Promise<DadosDaAssinatura>;
  /** Cancels now, without a refund or a final invoice (erasing the account, a refund). */
  cancelar(id: string): Promise<void>;
  /** A Checkout Session for the one Price; returns the URL to send the person to. */
  checkout(dados: { contaId: string; email: string | null; cliente: string | null }): Promise<string>;
  /** A Customer Portal session; returns its URL. */
  portal(cliente: string): Promise<string>;
}

/** A Stripe reference, expanded or not, as its id. */
export const idDe = (x: string | { id: string } | null | undefined) => (x == null ? null : typeof x === 'string' ? x : x.id);

/**
 * Stripe's subscription in the app's terms. Since the API version `basil`
 * the period is on each item, not on the subscription; the one Price makes
 * one item.
 */
export function daStripe(s: Stripe.Subscription): DadosDaAssinatura {
  const item = s.items.data[0];
  if (!item) throw new Error(`subscription ${s.id} has no item`);
  return {
    id: s.id,
    cliente: idDe(s.customer)!,
    status: s.status,
    inicio: new Date(item.current_period_start * 1000),
    fim: new Date(item.current_period_end * 1000),
    contaId: s.metadata?.conta_id || null,
  };
}

/** Where Stripe sends the person back: `APP_URL`, which production requires (like the OAuth). */
export function urlDoApp(): string {
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl && process.env.NODE_ENV === 'production') throw new Error('APP_URL is not set');
  return (appUrl || 'http://localhost:3000').replace(/\/+$/, '');
}

function exigir(nome: 'STRIPE_SECRET_KEY' | 'STRIPE_PRICE_ID'): string {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new Error(`${nome} is not set`);
  return valor;
}

function cobrancaDaStripe(): Cobranca {
  const stripe = new Stripe(exigir('STRIPE_SECRET_KEY'));
  return {
    async assinatura(id) {
      return daStripe(await stripe.subscriptions.retrieve(id));
    },
    async cancelar(id) {
      // Already over at Stripe (the row has not heard yet): nothing to cancel, and no error to retry on.
      const atual = await stripe.subscriptions.retrieve(id);
      if (atual.status === 'canceled' || atual.status === 'incomplete_expired') return;
      await stripe.subscriptions.cancel(id, { invoice_now: false, prorate: false });
    },
    async checkout({ contaId, email, cliente }) {
      const sessao = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: exigir('STRIPE_PRICE_ID'), quantity: 1 }],
        // Card only in the beta (Pix and boleto are out of scope).
        allowed_payment_method_types: ['card'],
        client_reference_id: contaId,
        // Every event of the subscription carries the account, whatever arrives first.
        subscription_data: { metadata: { conta_id: contaId } },
        ...(cliente ? { customer: cliente } : email ? { customer_email: email } : {}),
        locale: 'pt-BR',
        success_url: `${urlDoApp()}/casa?assinatura=ok`,
        cancel_url: `${urlDoApp()}/casa`,
      });
      if (!sessao.url) throw new Error('checkout session without a url');
      return sessao.url;
    },
    async portal(cliente) {
      const sessao = await stripe.billingPortal.sessions.create({ customer: cliente, return_url: `${urlDoApp()}/casa` });
      return sessao.url;
    },
  };
}

let atual: Cobranca | null = null;

export function cobranca(): Cobranca {
  atual ??= cobrancaDaStripe();
  return atual;
}

/** For the tests: the fake in place of Stripe (null puts the real one back). */
export function usarCobranca(c: Cobranca | null): void {
  atual = c;
}
