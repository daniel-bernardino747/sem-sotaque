// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { escolhaPermitida, statusDosCaminhos, type RodarComando } from './disponibilidade';

type Resposta = Awaited<ReturnType<RodarComando>>;

/** Each CLI answers as given; one not given is not installed. */
/** What `codex features list` prints with this app's `--disable`s: only features the app checked stay on. */
const featuresLimpas = (...extras: string[]): Resposta => ({
  codigo: 0,
  saida: ['sqlite                 removed   true', 'shell_tool             stable    false', ...extras].join('\n'),
  erros: '',
});

function maquina(respostas: { claude?: Resposta; codex?: Resposta; codexVersao?: Resposta; codexFeatures?: Resposta }) {
  const rodados: string[] = [];
  const rodar: RodarComando = async (bin, args) => {
    rodados.push([bin, ...args].join(' '));
    if (bin === 'codex' && args[0] === '--version') return respostas.codexVersao ?? 'nao_instalado';
    if (bin === 'codex' && args.includes('features')) return respostas.codexFeatures ?? featuresLimpas();
    return respostas[bin as 'claude' | 'codex'] ?? 'nao_instalado';
  };
  return { rodar, rodados };
}

const claudeLogado = (authMethod: string, loggedIn = true): Resposta => ({
  codigo: loggedIn ? 0 : 1,
  saida: JSON.stringify({ loggedIn, authMethod, subscriptionType: 'max' }),
  erros: '',
});

describe('statusDosCaminhos', () => {
  it('the API key is there or not, read from the environment only', async () => {
    const { rodar } = maquina({});
    expect((await statusDosCaminhos({ env: { ANTHROPIC_API_KEY: 'sk-ant' }, rodar })).api).toMatchObject({ disponivel: true });
    const sem = (await statusDosCaminhos({ env: { ANTHROPIC_API_KEY: ' ' }, rodar })).api;
    expect(sem).toMatchObject({ disponivel: false, motivo: expect.stringMatching(/ANTHROPIC_API_KEY.*\.env/) });
  });

  it('the Claude subscription needs `claude` logged in through Claude.ai', async () => {
    const st = async (r?: Resposta) => (await statusDosCaminhos({ env: {}, rodar: maquina({ claude: r }).rodar })).assinatura_claude;
    expect(await st(claudeLogado('claude.ai'))).toMatchObject({ disponivel: true });
    expect(await st()).toMatchObject({ disponivel: false, motivo: expect.stringMatching(/não está instalado.*Docker/) });
    expect(await st(claudeLogado('claude.ai', false))).toMatchObject({ disponivel: false, motivo: expect.stringMatching(/claude auth login/) });
    // Logged in with an API key, `claude -p` would bill the API.
    expect(await st(claudeLogado('apiKey'))).toMatchObject({ disponivel: false, motivo: expect.stringMatching(/chave de API/) });
  });

  it('the ChatGPT subscription is off when the Codex leaves on a feature this app has not checked', async () => {
    const logado: Resposta = { codigo: 0, saida: 'Logged in using ChatGPT', erros: '' };
    const versao: Resposta = { codigo: 0, saida: 'codex-cli 0.167.0', erros: '' };
    const { rodar, rodados } = maquina({ codex: logado, codexVersao: versao, codexFeatures: featuresLimpas('teleport_tool   stable   true') });
    const st = (await statusDosCaminhos({ env: {}, rodar, codexConferido: '0.167.0' })).assinatura_chatgpt;
    expect(st).toMatchObject({ disponivel: false, motivo: expect.stringMatching(/teleport_tool/) });
    // The list is read with the same --disable flags the calls use.
    expect(rodados.find((r) => r.includes('features list'))).toMatch(/--disable shell_tool .*--disable hooks/);
  });

  it('the ChatGPT subscription needs `codex` logged in with ChatGPT, at a version this app has checked', async () => {
    const st = async (r: Parameters<typeof maquina>[0], conferida: string | null = '0.167.0') =>
      (await statusDosCaminhos({ env: {}, rodar: maquina(r).rodar, codexConferido: conferida })).assinatura_chatgpt;
    const logado: Resposta = { codigo: 0, saida: 'Logged in using ChatGPT', erros: '' };
    const versao = (v: string): Resposta => ({ codigo: 0, saida: `codex-cli ${v}`, erros: '' });

    expect(await st({ codex: logado, codexVersao: versao('0.167.0') })).toMatchObject({ disponivel: true });
    expect(await st({ codex: logado, codexVersao: versao('0.170.2') })).toMatchObject({ disponivel: true });
    expect(await st({})).toMatchObject({ disponivel: false, motivo: expect.stringMatching(/não está instalado.*Docker/) });
    expect(await st({ codex: { codigo: 1, saida: 'Not logged in', erros: '' }, codexVersao: versao('0.167.0') })).toMatchObject({
      disponivel: false,
      motivo: expect.stringMatching(/codex login/),
    });
    expect(await st({ codex: { codigo: 0, saida: 'Logged in using an API key', erros: '' }, codexVersao: versao('0.167.0') })).toMatchObject({
      disponivel: false,
      motivo: expect.stringMatching(/chave de API/),
    });
    // M8: a version older than the one checked may not turn off what must be off.
    expect(await st({ codex: logado, codexVersao: versao('0.150.0') })).toMatchObject({ disponivel: false, motivo: expect.stringMatching(/0\.167\.0/) });
    // Until the flags are checked against an installed CLI, no version is enough.
    expect(await st({ codex: logado, codexVersao: versao('0.167.0') }, null)).toMatchObject({ disponivel: false, motivo: expect.stringMatching(/conferid/) });
  });
});

describe('o ambiente da conferência', () => {
  it('checks each CLI with the environment its calls run with: no API key for either', async () => {
    const ambientes: Record<string, Record<string, string | undefined>> = {};
    const rodar: RodarComando = async (bin, args, env) => {
      ambientes[`${bin} ${args[0]}`] = env ?? {};
      return 'nao_instalado';
    };
    const env = { PATH: '/bin', ANTHROPIC_API_KEY: 'sk-ant', ANTHROPIC_AUTH_TOKEN: 't', OPENAI_API_KEY: 'sk-o', CODEX_API_KEY: 'ck' };
    await statusDosCaminhos({ env, rodar });
    expect(ambientes['claude auth']).toEqual({ PATH: '/bin', OPENAI_API_KEY: 'sk-o', CODEX_API_KEY: 'ck' });
    expect(ambientes['codex --version']).toEqual({ PATH: '/bin', ANTHROPIC_API_KEY: 'sk-ant', ANTHROPIC_AUTH_TOKEN: 't' });
  });
});

describe('escolhaPermitida', () => {
  it('lets only an available way be saved', async () => {
    const status = await statusDosCaminhos({ env: {}, rodar: maquina({ claude: claudeLogado('claude.ai') }).rodar });
    expect(escolhaPermitida('assinatura_claude', status)).toEqual({ ok: true });
    expect(escolhaPermitida('api', status)).toMatchObject({ ok: false, motivo: expect.stringMatching(/ANTHROPIC_API_KEY/) });
    expect(escolhaPermitida('assinatura_chatgpt', status)).toMatchObject({ ok: false });
  });
});
