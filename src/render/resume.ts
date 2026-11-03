// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import {
  buildHeader,
  compileTex,
  escapeLatex,
  escapePdfString,
  FONT_PREAMBLE,
  headerSchema,
  LANGUAGE_BABEL,
  parseOrRefuse,
  slugify,
} from './document.ts';

export { isTectonicAvailable, RenderError } from './document.ts';

/**
 * The render pipeline: a Selection — structured data the generation skill emits —
 * becomes a PDF through a fixed, versioned LaTeX template. The model never writes
 * LaTeX (ADR-0004 of `personal-website`):
 * standardisation is structural, so a Selection that departs from the expected
 * shape fails to render here rather than producing a subtly different document.
 *
 * The layout is derived from Celio B Junior's resume-template
 * (https://github.com/celiobjunior/resume-template), Apache-2.0. Its notice is
 * reproduced in every document this module emits, which is what that licence
 * asks of a derivative work.
 *
 * This module is deliberately self-contained — it depends on the Selection alone,
 * never on the Corpus loader — so it stays testable with a fixture Selection and
 * runnable from a plain Node script (see `scripts/render-fixture.ts`).
 */

/**
 * The template version. A Selection must declare the same number; a mismatch is
 * refused rather than rendered, so a Selection authored against an old template
 * cannot silently produce a malformed résumé. Bump this whenever the template's
 * expectations of the Selection change.
 *
 * 3 — the group heading became structured (`organisation` / `location` / `role` /
 * `period`) so the template can set organisation and location on one line and
 * role and period on the next, each pair pushed apart with `\hfill`. A version-2
 * Selection carried all of that as one pre-joined string, which cannot be split
 * back apart, so it is refused rather than guessed at.
 */
export const SELECTION_VERSION = 3;

/**
 * One résumé line: the model-compressed statement plus `source` — the id of the
 * Corpus file it came from. `source` is the audit trail (ADR-0003 of `personal-website`):
 * it ties every claim back to what Daniel actually wrote and is never printed on
 * the résumé itself.
 *
 * `label` is an optional bold lead-in for a line that is a labelled list rather
 * than a claim — "Tech stack: Next.js, Prisma, Zod." It renders as
 * `\textbf{label:}` ahead of the text.
 */
const entrySchema = z.strictObject({
  source: z.string().min(1),
  label: z.string().min(1).optional(),
  text: z.string().min(1),
});

/**
 * A group's context line, kept in parts rather than pre-joined. The template sets
 * `role` bold on the left of its line with `period` flush right, then
 * `organisation` and `location` the same way on the line beneath — a layout that needs the
 * four values separately. A single pre-joined string could not be split back into
 * them, which is why version 3 refuses one.
 *
 * Only `organisation` is required: a personal project has no location, and a
 * degree may have no role.
 */
const headingSchema = z.strictObject({
  organisation: z.string().min(1),
  location: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  period: z.string().min(1).optional(),
});

type Heading = z.infer<typeof headingSchema>;

/**
 * The bullets that share one context line — an employer, a client, a project.
 * The Corpus stores each Accomplishment on its own, carrying its own affiliation,
 * so three things done at one employer arrive as three unrelated records; without
 * this level they render as three separate-looking jobs. The group is where the
 * Selection states that they belong together: `heading` is written once and its
 * `entries` sit beneath it.
 *
 * A group with no `heading` is a bare list of bullets — right for a section whose
 * lines need no attribution. A group with a `heading` and no `entries` is a
 * context line standing alone — how a degree appears under Education. A group
 * with neither says nothing at all, and is refused.
 */
const groupSchema = z
  .strictObject({
    heading: headingSchema.optional(),
    entries: z.array(entrySchema).default([]),
  })
  .refine((group) => group.heading !== undefined || group.entries.length > 0, {
    message:
      'a group needs a heading, entries, or both — an empty group renders nothing',
  });

const sectionSchema = z.strictObject({
  title: z.string().min(1),
  groups: z.array(groupSchema).min(1),
});

/**
 * The whole contract between the model and the template. Strict throughout: an
 * unknown or missing field is rejected, which is the mechanism ADR-0004 relies on
 * — an output that departs from the format does not compile.
 */
export const selectionSchema = z.strictObject({
  version: z.literal(SELECTION_VERSION),
  language: z.enum(['en', 'pt']).default('en'),
  targetRole: z.string().min(1),
  header: headerSchema,
  summary: z.string().min(1).optional(),
  sections: z.array(sectionSchema).min(1),
});

export type Selection = z.infer<typeof selectionSchema>;

/** The paths a render produced. */
export interface RenderResult {
  texPath: string;
  pdfPath: string;
}

/**
 * The upstream template's licence notice, carried into every generated document.
 * Apache-2.0 asks a derivative work to retain the copyright notice and a pointer
 * to the licence; the `.tex` is where a reader of the output can see it.
 */
const TEMPLATE_NOTICE = [
  '% Resume layout derived from https://github.com/celiobjunior/resume-template',
  '% Copyright (c) 2025 Celio B Junior. Licensed under the Apache License, Version 2.0.',
  '% You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0',
  '%',
  '% Generated by src/render/resume.ts from a Selection - do not edit by hand.',
];

/** Validate arbitrary input against the Selection schema, or throw `RenderError`. */
function parseSelection(input: unknown): Selection {
  return parseOrRefuse(selectionSchema, input, 'Selection');
}

