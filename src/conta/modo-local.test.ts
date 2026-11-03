// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { contaLocal, entrar, sessaoDaConta } from '@/db';
import { fecharDb } from '@/db/client';

/** The browser's cookies, as `next/headers` would read them in a request. */
const navegador = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) => (navegador.has(nome) ? { name: nome, value: navegador.get(nome) } : undefined),
  }),
}));
// `connection()` marks a page as per request; outside a request it throws.
vi.mock('next/server', async (original) => ({ ...(await original<object>()), connection: async () => {} }));

const { COOKIE_CONTA } = await import('./acesso');
const { temAcesso } = await import('@/assinatura/acesso');
const { sessaoDaRota } = await import('@/app/casa/_sessao');
const { exigirAdmin } = await import('@/admin/servidor');
const { default: Inicio } = await import('@/app/page');
const { default: Entrar } = await import('@/app/entrar/page');
const { default: LinkAntigo } = await import('@/app/s/[token]/page');
const { irParaOProvedor, voltarDoProvedor } = await import('./rotas-oauth');

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);
beforeEach(() => {
  navegador.clear();
  vi.stubEnv('MODO', 'local');
});
afterEach(() => vi.unstubAllEnvs());

/** What `redirect()`, `notFound()` and `unauthorized()` throw: Next reads the digest. */
async function interrompe(fazer: () => unknown): Promise<string> {
  const erro = await Promise.resolve()
    .then(fazer)
    .then(
      () => null,
      (e: unknown) => e,
    );
  const digest = (erro as { digest?: string } | null)?.digest;
  if (!digest) throw new Error(`expected a redirect or an HTTP error, got ${String(erro)}`);
  if (digest.startsWith('NEXT_REDIRECT')) return `redirect ${digest.split(';')[2]}`;
  if (digest.startsWith('NEXT_HTTP_ERROR_FALLBACK;')) return digest.split(';')[1];
  return digest;
}

describe.skipIf(semBanco)('MODO=local', () => {
  it('opens the home without signing in: every route is the one local session', async () => {
    const local = (await sessaoDaConta((await contaLocal()).id))!;
    expect((await sessaoDaRota()).id).toBe(local.id);
  });

  it('has no payment: temAcesso is always true, with no subscription anywhere', async () => {
    expect(await temAcesso(await contaLocal())).toBe(true);
    const r = await entrar({ provedor: 'github', idNoProvedor: `local-sem-assinatura-${Date.now()}`, email: null, nome: null });
    if (r.tipo !== 'entrou') throw new Error(r.tipo);
    expect(await temAcesso(r.conta)).toBe(true);
  });

  it('ignores a sign-in cookie', async () => {
    const r = await entrar({ provedor: 'github', idNoProvedor: `local-${Date.now()}`, email: null, nome: null });
    if (r.tipo !== 'entrou') throw new Error(r.tipo);
    navegador.set(COOKIE_CONTA, r.acesso);
    const local = (await sessaoDaConta((await contaLocal()).id))!;
    expect((await sessaoDaRota()).id).toBe(local.id);
  });

  it('has no landing and no sign-in page: both go home', async () => {
    expect(await interrompe(() => Inicio())).toBe('redirect /casa');
    expect(await interrompe(() => Entrar({ searchParams: Promise.resolve({}) }))).toBe('redirect /casa');
  });

  it('a v0 link and the OAuth routes go home too, never to a provider', async () => {
    expect(await interrompe(() => LinkAntigo({ params: Promise.resolve({ token: 'qualquer' }) }))).toBe('redirect /casa');
    const pedido = new Request('http://localhost:3000/api/auth/github');
    expect(await interrompe(() => irParaOProvedor(pedido, 'github'))).toBe('redirect /casa');
    expect(await interrompe(() => irParaOProvedor(pedido, 'github', 'qualquer'))).toBe('redirect /casa');
    expect(await interrompe(() => voltarDoProvedor(new Request('http://localhost:3000/api/auth/callback/github?code=x&state=y'), 'github'))).toBe('redirect /casa');
  });
});

describe('MODO=local, without the database', () => {
  it('has no panel: /admin is a 404, not the token form', async () => {
    expect(await interrompe(() => exigirAdmin())).toBe('404');
  });

  it('hosted, the panel still asks for its token', async () => {
    vi.stubEnv('MODO', 'hospedado');
    // What `experimental.authInterrupts` in next.config.ts sets for `unauthorized()`.
    vi.stubEnv('__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS', '1');
    expect(await interrompe(() => exigirAdmin())).toBe('401');
  });
});
