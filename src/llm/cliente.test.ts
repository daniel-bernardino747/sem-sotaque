// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { describe, expect, it } from 'vitest';

import {
  criarClienteLlm,
  ErroLlm,
  type LinhaChamada,
  MARGEM_GERACAO_USD,
  ORCAMENTO_POR_VAGA_USD,
  type SdkMinimo,
  TETO_SESSAO_PADRAO_USD,
  tetoDoAmbiente,
} from './cliente';
import { custoUsd, MODELO_PADRAO } from './precos';

type Mensagem = Anthropic.Beta.BetaMessage;

function mensagem(parcial: Partial<Mensagem> = {}): Mensagem {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: MODELO_PADRAO,
    content: [{ type: 'text', text: 'oi', citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 200,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_creation: null,
      server_tool_use: null,
      service_tier: 'standard',
      iterations: null,
    },
    ...parcial,
  } as Mensagem;
}

/** One scripted reply per attempt: a message (streamed as `textos`), or an error to throw. */
type Roteiro = { mensagem: Mensagem; textos?: string[] } | { erro: Error; textos?: string[] };

function sdkFalso(roteiro: Roteiro[]) {
  const pedidos: BetaMessageStreamParams[] = [];
  const sdk: SdkMinimo = {
    beta: {
      messages: {
        stream(params) {
          pedidos.push(params);
          const passo = roteiro.shift();
          if (!passo) throw new Error('no scripted reply left');
          const ouvintes: ((delta: string) => void)[] = [];
          return {
            on(_evento: 'text', ouvinte: (delta: string) => void) {
              ouvintes.push(ouvinte);
              return this;
            },
            async finalMessage() {
              for (const texto of passo.textos ?? []) ouvintes.forEach((o) => o(texto));
              if ('erro' in passo) throw passo.erro;
              return passo.mensagem;
            },
          };
        },
      },
    },
  };
  return { sdk, pedidos };
}

function montar(roteiro: Roteiro[]) {
  const linhas: LinhaChamada[] = [];
  const { sdk, pedidos } = sdkFalso(roteiro);
  const cliente = criarClienteLlm({
    sdk,
    registrar: async (linha) => {
      linhas.push(linha);
    },
  });
  return { cliente, linhas, pedidos };
}

const pedidoBase = {
  etapa: 'import' as const,
  sessaoId: 'sessao-1',
  params: { max_tokens: 1000, messages: [{ role: 'user' as const, content: 'oi' }] },
};

const erroTransitorio = () => new Anthropic.APIConnectionError({ message: 'socket hang up' });

