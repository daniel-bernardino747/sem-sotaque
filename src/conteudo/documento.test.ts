// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { blocos, documento } from './documento';

describe('blocos', () => {
  it('reads the title, the headings, the lists and the paragraphs, with the bold runs', () => {
    expect(blocos('# Termos\n\nUm **dois**.\ncontinua\n\n## Conta\n\n- primeiro\n- **segundo**\n')).toEqual([
      { tipo: 'titulo', texto: 'Termos' },
      {
        tipo: 'paragrafo',
        trechos: [
          { texto: 'Um ', negrito: false },
          { texto: 'dois', negrito: true },
          { texto: '.\ncontinua', negrito: false },
        ],
      },
      { tipo: 'secao', texto: 'Conta' },
      {
        tipo: 'lista',
        itens: [[{ texto: 'primeiro', negrito: false }], [{ texto: 'segundo', negrito: true }]],
      },
    ]);
  });
});

const texto = (nome: 'termos' | 'privacidade') =>
  documento(nome)
    .flatMap((b) => (b.tipo === 'paragrafo' ? b.trechos : b.tipo === 'lista' ? b.itens.flat() : [{ texto: b.texto }]))
    .map((t) => t.texto)
    .join(' ');

describe('os termos e a política (step 22, Q25)', () => {
  it('both say who is responsible, how to reach them, and that no lawyer has read them yet', () => {
    for (const nome of ['termos', 'privacidade'] as const) {
      for (const trecho of ['CNPJ', 'hello@teamdbsolutions.com', 'advogado']) expect(texto(nome)).toContain(trecho);
    }
  });

  it('the policy names where the data goes, what is kept, the reading opt-in and how to erase', () => {
    for (const trecho of [
      'Anthropic',
      'TypeSafe',
      'Stripe',
      'GitHub',
      'Google',
      'Pode ler',
      'só números',
      'Apagar meus dados',
      'cookie',
      'LGPD',
      'ANPD',
    ]) {
      expect(texto('privacidade')).toContain(trecho);
    }
  });

  it('the terms say the price, the quota, how to cancel, the 7 days and that erasing cancels', () => {
    for (const trecho of ['R$ 99', '15 vagas', '3 versões', 'Gerenciar assinatura', '7 dias', 'art. 49', 'Apagar meus dados', 'cancela a assinatura na hora']) {
      expect(texto('termos')).toContain(trecho);
    }
  });
});

describe('as páginas', () => {
  it('/termos and /privacidade render their text', async () => {
    const { default: Termos } = await import('@/app/termos/page');
    const { default: Privacidade } = await import('@/app/privacidade/page');
    expect(renderToStaticMarkup(createElement(Termos))).toContain('<h1>Termos de uso</h1>');
    expect(renderToStaticMarkup(createElement(Privacidade))).toContain('<h1>Política de privacidade</h1>');
  });
});
