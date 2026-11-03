// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The header form on the result screen: what the résumé prints at the top.
 * Read from the form, trimmed, and checked loosely: a person who typed their
 * LinkedIn as "linkedin.com/in/ana" or "https://www.linkedin.com/in/ana/" gets
 * the same link.
 */
import type { Cabecalho } from '@/db/geracao';

export type ResultadoCabecalho = { ok: true; cabecalho: Cabecalho } | { ok: false; erro: string };

const campo = (form: FormData, nome: string) => {
  const v = form.get(nome);
  return typeof v === 'string' ? v.trim() : '';
};

export function lerCabecalho(form: FormData): ResultadoCabecalho {
  const nome = campo(form, 'nome');
  const email = campo(form, 'email');
  const linkedin = campo(form, 'linkedin');
  const github = campo(form, 'github');
  const local = campo(form, 'local');

  if (nome.length < 3) return { ok: false, erro: 'Escreva seu nome como quer que apareça no currículo.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: 'Esse e-mail não parece certo.' };
  if (!/linkedin\.com\/in\/[^/\s]+/i.test(linkedin)) {
    return { ok: false, erro: 'Cole o link do seu perfil do LinkedIn (linkedin.com/in/…).' };
  }
  let githubFinal: string | null = null;
  if (github) {
    if (/github\.com\/[^/\s]+/i.test(github)) githubFinal = github;
    else if (/^@?[a-z\d](?:[a-z\d-]{0,38})$/i.test(github)) githubFinal = `github.com/${github.replace(/^@/, '')}`;
    else return { ok: false, erro: 'Cole o link do seu GitHub (github.com/…), ou deixe em branco.' };
  }
  if (!/[\p{L}].*,\s*[\p{L}]/u.test(local)) return { ok: false, erro: 'Escreva a cidade e o país, separados por vírgula (ex.: Recife, Brazil).' };
  // The checks refuse availability in the header, and the model cannot fix what the person typed.
  if (/\b(remot[eo]|h[ií]brido|hybrid|pj|clt|freelanc\w*|relocat\w*|utc|gmt)\b/i.test(local)) {
    return { ok: false, erro: 'Só a cidade e o país: se você quer trabalho remoto ou como PJ, isso se combina na entrevista.' };
  }

  return { ok: true, cabecalho: { nome, email, linkedin, github: githubFinal, local } };
}
