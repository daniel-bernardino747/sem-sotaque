// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FormularioOpiniao } from '@/app/casa/_telas/fim';

import { lerIndicacoes, lerOpiniao } from './fechamento';

const form = (campos: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of campos) f.append(k, v);
  return f;
};

describe('lerIndicacoes', () => {
  it('reads every filled row and skips the empty ones', () => {
    const f = form([
      ['nome', 'Beto Inventado'],
      ['contato', '11 98888-0000'],
      ['nome', ''],
      ['contato', ''],
      ['nome', 'Carla Inventada'],
      ['contato', 'linkedin.com/in/carla'],
    ]);
    expect(lerIndicacoes(f)).toEqual({
      ok: true,
      dados: [
        { nome: 'Beto Inventado', contato: '11 98888-0000' },
        { nome: 'Carla Inventada', contato: 'linkedin.com/in/carla' },
      ],
    });
  });

  it('refuses a half-filled row and an empty form', () => {
    expect(lerIndicacoes(form([['nome', 'Beto'], ['contato', '']]))).toEqual({ ok: false, erro: 'Falta o WhatsApp ou o LinkedIn de Beto.' });
    expect(lerIndicacoes(form([['nome', ''], ['contato', '11 98888-0000']]))).toMatchObject({ ok: false });
    expect(lerIndicacoes(form([['nome', ''], ['contato', '']]))).toMatchObject({ ok: false });
  });
});

describe('lerOpiniao', () => {
  it('reads each answer on its own, all optional', () => {
    expect(lerOpiniao(form([['comentario', 'o chat travou uma vez']]))).toEqual({
      ok: true,
      dados: { depoimento: null, depoimentoPodeUsar: false, comentario: 'o chat travou uma vez' },
    });
    expect(lerOpiniao(form([['depoimento', 'Gostei.']]))).toMatchObject({ ok: true, dados: { depoimento: 'Gostei.' } });
    expect(lerOpiniao(form([]))).toMatchObject({ ok: false });
  });

  it('no longer asks "pagaria?" (step 22): those fields alone are an empty form', () => {
    expect(lerOpiniao(form([['pagaria', 'sim'], ['pagaria_quanto', 'R$ 200']]))).toMatchObject({ ok: false });
  });

  it('the testimonial may be used only with its own box ticked, never with the entry consent', () => {
    const depoimento: [string, string] = ['depoimento', 'Gostei das perguntas.'];
    // The entry consent's field (`aceito`, step 03) does not count as this one.
    expect(lerOpiniao(form([depoimento, ['aceito', 'sim']]))).toMatchObject({ ok: true, dados: { depoimentoPodeUsar: false } });
    expect(lerOpiniao(form([depoimento]))).toMatchObject({ ok: true, dados: { depoimentoPodeUsar: false } });
    expect(lerOpiniao(form([depoimento, ['depoimento_pode_usar', 'sim']]))).toMatchObject({
      ok: true,
      dados: { depoimento: 'Gostei das perguntas.', depoimentoPodeUsar: true },
    });
    // Ticked with nothing written: there is no testimonial to use.
    expect(lerOpiniao(form([['comentario', 'ok'], ['depoimento_pode_usar', 'sim']]))).toMatchObject({ ok: true, dados: { depoimentoPodeUsar: false } });
  });
});

describe('FormularioOpiniao', () => {
  it('renders the testimonial consent unticked, optional and separate from the entry one', () => {
    const html = renderToStaticMarkup(createElement(FormularioOpiniao, { enviar: async (e) => e, jaEnviou: false }));
    const caixas = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    expect(caixas).toHaveLength(1);
    const [caixa] = caixas;
    expect(caixa).toContain('name="depoimento_pode_usar"');
    expect(caixa).not.toMatch(/\bchecked\b/);
    expect(caixa).not.toMatch(/\brequired\b/);
    expect(html).not.toContain('name="aceito"');
    expect(html).not.toMatch(/pagaria/i);
  });
});
