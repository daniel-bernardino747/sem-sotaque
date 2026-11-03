// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The résumé as the model writes it (`Rascunho`), and the Selection the code
 * builds from it. The model cites records by ref (`ac3`, `af1`, as the
 * interrogation does) and never sees a database id; every line has an id
 * (`b3`, `g1.role`, `summary`) so a check, the measure or the Critic can say
 * which line is wrong and the rewrite can change only that one.
 *
 * What the model does not write, the code does, the same way every time: the
 * header from the form, each period from its Affiliation (month/year, or
 * nothing when the Corpus has no month), the stack line as the group's last
 * entry, and the template version.
 */
import { z } from 'zod';

import type { Corpus } from '@/db';
import type { Cabecalho } from '@/db/geracao';
import { ehFormacao, type Refs } from '@/interrogatorio/estado';
import { SELECTION_VERSION, type Selection } from '@/render';

import { SECOES, STACK_LABEL, type Onde } from './checagens';

// ---- what the model writes --------------------------------------------------

export const entradaDaSelecao = z.object({
  header_role: z
    .string()
    .nullable()
    .describe('A short engineering headline under the name ("Backend Engineer"), or null. Never a seniority word.'),
  summary: z.string().nullable().describe('One line of positioning drawn from the records, or null.'),
  sections: z.array(
    z.object({
      title: z.enum(SECOES),
      groups: z.array(
        z.object({
          affiliation_ref: z
            .string()
            .nullable()
            .describe('The Affiliation (af1…) this group is. Its period comes from the Corpus. Null only for a project with no Affiliation.'),
          organisation: z.string().describe("The organisation, in English; a confidential one's public description, never its name."),
          role: z.string().nullable().describe('The role in English, engineering only, no seniority. For Education, the degree or course.'),
          location: z.string().nullable().describe('City and country of the job, if the Corpus says it; else null.'),
          bullets: z.array(
            z.object({
              source: z.string().describe('The ref (ac3…) of the one Accomplishment this bullet tells.'),
              text: z.string().describe('The bullet, in English.'),
            }),
          ),
          stack: z
            .array(z.string())
            .describe('The technologies of this group\'s bullets, ordered by flow: language, front end, back end, data, tests, delivery. Empty for Education.'),
        }),
      ),
    }),
  ),
});
export type EntradaDaSelecao = z.infer<typeof entradaDaSelecao>;

export interface BulletR {
  id: string;
  source: string;
  text: string;
}
export interface GrupoR {
  id: string;
  affiliationRef: string | null;
  organisation: string;
  role: string | null;
  location: string | null;
  bullets: BulletR[];
  stack: string[];
}
export interface Rascunho {
  headerRole: string | null;
  summary: string | null;
  sections: { title: (typeof SECOES)[number]; groups: GrupoR[] }[];
  /** The next free numbers for ids, so an added line never takes a removed one's id. */
  proximo: { grupo: number; bullet: number };
}

export function rascunhoDaEntrada(entrada: EntradaDaSelecao): Rascunho {
  let g = 0;
  let b = 0;
  const sections = entrada.sections.map((s) => ({
    title: s.title,
    groups: s.groups.map((grupo) => ({
      id: `g${++g}`,
      affiliationRef: grupo.affiliation_ref,
      organisation: grupo.organisation,
      role: grupo.role,
      location: grupo.location,
      bullets: grupo.bullets.map((x) => ({ id: `b${++b}`, source: x.source.trim(), text: x.text })),
      stack: grupo.stack,
    })),
  }));
  return { headerRole: entrada.header_role, summary: entrada.summary, sections, proximo: { grupo: g + 1, bullet: b + 1 } };
}

// ---- the rewrite's patches --------------------------------------------------

export const entradaDaReescrita = z.object({
  mudancas: z.array(
    z.object({
      acao: z
        .enum(['trocar', 'remover', 'adicionar', 'manter'])
        .describe(
          'trocar: new text for a line. remover: drop a line (a bullet, "summary", "header_role" or a whole group "g2"). adicionar: a new bullet in a group. manter: the line stays as it is, because the Corpus cannot fix it (say why).',
        ),
      id: z
        .string()
        .describe('The line (b3, g1.role, g1.organisation, g1.location, g1.stack, summary, header_role) or, for adicionar, the group (g1).'),
      source: z.string().nullable().describe('For adicionar: the record (ac5) the new bullet tells. Else null.'),
      texto: z
        .string()
        .nullable()
        .describe('For trocar and adicionar: the new text (for g1.stack, the technologies separated by commas). Else null.'),
      depois_de: z
        .string()
        .nullable()
        .describe('For adicionar: the bullet (b2) the new one goes after, or "inicio" to open the group; null for the end.'),
      motivo: z.string().nullable().describe('For manter: why the Corpus cannot fix it. Else null.'),
    }),
  ),
});
export type Mudanca = z.infer<typeof entradaDaReescrita>['mudancas'][number];

