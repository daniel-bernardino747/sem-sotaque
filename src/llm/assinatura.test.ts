// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { describe, expect, it } from 'vitest';

import { criarSdkAssinatura, esquemaDaResposta, type Executar, type Invocacao } from './assinatura';
import { criarClienteLlm, type LinhaChamada, sdkDoAmbiente } from './cliente';

const FERRAMENTA: Anthropic.Beta.BetaTool = {
  name: 'registrar_metric',
  description: 'Registra um número.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: { valor: { type: 'string' } },
    required: ['valor'],
    additionalProperties: false,
  },
};

/** What `claude -p --output-format json` prints on success. */
function saidaJson(structured: unknown, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: JSON.stringify(structured),
    structured_output: structured,
    usage: { input_tokens: 12, output_tokens: 34, cache_read_input_tokens: 5, cache_creation_input_tokens: 6 },
    total_cost_usd: 0.01,
    ...extra,
  });
}

function processoFalso(resposta: Awaited<ReturnType<Executar>>) {
  const invocacoes: Invocacao[] = [];
  const executar: Executar = async (inv) => {
    invocacoes.push(inv);
    return resposta;
  };
  return { sdk: criarSdkAssinatura(executar), invocacoes };
}

const conversa: BetaMessageStreamParams['messages'] = [
  { role: 'user', content: 'Quantas lojas usavam o checkout?' },
  {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Anotado.' },
      { type: 'tool_use', id: 'toolu_1', name: 'registrar_metric', input: { valor: '40' } },
    ],
  },
  {
    role: 'user',
    content: [
      { type: 'tool_result', tool_use_id: 'toolu_1', is_error: true, content: 'o número não foi dito' },
      { type: 'text', text: '[sistema] Corrija.' },
    ],
  },
];

const params = (extra: Partial<BetaMessageStreamParams> = {}): BetaMessageStreamParams => ({
  model: 'claude-opus-5-5',
  max_tokens: 1000,
  system: [{ type: 'text', text: 'Você é o questionador.', cache_control: { type: 'ephemeral' } }],
  tools: [FERRAMENTA],
  messages: conversa,
  ...extra,
});

