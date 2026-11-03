// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Whether an account may use the app (step 21, decision 2): the one check
 * every page, action and route of `/casa` makes after the sign-in.
 */
import { assinaturaDaConta, situacao, type Conta, type Situacao } from '@/db';
import { modo } from '@/modo';

/** Hosted: a subscription `active` or `trialing`, not refunded. `MODO=local` has no payment: always. */
export async function temAcesso(conta: Pick<Conta, 'id'>): Promise<boolean> {
  if (modo() === 'local') return true;
  return situacao(await assinaturaDaConta(conta.id)) === 'ativa';
}

/**
 * What the home shows an account without access:
 * - `assinar`: the paywall, with the price and the Checkout;
 * - `esperando`: back from a paid Checkout, before the webhook arrived;
 * - `pendente`: a payment that did not go through: fix the card in the portal.
 */
export type TelaSemAcesso = 'assinar' | 'esperando' | 'pendente';

export function telaSemAcesso(situacaoDaAssinatura: Situacao, voltouDoCheckout: boolean): TelaSemAcesso {
  if (situacaoDaAssinatura === 'pendente') return 'pendente';
  return voltouDoCheckout ? 'esperando' : 'assinar';
}
