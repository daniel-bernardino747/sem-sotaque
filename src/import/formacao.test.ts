// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import type { CorpusImportado } from '@/db';

import { aplicarRegrasDeFormacao, mesesDeExperiencia } from './formacao';

const HOJE = new Date('2026-10-20T12:00:00Z');

type AfImportada = CorpusImportado['affiliations'][number];
const af = (ref: string, tipo: AfImportada['tipo'], periodoOriginal: string | null, extra: Partial<AfImportada> = {}): AfImportada => ({
  ref,
  organizacao: `Org ${ref}`,
  cargo: `Cargo ${ref}`,
  tipo,
  periodoOriginal,
  stack: [],
  ...extra,
});
const ac = (ref: string, affiliationRef: string | null, tipo: CorpusImportado['accomplishments'][number]['tipo'] = 'engineering') => ({
  ref,
  affiliationRef,
  tipo,
  enunciado: `fez ${ref}`,
});

function corpus(affiliations: AfImportada[], accomplishments: ReturnType<typeof ac>[]): CorpusImportado {
  return { affiliations, accomplishments, linhas: [] };
}

const pulados = (c: CorpusImportado) => ({
  affiliations: c.affiliations.filter((a) => a.pulado).map((a) => a.ref),
  accomplishments: c.accomplishments.filter((a) => a.pulado).map((a) => a.ref),
});

describe('mesesDeExperiencia', () => {
  it('sums the jobs, by month when there is one and by year when not, up to today when current', () => {
    expect(mesesDeExperiencia([af('a1', 'emprego', 'mar 2022 – atual', { periodoInicio: '2022-03' })], HOJE)).toBe(56);
    expect(mesesDeExperiencia([af('a1', 'emprego', '2018 – 2019')], HOJE)).toBe(24);
    expect(mesesDeExperiencia([af('a1', 'graduacao', '2014 – 2018')], HOJE)).toBe(0);
  });

  it('does not count an overlap twice, and a job with no period counts nothing', () => {
    const jobs = [af('a1', 'emprego', '2020 – 2021'), af('a2', 'emprego', '2021 – 2021'), af('a3', 'emprego', null)];
    expect(mesesDeExperiencia(jobs, HOJE)).toBe(24);
  });
});

describe('aplicarRegrasDeFormacao', () => {
  it('skips high school when there is a degree, a technical course or a job', () => {
    for (const outra of [af('a2', 'graduacao', '2014 – 2018'), af('a2', 'tecnico', '2012 – 2013'), af('a2', 'emprego', '2019 – 2020')]) {
      const c = aplicarRegrasDeFormacao(corpus([af('a1', 'ensino_medio', '2010 – 2012'), outra], [ac('c1', 'a1', 'education')]), HOJE);
      expect(pulados(c).affiliations).toContain('a1');
      expect(pulados(c).accomplishments).toEqual(['c1']);
    }
  });

  it('keeps high school when it is all there is', () => {
    const c = aplicarRegrasDeFormacao(corpus([af('a1', 'ensino_medio', '2010 – 2012')], []), HOJE);
    expect(pulados(c).affiliations).toEqual([]);
  });

  it('skips bootcamps and free courses, and what was done in them', () => {
    const c = aplicarRegrasDeFormacao(corpus([af('a1', 'curso_livre', '2023')], [ac('c1', 'a1', 'project')]), HOJE);
    expect(pulados(c)).toEqual({ affiliations: ['a1'], accomplishments: ['c1'] });
  });

  it('closes a degree with the year it ended, read from the resume', () => {
    const c = aplicarRegrasDeFormacao(corpus([af('a1', 'graduacao', '2014 – 2018'), af('a2', 'tecnico', 'Conclusão: 2012')], []), HOJE);
    expect(c.affiliations.map((a) => [a.anoConclusao, a.cursando])).toEqual([[2018, false], [2012, false]]);
  });

  it('reads "cursando" with its expected year, and leaves the year open without one', () => {
    const c = aplicarRegrasDeFormacao(
      corpus([af('a1', 'graduacao', '2023 – previsão 2027'), af('a2', 'graduacao', '2024 – atual'), af('a3', 'graduacao', null)], []),
      HOJE,
    );
    expect(c.affiliations.map((a) => [a.anoConclusao, a.cursando])).toEqual([[2027, true], [null, true], [null, false]]);
  });

  it('always skips the record of the course itself: it enters through the Affiliation', () => {
    const c = aplicarRegrasDeFormacao(
      corpus([af('a1', 'graduacao', '2022 – 2024'), af('a2', 'emprego', 'fev 2025 – atual', { periodoInicio: '2025-02' })], [ac('c1', 'a1', 'education'), ac('c2', 'a1', 'project')]),
      HOJE,
    );
    // Under 2 years of work: the TCC stays, the degree's own record goes.
    expect(pulados(c).accomplishments).toEqual(['c1']);
  });

  it('skips everything done in a degree when the work adds up to 2 years or more', () => {
    const c = aplicarRegrasDeFormacao(
      corpus([af('a1', 'graduacao', '2014 – 2018'), af('a2', 'emprego', 'mar 2022 – atual', { periodoInicio: '2022-03' })], [ac('c1', 'a1', 'project'), ac('c2', 'a2')]),
      HOJE,
    );
    expect(pulados(c).accomplishments).toEqual(['c1']);
  });
});
