// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

/**
 * What the résumé and the cover letter share: the identity header they both open
 * with, the escaping that keeps authored prose from breaking LaTeX, and the
 * Tectonic compile. Each document keeps its own schema and body in its own module
 * (`resume.ts`, `letter.ts`); this one holds only what must stay identical so the
 * two read as a pair.
 */

/**
 * Thrown when a document cannot be rendered — because its input does not match
 * the schema, or because Tectonic is absent or failed. Distinct from the loader's
 * `CorpusError`: this concerns generated output, never the Corpus.
 */
export class RenderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RenderError';
  }
}

const linkSchema = z.strictObject({
  label: z.string().min(1),
  url: z.string().min(1),
});

/**
 * The identity header. `role` is optional: the reference template names the
 * person and their contact details only, but a document tailored to one posting
 * often wants a headline under the name, so it renders when present and is
 * omitted otherwise.
 */
export const headerSchema = z.strictObject({
  name: z.string().min(1),
  role: z.string().min(1).optional(),
  location: z.string().min(1),
  email: z.string().min(1),
  links: z.array(linkSchema).default([]),
});

export type Header = z.infer<typeof headerSchema>;

/** babel's language name per document language, for correct hyphenation. */
export const LANGUAGE_BABEL = {
  en: 'english',
  pt: 'portuguese',
} as const;

export type Language = keyof typeof LANGUAGE_BABEL;

/**
 * The font setup both documents load in place of `inputenc` + `fontenc` T1: the
 * same Latin Modern the template always used, through `fontspec` so its features
 * can be chosen. `NoCommon` turns off the typographic ligatures. With them on,
 * "fi", "fl" and "ff" are each set as one glyph and come out of text extraction
 * as U+FB01 and friends: "Cloudﬂare" and "ﬁeld" no longer match "Cloudflare"
 * and "field", which is what an ATS searches for. `TeX` keeps the input
 * ligatures, so `---` and ``` `` ``` still become a dash and a quote.
 */
export const FONT_PREAMBLE = [
  '\\usepackage{fontspec}',
  '\\setmainfont{lmroman10}[Extension=.otf, UprightFont=*-regular, BoldFont=*-bold, ItalicFont=*-italic, BoldItalicFont=*-bolditalic, Ligatures={TeX, NoCommon}]',
];

const execFileAsync = promisify(execFile);

/** LaTeX's special characters, mapped to their escaped forms. */
const LATEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '%': '\\%',
  _: '\\_',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};

/**
 * Typographic punctuation, mapped to a form the template's fonts can actually
 * set. Under the old `fontenc` T1 setup an em dash, a curly quote or an
 * ellipsis was dropped from the output with a warning and no error, leaving a
 * silent hole in the document. The OpenType fonts of `FONT_PREAMBLE` would set
 * most of them, but rewriting them to LaTeX's own forms (which the `TeX`
 * ligatures turn back into the character) keeps the output independent of
 * which glyphs a font happens to carry.
 */
const UNICODE_PUNCTUATION: Record<string, string> = {
  '—': '---', // em dash
  '–': '--', // en dash
  '−': '-', // minus sign
  '‑': '-', // non-breaking hyphen
  '“': '``', // left double quote
  '”': "''", // right double quote
  '‘': '`', // left single quote
  '’': "'", // right single quote
  '…': '\\ldots{}',
  ' ': '~', // no-break space
  ' ': '~', // narrow no-break space
  '·': '$\\cdot$',
  '•': '$\\bullet$',
  '→': '$\\rightarrow$',
  '×': '$\\times$',
  '≤': '$\\leq$',
  '≥': '$\\geq$',
};

const UNICODE_PUNCTUATION_PATTERN = new RegExp(
  `[${Object.keys(UNICODE_PUNCTUATION).join('')}]`,
  'g',
);

/**
 * Escape LaTeX special characters in authored prose, then rewrite typographic
 * punctuation the template's fonts cannot set.
 *
 * Two passes, in this order. The first is a single pass over the original string
 * — the replacements themselves contain braces and backslashes, but those are
 * never rescanned — so no character is double-escaped. The second matches only
 * the Unicode punctuation above, which the first pass never emits, so the
 * backslashes it introduces are left alone.
 */
