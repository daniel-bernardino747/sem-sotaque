// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The model through the ChatGPT plan (`codex exec`, the Codex CLI run
 * non-interactively) instead of an API: local use only (step 28, M1–M2). Like
 * the Claude subscription (`./assinatura`), it is an `SdkMinimo`, so the
 * callers, the cap, the retry and `chamadas_llm` stay the client's, and the
 * request goes the same way: a transcript (stdin), a system prompt that lists
 * the tools, and the reply forced into `{ texto, chamadas }` by
 * `--output-schema`. The app's tools are only JSON in that reply, never run.
 *
 * `codex exec` is an agent, and what the person typed is in the prompt, so it
 * runs with no way to act (M8): an empty temporary directory, `--sandbox
 * read-only`, `approval_policy="never"`, the shell, image and web tools off,
 * no user config (`--ignore-user-config`, which also leaves its MCP servers
 * out) and no rules, no project docs (`project_doc_max_bytes=0`), nothing kept
 * (`--ephemeral`), and its own instructions replaced (`model_instructions_file`).
 * `OPENAI_API_KEY` and `CODEX_API_KEY` are removed from the child's
 * environment: with them, the Codex would bill the API, not the plan.
 *
 * Flags from the Codex docs (learn.chatgpt.com/docs: non-interactive-mode,
 * developer-commands, config-reference, sandboxing), read 2026-11-09, latest
 * CLI then 0.167.0. Not yet checked against an installed CLI: until it is,
 * step 28 keeps the option behind that check (see its notes).
 *
 * Ignored, as in `./assinatura`: `cache_control`, `max_tokens`, `betas`,
 * `fallbacks`, `thinking`, and the model the app asks for (a Claude id): the
 * Codex default runs unless the configuration pins one (M7). The text arrives
 * all at once, after the call, as a single `text` event.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import { esquemaDaResposta, mensagemEstruturada, sistemaDo, transcricao } from './assinatura';
import type { SdkMinimo } from './cliente';
import { PREFIXO_ASSINATURA } from './precos';

type Params = BetaMessageStreamParams;

/** One `codex exec` run: the flags, and what goes in its files and its stdin. */
export interface InvocacaoCodex {
  args: string[];
  sistema: string;
  esquema: Record<string, unknown>;
  prompt: string;
}

/** `saida` is the `--json` events (JSONL); `ultima` the final message's file, null if none was written. */
export type ExecutarCodex = (
  invocacao: InvocacaoCodex,
) => Promise<{ codigo: number | null; saida: string; erros: string; ultima: string | null }>;

const LIMITE_MS = 10 * 60_000;

/** The levels every Codex model takes; the stages that ask for more get `high` (M7). */
const EFFORTS = new Set(['low', 'medium', 'high']);

export function argumentosCodex(params: Params, modelo: string | null): string[] {
  const pedido = (params as { output_config?: { effort?: string } }).output_config?.effort;
  const effort = pedido === undefined ? undefined : EFFORTS.has(pedido) ? pedido : 'high';
  const config = (valor: string) => ['-c', valor];
  return [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--sandbox',
    'read-only',
    ...config('approval_policy="never"'),
    ...config('features.shell_tool=false'),
    ...config('features.view_image=false'),
    ...config('web_search="disabled"'),
    ...config('project_doc_max_bytes=0'),
    ...(modelo ? ['-m', modelo] : []),
    ...(effort ? config(`model_reasoning_effort="${effort}"`) : []),
  ];
}

/** The full command line: the files, then `-` (the prompt from stdin). A TOML string is a JSON string. */
export function linhaDeComando(args: string[], arquivos: { sistema: string; esquema: string; ultima: string }): string[] {
  return [
    ...args,
    '-c',
    `model_instructions_file=${JSON.stringify(arquivos.sistema)}`,
    '--output-schema',
    arquivos.esquema,
    '--output-last-message',
    arquivos.ultima,
    '-',
  ];
}

