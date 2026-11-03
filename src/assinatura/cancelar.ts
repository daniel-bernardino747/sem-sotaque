// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { assinaturaDaConta, situacao } from '@/db';
import { modo } from '@/modo';

import { cobranca } from './stripe';

/**
 * Before erasing an account (decision 5): its subscription is canceled at
 * Stripe now, without a refund. One that ended (or was refunded, which
 * cancels it) is left alone. Throws if Stripe fails, so the caller erases
 * nothing: an erased account still being charged is the one thing not to do.
 */
export async function cancelarAntesDeApagar(contaId: string): Promise<void> {
  if (modo() === 'local') return;
  const assinatura = await assinaturaDaConta(contaId);
  if (!assinatura || situacao(assinatura) === 'sem') return;
  await cobranca().cancelar(assinatura.stripeSubscriptionId);
}

/** Whether the "apagar" warning must say the subscription goes too. */
export async function apagarCancelaAssinatura(contaId: string): Promise<boolean> {
  if (modo() === 'local') return false;
  return situacao(await assinaturaDaConta(contaId)) !== 'sem';
}
