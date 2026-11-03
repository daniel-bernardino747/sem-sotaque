// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import type { Affiliation, Corpus } from '@/db';
import { Refs } from '@/interrogatorio/estado';

import { aplicarMudancas, montarSelection, periodoDaAffiliation, rascunhoDaEntrada, textoComIds } from './rascunho';

const quando = new Date('2026-01-01T00:00:00Z');
function affiliation(over: Partial<Affiliation>): Affiliation {
  return {
    id: 'af-uuid', sessaoId: 's', organizacao: 'Acme Pagamentos', cargo: 'Dev', tipo: 'emprego', anoConclusao: null, cursando: false, periodoOriginal: null,
    periodoInicio: '2022-03', periodoFim: null, stack: [], confidencial: false, descricaoPublica: 'a payments company',
    periodoConfirmado: true, pulado: false, ordem: 0, createdAt: quando, atualizadoEm: quando, ...over,
  };
}

const af = affiliation({});
const corpus: Corpus = {
  affiliations: [af],
  accomplishments: [
    { id: 'ac-1', sessaoId: 's', affiliationId: af.id, tipo: 'engineering', enunciado: 'x', importanciaParaPessoa: null, data: null, pulado: false, forca: null, adiado: false, adiadoVoltou: false, ordem: 0, createdAt: quando, atualizadoEm: quando, affiliation: af, metrics: [], rascunho: true },
    { id: 'ac-2', sessaoId: 's', affiliationId: af.id, tipo: 'engineering', enunciado: 'y', importanciaParaPessoa: null, data: null, pulado: false, forca: null, adiado: false, adiadoVoltou: false, ordem: 1, createdAt: quando, atualizadoEm: quando, affiliation: af, metrics: [], rascunho: true },
  ],
};
const refs = new Refs(corpus, []);
const cabecalho = { nome: 'Ada Teste', email: 'ada@example.com', linkedin: 'https://www.linkedin.com/in/ada/', github: null, local: 'Recife, Brazil' };

const rascunho = rascunhoDaEntrada({
  header_role: 'Backend Engineer',
  summary: null,
  sections: [
    {
      title: 'Experience',
      groups: [
        {
          affiliation_ref: 'af1', organisation: 'Acme Pagamentos', role: 'Backend Engineer', location: null,
          bullets: [{ source: 'ac1', text: 'First.' }, { source: 'ac2', text: 'Second.' }],
          stack: ['Go', 'PostgreSQL'],
        },
      ],
    },
  ],
});

describe('periodoDaAffiliation', () => {
  it('writes month/year, Present only when confirmed, and nothing without a month', () => {
    expect(periodoDaAffiliation(affiliation({ periodoFim: '2024-10' }))).toBe('Mar 2022 - Oct 2024');
    expect(periodoDaAffiliation(affiliation({}))).toBe('Mar 2022 - Present');
    expect(periodoDaAffiliation(affiliation({ periodoConfirmado: false }))).toBeUndefined();
    expect(periodoDaAffiliation(affiliation({ periodoInicio: null }))).toBeUndefined();
  });

  it('falls back to the years the resume gave when the month was never confirmed', () => {
    const semMes = { periodoInicio: null, periodoConfirmado: false };
    expect(periodoDaAffiliation(affiliation({ ...semMes, periodoOriginal: '2019 – 2021' }))).toBe('2019 - 2021');
    expect(periodoDaAffiliation(affiliation({ ...semMes, periodoOriginal: 'mar 2022 – atual' }))).toBe('2022 - Present');
    expect(periodoDaAffiliation(affiliation({ ...semMes, periodoOriginal: '2023' }))).toBe('2023');
    expect(periodoDaAffiliation(affiliation({ ...semMes, periodoOriginal: '2020 – 2020' }))).toBe('2020');
    // An imported month with an end never confirmed: the years, not a guessed "Present".
    expect(periodoDaAffiliation(affiliation({ periodoInicio: '2022-03', periodoConfirmado: false, periodoOriginal: 'mar 2022' }))).toBe('2022');
  });

  it('prints a degree by its year of conclusion, or the expected one', () => {
    const curso = { tipo: 'graduacao' as const, periodoInicio: null, periodoConfirmado: false, periodoOriginal: '2014 – 2018' };
    expect(periodoDaAffiliation(affiliation({ ...curso, anoConclusao: 2018 }))).toBe('2018');
    expect(periodoDaAffiliation(affiliation({ ...curso, anoConclusao: 2027, cursando: true }))).toBe('Expected 2027');
    expect(periodoDaAffiliation(affiliation({ ...curso, anoConclusao: null }))).toBe('2014 - 2018');
  });
});