/** The child's environment without an OpenAI key, so the plan is what pays. */
export function ambienteDoCodex<T extends Record<string, string | undefined>>(env: T): T {
  const limpo = { ...env };
  delete limpo.OPENAI_API_KEY;
  delete limpo.CODEX_API_KEY;
  return limpo;
}

/** The real `codex` binary, in an empty temporary directory so no project file is near it. */
export const executarCodex: ExecutarCodex = ({ args, sistema, esquema, prompt }) => {
  const pasta = mkdtempSync(path.join(tmpdir(), 'sem-sotaque-codex-'));
  const arquivos = {
    sistema: path.join(pasta, 'sistema.md'),
    esquema: path.join(pasta, 'esquema.json'),
    ultima: path.join(pasta, 'ultima.json'),
  };
  writeFileSync(arquivos.sistema, sistema);
  writeFileSync(arquivos.esquema, JSON.stringify(esquema));

  return new Promise((resolve, reject) => {
    const filho = spawn(process.env.CODEX_BIN ?? 'codex', linhaDeComando(args, arquivos), {
      cwd: pasta,
      env: ambienteDoCodex(process.env),
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
      reject(new Error(`codex exec did not start (${erro.message}); is the Codex CLI installed and logged in?`));
    });
    filho.on('close', (codigo) => {
      const ultima = existsSync(arquivos.ultima) ? readFileSync(arquivos.ultima, 'utf8') : null;
      limpar();
      resolve({ codigo, saida, erros, ultima });
    });
    filho.stdin.end(prompt, 'utf8');
  });
};

interface Evento {
  type?: string;
  message?: string;
  error?: { message?: string };
  usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number };
}

/** What `codex exec` left, as a message; a failed turn or a missing answer throws. */
export function mensagemDoCodex(
  { codigo, saida, erros, ultima }: Awaited<ReturnType<ExecutarCodex>>,
  params: Params,
  modelo: string | null,
): Anthropic.Beta.BetaMessage {
  const eventos = saida.split('\n').flatMap((linha): Evento[] => {
    try {
      return [JSON.parse(linha) as Evento];
    } catch {
      return [];
    }
  });
  const falha = eventos.find((e) => e.type === 'turn.failed' || e.type === 'error');
  if (falha || codigo !== 0 || ultima === null) {
    const motivo = falha?.error?.message ?? falha?.message ?? (erros.trim() || `exit code ${codigo}`);
    throw new Error(`codex exec failed: ${motivo.trim().slice(0, 500)}`);
  }
  let resposta: unknown;
  try {
    resposta = JSON.parse(ultima);
  } catch {
    throw new Error('codex exec answered without the structured output');
  }
  const uso = eventos.filter((e) => e.type === 'turn.completed').at(-1)?.usage ?? {};
  return mensagemEstruturada(resposta, params, {
    quem: 'codex exec',
    modelo: `${PREFIXO_ASSINATURA}codex:${modelo ?? 'padrao'}`,
    uso: { input_tokens: uso.input_tokens, output_tokens: uso.output_tokens, cache_read_input_tokens: uso.cached_input_tokens },
  });
}

/** An `SdkMinimo` that runs `codex exec`; `modelo` null is the Codex default, `executar` is injected in tests. */
export function criarSdkCodex(modelo: string | null, executar: ExecutarCodex = executarCodex): SdkMinimo {
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
              const invocacao = {
                args: argumentosCodex(params, modelo),
                sistema: sistemaDo(params),
                esquema: esquemaDaResposta(params),
                prompt: transcricao(params.messages),
              };
              const mensagem = mensagemDoCodex(await executar(invocacao), params, modelo);
              for (const b of mensagem.content) if (b.type === 'text') ouvintes.forEach((o) => o(b.text));
              return mensagem;
            },
          };
        },
      },
    },
  };
}
