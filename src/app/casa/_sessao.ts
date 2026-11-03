// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { notFound, redirect } from 'next/navigation';

import { sessaoComAcesso } from '@/conta/servidor';
import { vagaDaSessao, type Sessao, type VagaComRequisitos } from '@/db';
import { antesDaCasa } from '@/sessao/tela';

/**
 * The session a route below the home works on. Every page and route resolves
 * the signed-in account first: signed out goes to `/entrar`; without a
 * subscription, or owing the consent, it goes to the home, which shows the
 * paywall or the consent.
 */
export async function sessaoDaRota(): Promise<Sessao> {
  const sessao = await sessaoComAcesso();
  if (sessao === 'sem_conta') redirect('/entrar');
  if (sessao === 'sem_acesso' || antesDaCasa(sessao)) redirect('/casa');
  return sessao;
}

/**
 * A Vaga of the signed-in session. Another account's Vaga, an emptied one or
 * an id that is not one is the same 404 as any other path, never a 403.
 */
export async function vagaDaRota(vagaId: string): Promise<{ sessao: Sessao; vaga: VagaComRequisitos }> {
  const sessao = await sessaoDaRota();
  const vaga = await vagaDaSessao(sessao.id, vagaId);
  if (!vaga) notFound();
  return { sessao, vaga };
}
