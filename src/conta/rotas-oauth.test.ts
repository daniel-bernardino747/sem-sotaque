// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { contaDoAcesso, criarTester, sessaoDaConta, type Perfil } from '@/db';
import { fecharDb } from '@/db/client';

/** The browser's cookies, as `next/headers` reads and writes them in a request. */
const navegador = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) => (navegador.has(nome) ? { name: nome, value: navegador.get(nome) } : undefined),
    set: (nome: string, valor: string) => void navegador.set(nome, valor),
    delete: (c: string | { name: string }) => void navegador.delete(typeof c === 'string' ? c : c.name),
  }),
}));

/** Who GitHub says signed in: the code trade is the only part faked. */
let perfilDoGithub: Perfil;
vi.mock('./oauth', async (original) => ({
  ...(await original<typeof import('./oauth')>()),
  perfilDoRetorno: async () => perfilDoGithub,
}));

const { COOKIE_CONTA } = await import('./acesso');
const { COOKIE_OAUTH } = await import('./oauth');
const { irParaOProvedor, voltarDoProvedor } = await import('./rotas-oauth');

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);

beforeEach(() => {
  navegador.clear();
  vi.stubEnv('GITHUB_CLIENT_ID', 'id-de-teste');
  vi.stubEnv('GITHUB_CLIENT_SECRET', 'segredo-de-teste');
  vi.stubEnv('APP_URL', 'https://semsotaque.exemplo.dev');
  perfilDoGithub = { provedor: 'github', idNoProvedor: `oauth-${Date.now()}-${Math.random()}`, email: null, nome: 'Inventada' };
});

/** Where `redirect()` sent the browser, or the status of a plain response. */
async function destino(promessa: Promise<Response>): Promise<string> {
  try {
    return `status ${(await promessa).status}`;
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? '';
    if (!digest.startsWith('NEXT_REDIRECT')) throw e;
    return digest.split(';')[2];
  }
}

const pedido = (caminho: string) => new Request(`http://localhost:3000${caminho}`);

/** Off to GitHub and back with the `state` it was given. */
async function idaEVolta(vincular?: string, mexer: (state: string) => string = (s) => s) {
  const url = new URL(await destino(irParaOProvedor(pedido('/api/auth/github'), 'github', vincular)));
  const state = url.searchParams.get('state')!;
  return destino(voltarDoProvedor(pedido(`/api/auth/callback/github?code=abc&state=${mexer(state)}`), 'github'));
}

describe.skipIf(semBanco)('o OAuth', () => {
  it('goes to GitHub with a state and the callback on APP_URL', async () => {
    const url = new URL(await destino(irParaOProvedor(pedido('/api/auth/github'), 'github')));
    expect(url.origin).toBe('https://github.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://semsotaque.exemplo.dev/api/auth/callback/github');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(navegador.get(COOKIE_OAUTH)).toContain(url.searchParams.get('state'));
  });

  it('an unknown provider is a 404, and one without an OAuth app goes back to /entrar', async () => {
    expect(await destino(irParaOProvedor(pedido('/api/auth/orkut'), 'orkut'))).toBe('status 404');
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    expect(await destino(irParaOProvedor(pedido('/api/auth/google'), 'google'))).toBe('/entrar?erro=1');
  });

  it('back with the right state: signed in, the cookie set, and home', async () => {
    expect(await idaEVolta()).toBe('/casa');
    const conta = await contaDoAcesso(navegador.get(COOKIE_CONTA));
    expect(conta).toMatchObject({ provedor: 'github', idNoProvedor: perfilDoGithub.idNoProvedor });
    expect(navegador.has(COOKIE_OAUTH)).toBe(false);
  });

  it('a state that does not match, or no OAuth cookie, signs in nobody', async () => {
    expect(await idaEVolta(undefined, () => 'outro')).toBe('/entrar?erro=1');
    expect(navegador.has(COOKIE_CONTA)).toBe(false);

    expect(await destino(voltarDoProvedor(pedido('/api/auth/callback/github?code=abc&state=x'), 'github'))).toBe('/entrar?erro=1');
    expect(navegador.has(COOKIE_CONTA)).toBe(false);
  });

  it('through an old link: links it the first time; for a second account, signs in nobody', async () => {
    const antigo = await criarTester({ apelido: 'Do v0', origem: 'LinkedIn' });
    expect(await idaEVolta(antigo.token)).toBe('/casa');
    const dona = await contaDoAcesso(navegador.get(COOKIE_CONTA));
    expect((await sessaoDaConta(dona!.id))?.id).toBe(antigo.sessao.id);

    navegador.clear();
    perfilDoGithub = { ...perfilDoGithub, idNoProvedor: `${perfilDoGithub.idNoProvedor}-outra` };
    expect(await idaEVolta(antigo.token)).toBe('/entrar?erro=link');
    expect(navegador.has(COOKIE_CONTA)).toBe(false);
  });

  it('through a link that does not exist (or was erased meanwhile): the plain error, not "another account"', async () => {
    expect(await idaEVolta('nunca-existiu')).toBe('/entrar?erro=1');
    expect(navegador.has(COOKIE_CONTA)).toBe(false);
  });

});
