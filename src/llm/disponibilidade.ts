// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Whether each way to the model can be used on this machine (step 28, M5–M6
 * and M8), checked when the configuration screen opens and again when it
 * saves:
 * - the API key: `ANTHROPIC_API_KEY` in the environment (`.env`), never shown;
 * - the Claude subscription: `claude auth status` logged in through Claude.ai
 *   (logged in with an API key, `claude -p` would bill the API);
 * - the ChatGPT subscription: `codex login status` logged in with ChatGPT, at a
 *   version not older than the one whose flags this app checked
 *   (`CODEX_CONFERIDO`), so nothing that must be off is silently on.
 * In the Docker image neither CLI exists, so both say "não instalado".
 */
import { spawn } from 'node:child_process';

import type { CaminhoModelo } from '@/db/schema';

import { ambienteDoClaude } from './assinatura';
import { ambienteDoCodex, DESLIGAR_FEATURES, FEATURES_CONFERIDAS } from './codex';

export type Estado = { disponivel: true; detalhe: string } | { disponivel: false; motivo: string };
export type StatusDosCaminhos = Record<CaminhoModelo, Estado>;

type Ambiente = Record<string, string | undefined>;

/** `env` is the environment the CLI runs with: the same its calls get, so the check sees what they will. */
export type RodarComando = (bin: string, args: string[], env?: Ambiente) => Promise<{ codigo: number | null; saida: string; erros: string } | 'nao_instalado'>;

/**
 * The Codex CLI version whose flags were checked against the installed CLI
 * (`./codex`). Null until that check is done: the option stays unavailable.
 */
export const CODEX_CONFERIDO: string | null = null;

const NO_DOCKER = 'No Docker, só a chave da API.';

/** A CLI, with a short time limit; a missing binary is "não instalado". */
export const rodarComando: RodarComando = (bin, args, env) =>
  new Promise((resolve) => {
    const filho = spawn(bin, args, { env: env as NodeJS.ProcessEnv | undefined, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 15_000 });
    let saida = '';
    let erros = '';
    filho.stdout.setEncoding('utf8').on('data', (d: string) => (saida += d));
    filho.stderr.setEncoding('utf8').on('data', (d: string) => (erros += d));
    filho.on('error', (erro: NodeJS.ErrnoException) =>
      resolve(erro.code === 'ENOENT' ? 'nao_instalado' : { codigo: null, saida, erros: erro.message }),
    );
    filho.on('close', (codigo) => resolve({ codigo, saida, erros }));
  });

function estadoDaChave(env: Record<string, string | undefined>): Estado {
  return env.ANTHROPIC_API_KEY?.trim()
    ? { disponivel: true, detalhe: 'Chave encontrada no .env.' }
    : { disponivel: false, motivo: 'Não há ANTHROPIC_API_KEY no .env.' };
}

async function estadoDoClaude(rodar: RodarComando, env: Ambiente): Promise<Estado> {
  // Without the API key, as `claude -p` runs: with it, the CLI reports the key, not the login.
  const r = await rodar('claude', ['auth', 'status', '--json'], ambienteDoClaude(env));
  if (r === 'nao_instalado') return { disponivel: false, motivo: `O claude não está instalado nesta máquina. ${NO_DOCKER}` };
  let status: { loggedIn?: boolean; authMethod?: string; subscriptionType?: string } = {};
  try {
    status = JSON.parse(r.saida);
  } catch {
    // Not JSON: an old CLI, or an error. Read as not logged in.
  }
  if (!status.loggedIn) return { disponivel: false, motivo: 'O claude está instalado, mas sem login: rode claude auth login.' };
  if (status.authMethod !== 'claude.ai') {
    return { disponivel: false, motivo: 'O claude está logado por chave de API, que cobra a API: entre com a conta do Claude.ai (claude auth login).' };
  }
  const plano = status.subscriptionType ? ` (plano ${status.subscriptionType})` : '';
  return { disponivel: true, detalhe: `Logado no Claude.ai${plano}.` };
}

