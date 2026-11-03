// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { sessaoComAcesso } from '@/conta/servidor';
import { precisaReaceitar } from '@/sessao/tela';

import { turnoEmFluxo } from '../_chat';

/** A turn of the general conversation, streamed (`../_chat.ts`). */
export async function POST(request: Request) {
  const sessao = await sessaoComAcesso();
  if (sessao === 'sem_conta') return new Response(null, { status: 401 });
  // Without a subscription (step 21): the home shows the paywall.
  if (sessao === 'sem_acesso') return new Response(null, { status: 402 });
  // Not talking (before the interrogation, or with the résumé owed), or owing an
  // answer to the new consent text: the page shows what to do. After the
  // résumé, the conversation goes on as a retomada (step 14).
  if (!['interrogando', 'pronto', 'encerrado'].includes(sessao.estado) || precisaReaceitar(sessao)) {
    return new Response(null, { status: 409 });
  }
  return turnoEmFluxo(request, sessao.id);
}