describe('criarClienteLlm', () => {
  it('records a successful call with its tokens, duration and a non-zero cost', async () => {
    const { cliente, linhas } = montar([{ mensagem: mensagem() }]);

    const resposta = await cliente.chamar(pedidoBase);

    expect(resposta.stop_reason).toBe('end_turn');
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      sessaoId: 'sessao-1',
      vagaId: null,
      etapa: 'import',
      modelo: MODELO_PADRAO,
      tokensEntrada: 1000,
      tokensSaida: 200,
      erro: null,
    });
    expect(linhas[0].custoUsd).toBeGreaterThan(0);
    expect(linhas[0].custoUsd).toBeCloseTo(
      custoUsd(MODELO_PADRAO, { input_tokens: 1000, output_tokens: 200 }),
      9,
    );
    expect(linhas[0].duracaoMs).toBeGreaterThanOrEqual(0);
  });

  it('sends the default model with refusal fallbacks on', async () => {
    const { cliente, pedidos } = montar([{ mensagem: mensagem() }]);
    await cliente.chamar(pedidoBase);
    expect(pedidos[0]).toMatchObject({
      model: MODELO_PADRAO,
      fallbacks: 'default',
      betas: expect.arrayContaining(['server-side-fallback-2026-07-01']),
    });
  });

  it('streams text deltas to the caller', async () => {
    const { cliente } = montar([{ mensagem: mensagem(), textos: ['Encon', 'trei'] }]);
    const recebido: string[] = [];
    await cliente.chamar({ ...pedidoBase, aoTexto: (d) => recebido.push(d) });
    expect(recebido.join('')).toBe('Encontrei');
  });

  it('prices every attempt of a fallback-served call at its own model', async () => {
    const tentativa = { cache_creation: null, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const { cliente, linhas } = montar([
      {
        mensagem: mensagem({
          model: 'claude-opus-5' as Mensagem['model'],
          usage: {
            ...mensagem().usage,
            input_tokens: 500,
            output_tokens: 100,
            iterations: [
              { ...tentativa, type: 'message', model: MODELO_PADRAO, input_tokens: 500, output_tokens: 0 },
              { ...tentativa, type: 'fallback_message', model: 'claude-opus-5', input_tokens: 500, output_tokens: 100 },
            ],
          },
        }),
      },
    ]);

    await cliente.chamar(pedidoBase);

    expect(linhas[0].modelo).toBe('claude-opus-5');
    expect(linhas[0].tokensEntrada).toBe(1000);
    expect(linhas[0].custoUsd).toBeCloseTo(
      custoUsd(MODELO_PADRAO, { input_tokens: 500, output_tokens: 0 }) +
        custoUsd('claude-opus-5', { input_tokens: 500, output_tokens: 100 }),
      9,
    );
  });

  it('still records a paid call whose model has no price, at the highest price known', async () => {
    const { cliente, linhas } = montar([
      { mensagem: mensagem({ model: 'claude-novo' as Mensagem['model'] }) },
    ]);

    await cliente.chamar(pedidoBase);

    expect(linhas[0].modelo).toBe('claude-novo');
    expect(linhas[0].custoUsd).toBeGreaterThan(0);
    expect(linhas[0].erro).toMatch(/no price for claude-novo/);
  });

  it('retries a transient error once, recording both attempts', async () => {
    const { cliente, linhas } = montar([{ erro: erroTransitorio() }, { mensagem: mensagem() }]);

    const resposta = await cliente.chamar(pedidoBase);

    expect(resposta.stop_reason).toBe('end_turn');
    expect(linhas).toHaveLength(2);
    expect(linhas[0].erro).toMatch(/socket hang up/);
    expect(linhas[0].custoUsd).toBe(0);
    expect(linhas[1].erro).toBeNull();
  });

  it('gives up after the one retry', async () => {
    const { cliente, linhas } = montar([{ erro: erroTransitorio() }, { erro: erroTransitorio() }]);
    await expect(cliente.chamar(pedidoBase)).rejects.toBeInstanceOf(ErroLlm);
    expect(linhas).toHaveLength(2);
  });

  it('does not retry once text already reached the caller', async () => {
    const { cliente, linhas } = montar([{ erro: erroTransitorio(), textos: ['meio'] }]);
    await expect(cliente.chamar({ ...pedidoBase, aoTexto: () => {} })).rejects.toBeInstanceOf(ErroLlm);
    expect(linhas).toHaveLength(1);
  });

  it('does not retry a request the API rejected', async () => {
    const ruim = new Anthropic.BadRequestError(400, undefined, 'bad request', new Headers());
    const { cliente, linhas } = montar([{ erro: ruim }]);
    await expect(cliente.chamar(pedidoBase)).rejects.toMatchObject({ motivo: 'api' });
    expect(linhas).toHaveLength(1);
  });

  it('turns a refusal into an error, still recording what it cost', async () => {
    const { cliente, linhas } = montar([
      {
        mensagem: mensagem({
          stop_reason: 'refusal',
          content: [],
          stop_details: { type: 'refusal', category: 'cyber', explanation: null, fallback_credit_token: null, fallback_has_prefill_claim: false, recommended_model: null },
        } as Partial<Mensagem>),
      },
    ]);

    await expect(cliente.chamar(pedidoBase)).rejects.toMatchObject({ motivo: 'recusa' });
    expect(linhas[0].erro).toMatch(/refusal/);
    expect(linhas[0].custoUsd).toBeGreaterThan(0);
  });

  it('stops calling once the session reached its spending cap', async () => {
    const { sdk, pedidos } = sdkFalso([{ mensagem: mensagem() }]);
    const linhas: LinhaChamada[] = [];
    const cliente = criarClienteLlm({
      sdk,
      registrar: async (linha) => {
        linhas.push(linha);
      },
      gastoDaSessao: async () => 3.01,
      tetoSessaoUsd: 3,
    });

    await expect(cliente.chamar(pedidoBase)).rejects.toMatchObject({ motivo: 'teto' });
    expect(pedidos).toHaveLength(0);
    expect(linhas).toHaveLength(0);
  });

  it('calls below the cap, and never caps a call without a session', async () => {
    const { sdk } = sdkFalso([{ mensagem: mensagem() }, { mensagem: mensagem() }]);
    const lidas: string[] = [];
    const cliente = criarClienteLlm({
      sdk,
      registrar: async () => {},
      gastoDaSessao: async (id) => {
        lidas.push(id);
        return id === 'sessao-1' ? 2.99 : 100;
      },
      tetoSessaoUsd: 3,
    });

    await expect(cliente.chamar(pedidoBase)).resolves.toBeDefined();
    await expect(cliente.chamar({ ...pedidoBase, sessaoId: null })).resolves.toBeDefined();
    expect(lidas).toEqual(['sessao-1']);
  });

  it('lets generation spend its margin past the cap, and no further', async () => {
    const { sdk, pedidos } = sdkFalso([{ mensagem: mensagem() }]);
    const cliente = criarClienteLlm({
      sdk,
      registrar: async () => {},
      gastoDaSessao: async () => 3.02,
      tetoSessaoUsd: 3,
    });

    await expect(cliente.chamar({ ...pedidoBase, etapa: 'interrogatorio' })).rejects.toMatchObject({ motivo: 'teto' });
    await expect(cliente.chamar({ ...pedidoBase, etapa: 'selecao' })).resolves.toBeDefined();
    expect(pedidos).toHaveLength(1);

    const esgotado = criarClienteLlm({
      sdk,
      registrar: async () => {},
      gastoDaSessao: async () => 3 + MARGEM_GERACAO_USD,
      tetoSessaoUsd: 3,
    });
    await expect(esgotado.chamar({ ...pedidoBase, etapa: 'critico' })).rejects.toMatchObject({ motivo: 'teto' });
  });

  it('records the Vaga a call was for', async () => {
    const { cliente, linhas } = montar([{ mensagem: mensagem() }]);
    await cliente.chamar({ ...pedidoBase, etapa: 'leitura_vaga', vagaId: 'vaga-1' });
    expect(linhas[0]).toMatchObject({ sessaoId: 'sessao-1', vagaId: 'vaga-1', etapa: 'leitura_vaga' });
  });

  it('reads the 10th Vaga of a session that spent on 9 before it, past the general cap', async () => {
    // 9 Vagas read, talked about and generated 3 times each, at about US$ 1.50 a Vaga, on top of a US$ 3 interrogation.
    const gasto = TETO_SESSAO_PADRAO_USD + 9 * 1.5;
    const { sdk, pedidos } = sdkFalso([{ mensagem: mensagem() }]);
    const cliente = criarClienteLlm({
      sdk,
      registrar: async () => {},
      gastoDaSessao: async () => gasto,
      vagasCriadas: async () => 10,
      tetoSessaoUsd: TETO_SESSAO_PADRAO_USD,
    });

    await expect(cliente.chamar({ ...pedidoBase, etapa: 'leitura_vaga', vagaId: 'vaga-10' })).resolves.toBeDefined();
    expect(pedidos).toHaveLength(1);
    // The general conversation of that session stays under the cap alone.
    await expect(cliente.chamar({ ...pedidoBase, etapa: 'interrogatorio' })).rejects.toMatchObject({ motivo: 'teto' });
  });

  it('caps the Vaga calls at the cap, the margin and the budget of every Vaga created', async () => {
    const vagas = 3;
    const cliente = criarClienteLlm({
      sdk: sdkFalso([]).sdk,
      registrar: async () => {},
      gastoDaSessao: async () => 3 + MARGEM_GERACAO_USD + vagas * ORCAMENTO_POR_VAGA_USD,
      vagasCriadas: async () => vagas,
      tetoSessaoUsd: 3,
    });
    await expect(cliente.chamar({ ...pedidoBase, etapa: 'leitura_vaga', vagaId: 'v' })).rejects.toMatchObject({ motivo: 'teto' });
  });
});

describe('tetoDoAmbiente', () => {
  it('reads a positive TETO_SESSAO_USD and falls back to the default otherwise', () => {
    expect(tetoDoAmbiente('5')).toBe(5);
    expect(tetoDoAmbiente('1.5')).toBe(1.5);
    for (const ruim of [undefined, '', '0', '-1', 'abc']) expect(tetoDoAmbiente(ruim)).toBe(TETO_SESSAO_PADRAO_USD);
  });
});
