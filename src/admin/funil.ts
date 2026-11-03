// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The arithmetic of Daniel's panel (step 08): which steps of the funnel a
 * session reached, where it stopped, and the summary numbers. Pure functions
 * over rows the data layer (`src/db/painel.ts`) loads, so the counting rules
 * are tested without a database.
 *
 * How a step counts:
 * - The chain `link_aberto` → … → `pdf_gerado` is monotone: a session counts
 *   at a step when it has the event of that step **or of a later one**, or a
 *   column of `sessoes` says so (`consentiu_em`, `terminou_interrogatorio_em`,
 *   the state). The columns survive an erasure, the events do not; and the
 *   simulations never open the link, so they have no `link_aberto`.
 * - `pdf_baixado` and `fundador_ou_indicou` come after the PDF and do not imply
 *   each other: each counts on its own (event, or the `fechamento` /
 *   `indicacoes` rows), and either one implies `pdf_gerado`.
 * - An erased session keeps the event types it had reached in the `apagou`
 *   event (`dados.etapas`); an older erasure without it falls back on the
 *   columns. Erasing needs the page open, so it implies `link_aberto`.
 */
import { ESTADOS_SESSAO, type EstadoSessao } from '@/db/schema';

export const ETAPAS_FUNIL = [
  'link_aberto',
  'consentiu',
  'importou',
  'primeira_resposta',
  'terminou',
  'pdf_gerado',
  'pdf_baixado',
  'fundador_ou_indicou',
] as const;
export type EtapaFunil = (typeof ETAPAS_FUNIL)[number];

export const NOME_DA_ETAPA: Record<EtapaFunil, string> = {
  link_aberto: 'Abriu o link',
  consentiu: 'Consentiu',
  importou: 'Importou o currículo',
  primeira_resposta: 'Primeira resposta',
  terminou: 'Terminou o interrogatório',
  pdf_gerado: 'PDF gerado',
  pdf_baixado: 'PDF baixado',
  fundador_ou_indicou: 'Fundador ou indicou',
};

const CADEIA = ['link_aberto', 'consentiu', 'importou', 'primeira_resposta', 'terminou', 'pdf_gerado'] as const;

/** The v0 validation criterion, as shares of the testers (6 and 4 of 10). */
export const META_COMPLETAM = 0.6;
export const META_FUNDADOR_OU_INDICOU = 0.4;

export interface SessaoParaFunil {
  estado: EstadoSessao;
  consentiuEm: Date | null;
  terminouInterrogatorioEm: Date | null;
  apagadaEm: Date | null;
  eventos: { tipo: string; dados: unknown }[];
  /** `fechamento.fundador`. */
  fundador: boolean;
  /** Rows in `indicacoes`. */
  indicacoes: number;
}

export interface Alcance {
  /** Every step the session counts at. */
  etapas: Set<EtapaFunil>;
  /** The furthest step it reached, or null if it never opened the link. */
  parouEm: EtapaFunil | null;
  fundador: boolean;
  indicou: boolean;
}

const ordemDoEstado = (e: EstadoSessao) => ESTADOS_SESSAO.indexOf(e);

/** The event types a session has, counting those an erasure kept in `apagou.dados.etapas`. */
function tiposDosEventos(eventos: SessaoParaFunil['eventos']): Set<string> {
  const tipos = new Set<string>();
  for (const e of eventos) {
    tipos.add(e.tipo);
    if (e.tipo === 'apagou') {
      const etapas = (e.dados as { etapas?: unknown } | null)?.etapas;
      if (Array.isArray(etapas)) for (const t of etapas) if (typeof t === 'string') tipos.add(t);
    }
  }
  return tipos;
}

export function alcanceDaSessao(s: SessaoParaFunil): Alcance {
  const tipos = tiposDosEventos(s.eventos);
  let ultimo = -1;
  CADEIA.forEach((etapa, i) => {
    if (tipos.has(etapa)) ultimo = Math.max(ultimo, i);
  });
  const ate = (etapa: (typeof CADEIA)[number]) => (ultimo = Math.max(ultimo, CADEIA.indexOf(etapa)));
  const estado = ordemDoEstado(s.estado);

  if (s.consentiuEm || estado >= ordemDoEstado('consentiu')) ate('consentiu');
  if (estado >= ordemDoEstado('importou')) ate('importou');
  if (s.terminouInterrogatorioEm || estado >= ordemDoEstado('gerando')) ate('terminou');
  if (estado >= ordemDoEstado('pronto')) ate('pdf_gerado');

  const baixou = tipos.has('pdf_baixado');
  const fundador = s.fundador || tipos.has('fundador');
  const indicou = s.indicacoes > 0 || tipos.has('indicou');
  if (baixou || fundador || indicou) ate('pdf_gerado');
  if (s.apagadaEm || tipos.size > 0) ate('link_aberto');

  const etapas = new Set<EtapaFunil>(CADEIA.slice(0, ultimo + 1));
  if (baixou) etapas.add('pdf_baixado');
  if (fundador || indicou) etapas.add('fundador_ou_indicou');

  const parouEm: EtapaFunil | null =
    fundador || indicou ? 'fundador_ou_indicou' : baixou ? 'pdf_baixado' : (CADEIA[ultimo] ?? null);
  return { etapas, parouEm, fundador, indicou };
}

export interface Funil {
  testers: number;
  /** How many sessions count at each step. */
  porEtapa: Record<EtapaFunil, number>;
  /** How many sessions stopped at each step (`null`: never opened the link). */
  pararamEm: Map<EtapaFunil | null, number>;
}

export function funil(alcances: Alcance[]): Funil {
  const porEtapa = Object.fromEntries(ETAPAS_FUNIL.map((e) => [e, 0])) as Record<EtapaFunil, number>;
  const pararamEm = new Map<EtapaFunil | null, number>();
  for (const a of alcances) {
    for (const e of a.etapas) porEtapa[e] += 1;
    pararamEm.set(a.parouEm, (pararamEm.get(a.parouEm) ?? 0) + 1);
  }
  return { testers: alcances.length, porEtapa, pararamEm };
}

/** How many of `testers` a share of the criterion asks for (6 of 10, 4 of 10). */
export const metaPara = (testers: number, fracao: number) => Math.ceil(testers * fracao);

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

export function resumo(valores: number[]): { media: number; mediana: number; maximo: number; n: number } | null {
  if (valores.length === 0) return null;
  return {
    media: valores.reduce((a, b) => a + b, 0) / valores.length,
    mediana: mediana(valores)!,
    maximo: Math.max(...valores),
    n: valores.length,
  };
}

/** "1 h 05 min", "12 min", "40 s". */
export function duracao(ms: number | null): string {
  if (ms === null) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, '0')} min`;
}
