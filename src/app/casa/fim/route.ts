// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { sessaoComAcesso } from '@/conta/servidor';
import { encerrarSessao } from '@/db';

/**
 * The person left the end section without sending anything: the page sends a
 * beacon (`navigator.sendBeacon`) and the session moves `pronto` → `encerrado`.
 * Nothing else changes: the PDF and "apagar meus dados" stay where they were.
 */
export async function POST() {
  const sessao = await sessaoComAcesso();
  if (sessao === 'sem_conta') return new Response(null, { status: 401 });
  // Without a subscription (step 21): the home shows the paywall.
  if (sessao === 'sem_acesso') return new Response(null, { status: 402 });
  await encerrarSessao(sessao.id);
  return new Response(null, { status: 204 });
}
