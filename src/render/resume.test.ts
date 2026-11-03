// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  isTectonicAvailable,
  RenderError,
  renderSelectionToPdf,
  renderSelectionToTex,
  SELECTION_VERSION,
} from './resume';

import sampleSelection from './__fixtures__/sample-selection.json';

/**
 * The render pipeline turns a Selection — structured data the model emits — into
 * a PDF through a fixed LaTeX template (ADR-0004 of `personal-website`).
 * These tests fix the pipeline's external behaviour: what a valid Selection
 * produces, and that a malformed one fails loudly rather than yielding a subtly
 * different document. They say nothing about how the `.tex` is assembled, beyond
 * the few structural choices the layout depends on.
 */
describe('renderSelectionToTex', () => {
  it('renders a valid Selection into a LaTeX document carrying its content', () => {
    const tex = renderSelectionToTex(sampleSelection);

    expect(tex).toContain('\\documentclass');
    expect(tex).toContain('\\begin{document}');
    expect(tex).toContain('\\end{document}');
    // Header identity and every section title and entry reach the document.
    expect(tex).toContain('Ada Fixture');
    expect(tex).toContain('Experience');
    expect(tex).toContain('Talks');
    expect(tex).toContain('cutting p95 latency from 800ms to 120ms');
  });

  it("retains the upstream template's Apache-2.0 notice in the generated document", () => {
    // The layout is a derivative of celiobjunior/resume-template; the licence
    // asks that the copyright notice travel with the work, and the `.tex` is
    // where a reader of the output can see it.
    const tex = renderSelectionToTex(sampleSelection);

    expect(tex).toContain('celiobjunior/resume-template');
    expect(tex).toContain('Apache License, Version 2.0');
  });

  it('makes the contact line clickable — a mailto for the address, an href per link', () => {
    const tex = renderSelectionToTex(sampleSelection);

    expect(tex).toContain('\\href{mailto:ada@example.com}{ada@example.com}');
    expect(tex).toContain('\\href{https://github.com/ada}{github.com/ada}');
    expect(tex).toContain('{\\textbullet}');
  });

  it('writes a group heading once, however many entries hang under it', () => {
    // The defect this level exists to prevent: three Accomplishments from one
    // employer, each carrying its own context line, rendered as three separate
    // jobs. Grouped, the employer is stated once and the bullets sit beneath it.
    const tex = renderSelectionToTex(sampleSelection);

    expect(tex.split('\\textit{Acme Corp')).toHaveLength(2); // one occurrence
    expect(tex).toContain('cutting p95 latency from 800ms to 120ms');
    expect(tex).toContain('migration of 40 endpoints');
    // One list per group with entries — Experience and Talks. Education's
    // heading-only group contributes none.
    expect(tex.split('begin{itemize}')).toHaveLength(3);
  });

  it('sets the heading in two lines, role first, each pushed apart with \\hfill', () => {
    // Role left / period right, then organisation left / location right. The
    // role leads because recruiters read job titles first. This is the layout the
    // structured heading exists to make possible — a pre-joined string could not
    // be split across the two lines.
    const tex = renderSelectionToTex(sampleSelection);

    expect(tex).toContain('\\textbf{Senior Software Engineer} \\hfill 2022 - 2024');
    expect(tex).toContain('\\textit{Acme Corp \\hfill Berlin (Remote)}');
    // hyperref needs a plain-text alternative for the PDF outline.
    expect(tex).toContain('\\texorpdfstring{');
    expect(tex).toContain('Senior Software Engineer -- Acme Corp');
  });

  it('puts the organisation in the title when a heading has no role', () => {
    const noRole = {
      ...sampleSelection,
      sections: [
        {
          title: 'Projects',
          groups: [
            {
              heading: { organisation: 'Side Project', period: '2024' },
              entries: [{ source: 'x', text: 'Did a thing.' }],
            },
          ],
        },
      ],
    };

    const tex = renderSelectionToTex(noRole);
    expect(tex).toContain('\\textbf{Side Project} \\hfill 2024');
    expect(tex).not.toContain('\\textit{Side Project');
  });

  it('turns off the typographic ligatures, so "fi" and "fl" extract as letters', () => {
    // Set as one glyph, "Cloudflare" extracts as "Cloudﬂare" and an ATS
    // searching for the keyword misses it.
    const tex = renderSelectionToTex(sampleSelection);

    expect(tex).toContain('\\usepackage{fontspec}');
    expect(tex).toContain('Ligatures={TeX, NoCommon}');
    expect(tex).not.toContain('{fontenc}');
  });

  it('renders a heading-only group as a context line with no list', () => {
    // A degree under Education has no bullets. An empty `itemize` is a LaTeX
    // error, so the list must be omitted entirely rather than left empty.
    const tex = renderSelectionToTex(sampleSelection);

    expect(tex).toContain('\\textbf{Web Fullstack Development} \\hfill');
    expect(tex).toContain('\\textit{Driven Education \\hfill Remote}');
    expect(tex).not.toContain('\\begin{itemize}\n        \\end{itemize}');
  });

  it('renders an entry label as a bold lead-in', () => {
    const tex = renderSelectionToTex(sampleSelection);

    expect(tex).toContain('\\textbf{Tech stack:} Node.js, PostgreSQL');
  });

  it('keeps the source reference out of the rendered document — it is an audit field, not resume content', () => {
    // Per ADR-0004 the Selection is the audit surface: `source` ties each entry
    // back to its Corpus file for review, but a résumé must not print internal ids.
    const tex = renderSelectionToTex(sampleSelection);
    expect(tex).not.toContain('caching-layer');
    expect(tex).not.toContain('api-migration');
  });

  it('escapes LaTeX special characters so authored prose cannot break or malform the document', () => {
    const withSpecials = {
      ...sampleSelection,
      sections: [
        {
          title: 'R&D',
          groups: [
            {
              entries: [
                {
                  source: 'specials',
                  text: 'Cut cost by 50% & saved $3k; tuned a_b tests #1 with ~10% lift ^2 {scope}.',
                },
              ],
            },
          ],
        },
      ],
    };

    const tex = renderSelectionToTex(withSpecials);

    // The escaped forms are present…
    expect(tex).toContain('50\\%');
    expect(tex).toContain('\\&');
    expect(tex).toContain('\\$3k');
    expect(tex).toContain('a\\_b');
    expect(tex).toContain('\\#1');
    // …and no raw special survives in the body that would derail the compile.
    const body = tex.slice(tex.indexOf('\\begin{document}'));
    expect(body).not.toMatch(/[^\\]&/); // no unescaped ampersand
    expect(body).not.toMatch(/[^\\]%[^\s]/); // no unescaped percent starting a comment
  });

  it('rewrites typographic punctuation the template fonts cannot set', () => {
    // The silent failure this guards against: XeTeX reads the em dash fine, but
    // the T1 `ec-*` fonts have no glyph for it, so it vanishes from the PDF with
    // a warning and no error — a hole in the middle of a sentence nobody sees
    // until the résumé is already sent.
    const withPunctuation = {
      ...sampleSelection,
      summary: 'Shipped 9 of 10 modules — “on time” — and the rest… 1 → 2.',
      sections: [
        {
          title: 'Experience',
          groups: [
            {
              heading: { organisation: 'Acme Corp', period: '2022–2024' },
              entries: [{ source: 'x', text: 'Cut latency — by half.' }],
            },
          ],
        },
      ],
    };

    const tex = renderSelectionToTex(withPunctuation);

    expect(tex).toContain('Shipped 9 of 10 modules --- ``on time\'\' --- and the rest\\ldots{}');
    expect(tex).toContain('1 $\\rightarrow$ 2');
    expect(tex).toContain('Cut latency --- by half.');
    expect(tex).toContain('2022--2024');
    // No raw typographic punctuation survives into the document.
    expect(tex).not.toMatch(/[—–“”‘’…·•→×]/);
  });

  it('escapes a heading, which is authored prose like any other', () => {
    const withSpecials = {
      ...sampleSelection,
      sections: [
        {
          title: 'Experience',
          groups: [
            {
              heading: { organisation: 'Ben & Co', role: 'R&D Lead' },
              entries: [{ source: 'x', text: 'Did a thing.' }],
            },
          ],
        },
      ],
    };

    const tex = renderSelectionToTex(withSpecials);
    expect(tex).toContain('\\textbf{R\\&D Lead}');
    expect(tex).toContain('\\textit{Ben \\& Co}');
  });
});

