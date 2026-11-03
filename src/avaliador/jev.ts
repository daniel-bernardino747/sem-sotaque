// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The evaluator's classifier: the Jev, from TypeSafe. It reads a state and
 * named questions and picks among the options given; it writes no text. The
 * pattern comes from `../zap-bench/src/brains/jev.ts` (questions and criteria in
 * English, the Jev's main training language).
 *
 * Like the Claude client, every attempt is a row in `chamadas_llm` (stage
 * `avaliador`), a failure gets one quick retry, and a session past its
 * spending cap is not called. An answer that does not fit the questions (a
 * missing name, a label that was not offered) is a failure: the caller falls
 * back to its fixed rules.
 *
 * Model and price from docs.typesafe.ai/models, checked 2026-10-20: input
 * tokens at US$ 0.042 per million, output tokens free. `jev-1.13.0` is what
 * `jev-latest` pointed to that day (1.14 was `jev-preview`); pinned, so the
 * thresholds below do not move when the alias does.
 */
import { TypeSafeClient, type Questions, type SystemOneRequest, type SystemOneResult } from '@typesafe-ai/sdk';

import { gastoDaSessao, registrarChamadaLlm, vagasCriadas } from '@/db';
import { ORCAMENTO_POR_VAGA_USD, tetoDoAmbiente, type LinhaChamada } from '@/llm/cliente';

export const MODELO_JEV = 'jev-1.13.0';
const USD_POR_MILHAO_ENTRADA = 0.042;
/** Per attempt. The turn waits on it, so it is short. */
const TIMEOUT_MS = 8_000;

export type { Questions };
export type Respostas<Q extends Questions> = SystemOneResult<Q>['answers'];

/** The slice of the SDK the client uses, so tests can hand in a fake. */
export interface SdkJev {
  systemOne(pedido: SystemOneRequest & { model: string }): Promise<SystemOneResult<Questions>>;
}

export class ErroClassificador extends Error {
  constructor(
    readonly motivo: 'api' | 'invalida' | 'teto' | 'payload',
    mensagem: string,
    options?: { cause?: unknown },
  ) {
    super(mensagem, options);
    this.name = 'ErroClassificador';
  }
}

export interface PedidoClassificador<Q extends Questions> {
  sessaoId: string;
  /** A Vaga's conversation (step 16): the call counts for the Vaga, and under its budget. */
  vagaId?: string | null;
  state: SystemOneRequest['state'];
  questions: Q;
}

export interface Classificador {
  classificar<Q extends Questions>(pedido: PedidoClassificador<Q>): Promise<Respostas<Q>>;
}

/** What is wrong with an answer, against the questions asked; empty when it fits. */
export function conferirRespostas(questions: Questions, answers: unknown): string[] {
  const problemas: string[] = [];
  const lidas = (answers ?? {}) as Record<string, { type?: string; noul?: unknown; choice?: unknown; score?: unknown }>;
  for (const [nome, q] of Object.entries(questions)) {
    const r = lidas[nome];
    if (!r || r.type !== q.type) {
      problemas.push(`${nome}: no ${q.type} answer`);
    } else if (q.type === 'noul' && !(typeof r.noul === 'number' && r.noul >= 0 && r.noul <= 1)) {
      problemas.push(`${nome}: noul out of range`);
    } else if (q.type === 'choice' && !(typeof r.choice === 'string' && r.choice in q.criteria)) {
      problemas.push(`${nome}: "${String(r.choice)}" was not an option`);
    } else if (q.type === 'score' && !(typeof r.score === 'number' && r.score >= 0 && r.score <= q.criteria.length - 1)) {
      problemas.push(`${nome}: score out of range`);
    }
  }
  return problemas;
}

export function criarJev(deps: {
  sdk: SdkJev;
  registrar: (linha: LinhaChamada) => Promise<unknown>;
  /** What a session already cost. Without it, there is no cap. */
  gastoDaSessao?: (sessaoId: string) => Promise<number>;
  tetoSessaoUsd?: number;
  /** How many Vagas the session created: each adds its budget to a Vaga's call, as in the Claude client. */
  vagasCriadas?: (sessaoId: string) => Promise<number>;
}): Classificador {
  async function tentar<Q extends Questions>(pedido: PedidoClassificador<Q>): Promise<Respostas<Q>> {
    const inicio = performance.now();
    const linha = (dados: Partial<LinhaChamada>): LinhaChamada => ({
      sessaoId: pedido.sessaoId,
      vagaId: pedido.vagaId ?? null,
      etapa: 'avaliador',
      modelo: MODELO_JEV,
      tokensEntrada: 0,
      tokensSaida: 0,
      tokensCacheLeitura: 0,
      tokensCacheEscrita: 0,
      custoUsd: 0,
      duracaoMs: Math.round(performance.now() - inicio),
      erro: null,
      ...dados,
    });
    let resposta: SystemOneResult<Questions>;
    try {
      resposta = await deps.sdk.systemOne({ model: MODELO_JEV, state: pedido.state, questions: pedido.questions });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      await deps.registrar(linha({ erro: mensagem }));
      throw new ErroClassificador('api', mensagem, { cause: erro });
    }
    const problemas = conferirRespostas(pedido.questions, resposta.answers);
    await deps.registrar(
      linha({
        modelo: resposta.model || MODELO_JEV,
        tokensEntrada: resposta.usage.input_tokens,
        tokensSaida: resposta.usage.output_tokens,
        custoUsd: (resposta.usage.input_tokens * USD_POR_MILHAO_ENTRADA) / 1_000_000,
        erro: problemas.length ? `invalid answer: ${problemas.join('; ')}` : null,
      }),
    );
    if (problemas.length) throw new ErroClassificador('invalida', problemas.join('; '));
    return resposta.answers as Respostas<Q>;
  }

  return {
    async classificar(pedido) {
      if (deps.gastoDaSessao) {
        const vagas = pedido.vagaId && deps.vagasCriadas ? await deps.vagasCriadas(pedido.sessaoId) : 0;
        const teto = (deps.tetoSessaoUsd ?? tetoDoAmbiente()) + vagas * ORCAMENTO_POR_VAGA_USD;
        if ((await deps.gastoDaSessao(pedido.sessaoId)) >= teto) {
          throw new ErroClassificador('teto', `session spending cap reached (US$ ${teto.toFixed(2)})`);
        }
      }
      try {
        return await tentar(pedido);
      } catch {
        return tentar(pedido);
      }
    },
  };
}

/**
 * The real SDK. Without `TYPESAFE_API_KEY` the app never asks for the Jev
 * (`usaJev`, src/interrogatorio/turno.ts); if the client still cannot be
 * built, every call fails and each checkpoint falls back to the fixed rules
 * with the reason in the panel, rather than the interrogation breaking.
 */
function sdkDoAmbiente(): SdkJev {
  try {
    // The client does its own single retry, so it can record each attempt.
    return new TypeSafeClient({ defaultModel: MODELO_JEV, timeout: TIMEOUT_MS, retry: { maxRetries: 0 }, logLevel: 'off' }) as unknown as SdkJev;
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    return { systemOne: async () => Promise.reject(new Error(`no TypeSafe client: ${motivo}`)) };
  }
}

let padrao: Classificador | undefined;

/** The app's Jev (`TYPESAFE_API_KEY`), recording into `chamadas_llm`, capped per session. */
export function jev(): Classificador {
  padrao ??= criarJev({
    sdk: sdkDoAmbiente(),
    registrar: registrarChamadaLlm,
    gastoDaSessao,
    tetoSessaoUsd: tetoDoAmbiente(),
    vagasCriadas,
  });
  return padrao;
}
