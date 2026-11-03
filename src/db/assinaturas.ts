// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The subscriptions (step 21). Only the Stripe webhook writes them: the row
 * is what Stripe last said, read fresh from the API on each event, plus the
 * refund mark. Each handled event's id is kept, so a second delivery of the
 * same event changes nothing.
 */
import { eq } from 'drizzle-orm';

import { db } from './client';
import { assinaturas, contas, eventosStripe } from './schema';

export type Assinatura = typeof assinaturas.$inferSelect;

/** A subscription as Stripe has it now, in the app's terms (`src/assinatura/stripe.ts` builds it). */
export interface DadosDaAssinatura {
  id: string;
  cliente: string;
  status: string;
  inicio: Date;
  fim: Date;
  /** The `conta_id` the Checkout wrote into the subscription's metadata; null for one made elsewhere. */
  contaId: string | null;
}

/** A Stripe event, as `eventos_stripe` records it. */
export interface EventoStripe {
  id: string;
  tipo: string;
}

/** Stripe's statuses that open the app (decision 2). */
const COM_ACESSO = ['active', 'trialing'];
/** The ones a subscription never leaves: a new one is a new Checkout. */
const ENCERRADOS = ['canceled', 'incomplete_expired'];

/**
 * - `ativa`: the app opens;
 * - `pendente`: a payment did not go through (`past_due`, `unpaid`, ...): the
 *   card is fixed in the portal, not with a second subscription;
 * - `sem`: never subscribed, ended or refunded: the Checkout again.
 */
export type Situacao = 'ativa' | 'pendente' | 'sem';

export function situacao(a: Assinatura | null): Situacao {
  if (!a || a.reembolsadaEm || ENCERRADOS.includes(a.status)) return 'sem';
  return COM_ACESSO.includes(a.status) ? 'ativa' : 'pendente';
}

export async function assinaturaDaConta(contaId: string): Promise<Assinatura | null> {
  const [linha] = await db().select().from(assinaturas).where(eq(assinaturas.contaId, contaId));
  return linha ?? null;
}

export async function eventoStripeVisto(id: string): Promise<boolean> {
  const [linha] = await db().select({ id: eventosStripe.id }).from(eventosStripe).where(eq(eventosStripe.id, id));
  return Boolean(linha);
}

type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

/**
 * Records the event and runs `fazer` in the same transaction, unless the
 * event was already recorded (two deliveries at once: the second waits on
 * the id and does nothing). Returns whether it ran.
 */
async function umaVez(evento: EventoStripe, fazer: (tx: Tx) => Promise<void>): Promise<boolean> {
  return db().transaction(async (tx) => {
    const [novo] = await tx
      .insert(eventosStripe)
      .values({ id: evento.id, tipo: evento.tipo })
      .onConflictDoNothing()
      .returning({ id: eventosStripe.id });
    if (!novo) return false;
    await fazer(tx);
    return true;
  });
}

/**
 * Writes what Stripe says of a subscription, for the event `evento`. The
 * account is `contaId` (from the Checkout), else the metadata, else the row
 * that already has this subscription; none of those, or an account that no
 * longer exists, and the event is only recorded.
 *
 * One row per account: a different subscription replaces the row, unless it
 * has ended and the row's is still going (a late event of an old one).
 */
export async function gravarAssinatura(
  evento: EventoStripe,
  dados: DadosDaAssinatura,
  contaId: string | null = null,
): Promise<void> {
  await umaVez(evento, async (tx) => {
    let dona = contaId ?? dados.contaId;
    if (!dona) {
      const [linha] = await tx
        .select({ contaId: assinaturas.contaId })
        .from(assinaturas)
        .where(eq(assinaturas.stripeSubscriptionId, dados.id));
      dona = linha?.contaId ?? null;
    }
    if (!dona) return;
    const [conta] = await tx.select({ id: contas.id }).from(contas).where(eq(contas.id, dona));
    if (!conta) return;

    const [atual] = await tx.select().from(assinaturas).where(eq(assinaturas.contaId, dona)).for('update');
    const outra = atual && atual.stripeSubscriptionId !== dados.id;
    if (outra && situacao(atual) !== 'sem') {
      // A late event of an old subscription changes nothing. A second live one
      // (two Checkouts paid at once) is charging too: the row keeps the first,
      // and Daniel cancels and refunds the other by hand.
      if (!ENCERRADOS.includes(dados.status)) {
        console.error(`stripe: account ${dona} has two live subscriptions, ${atual.stripeSubscriptionId} and ${dados.id}: cancel and refund ${dados.id}`);
      }
      return;
    }

    const valores = {
      stripeCustomerId: dados.cliente,
      stripeSubscriptionId: dados.id,
      status: dados.status,
      periodoInicio: dados.inicio,
      periodoFim: dados.fim,
      // A refund marks one subscription; a new one starts clean.
      ...(outra ? { reembolsadaEm: null } : {}),
      atualizadaEm: new Date(),
    };
    await tx
      .insert(assinaturas)
      .values({ contaId: dona, ...valores })
      .onConflictDoUpdate({ target: assinaturas.contaId, set: valores });
  });
}

export async function assinaturaDoCliente(cliente: string): Promise<Assinatura | null> {
  const [linha] = await db().select().from(assinaturas).where(eq(assinaturas.stripeCustomerId, cliente));
  return linha ?? null;
}

/**
 * A charge of the customer was refunded in full (decision 4): the access ends
 * now, whatever the status says. A repeated event, or a customer of no
 * account, changes nothing.
 */
export async function marcarReembolso(evento: EventoStripe, cliente: string): Promise<void> {
  await umaVez(evento, async (tx) => {
    await tx
      .update(assinaturas)
      .set({ reembolsadaEm: new Date(), atualizadaEm: new Date() })
      .where(eq(assinaturas.stripeCustomerId, cliente));
  });
}

/** An event the app does not act on, or acts on outside the database: recorded, so it is not handled twice. */
export async function registrarEventoStripe(evento: EventoStripe): Promise<boolean> {
  return umaVez(evento, async () => {});
}
