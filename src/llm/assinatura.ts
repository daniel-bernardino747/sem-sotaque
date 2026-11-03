// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The model through Daniel's Claude subscription (`claude -p`, Claude Code run
 * non-interactively) instead of the API: local use only (step 12). It is an
 * `SdkMinimo`, so the callers, the cap, the retry and `chamadas_llm` stay the
 * client's.
 *
 * `claude -p` has no native tool use for the app's tools, so the request is
 * turned into a transcript (stdin) plus a system prompt that lists the tools,
 * and the reply is forced into a JSON Schema `{ texto, chamadas }` whose
 * `input` is each tool's own schema. The reply comes back as a synthetic
 * message: one `text` block and one `tool_use` per call.
 *
 * Ignored: `cache_control`, `max_tokens`, `betas`, `fallbacks`, `thinking`.
 * `output_config.effort` becomes `--effort`. The text arrives all at once,
 * after the call, as a single `text` event.
 *
 * Flags (checked against the CLI 2.1.308 and its docs, 2026-10-22):
 * `--safe-mode` keeps CLAUDE.md, hooks, skills, plugins and MCP out and still
 * reads the subscription login (`--bare` would not: it only takes
 * `ANTHROPIC_API_KEY`); `--tools ""` turns off the built-in tools;
 * `--system-prompt-file` replaces Claude Code's prompt. `ANTHROPIC_API_KEY` is
 * removed from the child's environment: with it set, `-p` bills the API.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import type { SdkMinimo } from './cliente';
import { MODELO_PADRAO, PREFIXO_ASSINATURA } from './precos';

/** One `claude -p` run: the flags, the system prompt (written to a file) and the transcript (stdin). */
export interface Invocacao {
  args: string[];
  sistema: string;
  prompt: string;
}

export type Executar = (invocacao: Invocacao) => Promise<{ codigo: number | null; saida: string; erros: string }>;

const LIMITE_MS = 10 * 60_000;

