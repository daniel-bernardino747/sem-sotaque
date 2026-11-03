// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * What the app does with each Stripe event (step 21). The signature is
 * checked by the route (`/api/stripe/webhook`); this only acts.
 *
 * Stripe does not promise the order of its events, so none is trusted for
 * the state: each one names a subscription, and the subscription is read
 * from Stripe as it is now. A late event then writes the current state, and
 * the same event twice is recorded once (`eventos_stripe`).
 */
import type Stripe from 'stripe';

import {
  assinaturaDoCliente,
  eventoStripeVisto,
  gravarAssinatura,
  marcarReembolso,
  registrarEventoStripe,
  situacao,
} from '@/db/assinaturas';

import { idDe, type Cobranca } from './stripe';

/** The subscription an event is about, and the account when the event says it. */
function doQueTrata(evento: Stripe.Event): { assinatura: string; conta: string | null } | null {
  switch (evento.type) {
    case 'checkout.session.completed': {
      const s = evento.data.object;
      const assinatura = s.mode === 'subscription' ? idDe(s.subscription) : null;
      return assinatura ? { assinatura, conta: s.client_reference_id } : null;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return { assinatura: evento.data.object.id, conta: null };
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const assinatura = idDe(evento.data.object.parent?.subscription_details?.subscription);
      return assinatura ? { assinatura, conta: null } : null;
    }
    default:
      return null;
  }
}

export async function tratarEvento(evento: Stripe.Event, stripe: Cobranca): Promise<void> {
  const registro = { id: evento.id, tipo: evento.type };
  if (await eventoStripeVisto(evento.id)) return;

  if (evento.type === 'charge.refunded') {
    const pagamento = evento.data.object;
    const cliente = idDe(pagamento.customer);
    // A partial refund is a goodwill gesture, not the 7 days: the access stays.
    if (!pagamento.refunded || !cliente) return void (await registrarEventoStripe(registro));
    const assinatura = await assinaturaDoCliente(cliente);
    // Refunded and still billing would charge the next quarter: cancel first,
    // so a failure leaves the event unrecorded and Stripe sends it again.
    if (assinatura && situacao(assinatura) !== 'sem') await stripe.cancelar(assinatura.stripeSubscriptionId);
    await marcarReembolso(registro, cliente);
    return;
  }

  const alvo = doQueTrata(evento);
  if (!alvo) return void (await registrarEventoStripe(registro));
  await gravarAssinatura(registro, await stripe.assinatura(alvo.assinatura), alvo.conta);
}
