// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { sessaoComAcesso } from '@/conta/servidor';
import { vagaDaSessao } from '@/db';
import { precisaReaceitar } from '@/sessao/tela';

import { turnoEmFluxo } from '../../../_chat';

/**
 * A turn of a Vaga's conversation (step 16), streamed (`../../../_chat.ts`).
 * Signed out is a 401. Another account's Vaga, an emptied one or an unknown id is a 404; a Vaga
 * not yet confirmed (its checklist is what the conversation asks) is a 409.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await sessaoComAcesso();
  if (sessao === 'sem_conta') return new Response(null, { status: 401 });
  // Without a subscription (step 21): the home shows the paywall.
  if (sessao === 'sem_acesso') return new Response(null, { status: 402 });
  const vaga = await vagaDaSessao(sessao.id, id);
  if (!vaga) return new Response(null, { status: 404 });
  if (vaga.estagio !== 'confirmada' || precisaReaceitar(sessao)) return new Response(null, { status: 409 });
  return turnoEmFluxo(request, sessao.id, vaga.id);
}
