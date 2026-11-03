// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * "One question per message": a message that asks two things gets a rewrite
 * before it is recorded. A heuristic, shared by the turn and the simulation.
 */

/**
 * The question words that open a separate ask. "Quando" and "como" are left
 * out: they open subordinate clauses ("quando o financeiro fazia na planilha,
 * quanto tempo...") more often than asks.
 */
const INTERROGATIVOS = /(?<![\p{L}])(o qu[eê]|quem|quant[oa]s?|onde|qual|quais|por qu[eê])(?![\p{L}])/giu;

/**
 * More than one question: two question marks, or one question that asks two
 * things ("o que ela faz, pra quem e de que tamanho?"), read as two different
 * question words in the ask itself (the sentence that ends in "?", after its
 * last colon, without a leading "pra quem ..." clause). "Você entrou em março
 * e ainda está lá?" gets through it.
 */
export function maisDeUmaPergunta(texto: string): boolean {
  if ((texto.match(/\?/g) ?? []).length > 1) return true;
  const frase = texto.split(/(?<=[.!])\s+/).find((f) => f.includes('?')) ?? '';
  const pedido = frase
    .slice(frase.lastIndexOf(':') + 1)
    .toLowerCase()
    // "Pra quem nunca ouviu falar dela, ..." sets up the ask; it is not one.
    .replace(/^\s*(pra|para) quem [^,?]*,/u, '')
    // Nor is a "quem" that opens a clause: "o que acontecia com quem pagava?".
    // "E pra quem?" at the end still asks.
    .replace(/(?<![\p{L}])(com|de|por|a|pra|para) quem(?=\s+\p{L})/gu, '');
  return new Set(pedido.match(INTERROGATIVOS) ?? []).size > 1;
}
