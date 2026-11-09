// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Which way each call reaches the model (step 28, M3–M6). In `MODO=local` the
 * choice saved on the configuration screen is read at every call, so a change
 * applies from the next one with no restart, and a call already running ends
 * the way it began. Hosted, it is always the Anthropic API and the choice is
 * never read: a personal subscription cannot serve an app for other people.
 *
 * A subscription that fails never falls back to the API (that would spend
 * money nobody asked to spend): the call fails with `ErroDoCaminho`, which
 * names the way.
 */
import type { CaminhoModelo } from '@/db/schema';
import { modo } from '@/modo';

import type { SdkMinimo } from './cliente';

export interface Configuracao {
  caminho: CaminhoModelo;
  /** The Codex model to pin (`-m`); null is the Codex's own default. */
  modeloCodex: string | null;
}

/** How each way's SDK is made; the tests inject fakes. */
export interface Fabricas {
  api(): SdkMinimo;
  claude(): SdkMinimo;
  codex(modelo: string | null): SdkMinimo;
}

/** What the person reads for each way, in the errors and on the screen. */
export const NOME_DO_CAMINHO: Record<CaminhoModelo, string> = {
  api: 'chave da API da Anthropic',
  assinatura_claude: 'assinatura do Claude',
  assinatura_chatgpt: 'assinatura do ChatGPT',
};

/** A call through a subscription failed: `caminho` says which, and the API was not called. */
export class ErroDoCaminho extends Error {
  constructor(
    readonly caminho: CaminhoModelo,
    causa: unknown,
  ) {
    super(`pela ${NOME_DO_CAMINHO[caminho]}: ${causa instanceof Error ? causa.message : String(causa)}`, { cause: causa });
    this.name = 'ErroDoCaminho';
  }
}

/** Which subscription an error message failed through (`ErroDoCaminho`'s, as `ErroLlm` keeps it), or null. */
export function caminhoDoErro(mensagem: string): CaminhoModelo | null {
  for (const caminho of ['assinatura_claude', 'assinatura_chatgpt'] as const) {
    if (mensagem.startsWith(`pela ${NOME_DO_CAMINHO[caminho]}:`)) return caminho;
  }
  return null;
}

type Stream = ReturnType<SdkMinimo['beta']['messages']['stream']>;

/**
 * An `SdkMinimo` that picks the way at each `stream`. In `MODO=local` the
 * choice is read first, so the stream it returns is lazy: the listeners wait
 * until the real stream exists.
 */
export function sdkPorConfiguracao(deps: {
  ler: () => Promise<Configuracao>;
  fabricas: Fabricas;
  env?: Record<string, string | undefined>;
}): SdkMinimo {
  const local = modo(deps.env) === 'local';
  return {
    beta: {
      messages: {
        stream(params): Stream {
          if (!local) return deps.fabricas.api().beta.messages.stream(params);
          const ouvintes: ((delta: string) => void)[] = [];
          return {
            on(_evento: 'text', ouvinte: (delta: string) => void) {
              ouvintes.push(ouvinte);
              return this;
            },
            async finalMessage() {
              const { caminho, modeloCodex } = await deps.ler();
              const sdk =
                caminho === 'assinatura_claude'
                  ? deps.fabricas.claude()
                  : caminho === 'assinatura_chatgpt'
                    ? deps.fabricas.codex(modeloCodex)
                    : deps.fabricas.api();
              const real = sdk.beta.messages.stream(params);
              for (const ouvinte of ouvintes) real.on('text', ouvinte);
              if (caminho === 'api') return real.finalMessage();
              try {
                return await real.finalMessage();
              } catch (erro) {
                throw new ErroDoCaminho(caminho, erro);
              }
            },
          };
        },
      },
    },
  };
}
