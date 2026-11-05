// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, describe, expect, inject, it } from 'vitest';

import { db, fecharDb } from './client';
import { criarTester, errosEAtritos, registrarChamadaLlm, registrarEvento } from './index';
import * as t from './schema';

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);

const DIA = 24 * 60 * 60 * 1000;

describe.skipIf(semBanco)('errosEAtritos (o painel)', () => {
  it("groups the week's errors, and ties a screen's error to the server's by the digest", async () => {
    const marca = `Classe${Date.now()}`;
    const { sessao } = await criarTester({ apelido: 'Fulana Inventada', origem: 'teste' });
    const digest = `d${Date.now()}`;
    const velho = new Date(Date.now() - 8 * DIA);
    await db()
      .insert(t.erros)
      .values([
        { sessaoId: sessao.id, origem: 'servidor', onde: 'requisicao', classe: marca, digest },
        { sessaoId: sessao.id, origem: 'navegador', onde: '/casa', classe: `${marca}Tela`, codigo: 'limite', digest },
        { sessaoId: sessao.id, origem: 'navegador', onde: '/casa', classe: `${marca}Tela`, codigo: 'limite' },
        { sessaoId: sessao.id, origem: 'servidor', onde: 'import', classe: `${marca}Velho`, createdAt: velho },
      ]);

    const p = await errosEAtritos();

    expect(p.grupos.find((g) => g.classe === marca)).toMatchObject({ origem: 'servidor', onde: 'requisicao', n: 1 });
    expect(p.grupos.find((g) => g.classe === `${marca}Tela`)).toMatchObject({
      origem: 'navegador',
      onde: '/casa',
      codigo: 'limite',
      n: 2,
      doServidor: [{ onde: 'requisicao', classe: marca, n: 1 }],
    });
    expect(p.grupos.find((g) => g.classe === `${marca}Velho`)).toBeUndefined();
    expect(p.sessoes.find((s) => s.sessaoId === sessao.id)).toEqual({ sessaoId: sessao.id, apelido: 'Fulana Inventada', n: 3 });
  });

  it("counts the frictions, the sessions that hit the cap, the model's failures per stage and the week's render time", async () => {
    const antes = await errosEAtritos();
    const { sessao } = await criarTester({ apelido: 'Beltrano Inventado', origem: 'teste' });
    await registrarEvento(sessao.id, 'tentou_de_novo', { onde: 'chat' });
    await registrarEvento(sessao.id, 'tentou_de_novo', { onde: 'resultado' });
    await registrarEvento(sessao.id, 'turno_ocupado');
    await registrarEvento(sessao.id, 'terminou', { abertos: 0, total: 3, por: 'teto' });
    await registrarEvento(sessao.id, 'terminou', { abertos: 0, total: 3, por: 'pessoa' });
    const [selection] = await db().insert(t.selections).values({ sessaoId: sessao.id, json: {} }).returning();
    await db().insert(t.renders).values({ selectionId: selection.id, pdf: Buffer.from('%PDF'), medida: {}, duracaoMs: 9_876_543 });
    // A render older than the window stays out of it.
    await db()
      .insert(t.renders)
      .values({ selectionId: selection.id, pdf: Buffer.from('%PDF'), medida: {}, duracaoMs: 99_999_999, createdAt: new Date(Date.now() - 8 * DIA) });
    await registrarChamadaLlm({ sessaoId: sessao.id, etapa: 'critico', modelo: 'teste', custoUsd: 0, duracaoMs: 1, erro: 'refusal (x)' });
    await registrarChamadaLlm({ sessaoId: sessao.id, etapa: 'critico', modelo: 'teste', custoUsd: 0, duracaoMs: 1, erro: null });

    const depois = await errosEAtritos();

    expect((depois.tentouDeNovo.chat ?? 0) - (antes.tentouDeNovo.chat ?? 0)).toBe(1);
    expect((depois.tentouDeNovo.resultado ?? 0) - (antes.tentouDeNovo.resultado ?? 0)).toBe(1);
    expect(depois.turnoOcupado - antes.turnoOcupado).toBe(1);
    expect(depois.teto - antes.teto).toBe(1);
    expect(depois.render?.maximo).toBe(9_876_543);
    expect(depois.render?.n).toBe((antes.render?.n ?? 0) + 1);
    expect((depois.falhasDoModelo.critico ?? 0) - (antes.falhasDoModelo.critico ?? 0)).toBe(1);
  });
});