/** The real `claude` binary, in an empty temporary directory so no project file is near it. */
export const executarClaude: Executar = ({ args, sistema, prompt }) => {
  const pasta = mkdtempSync(path.join(tmpdir(), 'sem-sotaque-assinatura-'));
  const arquivo = path.join(pasta, 'sistema.md');
  writeFileSync(arquivo, sistema);
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;

  return new Promise((resolve, reject) => {
    const filho = spawn(process.env.CLAUDE_BIN ?? 'claude', [...args, '--system-prompt-file', arquivo], {
      cwd: pasta,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let saida = '';
    let erros = '';
    const limite = setTimeout(() => filho.kill(), LIMITE_MS);
    const limpar = () => {
      clearTimeout(limite);
      rmSync(pasta, { recursive: true, force: true });
    };
    filho.stdout.setEncoding('utf8').on('data', (d: string) => (saida += d));
    filho.stderr.setEncoding('utf8').on('data', (d: string) => (erros += d));
    filho.on('error', (erro) => {
      limpar();
      reject(new Error(`claude -p did not start (${erro.message}); is Claude Code installed and logged in?`));
    });
    filho.on('close', (codigo) => {
      limpar();
      resolve({ codigo, saida, erros });
    });
    filho.stdin.end(prompt, 'utf8');
  });
};

type Params = BetaMessageStreamParams;
type Bloco = Exclude<Anthropic.Beta.BetaMessageParam['content'], string>[number];

function textoDoResultado(conteudo: Anthropic.Beta.BetaToolResultBlockParam['content']): string {
  if (conteudo === undefined) return '';
  if (typeof conteudo === 'string') return conteudo;
  return conteudo
    .map((b) => {
      if (b.type === 'text') return b.text;
      throw new Error(`the subscription backend cannot send a ${b.type} block in a tool result`);
    })
    .join('\n');
}

function bloco(b: Bloco): string {
  switch (b.type) {
    case 'text':
      return b.text;
    case 'tool_use':
      return `<tool_call id="${b.id}" name="${b.name}">${JSON.stringify(b.input)}</tool_call>`;
    case 'tool_result':
      return `<tool_result for="${b.tool_use_id}"${b.is_error ? ' error="true"' : ''}>\n${textoDoResultado(b.content)}\n</tool_result>`;
    case 'thinking':
    case 'redacted_thinking':
      return '';
    default:
      throw new Error(`the subscription backend cannot send a ${b.type} block`);
  }
}

/** The conversation as a transcript that keeps who said what. */
export function transcricao(messages: Params['messages']): string {
  const turnos = messages.map((m) => {
    const corpo = typeof m.content === 'string' ? m.content : m.content.map(bloco).filter(Boolean).join('\n\n');
    return `<turn role="${m.role}">\n${corpo}\n</turn>`;
  });
  return `${turnos.join('\n\n')}\n\nWrite the next assistant turn.`;
}

type Ferramenta = Anthropic.Beta.BetaTool;

function ferramentasDo(params: Params): Ferramenta[] {
  const todas = (params.tools ?? []).filter((t): t is Ferramenta => 'input_schema' in t && 'name' in t);
  if (todas.length !== (params.tools ?? []).length) {
    throw new Error('the subscription backend only takes custom tools (name and input_schema)');
  }
  const escolha = params.tool_choice;
  if (escolha?.type === 'none') return [];
  if (escolha?.type === 'tool') return todas.filter((t) => t.name === escolha.name);
  return todas;
}

/** The JSON Schema the reply must match: the text, and calls whose input is each tool's own schema. */
export function esquemaDaResposta(params: Params): Record<string, unknown> {
  const ferramentas = ferramentasDo(params);
  const texto = { type: 'string', description: 'What you write to the person in this turn; "" if nothing.' };
  if (ferramentas.length === 0) {
    return { type: 'object', properties: { texto }, required: ['texto'], additionalProperties: false };
  }
  const obrigatoria = params.tool_choice?.type === 'any' || params.tool_choice?.type === 'tool';
  return {
    type: 'object',
    properties: {
      texto,
      chamadas: {
        type: 'array',
        ...(obrigatoria ? { minItems: 1 } : {}),
        items: {
          anyOf: ferramentas.map((t) => ({
            type: 'object',
            properties: { name: { const: t.name }, input: t.input_schema },
            required: ['name', 'input'],
            additionalProperties: false,
          })),
        },
      },
    },
    required: ['texto', 'chamadas'],
    additionalProperties: false,
  };
}

/** The caller's system prompt, then how to answer without native tool use. */
export function sistemaDo(params: Params): string {
  const proprio = typeof params.system === 'string' ? params.system : (params.system ?? []).map((b) => b.text).join('\n\n');
  const ferramentas = ferramentasDo(params);
  if (ferramentas.length === 0) {
    return `${proprio}\n\n# How to answer here\n\nThe conversation arrives as <turn> blocks. Put your next turn's text in "texto".`;
  }
  const lista = ferramentas
    .map((t) => `## ${t.name}\n\n${t.description ?? ''}\n\nInput schema: ${JSON.stringify(t.input_schema)}`)
    .join('\n\n');
  const escolha = params.tool_choice;
  const obrigacao =
    escolha?.type === 'tool'
      ? `\n\nIn this turn you must call ${escolha.name}.`
      : escolha?.type === 'any'
        ? '\n\nIn this turn you must call at least one tool.'
        : '';
  return `${proprio}

# How to answer here

The conversation arrives as <turn> blocks. Your earlier tool calls appear as <tool_call>, and what they returned as <tool_result> in the next user turn. Answer with your next turn only:

- "texto": what you write to the person in this turn ("" if nothing);
- "chamadas": the tools you call in this turn, in order, each with its "name" and an "input" that matches its schema ([] if none).

A call here is a real tool call: its result comes back in the next user turn, as it would natively.${obrigacao}

# Tools

${lista}`;
}

const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

export function argumentos(params: Params): string[] {
  const effort = (params as { output_config?: { effort?: string } }).output_config?.effort;
  return [
    '-p',
    '--safe-mode',
    '--tools',
    '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--output-format',
    'json',
    '--model',
    params.model ?? MODELO_PADRAO,
    ...(effort && EFFORTS.has(effort) ? ['--effort', effort] : []),
    '--json-schema',
    JSON.stringify(esquemaDaResposta(params)),
  ];
}

interface SaidaJson {
  is_error?: boolean;
  result?: string;
  api_error_status?: number | null;
  structured_output?: { texto?: unknown; chamadas?: unknown };
  usage?: Partial<Anthropic.Beta.BetaUsage>;
}

/** What `claude -p --output-format json` printed, as a message; anything else throws. */
export function mensagemDaSaida(
  { codigo, saida, erros }: Awaited<ReturnType<Executar>>,
  params: Params,
): Anthropic.Beta.BetaMessage {
  let json: SaidaJson;
  try {
    json = JSON.parse(saida) as SaidaJson;
  } catch {
    const motivo = (erros || saida).trim().slice(0, 500) || `exit code ${codigo}`;
    throw new Error(`claude -p failed: ${motivo}`);
  }
  if (json.is_error || codigo !== 0) {
    const status = json.api_error_status ? ` (${json.api_error_status})` : '';
    throw new Error(`claude -p failed${status}: ${(json.result ?? erros).trim().slice(0, 500)}`);
  }
  const resposta = json.structured_output;
  if (!resposta || typeof resposta.texto !== 'string') {
    throw new Error('claude -p answered without the structured output');
  }
  const nomes = new Set(ferramentasDo(params).map((t) => t.name));
  const chamadas = resposta.chamadas ?? [];
  if (!Array.isArray(chamadas)) throw new Error('claude -p answered with "chamadas" not a list');
  const usos = chamadas.map((c: unknown): Anthropic.Beta.BetaToolUseBlock => {
    const { name, input } = (c ?? {}) as { name?: unknown; input?: unknown };
    if (typeof name !== 'string' || !nomes.has(name) || !input || typeof input !== 'object') {
      throw new Error(`claude -p called a tool it was not given, or without input: ${JSON.stringify(c).slice(0, 200)}`);
    }
    return { type: 'tool_use', id: `toolu_assinatura_${randomUUID().replaceAll('-', '')}`, name, input };
  });

  const texto = resposta.texto.trim();
  const uso = json.usage ?? {};
  return {
    id: `msg_assinatura_${randomUUID().replaceAll('-', '')}`,
    type: 'message',
    role: 'assistant',
    model: `${PREFIXO_ASSINATURA}${params.model ?? MODELO_PADRAO}`,
    content: [...(texto ? [{ type: 'text' as const, text: texto, citations: null }] : []), ...usos],
    stop_reason: usos.length ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: uso.input_tokens ?? 0,
      output_tokens: uso.output_tokens ?? 0,
      cache_read_input_tokens: uso.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: uso.cache_creation_input_tokens ?? 0,
      cache_creation: null,
      server_tool_use: null,
      service_tier: 'standard',
      iterations: null,
    },
  } as Anthropic.Beta.BetaMessage;
}

/** An `SdkMinimo` that runs `claude -p`; `executar` is injected in tests. */
export function criarSdkAssinatura(executar: Executar = executarClaude): SdkMinimo {
  return {
    beta: {
      messages: {
        stream(params) {
          const ouvintes: ((delta: string) => void)[] = [];
          return {
            on(_evento: 'text', ouvinte: (delta: string) => void) {
              ouvintes.push(ouvinte);
              return this;
            },
            async finalMessage() {
              const invocacao = { args: argumentos(params), sistema: sistemaDo(params), prompt: transcricao(params.messages) };
              const mensagem = mensagemDaSaida(await executar(invocacao), params);
              for (const b of mensagem.content) if (b.type === 'text') ouvintes.forEach((o) => o(b.text));
              return mensagem;
            },
          };
        },
      },
    },
  };
}
