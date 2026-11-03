// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The price table `chamadas_llm.custo_usd` is computed from, in USD per million
 * tokens. Taken from the `claude-api` skill (model table cached 2026-10-06),
 * never from memory: when a price changes, change it here and the rows written
 * from then on carry the new one (the old rows keep what they cost).
 *
 * Cache writes are a multiple of the input price: 1.25x for the 5-minute TTL,
 * 2x for the 1-hour one. Cache reads have their own rate per model.
 */

/** The model every stage uses unless it says otherwise. */
export const MODELO_PADRAO = 'claude-opus-5-5';

/** What `chamadas_llm.modelo` starts with for a call through the subscription (step 12): no cost measured. */
export const PREFIXO_ASSINATURA = 'assinatura:';

interface Preco {
  entrada: number;
  saida: number;
  cacheLeitura: number;
}

export const PRECOS: Record<string, Preco> = {
  'claude-opus-5-5': { entrada: 4, saida: 20, cacheLeitura: 0.2 },
  'claude-sonnet-5-5': { entrada: 2, saida: 10, cacheLeitura: 0.2 },
  // The targets `fallbacks: "default"` routes a refused Opus 5.5 request to.
  'claude-opus-5': { entrada: 5, saida: 25, cacheLeitura: 0.5 },
  'claude-opus-4-8': { entrada: 5, saida: 25, cacheLeitura: 0.5 },
};

/**
 * What a model missing from the table is charged at: the most expensive one,
 * so an unexpected fallback model never logs a paid call as free.
 */
export const MODELO_MAIS_CARO = Object.entries(PRECOS).sort(([, a], [, b]) => b.saida - a.saida)[0][0];

const ESCRITA_5M = 1.25;
const ESCRITA_1H = 2;

/** The token counts of one attempt, as the API's `usage` reports them. */
export interface Uso {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: {
    ephemeral_5m_input_tokens: number;
    ephemeral_1h_input_tokens: number;
  } | null;
}

export function custoUsd(modelo: string, uso: Uso): number {
  const preco = PRECOS[modelo];
  if (!preco) throw new Error(`no price for model ${modelo}: add it to src/llm/precos.ts`);

  const escrita1h = uso.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const escrita5m = uso.cache_creation
    ? uso.cache_creation.ephemeral_5m_input_tokens
    : (uso.cache_creation_input_tokens ?? 0);

  const porMilhao =
    uso.input_tokens * preco.entrada +
    uso.output_tokens * preco.saida +
    (uso.cache_read_input_tokens ?? 0) * preco.cacheLeitura +
    escrita5m * preco.entrada * ESCRITA_5M +
    escrita1h * preco.entrada * ESCRITA_1H;
  return porMilhao / 1_000_000;
}