export function escapeLatex(text: string): string {
  return text
    .replace(/[\\{}$&#%_~^]/g, (char) => LATEX_ESCAPES[char])
    .replace(UNICODE_PUNCTUATION_PATTERN, (char) => UNICODE_PUNCTUATION[char]);
}

/**
 * Escape the characters that break a URL inside `\href`. Narrower than
 * `escapeLatex` because a URL is not prose: `%` and `#` are escaped, and a stray
 * backslash — which has no valid place in an http(s) URL and would otherwise
 * start a LaTeX control sequence — is rewritten to `/` rather than escaped. Every
 * other character is legal in a link target.
 */
export function escapeUrl(url: string): string {
  return url.replace(/[%#\\]/g, (char) => (char === '\\' ? '/' : `\\${char}`));
}

/**
 * Strip the characters that would break a `\hypersetup` value. Those fields are
 * brace-delimited, so an unbalanced brace in a name derails the preamble before
 * any content is typeset.
 */
export function escapePdfString(text: string): string {
  return text.replace(/[\\{}]/g, '');
}

/** Validate input against a schema, or throw `RenderError` naming each bad field. */
export function parseOrRefuse<T>(
  schema: z.ZodType<T>,
  input: unknown,
  what: string,
): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new RenderError(`${what} does not match the expected shape — ${issues}`, {
      cause: result.error,
    });
  }
  return result.data;
}

/** The centred identity block: name, optional headline, then the contact line. */
export function buildHeader(header: Header): string[] {
  const lines = [
    '\\begin{center}',
    `    {\\LARGE \\textbf{${escapeLatex(header.name)}}}`,
    '    \\\\ [0.1cm]',
  ];

  if (header.role !== undefined) {
    lines.push(`    {\\large ${escapeLatex(header.role)}}`, '    \\\\ [0.1cm]');
  }

  // Location, email and each profile link, separated by bullets. The email is a
  // mailto link so the address is clickable in the PDF, not merely legible, and
  // carries no "Email:" label: an address needs none (Daniel's rule).
  const contact = [
    `    ${escapeLatex(header.location)}`,
    `    \\href{mailto:${escapeUrl(header.email)}}{${escapeLatex(header.email)}}`,
    ...header.links.map(
      (link) => `    \\href{${escapeUrl(link.url)}}{${escapeLatex(link.label)}}`,
    ),
  ];
  lines.push(contact.join('\n    {\\textbullet}\n'));
  lines.push('\\end{center}');
  return lines;
}

/** Whether the Tectonic binary is installed and callable. */
export function isTectonicAvailable(): boolean {
  try {
    execFileSync('tectonic', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Compile a written `.tex` into a PDF beside it, or throw `RenderError`. */
export function compileTex(texPath: string, outDir: string): void {
  if (!isTectonicAvailable()) {
    throw new RenderError(
      'Tectonic is not installed or not on PATH. Install it (e.g. `scoop install tectonic`) — it is a prerequisite for rendering.',
    );
  }

  try {
    execFileSync('tectonic', [texPath, '--outdir', outDir, '--chatter', 'minimal'], {
      stdio: 'pipe',
    });
  } catch (error) {
    throw new RenderError(
      `Tectonic failed to compile ${texPath}. The input and template may have drifted, or a LaTeX package could not be fetched.`,
      { cause: error },
    );
  }
}

/**
 * `compileTex` without blocking the event loop: the server renders résumés in
 * the background while it keeps answering other people.
 */
export async function compileTexAsync(texPath: string, outDir: string): Promise<void> {
  if (!isTectonicAvailable()) {
    throw new RenderError(
      'Tectonic is not installed or not on PATH. Install it (e.g. `scoop install tectonic`) — it is a prerequisite for rendering.',
    );
  }
  try {
    await execFileAsync('tectonic', [texPath, '--outdir', outDir, '--chatter', 'minimal']);
  } catch (error) {
    throw new RenderError(
      `Tectonic failed to compile ${texPath}. The input and template may have drifted, or a LaTeX package could not be fetched.`,
      { cause: error },
    );
  }
}

export function slugify(value: string, fallback: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  );
}
