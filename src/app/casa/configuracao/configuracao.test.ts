// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from 'vitest';

// Outside a request, `connection()` throws; the page calls it first so a build never makes it a static 404.
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), connection: async () => {} }));

const { default: pagina } = await import('./page');
const { salvarConfiguracao } = await import('../acoes');

/** What `notFound()` throws: Next reads the digest. */
async function digest(promessa: Promise<unknown>): Promise<string | undefined> {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  );
  return (erro as { digest?: string } | null)?.digest;
}

afterEach(() => vi.unstubAllEnvs());

describe('a configuração, no hospedado', () => {
  it.each([
    ['unset MODO', ''],
    ['MODO=hospedado', 'hospedado'],
  ])('does not exist (%s): the page and its action are a 404', async (_, valor) => {
    vi.stubEnv('MODO', valor);
    expect(await digest(pagina())).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    const form = new FormData();
    form.set('caminho', 'assinatura_claude');
    expect(await digest(salvarConfiguracao({ erro: null, salvo: false }, form))).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });
});
