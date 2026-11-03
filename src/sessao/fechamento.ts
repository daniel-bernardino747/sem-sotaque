// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The forms at the end of the session (step 07), read and checked. Everything
 * is optional, so what is checked is only what was filled in.
 */
import type { Indicacao, Opiniao } from '@/db/fechamento';

export type Lido<T> = { ok: true; dados: T } | { ok: false; erro: string };

/** Enough for a testimonial, short of a pasted novel. */
const MAX_TEXTO = 4000;
const MAX_CURTO = 200;
export const MAX_INDICACOES = 10;

const campo = (form: FormData, nome: string) => {
  const v = form.get(nome);
  return typeof v === 'string' ? v.trim() : '';
};

/** One or more devs: a row with both fields empty is ignored, a half-filled one is an error. */
export function lerIndicacoes(form: FormData): Lido<Indicacao[]> {
  const nomes = form.getAll('nome').map((v) => (typeof v === 'string' ? v.trim() : ''));
  const contatos = form.getAll('contato').map((v) => (typeof v === 'string' ? v.trim() : ''));
  const lista: Indicacao[] = [];
  for (let i = 0; i < Math.max(nomes.length, contatos.length); i++) {
    const nome = nomes[i] ?? '';
    const contato = contatos[i] ?? '';
    if (!nome && !contato) continue;
    if (!nome) return { ok: false, erro: 'Falta o nome de quem você indicou.' };
    if (!contato) return { ok: false, erro: `Falta o WhatsApp ou o LinkedIn de ${nome}.` };
    if (nome.length > MAX_CURTO || contato.length > MAX_CURTO) return { ok: false, erro: 'Nome e contato curtos, por favor.' };
    lista.push({ nome, contato });
  }
  if (lista.length === 0) return { ok: false, erro: 'Escreva o nome e o contato de pelo menos uma pessoa.' };
  if (lista.length > MAX_INDICACOES) return { ok: false, erro: `No máximo ${MAX_INDICACOES} de uma vez.` };
  return { ok: true, dados: lista };
}

/**
 * The testimonial and "algo deu errado?" ("pagaria?" left with the free test,
 * step 22). The testimonial's consent is its own checkbox
 * (`depoimento_pode_usar`), read only from that field and only when there is
 * a testimonial: the entry consent (`aceito`) never counts.
 */
export function lerOpiniao(form: FormData): Lido<Opiniao> {
  const depoimento = campo(form, 'depoimento') || null;
  const comentario = campo(form, 'comentario') || null;
  const depoimentoPodeUsar = depoimento !== null && form.get('depoimento_pode_usar') === 'sim';

  if ([depoimento, comentario].some((t) => t && t.length > MAX_TEXTO)) {
    return { ok: false, erro: 'Esse texto ficou longo demais. Pode resumir?' };
  }
  if (!depoimento && !comentario) {
    return { ok: false, erro: 'Escreva pelo menos uma das duas, ou deixe para lá: é tudo opcional.' };
  }
  return { ok: true, dados: { depoimento, depoimentoPodeUsar, comentario } };
}
