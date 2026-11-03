// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import type { LinhaChamada } from '@/llm/cliente';

import { criarJev, ErroClassificador, MODELO_JEV, type SdkJev } from './jev';

const perguntas = {
  resultado: { type: 'noul' as const, instructions: 'Is there a result?' },
  decisao: { type: 'choice' as const, instructions: 'What next?', criteria: { continuar: null, trocar: null, adiar: null } },
  forca: { type: 'score' as const, instructions: 'How strong?', criteria: ['weak', 'medium', 'strong'] as const },
};

const valida = {
  model: MODELO_JEV,
  answers: {
    resultado: { type: 'noul', noul: 0.9 },
    decisao: { type: 'choice', choice: 'trocar', confidence: 0.8, probabilities: { continuar: 0.1, trocar: 0.8, adiar: 0.1 } },
    forca: { type: 'score', score: 1.6, confidence: 0.7, legend: {}, probabilities: {} },
  },
  usage: { input_tokens: 1_000_000, output_tokens: 50 },
};

function sdkFalso(respostas: (unknown | Error)[]) {
  const pedidos: unknown[] = [];
  const sdk: SdkJev = {
    async systemOne(pedido) {
      pedidos.push(pedido);
      const r = respostas.shift();
      if (r instanceof Error) throw r;
      return r as Awaited<ReturnType<SdkJev['systemOne']>>;
    },
  };
  return { sdk, pedidos };
}

describe('criarJev', () => {
  it('answers, pinned to its model, and records the cost of input tokens only', async () => {
    const { sdk, pedidos } = sdkFalso([valida]);
    const linhas: LinhaChamada[] = [];
    const jev = criarJev({ sdk, registrar: async (l) => linhas.push(l) });

    const r = await jev.classificar({ sessaoId: 's1', state: { x: 1 }, questions: perguntas });

    expect(r.decisao).toMatchObject({ choice: 'trocar' });
    expect(pedidos[0]).toMatchObject({ model: MODELO_JEV, state: { x: 1 } });
    expect(linhas).toEqual([
      expect.objectContaining({ sessaoId: 's1', etapa: 'avaliador', modelo: MODELO_JEV, tokensEntrada: 1_000_000, tokensSaida: 50, custoUsd: 0.042, erro: null }),
    ]);
  });

  it('tries once more after a failure, recording both attempts', async () => {
    const { sdk } = sdkFalso([new Error('socket hang up'), valida]);
    const linhas: LinhaChamada[] = [];
    const jev = criarJev({ sdk, registrar: async (l) => linhas.push(l) });
    await jev.classificar({ sessaoId: 's1', state: null, questions: perguntas });
    expect(linhas.map((l) => l.erro)).toEqual(['socket hang up', null]);
  });

  it('fails after the second failure, and on an answer that does not fit the questions', async () => {
    const duasFalhas = criarJev({ sdk: sdkFalso([new Error('a'), new Error('b')]).sdk, registrar: async () => {} });
    await expect(duasFalhas.classificar({ sessaoId: 's1', state: null, questions: perguntas })).rejects.toMatchObject({ motivo: 'api' });

    const fora = { ...valida, answers: { ...valida.answers, decisao: { ...valida.answers.decisao, choice: 'outra' } } };
    const invalida = criarJev({ sdk: sdkFalso([fora, fora]).sdk, registrar: async () => {} });
    const erro = await invalida.classificar({ sessaoId: 's1', state: null, questions: perguntas }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroClassificador);
    expect(erro).toMatchObject({ motivo: 'invalida' });
  });

  it('does not call past the session spending cap', async () => {
    const { sdk, pedidos } = sdkFalso([valida]);
    const jev = criarJev({ sdk, registrar: async () => {}, gastoDaSessao: async () => 3.5, tetoSessaoUsd: 3 });
    await expect(jev.classificar({ sessaoId: 's1', state: null, questions: perguntas })).rejects.toMatchObject({ motivo: 'teto' });
    expect(pedidos).toHaveLength(0);
  });
});