describe('criarSdkAssinatura', () => {
  it('turns the messages, tool calls and tool results into a transcript that keeps the roles', async () => {
    const { sdk, invocacoes } = processoFalso({ codigo: 0, saida: saidaJson({ texto: 'oi', chamadas: [] }), erros: '' });

    await sdk.beta.messages.stream(params({ output_config: { effort: 'medium' } } as Partial<BetaMessageStreamParams>)).finalMessage();

    const { prompt, sistema, args } = invocacoes[0];
    expect(prompt).toContain('<turn role="user">\nQuantas lojas usavam o checkout?\n</turn>');
    expect(prompt).toMatch(/<turn role="assistant">\nAnotado\.\n\n<tool_call id="toolu_1" name="registrar_metric">\{"valor":"40"\}<\/tool_call>/);
    expect(prompt).toContain('<tool_result for="toolu_1" error="true">\no número não foi dito\n</tool_result>');
    expect(prompt).toContain('[sistema] Corrija.');
    expect(prompt.indexOf('Quantas')).toBeLessThan(prompt.indexOf('<tool_call'));
    expect(sistema).toMatch(/^Você é o questionador\./);
    expect(sistema).toContain('## registrar_metric');
    expect(args).toEqual(expect.arrayContaining(['-p', '--safe-mode', '--tools', '', '--model', 'claude-opus-5-5', '--effort', 'medium']));
    expect(args).not.toContain('--bare');
    const esquema = JSON.parse(args[args.indexOf('--json-schema') + 1]);
    expect(esquema.properties.chamadas.items.anyOf[0].properties.input).toEqual(FERRAMENTA.input_schema);
  });

  it('turns the JSON output into a text block and tool_use blocks', async () => {
    const { sdk } = processoFalso({
      codigo: 0,
      saida: saidaJson({ texto: 'E quantos pedidos por dia?', chamadas: [{ name: 'registrar_metric', input: { valor: '40' } }] }),
      erros: '',
    });
    const textos: string[] = [];

    const fluxo = sdk.beta.messages.stream(params());
    fluxo.on('text', (d) => textos.push(d));
    const mensagem = await fluxo.finalMessage();

    expect(mensagem.stop_reason).toBe('tool_use');
    expect(mensagem.model).toBe('assinatura:claude-opus-5-5');
    expect(mensagem.content[0]).toMatchObject({ type: 'text', text: 'E quantos pedidos por dia?' });
    expect(mensagem.content[1]).toMatchObject({ type: 'tool_use', name: 'registrar_metric', input: { valor: '40' } });
    expect((mensagem.content[1] as Anthropic.Beta.BetaToolUseBlock).id).toMatch(/^toolu_/);
    expect(mensagem.usage).toMatchObject({ input_tokens: 12, output_tokens: 34, cache_read_input_tokens: 5 });
    expect(textos).toEqual(['E quantos pedidos por dia?']);
  });

  it('ends the turn when no tool is called', async () => {
    const { sdk } = processoFalso({ codigo: 0, saida: saidaJson({ texto: 'Pronto.', chamadas: [] }), erros: '' });
    const mensagem = await sdk.beta.messages.stream(params()).finalMessage();
    expect(mensagem.stop_reason).toBe('end_turn');
    expect(mensagem.content).toHaveLength(1);
  });

  it('forces the tool the request names', () => {
    const esquema = esquemaDaResposta(
      params({ tools: [FERRAMENTA, { ...FERRAMENTA, name: 'outra' }], tool_choice: { type: 'tool', name: 'outra' } }),
    ) as { properties: { chamadas: { minItems: number; items: { anyOf: { properties: { name: unknown } }[] } } } };
    expect(esquema.properties.chamadas.minItems).toBe(1);
    expect(esquema.properties.chamadas.items.anyOf.map((v) => v.properties.name)).toEqual([{ const: 'outra' }]);
  });

  it('asks only for text when there are no tools (the persona)', async () => {
    const { sdk, invocacoes } = processoFalso({ codigo: 0, saida: saidaJson({ texto: 'Umas 40 lojas.' }), erros: '' });
    const mensagem = await sdk.beta.messages.stream(params({ tools: undefined, system: 'Você é a persona.' })).finalMessage();
    expect(mensagem.content).toEqual([{ type: 'text', text: 'Umas 40 lojas.', citations: null }]);
    const esquema = JSON.parse(invocacoes[0].args[invocacoes[0].args.indexOf('--json-schema') + 1]);
    expect(Object.keys(esquema.properties)).toEqual(['texto']);
  });

  it.each([
    ['output that is not JSON', { codigo: 1, saida: '', erros: 'Error: something broke' }, /claude -p failed: Error: something broke/],
    ['an error result (the subscription limit)', { codigo: 1, saida: JSON.stringify({ is_error: true, api_error_status: 429, result: 'usage limit reached' }), erros: '' }, /\(429\): usage limit reached/],
    ['a result without the structured output', { codigo: 0, saida: JSON.stringify({ is_error: false, result: 'oi' }), erros: '' }, /without the structured output/],
    ['a call to a tool it was not given', { codigo: 0, saida: saidaJson({ texto: '', chamadas: [{ name: 'apagar_tudo', input: {} }] }), erros: '' }, /not given/],
  ])('turns %s into an error', async (_, resposta, erro) => {
    const { sdk } = processoFalso(resposta);
    await expect(sdk.beta.messages.stream(params()).finalMessage()).rejects.toThrow(erro);
  });

  it('refuses a block it cannot send', async () => {
    const { sdk } = processoFalso({ codigo: 0, saida: saidaJson({ texto: '', chamadas: [] }), erros: '' });
    const comPdf = params({
      messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' } }] }],
    });
    await expect(sdk.beta.messages.stream(comPdf).finalMessage()).rejects.toThrow(/cannot send a document block/);
  });

  it('is recorded by the client at zero cost, with the model marked', async () => {
    const { sdk } = processoFalso({ codigo: 0, saida: saidaJson({ texto: 'oi', chamadas: [] }), erros: '' });
    const linhas: LinhaChamada[] = [];
    const cliente = criarClienteLlm({ sdk, registrar: async (l) => linhas.push(l) });

    await cliente.chamar({ etapa: 'interrogatorio', sessaoId: 's1', params: { max_tokens: 100, messages: [{ role: 'user', content: 'oi' }] } });

    expect(linhas[0]).toMatchObject({ modelo: 'assinatura:claude-opus-5-5', custoUsd: 0, tokensEntrada: 12, erro: null });
  });
});

describe('sdkDoAmbiente', () => {
  it('uses the API unless LLM_BACKEND=assinatura, in any mode', () => {
    expect(sdkDoAmbiente({ ANTHROPIC_API_KEY: 'x' })).toBeDefined();
    expect(sdkDoAmbiente({ MODO: 'local', NODE_ENV: 'production', ANTHROPIC_API_KEY: 'x' })).toBeDefined();
  });

  it('accepts the subscription in MODO=local, even under NODE_ENV=production', () => {
    expect(sdkDoAmbiente({ MODO: 'local', LLM_BACKEND: 'assinatura', NODE_ENV: 'production' })).toBeDefined();
    expect(sdkDoAmbiente({ MODO: 'local', LLM_BACKEND: 'assinatura', NODE_ENV: 'development' })).toBeDefined();
  });

  it.each([
    ['unset MODO, in development', { NODE_ENV: 'development' }],
    ['MODO=hospedado, in development', { MODO: 'hospedado', NODE_ENV: 'development' }],
    ['MODO=hospedado, in production', { MODO: 'hospedado', NODE_ENV: 'production' }],
  ])('refuses the subscription when hosted (%s)', (_, env) => {
    expect(() => sdkDoAmbiente({ LLM_BACKEND: 'assinatura', ...env })).toThrow(/MODO=local/);
  });
});
