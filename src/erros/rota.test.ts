// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { assinarConta } from '@/assinatura/falso';
import { entrar, registrarConsentimento, sessaoDaConta } from '@/db';
import { db, fecharDb } from '@/db/client';
import * as t from '@/db/schema';

/** The browser's cookies, as `next/headers` would read them in a request. */
const navegador = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) => (navegador.has(nome) ? { name: nome, value: navegador.get(nome) } : undefined),
  }),
}));
vi.mock('next/server', async (original) => ({ ...(await original<object>()), connection: async () => {} }));

const { COOKIE_CONTA } = await import('@/conta/acesso');
const { POST } = await import('@/app/api/erros/route');
const { LIMITE_POR_HORA } = await import('./navegador');

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);
beforeEach(() => navegador.clear());
afterEach(() => vi.unstubAllEnvs());

const pedido = (corpo: unknown) =>
  new Request('http://localhost:3000/api/erros', {
    method: 'POST',
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
    headers: { 'content-type': 'application/json' },
  });

const valido = { tipo: 'janela', tela: '/casa', classe: 'TypeError' };

let n = 0;
/** An invented person, signed in, on consent v4. */
async function entrou(): Promise<string> {
  n += 1;
  const r = await entrar({ provedor: 'github', idNoProvedor: `erros-${Date.now()}-${n}`, email: null, nome: 'Inventada' });
  if (r.tipo !== 'entrou') throw new Error(r.tipo);
  await assinarConta(r.conta.id);
  navegador.set(COOKIE_CONTA, r.acesso);
  const sessao = (await sessaoDaConta(r.conta.id))!;
  await registrarConsentimento(sessao.id, 'v4', false);
  return sessao.id;
}

const errosDa = (sessaoId: string) => db().select().from(t.erros).where(eq(t.erros.sessaoId, sessaoId));

describe('POST /api/erros', () => {
  it('is a 404 in MODO=local', async () => {
    vi.stubEnv('MODO', 'local');
    expect((await POST(pedido(valido))).status).toBe(404);
  });

  it('refuses a body out of shape', async () => {
    for (const corpo of [
      'não é json',
      { ...valido, tipo: 'outro' },
      { ...valido, classe: '' },
      { ...valido, tela: 'casa' },
      { ...valido, tela: `/${'x'.repeat(300)}` },
      { ...valido, mensagem: 'texto do currículo' },
      // A class or digest is a token, never a sentence: free text could carry what the person typed.
      { ...valido, classe: 'Reduzi o fechamento da Padaria' },
      { ...valido, digest: 'texto do currículo' },
      JSON.stringify({ ...valido, digest: 'x'.repeat(5000) }),
    ]) {
      expect((await POST(pedido(corpo))).status, JSON.stringify(corpo).slice(0, 60)).toBe(400);
    }
  });

  it.skipIf(semBanco)('without a session cookie, answers 204 and writes nothing', async () => {
    const antes = await db().$count(t.erros);
    expect((await POST(pedido(valido))).status).toBe(204);
    expect(await db().$count(t.erros)).toBe(antes);
  });

  it.skipIf(semBanco)("records the screen's error, by its shape, with the digest", async () => {
    const sessaoId = await entrou();
    const resposta = await POST(pedido({ tipo: 'limite', tela: '/casa/vagas/2b1f0c7e-1d1a-4c55-9a43-0b7d8e1f2a3b', classe: 'Error', digest: '123456' }));

    expect(resposta.status).toBe(204);
    expect(await errosDa(sessaoId)).toMatchObject([
      { origem: 'navegador', onde: '/casa/vagas/[id]', classe: 'Error', codigo: 'limite', digest: '123456' },
    ]);
  });

  it.skipIf(semBanco)("the server's errors of the session do not use up the browser's limit", async () => {
    const sessaoId = await entrou();
    await db()
      .insert(t.erros)
      .values(Array.from({ length: LIMITE_POR_HORA }, () => ({ sessaoId, origem: 'servidor' as const, onde: 'turno', classe: 'Error' })));

    expect((await POST(pedido(valido))).status).toBe(204);
    expect(await errosDa(sessaoId)).toHaveLength(LIMITE_POR_HORA + 1);
  });

  it.skipIf(semBanco)('stops recording after the limit of errors in an hour', async () => {
    const sessaoId = await entrou();
    await db()
      .insert(t.erros)
      .values(Array.from({ length: LIMITE_POR_HORA }, () => ({ sessaoId, origem: 'navegador' as const, onde: '/casa', classe: 'Error' })));

    expect((await POST(pedido(valido))).status).toBe(204);
    expect(await errosDa(sessaoId)).toHaveLength(LIMITE_POR_HORA);
  });
});