describe('montarSelection', () => {
  it('fills the header, the period, the database ids and the stack line, and maps every line', () => {
    const { selection, linhas } = montarSelection(rascunho, { cabecalho, corpus, refs });
    expect(selection.header).toEqual({
      name: 'Ada Teste', role: 'Backend Engineer', location: 'Recife, Brazil', email: 'ada@example.com',
      links: [{ label: 'linkedin.com/in/ada', url: 'https://www.linkedin.com/in/ada/' }],
    });
    const grupo = selection.sections[0].groups[0];
    expect(grupo.heading).toEqual({ organisation: 'Acme Pagamentos', role: 'Backend Engineer', period: 'Mar 2022 - Present' });
    expect(grupo.entries).toEqual([
      { source: 'ac-1', text: 'First.' },
      { source: 'ac-2', text: 'Second.' },
      { source: 'ac-1', label: 'Tech stack', text: 'Go, PostgreSQL.' },
    ]);
    expect(linhas.get('e:0:0:1')).toBe('b2');
    expect(linhas.get('e:0:0:2')).toBe('g1.stack');
    expect(linhas.get('g:0:0')).toBe('g1');
  });

  it('prints the lines with their ids', () => {
    const { selection } = montarSelection(rascunho, { cabecalho, corpus, refs });
    const texto = textoComIds(rascunho, selection, { fontes: true });
    expect(texto).toContain('[b2] (ac2) Second.');
    expect(texto).toContain('[g1.role] Backend Engineer  |  Mar 2022 - Present');
    expect(texto).toContain('[g1.stack] Tech stack: Go, PostgreSQL.');
  });
});

describe('aplicarMudancas', () => {
  it('replaces, removes, adds in place, keeps, and says what it could not do', () => {
    const r = aplicarMudancas(rascunho, [
      { acao: 'trocar', id: 'b1', texto: 'New first.', source: null, depois_de: null, motivo: null },
      { acao: 'remover', id: 'b2', texto: null, source: null, depois_de: null, motivo: null },
      { acao: 'adicionar', id: 'g1', source: 'ac2', texto: 'Opening.', depois_de: 'inicio', motivo: null },
      { acao: 'trocar', id: 'g1.stack', texto: 'Go, Kafka.', source: null, depois_de: null, motivo: null },
      { acao: 'manter', id: 'g1.role', texto: null, source: null, depois_de: null, motivo: 'the Corpus says nothing else' },
      { acao: 'trocar', id: 'b99', texto: 'x', source: null, depois_de: null, motivo: null },
    ]);
    expect(r.rascunho.sections[0].groups[0].bullets).toEqual([
      { id: 'b3', source: 'ac2', text: 'Opening.' },
      { id: 'b1', source: 'ac1', text: 'New first.' },
    ]);
    expect(r.rascunho.sections[0].groups[0].stack).toEqual(['Go', 'Kafka']);
    expect([...r.alteradas]).toEqual(['b1', 'b3', 'g1.stack']);
    expect(r.mantidas.get('g1.role')).toBe('the Corpus says nothing else');
    expect(r.erros).toHaveLength(1);
    // The original draft is untouched.
    expect(rascunho.sections[0].groups[0].bullets).toHaveLength(2);
  });
});
