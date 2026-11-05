// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// `connection()` marks a page as per request; outside a request it throws.
vi.mock('next/server', async (original) => ({ ...(await original<object>()), connection: async () => {} }));

const { default: Inicio } = await import('./page');
const { CODIGO_FONTE } = await import('./_documento');

afterEach(() => vi.unstubAllEnvs());

async function pagina(): Promise<string> {
  vi.stubEnv('MODO', 'hospedado');
  return renderToStaticMarkup(await Inicio());
}

describe('a página de venda (step 25, Q16)', () => {
  it('says the beta price, the quota, the 7 days, and sends to sign in to subscribe', async () => {
    const html = await pagina();
    for (const trecho of ['R$ 99 por trimestre', 'travado', '15 vagas', '3 versões', '7 dias']) expect(html).toContain(trecho);
    expect(html).toContain('href="/entrar"');
    expect(html).toContain('Entrar e assinar');
  });

  it('shows the before × after of the invented person, never a real one', async () => {
    const html = await pagina();
    expect(html).toContain('Rodrigo');
    expect(html).toContain('Implementei a idempotência na API de cobranças');
    expect(html).not.toContain('No currículo do Daniel');
  });

  it('offers to run it on your own machine, with the link to the code', async () => {
    const html = await pagina();
    expect(html).toContain('Ou rode na sua máquina');
    expect(html.split(`href="${CODIGO_FONTE}"`).length - 1).toBeGreaterThanOrEqual(2);
  });

  it('no longer asks for an invitation', async () => {
    const html = await pagina();
    expect(html).not.toMatch(/convite|teste fechado|grátis/i);
  });
});
