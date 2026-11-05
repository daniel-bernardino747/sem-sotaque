// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import Stripe from 'stripe';

import { cobranca } from '@/assinatura/stripe';
import { tratarEvento } from '@/assinatura/webhook';
import { modo } from '@/modo';
import { registrarErro } from '@/erros';

/**
 * Stripe's webhook (step 21): the only writer of the subscription status. The
 * signature is checked against the raw body (`STRIPE_WEBHOOK_SECRET`): a
 * forged or altered post is a 400 and nothing is read. A failure while
 * handling is a 500, and Stripe sends the event again later.
 */
export async function POST(request: Request): Promise<Response> {
  // MODO=local has no payment.
  if (modo() === 'local') return new Response(null, { status: 404 });
  const segredo = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!segredo) {
    console.error('stripe webhook: STRIPE_WEBHOOK_SECRET is not set');
    return new Response(null, { status: 500 });
  }

  const corpo = await request.text();
  let evento: Stripe.Event;
  try {
    evento = Stripe.webhooks.constructEvent(corpo, request.headers.get('stripe-signature') ?? '', segredo);
  } catch {
    return new Response(null, { status: 400 });
  }

  try {
    await tratarEvento(evento, cobranca());
  } catch (erro) {
    await registrarErro({ origem: 'servidor', onde: 'stripe', erro, log: `stripe webhook: ${evento.type} ${evento.id} failed` });
    return new Response(null, { status: 500 });
  }
  return Response.json({ recebido: true });
}