/** `0.167.0` → [0, 167, 0]; anything else → null. */
const versaoDe = (texto: string) => texto.match(/(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number) ?? null;
const naoMenor = (a: number[], b: number[]) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};

async function estadoDoCodex(rodar: RodarComando, env: Ambiente, conferido: string | null): Promise<Estado> {
  const semChave = ambienteDoCodex(env);
  const versao = await rodar('codex', ['--version'], semChave);
  if (versao === 'nao_instalado') return { disponivel: false, motivo: `O codex não está instalado nesta máquina. ${NO_DOCKER}` };
  const r = await rodar('codex', ['login', 'status'], semChave);
  if (r === 'nao_instalado') return { disponivel: false, motivo: `O codex não está instalado nesta máquina. ${NO_DOCKER}` };
  const texto = `${r.saida}\n${r.erros}`;
  if (r.codigo !== 0 || /not logged in/i.test(texto)) return { disponivel: false, motivo: 'O codex está instalado, mas sem login: rode codex login.' };
  if (/api key/i.test(texto)) {
    return { disponivel: false, motivo: 'O codex está logado por chave de API, que cobra a API: rode codex login com a conta do ChatGPT.' };
  }
  if (!/chatgpt/i.test(texto)) return { disponivel: false, motivo: 'Não consegui ver se o codex está logado com o ChatGPT (codex login status).' };
  if (!conferido) {
    return { disponivel: false, motivo: 'As proteções do codex ainda não foram conferidas com o CLI instalado (passo 28): por enquanto, fica desligado.' };
  }
  const instalada = versaoDe(versao.saida);
  if (!instalada || !naoMenor(instalada, versaoDe(conferido)!)) {
    return { disponivel: false, motivo: `Esta versão do codex é anterior à ${conferido}, a conferida: atualize o codex.` };
  }
  // M8: what stays on with the calls' own --disable flags must all be plumbing this app checked.
  const features = await rodar('codex', [...DESLIGAR_FEATURES, 'features', 'list'], semChave);
  if (features === 'nao_instalado' || features.codigo !== 0) {
    return { disponivel: false, motivo: 'Não consegui ler os recursos do codex (codex features list).' };
  }
  const ligadas = features.saida
    .split('\n')
    .map((linha) => linha.trim().split(/\s+/))
    .filter((partes) => partes.length >= 3 && partes.at(-1) === 'true')
    .map((partes) => partes[0]);
  const naoConferidas = ligadas.filter((f) => !FEATURES_CONFERIDAS.has(f));
  if (naoConferidas.length) {
    return {
      disponivel: false,
      motivo: `O codex deixa ligado o que eu não conferi (${naoConferidas.join(', ')}): por enquanto, fica desligado.`,
    };
  }
  return { disponivel: true, detalhe: 'Logado com o ChatGPT.' };
}

export async function statusDosCaminhos(
  deps: { env?: Record<string, string | undefined>; rodar?: RodarComando; codexConferido?: string | null } = {},
): Promise<StatusDosCaminhos> {
  const env = deps.env ?? process.env;
  const rodar = deps.rodar ?? rodarComando;
  const conferido = deps.codexConferido === undefined ? CODEX_CONFERIDO : deps.codexConferido;
  const [claude, codex] = await Promise.all([estadoDoClaude(rodar, env), estadoDoCodex(rodar, env, conferido)]);
  return { api: estadoDaChave(env), assinatura_claude: claude, assinatura_chatgpt: codex };
}

/** Saving refuses a way that is not available now, with its reason. */
export function escolhaPermitida(caminho: CaminhoModelo, status: StatusDosCaminhos): { ok: true } | { ok: false; motivo: string } {
  const estado = status[caminho];
  return estado.disponivel ? { ok: true } : { ok: false, motivo: estado.motivo };
}
