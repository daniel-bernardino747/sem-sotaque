// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import type { Affiliation } from '@/db';

import { affiliationFechada } from './estado';

function affiliation(over: Partial<Affiliation>): Affiliation {
  return {
    id: 'af', sessaoId: 's', organizacao: 'Universidade Inventada', cargo: 'Ciência da Computação', tipo: 'graduacao',
    anoConclusao: null, cursando: false, periodoOriginal: '2014 – 2018', periodoInicio: null, periodoFim: null, stack: [],
    confidencial: false, descricaoPublica: null, periodoConfirmado: false, pulado: false, ordem: 0, createdAt: new Date(), atualizadoEm: new Date(), ...over,
  };
}

describe('affiliationFechada', () => {
  it('closes a degree or a technical course with institution, course and year, no month and no description', () => {
    expect(affiliationFechada(affiliation({ anoConclusao: 2018 }))).toBe(true);
    expect(affiliationFechada(affiliation({ tipo: 'tecnico', anoConclusao: 2012 }))).toBe(true);
    expect(affiliationFechada(affiliation({ anoConclusao: 2027, cursando: true }))).toBe(true);
    expect(affiliationFechada(affiliation({}))).toBe(false);
  });

  it('still closes a job with the confirmed period and the description', () => {
    const emprego = affiliation({ tipo: 'emprego', anoConclusao: 2018 });
    expect(affiliationFechada(emprego)).toBe(false);
    expect(affiliationFechada({ ...emprego, periodoConfirmado: true, periodoInicio: '2019-03', descricaoPublica: 'uma loja' })).toBe(true);
  });
});
