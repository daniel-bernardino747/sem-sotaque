// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { cookies } from 'next/headers';
import { connection } from 'next/server';

import { temAcesso } from '@/assinatura/acesso';
import { contaDoAcesso, contaLocal, sessaoDaConta, type Conta, type Sessao } from '@/db';
import { modo } from '@/modo';

import { COOKIE_CONTA } from './acesso';

/**
 * The signed-in account, or null. Read on every page, action and route, like
 * `exigirAdmin`. In `MODO=local` nobody signs in: it is always the one local
 * account, and a sign-in cookie is ignored.
 */
export async function contaAtual(): Promise<Conta | null> {
  if (modo() === 'local') {
    // Without the cookie read, nothing marks the page as per request: a build
    // with MODO=local would prerender the home, one account frozen into it.
    await connection();
    return contaLocal();
  }
  return contaDoAcesso((await cookies()).get(COOKIE_CONTA)?.value);
}

/** The signed-in account's session, or null signed out (or with the data erased). */
export async function sessaoAtual(): Promise<Sessao | null> {
  const conta = await contaAtual();
  return conta ? sessaoDaConta(conta.id) : null;
}

/** Who is in, and whether they may go further than the home (step 21). */
export interface Entrada {
  conta: Conta;
  /** Null with the data erased: the same as signed out. */
  sessao: Sessao | null;
  /** `temAcesso`: false shows only the paywall at the home. */
  acesso: boolean;
}

/** The signed-in account, its session and its access; null signed out. */
export async function entradaAtual(): Promise<Entrada | null> {
  const conta = await contaAtual();
  if (!conta) return null;
  const [sessao, acesso] = await Promise.all([sessaoDaConta(conta.id), temAcesso(conta)]);
  return { conta, sessao, acesso };
}

/**
 * The session a route of `/casa` works on: signed out (or erased) is
 * `sem_conta`, without a subscription is `sem_acesso`.
 */
export async function sessaoComAcesso(): Promise<Sessao | 'sem_conta' | 'sem_acesso'> {
  const entrada = await entradaAtual();
  if (!entrada?.sessao) return 'sem_conta';
  return entrada.acesso ? entrada.sessao : 'sem_acesso';
}
