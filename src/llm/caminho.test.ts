// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { caminhoDoErro, ErroDoCaminho, sdkPorConfiguracao, type Configuracao, type Fabricas } from './caminho';
import type { SdkMinimo } from './cliente';

type Params = Parameters<SdkMinimo['beta']['messages']['stream']>[0];
const PARAMS = { max_tokens: 10, messages: [{ role: 'user', content: 'oi' }] } as Params;

/** An SDK that answers `texto`, or fails with `falha`, and counts its calls. */
function sdkFalso(texto: string, falha?: string) {
  const chamadas: Params[] = [];
  const sdk: SdkMinimo = {
    beta: {
      messages: {
        stream(params) {
          chamadas.push(params);
          const ouvintes: ((d: string) => void)[] = [];
          return {
            on(_e: 'text', o: (d: string) => void) {
              ouvintes.push(o);
              return this;
            },
            async finalMessage() {
              if (falha) throw new Error(falha);
              ouvintes.forEach((o) => o(texto));
              return { content: [{ type: 'text', text: texto }] } as never;
            },
          };
        },
      },
    },
  };
  return { sdk, chamadas };
}

function caminhos() {
  const api = sdkFalso('pela api');
  const claude = sdkFalso('pelo claude');
  const codex = sdkFalso('pelo codex');
  const modelosDoCodex: (string | null)[] = [];
  const fabricas: Fabricas = {
    api: () => api.sdk,
    claude: () => claude.sdk,
    codex: (modelo) => (modelosDoCodex.push(modelo), codex.sdk),
  };
  return { api, claude, codex, modelosDoCodex, fabricas };
}

async function responder(sdk: SdkMinimo): Promise<{ texto: string; ouvido: string }> {
  let ouvido = '';
  const stream = sdk.beta.messages.stream(PARAMS);
  stream.on('text', (d) => (ouvido += d));
  const mensagem = await stream.finalMessage();
  return { texto: (mensagem.content[0] as { text: string }).text, ouvido };
}

describe('sdkPorConfiguracao', () => {
  it('in MODO=local, each call goes the way the saved choice says at that moment', async () => {
    const c = caminhos();
    let escolha: Configuracao = { caminho: 'api', modeloCodex: null };
    const sdk = sdkPorConfiguracao({ ler: async () => escolha, fabricas: c.fabricas, env: { MODO: 'local' } });

    expect(await responder(sdk)).toEqual({ texto: 'pela api', ouvido: 'pela api' });
    escolha = { caminho: 'assinatura_claude', modeloCodex: null };
    expect(await responder(sdk)).toEqual({ texto: 'pelo claude', ouvido: 'pelo claude' });
    escolha = { caminho: 'assinatura_chatgpt', modeloCodex: 'um-modelo' };
    expect(await responder(sdk)).toEqual({ texto: 'pelo codex', ouvido: 'pelo codex' });
    expect(c.modelosDoCodex).toEqual(['um-modelo']);
  });

  it.each([
    ['unset MODO', {}],
    ['MODO=hospedado', { MODO: 'hospedado' }],
    ['MODO=hospedado in production', { MODO: 'hospedado', NODE_ENV: 'production' }],
  ])('hosted (%s), it is always the API and the choice is never read', async (_, env) => {
    const c = caminhos();
    let lida = false;
    const ler = async (): Promise<Configuracao> => ((lida = true), { caminho: 'assinatura_claude', modeloCodex: null });
    const sdk = sdkPorConfiguracao({ ler, fabricas: c.fabricas, env });

    expect((await responder(sdk)).texto).toBe('pela api');
    expect(lida).toBe(false);
    expect(c.claude.chamadas).toHaveLength(0);
  });

  it('a subscription that fails says which way failed, and nothing goes through the API', async () => {
    const c = caminhos();
    c.fabricas.codex = () => sdkFalso('', 'not logged in').sdk;
    const sdk = sdkPorConfiguracao({
      ler: async () => ({ caminho: 'assinatura_chatgpt', modeloCodex: null }),
      fabricas: c.fabricas,
      env: { MODO: 'local' },
    });

    const erro = await responder(sdk).then(
      () => null,
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(ErroDoCaminho);
    expect((erro as ErroDoCaminho).caminho).toBe('assinatura_chatgpt');
    expect((erro as Error).message).toMatch(/assinatura do ChatGPT.*not logged in/);
    expect(c.api.chamadas).toHaveLength(0);
    // The screens read the way back from the message the client keeps.
    expect(caminhoDoErro((erro as Error).message)).toBe('assinatura_chatgpt');
    expect(caminhoDoErro('rate limited')).toBeNull();
  });
});
