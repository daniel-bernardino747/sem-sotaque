// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The one way the app talks to Claude. Every call streams, records one row in
 * `chamadas_llm` per attempt (stage, model, tokens, cache, cost, duration,
 * error), retries a transient failure once, and turns a refusal into an error.
 *
 * Requests go through the beta endpoint with `fallbacks: "default"`: when the
 * default model's safety classifiers decline, the API re-runs the request on
 * the model Anthropic recommends for that refusal category. The cost is then
 * summed per attempt, each at its own model's price.
 *
 * A session has a spending cap (`TETO_SESSAO_USD`, default US$ 3, about twice
 * the most expensive simulated session): once what it already cost reaches the
 * cap, the client stops calling and throws, so a tab left looping cannot run
 * up the bill. The generation stages get `MARGEM_GERACAO_USD` on top: a
 * session that hit the cap in the interrogation still gets its résumé. Each
 * Vaga the session created adds `ORCAMENTO_POR_VAGA_USD` to the cap of the
 * calls made for a Vaga (step 15); the general conversation keeps the cap
 * alone.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import { gastoDaSessao, registrarChamadaLlm, vagasCriadas } from '../db';
import { modo } from '../modo';
import type { etapaLlm } from '../db/schema';

import { criarSdkAssinatura } from './assinatura';
import { custoUsd, MODELO_MAIS_CARO, MODELO_PADRAO, PREFIXO_ASSINATURA, PRECOS, type Uso } from './precos';

export type Etapa = (typeof etapaLlm.enumValues)[number];

type Mensagem = Anthropic.Beta.BetaMessage;
type Params = BetaMessageStreamParams;

export interface PedidoLlm {
  etapa: Etapa;
  /** Null for calls that belong to no session (scripts, tests). */
  sessaoId: string | null;
  /** The Vaga the call is for, if any: its cost is counted per job, and the cap grows with the Vagas. */
  vagaId?: string | null;
  /** Everything but the model, which defaults to `MODELO_PADRAO`. */
  params: Omit<Params, 'model' | 'fallbacks' | 'betas'> & { model?: string };
  /** Each text delta as it streams. */
  aoTexto?: (delta: string) => void;
}

export interface LinhaChamada {
  sessaoId: string | null;
  vagaId: string | null;
  etapa: Etapa;
  modelo: string;
  tokensEntrada: number;
  tokensSaida: number;
  tokensCacheLeitura: number;
  tokensCacheEscrita: number;
  custoUsd: number;
  duracaoMs: number;
  erro: string | null;
}

/** The slice of the SDK the client uses, so tests can hand in a fake. */
export interface SdkMinimo {
  beta: {
    messages: {
      stream(params: Params): {
        on(evento: 'text', ouvinte: (delta: string) => void): unknown;
        finalMessage(): Promise<Mensagem>;
      };
    };
  };
}

export class ErroLlm extends Error {
  constructor(
    readonly motivo: 'recusa' | 'api' | 'teto',
    mensagem: string,
    options?: { cause?: unknown },
  ) {
    super(mensagem, options);
    this.name = 'ErroLlm';
  }
}

const BETAS = ['server-side-fallback-2026-07-01'];

/** Worth one more try: the request was fine, the network or the API was not. */
function transitorio(erro: unknown): boolean {
  return (
    erro instanceof Anthropic.APIConnectionError ||
    erro instanceof Anthropic.RateLimitError ||
    erro instanceof Anthropic.InternalServerError
  );
}

/**
 * Sums the attempts (a declined one and its fallback), each priced at its own
 * model. A model the table lacks is priced as the most expensive one and named
 * in `semPreco`, so the row still says the call cost something.
 */
