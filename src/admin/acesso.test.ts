// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { COOKIE_ADMIN, cookieDaRequisicao, cookieValido, requisicaoAutorizada, tokenConfere, valorDoCookie } from './acesso';

const TOKEN = 'um-token-de-teste-bem-comprido';
let antes: string | undefined;
beforeEach(() => {
  antes = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = TOKEN;
});
afterEach(() => {
  if (antes === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = antes;
});

describe('acesso ao painel', () => {
  it('accepts the token and nothing else', () => {
    expect(tokenConfere(TOKEN)).toBe(true);
    expect(tokenConfere(`  ${TOKEN} `)).toBe(true);
    expect(tokenConfere('outro')).toBe(false);
    expect(tokenConfere('')).toBe(false);
  });

  it('the cookie is not the token, and a changed token voids it', () => {
    const valor = valorDoCookie();
    expect(valor).not.toContain(TOKEN);
    expect(cookieValido(valor)).toBe(true);
    expect(cookieValido(TOKEN)).toBe(false);
    expect(cookieValido(undefined)).toBe(false);
    process.env.ADMIN_TOKEN = 'outro-token-tambem-comprido';
    expect(cookieValido(valor)).toBe(false);
  });

  it('is closed to everyone without an ADMIN_TOKEN, or with a short one', () => {
    delete process.env.ADMIN_TOKEN;
    expect(tokenConfere('')).toBe(false);
    expect(cookieValido('')).toBe(false);
    expect(() => valorDoCookie()).toThrow();
    process.env.ADMIN_TOKEN = 'curto';
    expect(tokenConfere('curto')).toBe(false);
  });

  it('reads the cookie from a request', () => {
    const valor = valorDoCookie();
    const com = new Request('http://x/admin', { headers: { cookie: `a=1; ${COOKIE_ADMIN}=${valor}; b=2` } });
    expect(cookieDaRequisicao(com)).toBe(valor);
    expect(requisicaoAutorizada(com)).toBe(true);
    expect(requisicaoAutorizada(new Request('http://x/admin'))).toBe(false);
    expect(requisicaoAutorizada(new Request('http://x/admin', { headers: { cookie: `${COOKIE_ADMIN}=errado` } }))).toBe(false);
  });
});