/** Every line id the draft has now. */
export function idsDoRascunho(r: Rascunho): Set<string> {
  const ids = new Set(['header_role', 'summary']);
  for (const g of r.sections.flatMap((s) => s.groups)) {
    for (const campo of ['organisation', 'role', 'location', 'stack']) ids.add(`${g.id}.${campo}`);
    ids.add(g.id);
    for (const b of g.bullets) ids.add(b.id);
  }
  return ids;
}

const clonar = (r: Rascunho): Rascunho => structuredClone(r);

/**
 * Applies the rewrite's patches. Returns the new draft, the ids of the lines
 * that changed (for the Critic to read again), the `manter` answers, and what
 * could not be applied (sent back to the model).
 */
export function aplicarMudancas(
  rascunho: Rascunho,
  mudancas: Mudanca[],
): { rascunho: Rascunho; alteradas: Set<string>; mantidas: Map<string, string>; erros: string[] } {
  const r = clonar(rascunho);
  const alteradas = new Set<string>();
  const mantidas = new Map<string, string>();
  const erros: string[] = [];
  const grupos = () => r.sections.flatMap((s) => s.groups);
  const grupo = (id: string) => grupos().find((g) => g.id === id);
  const doBullet = (id: string) => grupos().find((g) => g.bullets.some((b) => b.id === id));

  for (const m of mudancas) {
    const id = m.id.trim();
    const texto = m.texto?.trim() ?? '';
    if (m.acao === 'manter') {
      mantidas.set(id, m.motivo ?? '');
      continue;
    }
    if (m.acao === 'adicionar') {
      const g = grupo(id);
      if (!g) { erros.push(`adicionar: "${id}" is not a group.`); continue; }
      if (!m.source?.trim() || !texto) { erros.push(`adicionar em ${id}: needs source and texto.`); continue; }
      const novo = { id: `b${r.proximo.bullet++}`, source: m.source.trim(), text: texto };
      const posicao = m.depois_de === 'inicio' ? 0 : m.depois_de ? g.bullets.findIndex((b) => b.id === m.depois_de) + 1 : g.bullets.length;
      if (posicao === 0 && m.depois_de && m.depois_de !== 'inicio') { erros.push(`adicionar: "${m.depois_de}" is not a bullet of ${id}.`); continue; }
      g.bullets.splice(posicao, 0, novo);
      alteradas.add(novo.id);
      continue;
    }
    if (m.acao === 'remover') {
      if (id === 'summary') { r.summary = null; continue; }
      if (id === 'header_role') { r.headerRole = null; continue; }
      const g = grupo(id);
      if (g) {
        for (const s of r.sections) s.groups = s.groups.filter((x) => x.id !== id);
        r.sections = r.sections.filter((s) => s.groups.length > 0);
        continue;
      }
      const dono = doBullet(id);
      if (!dono) { erros.push(`remover: "${id}" is not a line.`); continue; }
      dono.bullets = dono.bullets.filter((b) => b.id !== id);
      continue;
    }
    // trocar
    if (!texto) { erros.push(`trocar ${id}: needs texto (use remover to drop a line).`); continue; }
    if (id === 'summary') { r.summary = texto; alteradas.add(id); continue; }
    if (id === 'header_role') { r.headerRole = texto; alteradas.add(id); continue; }
    const campo = /^(g\d+)\.(organisation|role|location|stack)$/.exec(id);
    if (campo) {
      const g = grupo(campo[1]);
      if (!g) { erros.push(`trocar: "${campo[1]}" is not a group.`); continue; }
      if (campo[2] === 'stack') g.stack = texto.replace(/\.$/, '').split(',').map((t) => t.trim()).filter(Boolean);
      else g[campo[2] as 'organisation' | 'role' | 'location'] = texto;
      alteradas.add(id);
      continue;
    }
    const dono = doBullet(id);
    const bullet = dono?.bullets.find((b) => b.id === id);
    if (!bullet) { erros.push(`trocar: "${id}" is not a line.`); continue; }
    bullet.text = texto;
    alteradas.add(id);
  }
  return { rascunho: r, alteradas, mantidas, erros };
}

// ---- the Selection ----------------------------------------------------------

const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mes = (yyyymm: string) => `${MESES[Number(yyyymm.slice(5, 7)) - 1]} ${yyyymm.slice(0, 4)}`;

/**
 * "Mar 2022 - Present" from the Affiliation. Without a confirmed month, the
 * safety net of step 10: the years the resume gave ("2019 - 2021"), never a
 * guessed month. A degree prints its year of conclusion ("2018", "Expected
 * 2027"). Nothing at all only when the resume gave no year either.
 */
export function periodoDaAffiliation(a: Corpus['affiliations'][number]): string | undefined {
  if (a.periodoInicio && a.periodoFim) return `${mes(a.periodoInicio)} - ${mes(a.periodoFim)}`;
  if (a.periodoInicio && a.periodoConfirmado) return `${mes(a.periodoInicio)} - Present`;
  if (ehFormacao(a) && a.anoConclusao) {
    return a.cursando ? `Expected ${a.anoConclusao}` : String(a.anoConclusao);
  }
  return anosDoImport(a.periodoOriginal);
}