function contabilizar(resposta: Mensagem, modeloPedido: string) {
  const uso = resposta.usage;
  // Through the subscription: tokens as Claude Code reports them, cost not measured.
  const assinatura = (resposta.model ?? '').startsWith(PREFIXO_ASSINATURA);
  const tentativas: { modelo: string; uso: Uso }[] = (uso.iterations ?? []).flatMap((it) =>
    it.type === 'message' || it.type === 'fallback_message'
      ? [{ modelo: it.model ?? resposta.model ?? modeloPedido, uso: it }]
      : [],
  );
  if (tentativas.length === 0) tentativas.push({ modelo: resposta.model ?? modeloPedido, uso });

  const soma = (f: (u: Uso) => number) => tentativas.reduce((total, t) => total + f(t.uso), 0);
  const semPreco = assinatura ? [] : [...new Set(tentativas.map((t) => t.modelo).filter((m) => !(m in PRECOS)))];
  const cobrado = (m: string) => (m in PRECOS ? m : MODELO_MAIS_CARO);
  return {
    semPreco,
    modelo: resposta.model ?? modeloPedido,
    tokensEntrada: soma((u) => u.input_tokens),
    tokensSaida: soma((u) => u.output_tokens),
    tokensCacheLeitura: soma((u) => u.cache_read_input_tokens ?? 0),
    tokensCacheEscrita: soma((u) => u.cache_creation_input_tokens ?? 0),
    custoUsd: assinatura ? 0 : tentativas.reduce((total, t) => total + custoUsd(cobrado(t.modelo), t.uso), 0),
  };
}

export const TETO_SESSAO_PADRAO_USD = 3;
/** What generation may spend past the cap (a generation costs US$ 0.10–0.40). */
export const MARGEM_GERACAO_USD = 1;
const ETAPAS_DE_GERACAO: ReadonlySet<Etapa> = new Set(['selecao', 'critico', 'reescrita', 'leitura_vaga', 'mapa_vaga']);
/**
 * What each Vaga adds to the cap of the calls made for a Vaga: its reading,
 * its conversation and its 3 generations. A guess, to be corrected by the cost
 * measured per job (step 19).
 */
export const ORCAMENTO_POR_VAGA_USD = 2;

