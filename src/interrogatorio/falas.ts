// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Short answers the server reads by itself, before any model call (step 11):
 * a bare "não sei" and a bare "pula". Anything with more in it ("sei lá, 400
 * motoristas", "não sei se conta, mas...") is the questioner's to read.
 */

const normalizar = (fala: string) =>
  fala.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const NAO_SEI = /\b(?:nao sei|sei la|nao lembro|nao faco ideia|nao tenho ideia|nao tenho como saber)\b/g;
/** Words that come around a "não sei" and add nothing. */
const ENCHIMENTO = new Set(
  'direito agora explicar dizer te isso eu mesmo bem olha cara ai nao muito assim com certeza ja nem detalhe'.split(' '),
);

/** The whole answer is "I don't know", in a few words. */
export function ehNaoSei(fala: string): boolean {
  const texto = normalizar(fala);
  if (!texto.match(NAO_SEI) || texto.split(' ').length > 8) return false;
  return texto
    .replace(NAO_SEI, ' ')
    .split(' ')
    .filter(Boolean)
    .every((p) => ENCHIMENTO.has(p));
}

const PULAR = new Set([
  'pula', 'pular', 'pula essa', 'pula esse', 'pula essa ai', 'pode pular', 'pode pular essa', 'proxima', 'passa', 'passa essa',
  'pula pra proxima', 'vamos pra proxima', 'next', 'skip',
]);

/** The whole answer asks to skip, like the "pular esta" button. */
export const ehPular = (fala: string) => PULAR.has(normalizar(fala));