/** "2019 - 2021", "2022 - Present" or "2023" from the period as the resume wrote it. */
function anosDoImport(original: string | null): string | undefined {
  const anos = original?.match(/\b(?:19|20)\d{2}\b/g);
  if (!anos) return undefined;
  const [inicio, fim] = [anos[0], anos.at(-1)!];
  if (/atual|present|hoje|momento/i.test(original!)) return `${inicio} - Present`;
  return inicio === fim ? inicio : `${inicio} - ${fim}`;
}

/** "linkedin.com/in/ada" from whatever the person typed. */
export function rotuloDoLink(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
}
export const urlDoLink = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/** Which draft line each place of the Selection is, so a violation finds its line. */
export type MapaDeLinhas = Map<string, string>;
export const chaveDe = (onde: Onde): string =>
  onde.tipo === 'entrada'
    ? `e:${onde.secao}:${onde.grupo}:${onde.entrada}`
    : onde.tipo === 'heading' || onde.tipo === 'grupo'
      ? `g:${onde.secao}:${onde.grupo}`
      : onde.tipo;

export function montarSelection(
  rascunho: Rascunho,
  dados: { cabecalho: Cabecalho; corpus: Corpus; refs: Refs },
): { selection: Selection; linhas: MapaDeLinhas } {
  const { cabecalho, corpus, refs } = dados;
  const linhas: MapaDeLinhas = new Map([
    ['cabecalho', 'header_role'],
    ['resumo', 'summary'],
    ['secoes', 'secoes'],
  ]);
  const idDe = (ref: string) => refs.registro(ref)?.id ?? ref;

  const sections: Selection['sections'] = rascunho.sections.map((s, i) => ({
    title: s.title,
    groups: s.groups.map((g, j) => {
      linhas.set(`g:${i}:${j}`, g.id);
      const registro = g.affiliationRef ? refs.registro(g.affiliationRef) : undefined;
      const affiliation = registro?.tipo === 'affiliation' ? corpus.affiliations.find((a) => a.id === registro.id) : undefined;
      const period = affiliation ? periodoDaAffiliation(affiliation) : undefined;
      const entries: Selection['sections'][number]['groups'][number]['entries'] = g.bullets.map((b, k) => {
        linhas.set(`e:${i}:${j}:${k}`, b.id);
        return { source: idDe(b.source), text: b.text };
      });
      if (g.stack.length && g.bullets.length) {
        linhas.set(`e:${i}:${j}:${entries.length}`, `${g.id}.stack`);
        entries.push({ source: idDe(g.bullets[0].source), label: STACK_LABEL, text: `${g.stack.join(', ')}.` });
      }
      return {
        heading: {
          organisation: g.organisation,
          ...(g.role ? { role: g.role } : {}),
          ...(g.location ? { location: g.location } : {}),
          ...(period ? { period } : {}),
        },
        entries,
      };
    }),
  }));

  const links = [cabecalho.linkedin, cabecalho.github].filter((l): l is string => Boolean(l?.trim()));
  const selection: Selection = {
    version: SELECTION_VERSION,
    language: 'en',
    targetRole: rascunho.headerRole ?? 'Software Engineer',
    header: {
      name: cabecalho.nome,
      ...(rascunho.headerRole ? { role: rascunho.headerRole } : {}),
      location: cabecalho.local,
      email: cabecalho.email,
      links: links.map((l) => ({ label: rotuloDoLink(l), url: urlDoLink(l) })),
    },
    ...(rascunho.summary ? { summary: rascunho.summary } : {}),
    sections,
  };
  return { selection, linhas };
}

/**
 * The résumé as text, every line with its id: what the Critic reads (it never
 * sees the Corpus) and what the rewrite edits. `fontes` adds each bullet's
 * record ref, for the rewrite.
 */
export function textoComIds(rascunho: Rascunho, selection: Selection, opcoes: { fontes?: boolean } = {}): string {
  const h = selection.header;
  const linhas = [
    h.name,
    `[header_role] ${rascunho.headerRole ?? '(none)'}`,
    [h.location, h.email, ...h.links.map((l) => l.label)].join(' · '),
    `[summary] ${rascunho.summary ?? '(none)'}`,
  ];
  rascunho.sections.forEach((s, i) => {
    linhas.push('', s.title.toUpperCase());
    s.groups.forEach((g, j) => {
      const period = selection.sections[i]?.groups[j]?.heading?.period;
      linhas.push(
        `[${g.id}.role] ${g.role ?? '(none)'}${period ? `  |  ${period}` : ''}`,
        `[${g.id}.organisation] ${g.organisation}${g.location ? `  |  [${g.id}.location] ${g.location}` : ''}${opcoes.fontes && g.affiliationRef ? `  (${g.affiliationRef})` : ''}`,
      );
      for (const b of g.bullets) linhas.push(`  [${b.id}]${opcoes.fontes ? ` (${b.source})` : ''} ${b.text}`);
      if (g.stack.length) linhas.push(`  [${g.id}.stack] ${STACK_LABEL}: ${g.stack.join(', ')}.`);
    });
  });
  return linhas.join('\n');
}