/** The preamble: page setup, PDF metadata, and the ruled section heading. */
function buildPreamble(selection: Selection): string[] {
  const { header, language } = selection;
  const pdfName = escapePdfString(header.name);

  return [
    ...TEMPLATE_NOTICE,
    '',
    '\\documentclass[a4paper,10pt]{article}',
    '',
    ...FONT_PREAMBLE,
    `\\usepackage[${LANGUAGE_BABEL[language]}]{babel}`,
    '\\usepackage{geometry}',
    '\\usepackage{parskip}',
    '\\usepackage{hyperref}',
    '\\usepackage{titlesec}',
    '',
    '\\geometry{top=1.0cm, bottom=1.0cm, left=1.0cm, right=1.0cm}',
    '\\pagestyle{empty}',
    '',
    '\\hypersetup{',
    `    pdftitle={CV - ${pdfName}},`,
    `    pdfauthor={${pdfName}},`,
    '    colorlinks=true,',
    '    linkcolor=black,',
    '    urlcolor=black,',
    '    citecolor=black,',
    '    bookmarksdepth=1',
    '}',
    '',
    '\\setcounter{secnumdepth}{0}',
    '',
    '\\titleformat{\\section}',
    '{\\Large\\bfseries}',
    '{}',
    '{0em}',
    '{}',
    '[\\titlerule\\vspace{0.5ex}]',
    '',
  ];
}

/**
 * A group's context line. `role` sits bold on the left with `period` pushed
 * flush right, and `organisation` and `location` do the same, in italics, on the
 * line beneath. The role leads because it is what a recruiter reads first: in
 * Ladders' 2018 eye-tracking study, job titles held more attention than any
 * other element of a résumé. With no role, the organisation takes its place.
 *
 * `\hfill` and `\textbf` mean nothing in a PDF bookmark, so `\texorpdfstring`
 * supplies a plain-text alternative — without it hyperref warns and the outline
 * entry comes out mangled.
 */
function buildHeading(heading: Heading): string[] {
  const organisation = escapeLatex(heading.organisation);
  const role = heading.role !== undefined ? escapeLatex(heading.role) : undefined;
  const location =
    heading.location !== undefined ? escapeLatex(heading.location) : undefined;
  const period =
    heading.period !== undefined ? escapeLatex(heading.period) : undefined;

  const title = role ?? organisation;
  const typeset =
    period !== undefined
      ? `\\textbf{${title}} \\hfill ${period}`
      : `\\textbf{${title}}`;
  const bookmark = role !== undefined ? `${role} -- ${organisation}` : organisation;

  const lines = [
    '    \\subsection*{\\texorpdfstring{',
    `            ${typeset}`,
    '        }{',
    `            ${bookmark}`,
    '        }}',
  ];

  // The line beneath: the organisation when the role took the title, and the
  // location flush right whenever there is one.
  const left = role !== undefined ? organisation : undefined;
  if (left !== undefined && location !== undefined) {
    lines.push(`    \\textit{${left} \\hfill ${location}}`);
  } else if (left !== undefined) {
    lines.push(`    \\textit{${left}}`);
  } else if (location !== undefined) {
    lines.push(`    \\textit{\\hfill ${location}}`);
  }

  return lines;
}

/** Assemble the LaTeX document for a validated Selection. */
function buildTex(selection: Selection): string {
  const { summary, sections } = selection;
  const lines: string[] = [
    ...buildPreamble(selection),
    '\\begin{document}',
    '',
    ...buildHeader(selection.header),
    '',
  ];

  if (summary !== undefined) {
    lines.push(escapeLatex(summary), '');
  }

  for (const section of sections) {
    lines.push(`\\section{${escapeLatex(section.title)}}`);
    for (const group of section.groups) {
      if (group.heading !== undefined) {
        lines.push(...buildHeading(group.heading));
      }
      // A heading-only group — a degree with no bullets — emits no list at all:
      // an empty itemize is a LaTeX error, not an empty space.
      if (group.entries.length > 0) {
        lines.push('        \\begin{itemize}');
        for (const entry of group.entries) {
          const text = escapeLatex(entry.text);
          const body =
            entry.label !== undefined
              ? `\\textbf{${escapeLatex(entry.label)}:} ${text}`
              : text;
          lines.push(`            \\item ${body}`);
        }
        lines.push('        \\end{itemize}');
      }
    }
    lines.push('');
  }

  lines.push('\\end{document}');
  return `${lines.join('\n')}\n`;
}

/**
 * Render a Selection to a LaTeX document string. Throws `RenderError` if the
 * Selection does not match the schema — the point where a malformed Selection is
 * refused rather than turned into a broken document.
 */
export function renderSelectionToTex(input: unknown): string {
  return buildTex(parseSelection(input));
}

/**
 * Render a Selection to a PDF via Tectonic, writing both the `.tex` and the
 * `.pdf` into `outDir`. Validates the Selection first, so a malformed one fails
 * before any file is written. Throws `RenderError` when Tectonic is missing or
 * the compile fails.
 */
export function renderSelectionToPdf(
  input: unknown,
  options: { outDir: string; name?: string },
): RenderResult {
  const selection = parseSelection(input);
  const tex = buildTex(selection);
  const name = options.name ?? slugify(selection.targetRole, 'resume');

  mkdirSync(options.outDir, { recursive: true });
  const texPath = join(options.outDir, `${name}.tex`);
  const pdfPath = join(options.outDir, `${name}.pdf`);
  writeFileSync(texPath, tex, 'utf8');

  compileTex(texPath, options.outDir);

  return { texPath, pdfPath };
}
