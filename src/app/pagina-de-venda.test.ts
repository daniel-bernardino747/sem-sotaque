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
    for (const trecho of ['R$ 99 por trimestre', 'travado', '15 vagas', '3 versões', '7 dias', 'Cancela quando quiser', 'Sem senha'])
      expect(html).toContain(trecho);
    expect(html).toContain('href="/entrar"');
    expect(html).toContain('Entrar e assinar');
  });

  it('says the price once, at the seal, after the pain and the before × after', async () => {
    const html = await pagina();
    expect(html.match(/R\$ ?99/g)).toHaveLength(1);
    const preco = html.indexOf('R$ 99');
    expect(preco).toBeGreaterThan(html.indexOf('id="selo"'));
    expect(preco).toBeGreaterThan(html.indexOf('ninguém responde'));
    expect(preco).toBeGreaterThan(html.indexOf('Implementei a idempotência'));
    // Neither the seal's rim nor the pinned bar repeats it.
    expect(html).not.toMatch(/POR TRIMESTRE/);
  });

  it('shows the before × after of the invented person, never a real one', async () => {
    const html = await pagina();
    expect(html).toContain('Rodrigo');
    expect(html).toContain('Implementei a idempotência na API de cobranças');
    expect(html).not.toContain('No currículo do Daniel');
  });

  it('offers to run it on your own machine only in the footer, with the link to the code, never beside the offer', async () => {
    const html = await pagina();
    const rodape = html.slice(html.indexOf('<footer'));
    expect(rodape).toContain(`<a href="${CODIGO_FONTE}">Código aberto · rodar na sua máquina</a>`);
    expect(rodape.split(`href="${CODIGO_FONTE}"`).length - 1).toBeGreaterThanOrEqual(2);
    const antesDoRodape = html.slice(0, html.indexOf('<footer'));
    expect(antesDoRodape).not.toMatch(/máquina|Docker|AGPL|chave da API/);
  });

  it('no longer asks for an invitation', async () => {
    const html = await pagina();
    expect(html).not.toMatch(/convite|teste fechado|grátis/i);
  });
});
