// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The forms of a Vaga, read and checked: the pasted posting ("Achei uma vaga")
 * and the confirmation (company, role, the checklist of gaps).
 */
import type { RespostaLacuna } from '@/db/schema';
import type { Lido } from '@/sessao/fechamento';

/** Shorter than this is a title, not a posting: there is nothing to read requirements from. */
export const MIN_TEXTO = 200;
/** Longer than any posting; past it, someone pasted a whole page. */
export const MAX_TEXTO = 30_000;
const MAX_CURTO = 200;
const MAX_LINK = 1000;

const campo = (form: FormData, nome: string) => {
  const v = form.get(nome);
  return typeof v === 'string' ? v.trim() : '';
};

export interface VagaColada {
  texto: string;
  empresa: string | null;
  cargo: string | null;
  link: string | null;
}

/** The posting, plus the optional company, role and link. The link is kept, never fetched. */
export function lerVagaColada(form: FormData): Lido<VagaColada> {
  const texto = campo(form, 'texto');
  const empresa = campo(form, 'empresa');
  const cargo = campo(form, 'cargo');
  const link = campo(form, 'link');
  if (texto.length < MIN_TEXTO) {
    return { ok: false, erro: 'Cole o texto inteiro da vaga, com os requisitos. Só o título não dá para ler.' };
  }
  if (texto.length > MAX_TEXTO) return { ok: false, erro: 'Esse texto é longo demais para uma vaga. Cole só a descrição da vaga.' };
  if (empresa.length > MAX_CURTO || cargo.length > MAX_CURTO) return { ok: false, erro: 'A empresa e o cargo cabem em uma linha.' };
  // Only a web address: the page shows it as a link, and anything else could run in the browser.
  if (link && (link.length > MAX_LINK || !/^https?:\/\/[^\s]+$/i.test(link))) {
    return { ok: false, erro: 'O link tem que começar com http:// ou https://, ou fique em branco.' };
  }
  return { ok: true, dados: { texto, empresa: empresa || null, cargo: cargo || null, link: link || null } };
}

export interface Confirmacao {
  empresa: string | null;
  cargo: string | null;
  /** Requisito id → the answer, only for the gaps that were marked. */
  respostas: Map<string, RespostaLacuna>;
}

/** Company and role (blank is allowed: some postings do not say), and each gap's `lacuna-<id>` radio. */
export function lerConfirmacao(form: FormData): Lido<Confirmacao> {
  const empresa = campo(form, 'empresa');
  const cargo = campo(form, 'cargo');
  if (empresa.length > MAX_CURTO || cargo.length > MAX_CURTO) return { ok: false, erro: 'A empresa e o cargo cabem em uma linha.' };
  const respostas = new Map<string, RespostaLacuna>();
  for (const [chave, valor] of form.entries()) {
    if (!chave.startsWith('lacuna-')) continue;
    if (valor === 'ja_usei' || valor === 'nao_usei') respostas.set(chave.slice('lacuna-'.length), valor);
  }
  return { ok: true, dados: { empresa: empresa || null, cargo: cargo || null, respostas } };
}
