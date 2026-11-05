// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { assinarConta } from '@/assinatura/falso';
import { entrar, registrarConsentimento, sessaoDaConta } from '@/db';
import { db, fecharDb } from '@/db/client';
import * as t from '@/db/schema';
import { emSerie } from '@/interrogatorio/trava';

/** The browser's cookies, as `next/headers` would read them in a request. */
const navegador = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) => (navegador.has(nome) ? { name: nome, value: navegador.get(nome) } : undefined),
  }),
}));

const { COOKIE_CONTA } = await import('@/conta/acesso');
const { tentarDeNovo, tentarDeNovoNaVaga, lerDeNovo } = await import('@/app/casa/acoes');
const { turnoEmFluxo } = await import('@/app/casa/_chat');

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);
beforeEach(() => navegador.clear());

let n = 0;
async function entrou(): Promise<string> {
  n += 1;
  const r = await entrar({ provedor: 'google', idNoProvedor: `atritos-${Date.now()}-${n}`, email: null, nome: 'Inventada' });
  if (r.tipo !== 'entrou') throw new Error(r.tipo);
  await assinarConta(r.conta.id);
  navegador.set(COOKIE_CONTA, r.acesso);
  const sessao = (await sessaoDaConta(r.conta.id))!;
  await registrarConsentimento(sessao.id, 'v4', false);
  return sessao.id;
}

/** What `redirect()` throws is the action's end: the event was written before it. */
const ate = (p: Promise<unknown>) => p.catch((e: { digest?: string }) => {
  if (!e.digest?.startsWith('NEXT_REDIRECT')) throw e;
});

const eventosDa = (sessaoId: string, tipo: 'tentou_de_novo' | 'turno_ocupado') =>
  db().select({ dados: t.eventos.dados }).from(t.eventos).where(and(eq(t.eventos.sessaoId, sessaoId), eq(t.eventos.tipo, tipo)));

describe.skipIf(semBanco)('os atritos', () => {
  it('each "Tentar de novo" of a screen records where it was tapped', async () => {
    const sessaoId = await entrou();
    const vagaId = '00000000-0000-4000-8000-000000000000';
    await ate(tentarDeNovo());
    await ate(tentarDeNovoNaVaga(vagaId));
    await ate(lerDeNovo(vagaId));

    expect((await eventosDa(sessaoId, 'tentou_de_novo')).map((e) => e.dados)).toEqual([
      { onde: 'resultado' },
      { onde: 'curriculo_da_vaga' },
      { onde: 'vaga' },
    ]);
  });

  it('the chat\'s "Tentar de novo" is recorded, and a turn already running is a 409 counted as turno_ocupado', async () => {
    const sessaoId = await entrou();
    let soltar = () => {};
    const rodando = emSerie(sessaoId, () => new Promise<void>((r) => (soltar = r)));

    const pedido = () =>
      new Request('http://localhost:3000/casa/chat', { method: 'POST', body: JSON.stringify({ tipo: 'continuar', deNovo: true }) });
    expect((await turnoEmFluxo(pedido(), sessaoId)).status).toBe(409);
    expect((await turnoEmFluxo(pedido(), sessaoId)).status).toBe(409);
    soltar();
    await rodando;

    expect((await eventosDa(sessaoId, 'tentou_de_novo')).map((e) => e.dados)).toEqual([{ onde: 'chat' }, { onde: 'chat' }]);
    // The 409 loop fires many: one per 10 s.
    expect(await eventosDa(sessaoId, 'turno_ocupado')).toHaveLength(1);
  });
});
