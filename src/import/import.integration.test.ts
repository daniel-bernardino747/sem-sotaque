// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The import against the real model. Runs only with ANTHROPIC_API_KEY set (and
 * Postgres up): it spends money, about one extraction per fixture plus one for
 * the PDF.
 *
 *   ANTHROPIC_API_KEY=... npx vitest run src/import/import.integration.test.ts
 */
import { readFileSync } from 'node:fs';

import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, inject, it } from 'vitest';

import { db, fecharDb } from '../db/client';
import { corpusDaSessao, criarTester } from '../db';
import * as t from '../db/schema';
import { numerosDe } from './extracao';
import { importarCurriculo } from './index';
import { pdftotextDisponivel } from './texto';

const pular = !process.env.ANTHROPIC_API_KEY || !inject('bancoDisponivel');
const fixture = (nome: string) => new URL(`../llm/__fixtures__/${nome}`, import.meta.url);

afterAll(fecharDb);

async function sessaoConsentida(apelido: string) {
  const { sessao } = await criarTester({ apelido, origem: 'teste de integração' });
  await db().update(t.sessoes).set({ estado: 'consentiu' }).where(sql`id = ${sessao.id}`);
  return sessao.id;
}

/** What the import left in the database for a session, and the checks every import must pass. */
async function conferirImport(sessaoId: string, texto: string) {
  const corpus = await corpusDaSessao(sessaoId);
  const linhas = await db().select().from(t.linhasOriginais).where(sql`sessao_id = ${sessaoId}`);
  const chamadas = await db().select().from(t.chamadasLlm).where(sql`sessao_id = ${sessaoId}`);
  const [sessao] = await db().select().from(t.sessoes).where(sql`id = ${sessaoId}`);

  expect(sessao.estado).toBe('importou');

  // A draft: no Metric, so no number can be in one without being in the text.
  expect(corpus.accomplishments.every((a) => a.metrics.length === 0)).toBe(true);

  // Nothing extracted carries a number the resume does not have.
  const doTexto = new Set(numerosDe(texto));
  const escrito = [
    ...corpus.affiliations.flatMap((a) => [a.organizacao, a.cargo, a.periodoInicio ?? '', a.periodoFim ?? '']),
    ...corpus.accomplishments.map((a) => a.enunciado),
  ];
  for (const valor of escrito) {
    for (const numero of numerosDe(valor.replace(/-(\d{2})$/, ''))) {
      expect(doTexto, `"${numero}" in "${valor}"`).toContain(numero);
    }
  }

  // Every accomplishment came from a line of the resume.
  const comLinha = new Set(linhas.map((l) => l.accomplishmentId));
  expect(corpus.accomplishments.filter((a) => !comLinha.has(a.id))).toEqual([]);

  // Every call was logged, and every answered one cost something. (An attempt
  // that failed before the API answered is logged at 0: nothing was billed.)
  expect(chamadas.length).toBeGreaterThan(0);
  expect(chamadas.filter((c) => c.tokensEntrada > 0).every((c) => c.custoUsd > 0)).toBe(true);
  expect(chamadas.some((c) => c.custoUsd > 0)).toBe(true);

  return corpus;
}

describe.skipIf(pular)('import (real model)', { timeout: 300_000 }, () => {
  it('júnior: one internship, a degree, a few things done', async () => {
    const texto = readFileSync(fixture('junior.txt'), 'utf8');
    const sessaoId = await sessaoConsentida('Júnior inventada');
    await importarCurriculo(sessaoId, { formato: 'texto', texto });

    const corpus = await conferirImport(sessaoId, texto);
    expect(corpus.affiliations.map((a) => a.organizacao)).toEqual(
      expect.arrayContaining(['Papelaria Riacho Doce', 'Faculdade Horizonte Mineiro']),
    );
    const estagio = corpus.affiliations.find((a) => a.organizacao === 'Papelaria Riacho Doce')!;
    expect(estagio).toMatchObject({ periodoInicio: '2024-02', periodoFim: null });
    // "2022 – 2024" has no month: nothing is guessed.
    const faculdade = corpus.affiliations.find((a) => a.organizacao === 'Faculdade Horizonte Mineiro')!;
    expect(faculdade).toMatchObject({ periodoInicio: null, periodoFim: null, periodoOriginal: '2022 – 2024' });
    expect(corpus.accomplishments.length).toBeGreaterThanOrEqual(3);
  });

  it('pleno: three jobs and a degree, with the numbers the resume gives and no other', async () => {
    const texto = readFileSync(fixture('pleno.txt'), 'utf8');
    const sessaoId = await sessaoConsentida('Pleno inventado');
    await importarCurriculo(sessaoId, { formato: 'texto', texto });

    const corpus = await conferirImport(sessaoId, texto);
    expect(corpus.affiliations.map((a) => a.organizacao)).toEqual([
      'Fintech Maracatu Pagamentos',
      'Transportadora Capibaribe',
      'Agência Frevo Digital',
      'Universidade Federal Inventada de Pernambuco',
    ]);
    expect(corpus.affiliations[0]).toMatchObject({ periodoInicio: '2022-03', periodoFim: null });
    expect(corpus.affiliations[1]).toMatchObject({ periodoInicio: '2020-01', periodoFim: '2022-02' });
    expect(corpus.affiliations[2]).toMatchObject({ periodoInicio: null, periodoFim: null });
    expect(corpus.affiliations[0].stack).toEqual(expect.arrayContaining(['Go', 'Kafka']));
    expect(corpus.accomplishments.length).toBeGreaterThanOrEqual(7);
  });

  it('in English: the statements stay in English', async () => {
    const texto = readFileSync(fixture('ingles.txt'), 'utf8');
    const sessaoId = await sessaoConsentida('Inglês inventada');
    await importarCurriculo(sessaoId, { formato: 'texto', texto });

    const corpus = await conferirImport(sessaoId, texto);
    expect(corpus.affiliations[0]).toMatchObject({
      organizacao: expect.stringContaining('Araucária Health'),
      periodoInicio: '2021-06',
      periodoFim: null,
    });
    const lembretes = corpus.accomplishments.find((a) => /reminder/i.test(a.enunciado));
    expect(lembretes?.enunciado).toMatch(/30%/);
    expect(corpus.accomplishments.some((a) => /\b(reduzi|criei|liderei)\b/i.test(a.enunciado))).toBe(false);
  });

  it.skipIf(!pdftotextDisponivel())('the PDF of a resume reaches the same Corpus as its text', async () => {
    const texto = readFileSync(fixture('pleno.txt'), 'utf8');
    const deTexto = await sessaoConsentida('Pleno por texto');
    const dePdf = await sessaoConsentida('Pleno por PDF');
    await importarCurriculo(deTexto, { formato: 'texto', texto });
    await importarCurriculo(dePdf, { formato: 'pdf', pdf: readFileSync(fixture('pleno.pdf')) });

    // Two model runs on the same words (the PDF only wraps lines differently,
    // which texto.test.ts pins down without the model): the places and their
    // periods must match; how each run splits bullets may vary by one or two.
    const [a, b] = [await corpusDaSessao(deTexto), await corpusDaSessao(dePdf)];
    const lugares = (c: typeof a) =>
      c.affiliations.map((af) => [af.organizacao, af.periodoInicio, af.periodoFim]);
    expect(lugares(b)).toEqual(lugares(a));
    expect(Math.abs(b.accomplishments.length - a.accomplishments.length)).toBeLessThanOrEqual(2);
  });
});
