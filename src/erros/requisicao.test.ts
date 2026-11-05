// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, inject, it, vi } from 'vitest';

import { COOKIE_CONTA } from '@/conta/acesso';
import { entrar, registrarConsentimento, sessaoDaConta } from '@/db';
import { db, fecharDb } from '@/db/client';
import * as t from '@/db/schema';

import { erroDaRequisicao } from './requisicao';

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);
afterEach(() => vi.restoreAllMocks());

const contexto = { routerKind: 'App Router', routePath: '/casa', routeType: 'render', revalidateReason: undefined } as const;

describe.skipIf(semBanco)('erroDaRequisicao (onRequestError)', () => {
  it("records what nobody handled, with Next's digest, linked to the session of the cookie", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await entrar({ provedor: 'github', idNoProvedor: `requisicao-${Date.now()}`, email: null, nome: 'Inventada' });
    if (r.tipo !== 'entrou') throw new Error(r.tipo);
    const sessao = (await sessaoDaConta(r.conta.id))!;
    await registrarConsentimento(sessao.id, 'v4', false);
    const erro = Object.assign(new TypeError('texto do currículo'), { digest: '4182736455' });

    await erroDaRequisicao(erro, { path: '/casa', method: 'GET', headers: { cookie: `outro=1; ${COOKIE_CONTA}=${r.acesso}` } }, contexto);

    expect(await db().select().from(t.erros).where(eq(t.erros.sessaoId, sessao.id))).toMatchObject([
      { origem: 'servidor', onde: 'requisicao', classe: 'TypeError', digest: '4182736455' },
    ]);
  });

  it("records without a session when the cookie is not there, and ignores Next's own redirect and 404", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const digest = `${Date.now()}`;
    await erroDaRequisicao(Object.assign(new Error('x'), { digest }), { path: '/', method: 'GET', headers: {} }, contexto);
    expect(await db().select().from(t.erros).where(eq(t.erros.digest, digest))).toMatchObject([{ sessaoId: null }]);

    const log = vi.mocked(console.error);
    log.mockClear();
    for (const digestDoNext of ['NEXT_REDIRECT;replace;/casa;307;', 'NEXT_HTTP_ERROR_FALLBACK;404']) {
      await erroDaRequisicao(Object.assign(new Error(digestDoNext), { digest: digestDoNext }), { path: '/', method: 'GET', headers: {} }, contexto);
    }
    expect(log).not.toHaveBeenCalled();
  });
});
