// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import type { Affiliation } from '@/db';

import { lerResposta, perguntaDoBloco } from './bloco';

const quando = new Date('2026-01-01T00:00:00Z');
function af(over: Partial<Affiliation> = {}): Affiliation {
  return {
    id: 'af1', sessaoId: 's', organizacao: 'Loja Inventada', cargo: 'Dev', tipo: 'emprego', anoConclusao: null, cursando: false,
    periodoOriginal: '2018 – 2019', periodoInicio: null, periodoFim: null, stack: [], confidencial: false, descricaoPublica: null,
    periodoConfirmado: false, pulado: false, ordem: 1, createdAt: quando, atualizadoEm: quando, ...over,
  };
}

describe('perguntaDoBloco', () => {
  it('asks a company, in order, for its period, what it does and whether it can be named, opening with the company', () => {
    const loja = af();
    expect(perguntaDoBloco(loja, [])).toEqual({ passo: 'inicio', texto: 'Antes de deixar Loja Inventada para trás: em que mês de 2018 você entrou lá?' });
    expect(perguntaDoBloco(af({ periodoInicio: '2018-08' }), ['inicio'])).toMatchObject({ passo: 'fim', texto: expect.stringMatching(/^E em que mês de 2019 você saiu/) });
    // No start month: no end month either.
    expect(perguntaDoBloco(loja, ['inicio'])).toMatchObject({ passo: 'descricao' });
    const datada = af({ periodoInicio: '2018-08', periodoFim: '2019-12', periodoConfirmado: true });
    expect(perguntaDoBloco(datada, ['inicio', 'fim'])).toMatchObject({ passo: 'descricao' });
    expect(perguntaDoBloco({ ...datada, descricaoPublica: 'agência de sites' }, ['inicio', 'fim', 'descricao'])).toEqual({
      passo: 'nome',
      texto: 'O nome Loja Inventada pode aparecer no currículo?',
    });
    expect(perguntaDoBloco(datada, ['inicio', 'fim', 'descricao', 'nome'])).toBeNull();
  });

  it('asks to confirm a period that came with months, and each question has one question mark', () => {
    const p = perguntaDoBloco(af({ periodoOriginal: 'mar/2022 – atual', periodoInicio: '2022-03' }), []);
    expect(p).toEqual({ passo: 'confirmar', texto: 'Antes de deixar Loja Inventada para trás: no currículo está de março de 2022 até hoje. Está certo?' });
    for (const passos of [[], ['inicio'], ['inicio', 'fim'], ['inicio', 'fim', 'descricao']] as const) {
      expect(perguntaDoBloco(af({ descricaoPublica: passos.length > 2 ? 'x' : null }), [...passos])!.texto.split('?')).toHaveLength(2);
    }
  });

  it('asks a degree for its year only', () => {
    const curso = af({ tipo: 'graduacao', organizacao: 'Universidade Inventada', cargo: 'Ciência da Computação', periodoOriginal: '2012 – 2016' });
    expect(perguntaDoBloco(curso, [])).toEqual({
      passo: 'ano',
      texto: 'Antes de deixar Universidade Inventada para trás: em que ano você se formou em Ciência da Computação? Se ainda está cursando, me diga a previsão.',
    });
    expect(perguntaDoBloco({ ...curso, anoConclusao: 2016 }, [])).toBeNull();
  });
});

describe('lerResposta', () => {
  const loja = af();

  it('reads a month, with the year from the resume when the person gives none', () => {
    expect(lerResposta(loja, 'inicio', 'agosto')).toEqual({ campos: { periodoInicio: '2018-08' } });
    expect(lerResposta(loja, 'inicio', 'acho que foi em março de 2017')).toEqual({ campos: { periodoInicio: '2017-03' } });
    expect(lerResposta(loja, 'inicio', '08/2018')).toEqual({ campos: { periodoInicio: '2018-08' } });
  });

  it('reads the start and the end when the person gives both at once', () => {
    expect(lerResposta(loja, 'inicio', 'Entrei em fevereiro de 2018 e saí em dezembro de 2019.')).toEqual({
      campos: { periodoInicio: '2018-02', periodoFim: '2019-12', periodoConfirmado: true },
    });
    expect(lerResposta(loja, 'inicio', 'entrei em agosto e saí em dezembro')).toEqual({
      campos: { periodoInicio: '2018-08', periodoFim: '2019-12', periodoConfirmado: true },
    });
    expect(lerResposta(loja, 'inicio', 'entrei em março de 2018 e ainda estou lá')).toEqual({
      campos: { periodoInicio: '2018-03', periodoFim: null, periodoConfirmado: true },
    });
  });

  it('closes the period with the month she left, or with "ainda estou lá"', () => {
    const entrou = af({ periodoInicio: '2018-08' });
    expect(lerResposta(entrou, 'fim', 'dezembro')).toEqual({ campos: { periodoFim: '2019-12', periodoConfirmado: true } });
    expect(lerResposta(entrou, 'fim', 'ainda tô lá')).toEqual({ campos: { periodoFim: null, periodoConfirmado: true } });
    expect(lerResposta(entrou, 'fim', 'julho de 2017')).toBeNull();
  });

  it('confirms a period on a yes, and asks for the start on a no', () => {
    const datada = af({ periodoInicio: '2022-03' });
    expect(lerResposta(datada, 'confirmar', 'sim')).toEqual({ campos: { periodoConfirmado: true } });
    expect(lerResposta(datada, 'confirmar', 'não, tá errado')).toEqual({ campos: {} });
    expect(perguntaDoBloco(datada, ['confirmar'])).toMatchObject({ passo: 'inicio' });
  });

  it('takes the description as she said it, and the name on a yes or a no', () => {
    expect(lerResposta(loja, 'descricao', 'fintech de boleto pra uns 8 mil lojistas')).toEqual({
      campos: { descricaoPublica: 'fintech de boleto pra uns 8 mil lojistas' },
    });
    expect(lerResposta(loja, 'nome', 'pode sim')).toEqual({ campos: { confidencial: false } });
    expect(lerResposta({ ...loja, descricaoPublica: 'agência de sites' }, 'nome', 'prefiro que não')).toEqual({ campos: { confidencial: true } });
  });

  it('reads a degree year, and whether it is still being taken', () => {
    const curso = af({ tipo: 'graduacao' });
    expect(lerResposta(curso, 'ano', '2016')).toEqual({ campos: { anoConclusao: 2016, cursando: false } });
    expect(lerResposta(curso, 'ano', 'ainda tô cursando, termino em 2027')).toEqual({ campos: { anoConclusao: 2027, cursando: true } });
  });

  it('moves past a "não sei" without recording anything', () => {
    expect(lerResposta(loja, 'descricao', 'sei lá')).toEqual({ campos: {} });
    expect(lerResposta(loja, 'inicio', 'não lembro')).toEqual({ campos: {} });
  });

  it('hands to the questioner what it cannot read, or what says more than the answer', () => {
    expect(lerResposta(loja, 'inicio', 'foi logo depois da faculdade')).toBeNull();
    expect(lerResposta(loja, 'nome', 'depende, por quê?')).toBeNull();
    expect(lerResposta(loja, 'nome', 'não')).toBeNull(); // confidential needs a description first
    expect(
      lerResposta(af({ periodoInicio: '2022-03' }), 'confirmar', 'Sim, ainda tô lá. Aliás, montei também um alerta de fraude que não tá no currículo e barrou bastante coisa'),
    ).toBeNull();
  });
});
