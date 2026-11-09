// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { describe, expect, it } from 'vitest';

import { criarClienteLlm, type LinhaChamada } from './cliente';
import {
  ambienteDoCodex,
  argumentosCodex,
  criarSdkCodex,
  linhaDeComando,
  type ExecutarCodex,
  type InvocacaoCodex,
} from './codex';

const FERRAMENTA: Anthropic.Beta.BetaTool = {
  name: 'registrar_metric',
  description: 'Registra um número.',
  input_schema: { type: 'object', properties: { valor: { type: 'string' } }, required: ['valor'], additionalProperties: false },
};

const PARAMS = {
  model: 'claude-opus-5-5',
  max_tokens: 100,
  system: 'Você entrevista uma pessoa.',
  tools: [FERRAMENTA],
  output_config: { effort: 'high' },
  messages: [{ role: 'user', content: 'Eram 40 lojas.' }],
} as BetaMessageStreamParams;

/** What `codex exec --json` prints: the events, the last one with the usage. */
const eventos = (...linhas: object[]) => linhas.map((l) => JSON.stringify(l)).join('\n');
const SUCESSO = eventos(
  { type: 'thread.started', thread_id: 't1' },
  { type: 'turn.started' },
  { type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: '{}' } },
  { type: 'turn.completed', usage: { input_tokens: 21, cached_input_tokens: 3, output_tokens: 8 } },
);

function processoFalso(resposta: Awaited<ReturnType<ExecutarCodex>>) {
  const invocacoes: InvocacaoCodex[] = [];
  const executar: ExecutarCodex = async (inv) => (invocacoes.push(inv), resposta);
  return { executar, invocacoes };
}

const responder = (sdk: ReturnType<typeof criarSdkCodex>, params = PARAMS) => sdk.beta.messages.stream(params).finalMessage();