describe('a Selection that departs from the expected shape', () => {
  it('throws rather than rendering when a required field is missing', () => {
    const { header, ...noHeader } = sampleSelection;
    expect(() => renderSelectionToTex(noHeader)).toThrow(RenderError);
  });

  it('throws when the Selection has no sections', () => {
    expect(() =>
      renderSelectionToTex({ ...sampleSelection, sections: [] }),
    ).toThrow(RenderError);
  });

  it('throws when an entry carries no source reference', () => {
    const noSource = {
      ...sampleSelection,
      sections: [
        {
          title: 'Experience',
          groups: [{ entries: [{ text: 'Did a thing.' }] }],
        },
      ],
    };
    expect(() => renderSelectionToTex(noSource)).toThrow(RenderError);
  });

  it('throws when a group has neither a heading nor entries', () => {
    // Such a group renders nothing at all — a silently dropped section is worse
    // than a refused Selection.
    expect(() =>
      renderSelectionToTex({
        ...sampleSelection,
        sections: [{ title: 'Experience', groups: [{}] }],
      }),
    ).toThrow(RenderError);
  });

  it('throws when a heading is a pre-joined string instead of its parts', () => {
    // The version-2 shape. It cannot be split back into organisation, location,
    // role and period, so it is refused rather than guessed at.
    expect(() =>
      renderSelectionToTex({
        ...sampleSelection,
        sections: [
          {
            title: 'Experience',
            groups: [
              {
                heading: 'Acme Corp · Senior Software Engineer · 2022–2024',
                entries: [{ source: 'x', text: 'Did a thing.' }],
              },
            ],
          },
        ],
      }),
    ).toThrow(RenderError);
  });

  it('throws when a heading names no organisation', () => {
    expect(() =>
      renderSelectionToTex({
        ...sampleSelection,
        sections: [
          {
            title: 'Experience',
            groups: [
              {
                heading: { role: 'Engineer', period: '2024' },
                entries: [{ source: 'x', text: 'Did a thing.' }],
              },
            ],
          },
        ],
      }),
    ).toThrow(RenderError);
  });

  it('throws when a section carries entries directly instead of groups', () => {
    // The pre-grouping shape: bullets hanging off the section with no group to
    // share a context line. It rendered one employer as several separate jobs,
    // so it is refused rather than silently rendered.
    const ungrouped = {
      ...sampleSelection,
      sections: [
        {
          title: 'Experience',
          entries: [{ source: 'caching-layer', text: 'Did a thing.' }],
        },
      ],
    };
    expect(() => renderSelectionToTex(ungrouped)).toThrow(RenderError);
  });

  it('throws when the Selection version does not match the template version', () => {
    expect(() =>
      renderSelectionToTex({ ...sampleSelection, version: SELECTION_VERSION + 1 }),
    ).toThrow(RenderError);
  });

  it('throws on an unknown top-level field, so a drifting generator is caught', () => {
    expect(() =>
      renderSelectionToTex({ ...sampleSelection, extraneous: true }),
    ).toThrow(RenderError);
  });
});

/**
 * The single smoke check the spec asks for: a fixture Selection passes through
 * the template and Tectonic and yields a non-trivial PDF. Typography is not
 * asserted — the failure this guards against is drift between the Selection shape
 * and the template's expectations. Skipped when Tectonic is not installed so the
 * suite stays green on machines without it; CI/dev must install it (see the
 * ticket prerequisite).
 */
describe('the render pipeline', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'resume-render-'));
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it.skipIf(!isTectonicAvailable())(
    'renders a fixture Selection to a non-trivial PDF via Tectonic',
    () => {
      const { pdfPath } = renderSelectionToPdf(sampleSelection, {
        outDir,
        name: 'smoke',
      });

      const bytes = statSync(pdfPath).size;
      expect(bytes).toBeGreaterThan(1000);
      // A PDF starts with the "%PDF" magic — proves we produced a real document,
      // not an empty or truncated file.
      const head = readFileSync(pdfPath).subarray(0, 4).toString('latin1');
      expect(head).toBe('%PDF');
    },
    120_000,
  );
});