export function criarClienteLlm(deps: {
  sdk: SdkMinimo;
  registrar: (linha: LinhaChamada) => Promise<unknown>;
  /** What a session already cost. Without it, there is no cap. */
  gastoDaSessao?: (sessaoId: string) => Promise<number>;
  /** How many Vagas a session created, emptied ones included. Without it, a Vaga adds nothing. */
  vagasCriadas?: (sessaoId: string) => Promise<number>;
  tetoSessaoUsd?: number;
}) {
  const teto = deps.tetoSessaoUsd ?? TETO_SESSAO_PADRAO_USD;

  async function tentar(pedido: PedidoLlm, modelo: string, emitiu: { texto: boolean }) {
    const inicio = performance.now();
    const base = { sessaoId: pedido.sessaoId, vagaId: pedido.vagaId ?? null, etapa: pedido.etapa };
    let resposta: Mensagem;
    try {
      const fluxo = deps.sdk.beta.messages.stream({
        ...pedido.params,
        model: modelo,
        betas: BETAS,
        fallbacks: 'default',
      });
      fluxo.on('text', (delta) => {
        emitiu.texto = true;
        pedido.aoTexto?.(delta);
      });
      resposta = await fluxo.finalMessage();
    } catch (erro) {
      await deps.registrar({
        ...base,
        modelo,
        tokensEntrada: 0,
        tokensSaida: 0,
        tokensCacheLeitura: 0,
        tokensCacheEscrita: 0,
        custoUsd: 0,
        duracaoMs: Math.round(performance.now() - inicio),
        erro: erro instanceof Error ? erro.message : String(erro),
      });
      throw erro;
    }

    const recusa = resposta.stop_reason === 'refusal';
    const categoria = resposta.stop_details?.category ?? 'unknown';
    const { semPreco, ...contas } = contabilizar(resposta, modelo);
    const avisos = [
      ...(recusa ? [`refusal (${categoria})`] : []),
      ...semPreco.map((m) => `no price for ${m}, charged as ${MODELO_MAIS_CARO}`),
    ];
    await deps.registrar({
      ...base,
      ...contas,
      duracaoMs: Math.round(performance.now() - inicio),
      erro: avisos.length ? avisos.join('; ') : null,
    });
    if (recusa) throw new ErroLlm('recusa', `the model refused (${categoria})`);
    return resposta;
  }

  return {
    /** One streamed call. Resolves with the final message; check `stop_reason` before trusting tool input. */
    async chamar(pedido: PedidoLlm): Promise<Mensagem> {
      const modelo = pedido.params.model ?? MODELO_PADRAO;
      if (pedido.sessaoId && deps.gastoDaSessao) {
        const [gasto, vagas] = await Promise.all([
          deps.gastoDaSessao(pedido.sessaoId),
          pedido.vagaId && deps.vagasCriadas ? deps.vagasCriadas(pedido.sessaoId) : 0,
        ]);
        const limite =
          teto + (ETAPAS_DE_GERACAO.has(pedido.etapa) ? MARGEM_GERACAO_USD : 0) + vagas * ORCAMENTO_POR_VAGA_USD;
        if (gasto >= limite) {
          // The session id, never the token: the token is the person's credential.
          console.error(
            `spending cap reached for session ${pedido.sessaoId}: US$ ${gasto.toFixed(2)} >= US$ ${limite.toFixed(2)}, ${pedido.etapa} not called`,
          );
          throw new ErroLlm('teto', `session spending cap reached (US$ ${limite.toFixed(2)})`);
        }
      }
      const emitiu = { texto: false };
      for (let tentativa = 1; ; tentativa++) {
        try {
          return await tentar(pedido, modelo, emitiu);
        } catch (erro) {
          if (erro instanceof ErroLlm) throw erro;
          // A retry after text reached the caller would show it twice.
          if (tentativa < 2 && transitorio(erro) && !emitiu.texto) continue;
          throw new ErroLlm('api', erro instanceof Error ? erro.message : String(erro), {
            cause: erro,
          });
        }
      }
    },
  };
}

export type ClienteLlm = ReturnType<typeof criarClienteLlm>;

let padrao: ClienteLlm | undefined;

/** A positive `TETO_SESSAO_USD`, or the default. */
export function tetoDoAmbiente(valor = process.env.TETO_SESSAO_USD): number {
  const n = Number(valor);
  return valor && Number.isFinite(n) && n > 0 ? n : TETO_SESSAO_PADRAO_USD;
}

/**
 * The SDK `LLM_BACKEND` picks: `assinatura` is the Claude subscription of
 * whoever runs the app, through `claude -p` (src/llm/assinatura.ts); anything
 * else the real API (`ANTHROPIC_API_KEY`). The subscription is for `MODO=local`
 * only (step 23): a personal subscription cannot serve an app for other
 * people, so the hosted mode refuses it whatever `NODE_ENV` says.
 */
export function sdkDoAmbiente(env: Record<string, string | undefined> = process.env): SdkMinimo {
  if (env.LLM_BACKEND !== 'assinatura') {
    // The client does its own single retry, so it can record each attempt.
    return new Anthropic({ maxRetries: 0, timeout: 5 * 60_000 });
  }
  if (modo(env) !== 'local') {
    throw new Error(
      'LLM_BACKEND=assinatura needs MODO=local: a personal Claude subscription cannot serve an app for other people (Anthropic terms); unset it here.',
    );
  }
  return criarSdkAssinatura();
}

/** The app's client: the SDK `LLM_BACKEND` picks, recording into `chamadas_llm`, capped per session. */
export function llm(): ClienteLlm {
  padrao ??= criarClienteLlm({
    sdk: sdkDoAmbiente(),
    registrar: registrarChamadaLlm,
    gastoDaSessao,
    vagasCriadas,
    tetoSessaoUsd: tetoDoAmbiente(),
  });
  return padrao;
}