describe('o codex exec', () => {
  it('runs with no way to act: read-only, no approvals, no shell, no web, no user config, no AGENTS.md, nothing kept', () => {
    const args = argumentosCodex(PARAMS, null);
    expect(args[0]).toBe('exec');
    for (const flag of ['--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--json']) {
      expect(args).toContain(flag);
    }
    const par = (flag: string) => args[args.indexOf(flag) + 1];
    expect(par('--sandbox')).toBe('read-only');
    const configs = args.flatMap((a, i) => (args[i - 1] === '-c' ? [a] : []));
    expect(configs).toEqual(
      expect.arrayContaining([
        'approval_policy="never"',
        'web_search="disabled"',
        'project_doc_max_bytes=0',
      ]),
    );
    // Every feature that lets the model act is off, the user's hooks included (`~/.codex/hooks.json`
    // is not config.toml, so --ignore-user-config leaves it in).
    const desligadas = args.flatMap((a, i) => (args[i - 1] === '--disable' ? [a] : []));
    expect(desligadas).toEqual(
      expect.arrayContaining(['shell_tool', 'hooks', 'computer_use', 'browser_use', 'apps', 'plugins', 'multi_agent', 'image_generation', 'view_image']),
    );
    expect(args).not.toContain('--yolo');
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
  });

  it('uses the Codex default model unless one is pinned, and the stage’s effort, high at most', () => {
    expect(argumentosCodex(PARAMS, null)).not.toContain('-m');
    const fixado = argumentosCodex(PARAMS, 'um-modelo');
    expect(fixado[fixado.indexOf('-m') + 1]).toBe('um-modelo');
    expect(argumentosCodex(PARAMS, null)).toContain('model_reasoning_effort="high"');
    const max = { ...PARAMS, output_config: { effort: 'max' } } as BetaMessageStreamParams;
    expect(argumentosCodex(max, null)).toContain('model_reasoning_effort="high"');
    const low = { ...PARAMS, output_config: { effort: 'low' } } as BetaMessageStreamParams;
    expect(argumentosCodex(low, null)).toContain('model_reasoning_effort="low"');
  });

  it('puts the system prompt, the schema and the answer in files, and reads the conversation from stdin', () => {
    const linha = linhaDeComando(['exec', '--json'], { sistema: 'C:\\tmp\\x\\sistema.md', esquema: '/tmp/x/esquema.json', ultima: '/tmp/x/ultima.json' });
    expect(linha).toEqual([
      'exec',
      '--json',
      '-c',
      'model_instructions_file="C:\\\\tmp\\\\x\\\\sistema.md"',
      '--output-schema',
      '/tmp/x/esquema.json',
      '--output-last-message',
      '/tmp/x/ultima.json',
      '-',
    ]);
  });

  it('never carries an OpenAI key: with one, the Codex would bill the API', () => {
    const env = ambienteDoCodex({ PATH: '/bin', OPENAI_API_KEY: 'sk-x', CODEX_API_KEY: 'ck-x', ANTHROPIC_API_KEY: 'a' });
    expect(env).toEqual({ PATH: '/bin', ANTHROPIC_API_KEY: 'a' });
  });

  it('sends the system prompt with the tools, the transcript and the reply schema', async () => {
    const p = processoFalso({ codigo: 0, saida: SUCESSO, erros: '', ultima: JSON.stringify({ texto: 'ok', chamadas: [] }) });
    await responder(criarSdkCodex(null, p.executar));
    const [inv] = p.invocacoes;
    expect(inv.sistema).toMatch(/Você entrevista uma pessoa[\s\S]*registrar_metric/);
    expect(inv.prompt).toMatch(/<turn role="user">\nEram 40 lojas\.\n<\/turn>/);
    expect(inv.esquema).toMatchObject({ required: ['texto', 'chamadas'] });
  });

  it('turns the reply into text and tool calls, recorded at zero cost under the Codex', async () => {
    const ultima = JSON.stringify({ texto: 'Anotado.', chamadas: [{ name: 'registrar_metric', input: { valor: '40' } }] });
    const p = processoFalso({ codigo: 0, saida: SUCESSO, erros: '', ultima });
    const linhas: LinhaChamada[] = [];
    const cliente = criarClienteLlm({ sdk: criarSdkCodex(null, p.executar), registrar: async (l) => void linhas.push(l) });

    const resposta = await cliente.chamar({ etapa: 'interrogatorio', sessaoId: 's1', params: PARAMS });

    expect(resposta.content).toMatchObject([
      { type: 'text', text: 'Anotado.' },
      { type: 'tool_use', name: 'registrar_metric', input: { valor: '40' } },
    ]);
    expect(linhas[0]).toMatchObject({ modelo: 'assinatura:codex:padrao', custoUsd: 0, tokensEntrada: 21, tokensSaida: 8, erro: null });
  });

  it('names the pinned model in the record', async () => {
    const p = processoFalso({ codigo: 0, saida: SUCESSO, erros: '', ultima: JSON.stringify({ texto: 'oi', chamadas: [] }) });
    const mensagem = await responder(criarSdkCodex('um-modelo', p.executar));
    expect(mensagem.model).toBe('assinatura:codex:um-modelo');
  });

  it('fails with the Codex’s own reason when the turn fails', async () => {
    const saida = eventos({ type: 'turn.started' }, { type: 'turn.failed', error: { message: 'You are not logged in' } });
    const p = processoFalso({ codigo: 1, saida, erros: '', ultima: null });
    await expect(responder(criarSdkCodex(null, p.executar))).rejects.toThrow(/codex exec failed: You are not logged in/);
  });

  it('fails when the process dies without a word', async () => {
    const p = processoFalso({ codigo: 2, saida: '', erros: 'error: unexpected argument', ultima: null });
    await expect(responder(criarSdkCodex(null, p.executar))).rejects.toThrow(/codex exec failed: error: unexpected argument/);
  });

  it('refuses a call to a tool it was not given', async () => {
    const ultima = JSON.stringify({ texto: '', chamadas: [{ name: 'rm_rf', input: {} }] });
    const p = processoFalso({ codigo: 0, saida: SUCESSO, erros: '', ultima });
    await expect(responder(criarSdkCodex(null, p.executar))).rejects.toThrow(/codex exec called a tool it was not given/);
  });
});
