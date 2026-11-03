// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { linhaDoTempo, resumoDoAvaliador } from './linha-do-tempo';

const em = (s: number) => new Date(Date.UTC(2026, 9, 20, 12, 0, s));

describe('linhaDoTempo', () => {
  it('puts each decision of the evaluator between the messages, in time order', () => {
    const mensagens = [
      { id: 'm1', createdAt: em(1) },
      { id: 'm2', createdAt: em(5) },
    ];
    const decisoes = [
      { id: 'd1', createdAt: em(0) },
      { id: 'd2', createdAt: em(3) },
      { id: 'd3', createdAt: em(5) },
    ];
    expect(linhaDoTempo(mensagens, decisoes).map((i) => `${i.tipo}:${i.item.id}`)).toEqual([
      'decisao:d1',
      'mensagem:m1',
      'decisao:d2',
      'mensagem:m2',
      'decisao:d3',
    ]);
  });
});

describe('resumoDoAvaliador', () => {
  it('counts the checkpoints, the Jev failures and the offer', () => {
    const decisoes = [
      { decisao: 'plano_inicial', backend: 'jev', erro: null },
      { decisao: 'continuar', backend: 'reserva', erro: 'api: timeout' },
      { decisao: 'trocar', backend: 'reserva', erro: null },
      { decisao: 'ofereceu_fim', backend: 'jev', erro: null },
      // The person's pick at the offer is not a checkpoint.
      { decisao: 'escolheu', backend: 'pessoa', erro: null },
    ];
    expect(resumoDoAvaliador(decisoes)).toEqual({ checkpoints: 3, falhasDoJev: 1, semJev: 1, ofereceuFim: true });
  });
});
