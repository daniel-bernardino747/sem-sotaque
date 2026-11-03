// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * What goes to the Jev goes pseudonymised (decision 11 of step 10): without the
 * person's name or contact, and with every organisation of the Corpus swapped
 * for "Empresa A", "Empresa B"... An organisation is caught whole and by each
 * word of its own ("a Maracatu" for "Fintech Maracatu Pagamentos"), ignoring
 * case and accents; generic words ("Pagamentos", "Universidade") stay. In a
 * Vaga's conversation (step 16), the Vaga's company is "Empresa X", a label no
 * organisation of the Corpus gets.
 *
 * `conferirPayload` reads the payload as it would be sent and lists what is
 * still there. A non-empty list means the call is refused, never sent.
 */

export interface Protegidos {
  /** Each organisation with its label and the terms that stand for it, whole name first. */
  organizacoes: { rotulo: string; termos: string[] }[];
  /** The parts of the person's name. */
  pessoa: string[];
}

/** Words too common in company and school names to stand for one. */
const GENERICAS = new Set(
  `empresa empresas grupo banco pagamentos pagamento digital digitais tecnologia tecnologias sistemas sistema software
  solucoes servicos consultoria agencia transportadora fintech startup ltda holding brasil brasileira brasileiro nacional
  universidade faculdade faculdades federal estadual municipal instituto escola centro colegio tecnica tecnico ensino ciencia
  ciencias computacao engenharia informatica sociedade associacao comercio industria loja lojas saude educacao`.split(/\s+/),
);
const CONECTORES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du']);

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');
const normalizar = (s: string) => semAcento(s).toLowerCase();

/** The first line of the resume, when it reads as a name: 2 to 6 capitalised words, no digits. */
export function nomeDaPessoa(curriculo: string): string | null {
  const primeira = curriculo.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const palavras = primeira.split(/\s+/);
  if (palavras.length < 2 || palavras.length > 6) return null;
  const ehNome = palavras.every((p) => CONECTORES.has(p.toLowerCase()) || /^\p{Lu}[\p{Ll}'’-]+$/u.test(p));
  return ehNome ? primeira : null;
}

/** The letters of the Corpus's labels: X is the Vaga's company. */
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWYZ';

const termosDe = (o: string) => [o.trim(), ...o.split(/[^\p{L}\p{N}]+/u).filter((p) => p.length >= 4 && !GENERICAS.has(normalizar(p)))];

export function protegidos(dados: { curriculo: string; organizacoes: string[]; vaga?: string | null }): Protegidos {
  const nome = nomeDaPessoa(dados.curriculo);
  const pessoa = nome ? nome.split(/\s+/).filter((p) => p.length >= 3 && !CONECTORES.has(p.toLowerCase())) : [];
  const vistas = new Set<string>();
  const organizacoes = dados.organizacoes
    .filter((o) => o.trim() && !vistas.has(normalizar(o)) && vistas.add(normalizar(o)))
    .map((o, i) => ({
      rotulo: `Empresa ${LETRAS[i % LETRAS.length]}${i >= LETRAS.length ? Math.floor(i / LETRAS.length) : ''}`,
      termos: termosDe(o),
    }));
  // A Vaga at a company the person worked for keeps that company's label.
  if (dados.vaga?.trim() && !vistas.has(normalizar(dados.vaga))) organizacoes.push({ rotulo: 'Empresa X', termos: termosDe(dados.vaga) });
  return { organizacoes, pessoa };
}

const VARIANTES: Record<string, string> = { a: 'aáàâãä', e: 'eéèêë', i: 'iíìîï', o: 'oóòôõö', u: 'uúùûü', c: 'cç', n: 'nñ' };

/** A whole-word, case- and accent-insensitive pattern for a term. */
function padrao(termo: string): RegExp {
  const corpo = [...normalizar(termo)]
    .map((c) => (VARIANTES[c] ? `[${VARIANTES[c]}]` : /\s/.test(c) ? '\\s+' : c.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')))
    .join('');
  return new RegExp(`(?<![\\p{L}\\p{N}])${corpo}(?![\\p{L}\\p{N}])`, 'giu');
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin|github)\.com\/\S+/giu;
const TELEFONE = /(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g;

function trocarTexto(texto: string, p: Protegidos): string {
  let t = texto.replace(EMAIL, '[email]').replace(LINK, '[link]').replace(TELEFONE, '[telefone]');
  // Longer terms first, so a whole name wins over one of its words.
  const termos = p.organizacoes
    .flatMap((o) => o.termos.map((termo) => ({ termo, rotulo: o.rotulo })))
    .concat(p.pessoa.map((termo) => ({ termo, rotulo: '[pessoa]' })))
    .sort((a, b) => b.termo.length - a.termo.length);
  for (const { termo, rotulo } of termos) t = t.replace(padrao(termo), rotulo);
  return t;
}

/** Every string in the value, pseudonymised. */
export function pseudonimizar<T>(valor: T, p: Protegidos): T {
  if (typeof valor === 'string') return trocarTexto(valor, p) as T;
  if (Array.isArray(valor)) return valor.map((v) => pseudonimizar(v, p)) as T;
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, pseudonimizar(v, p)])) as T;
  }
  return valor;
}

/** What of the person or of an organisation is still in the payload: empty when it may be sent. */
export function conferirPayload(payload: unknown, p: Protegidos): string[] {
  const texto = JSON.stringify(payload) ?? '';
  const achados = new Set<string>();
  const termos = [...p.organizacoes.flatMap((o) => o.termos), ...p.pessoa];
  for (const termo of termos) if (padrao(termo).test(texto)) achados.add(normalizar(termo));
  // A whole name and one of its words are the same finding: keep the shortest.
  const lista = [...achados].filter((a) => ![...achados].some((b) => b !== a && a.includes(b)));
  if (new RegExp(EMAIL.source, 'u').test(texto)) lista.push('an e-mail address');
  if (new RegExp(TELEFONE.source).test(texto)) lista.push('a phone number');
  if (new RegExp(LINK.source, 'iu').test(texto)) lista.push('a link');
  return lista;
}
