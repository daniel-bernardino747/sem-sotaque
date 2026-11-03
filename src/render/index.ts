// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { z } from 'zod';

import { compileTexAsync, parseOrRefuse, RenderError } from './document.ts';
import { renderSelectionToTex, selectionSchema } from './resume.ts';

export { RenderError };
export { isTectonicAvailable, SELECTION_VERSION } from './resume.ts';
export type { Selection } from './resume.ts';

/**
 * The one entry point the app uses to turn a Selection into a résumé: compile it
 * with Tectonic, measure the PDF with `scripts/measure-resume.py`, and hand back
 * both. Everything happens in a fresh temp directory that is removed before this
 * returns, success or failure — a tester's résumé never stays on disk.
 */

const execFileAsync = promisify(execFile);

/**
 * What `measure-resume.py --json` reports about a rendered résumé. Parsed, not
 * cast: the script is another language's code, and a drift in its output should
 * fail here rather than reach the pipeline as a half-shaped object.
 */
const medidaSchema = z.strictObject({
  pages: z.number().int(),
  /** How far down page 1's usable area the text reaches, in percent. */
  fill: z.number(),
  /** Lines per bullet, per group that has bullets (stack lines excluded). */
  groups: z.array(
    z.strictObject({ section: z.string(), group: z.string(), lines: z.array(z.number().int()) }),
  ),
  orphans: z.array(z.strictObject({ group: z.string(), source: z.string(), line: z.string() })),
  /** Every page rule the résumé breaks; empty when it passes. */
  problems: z.array(z.string()),
});

export type Medida = z.infer<typeof medidaSchema>;

export interface RenderedResume {
  pdf: Buffer;
  medida: Medida;
}

/** `python3` in the image; `python` on Windows, where `python3` is a Store stub. */
const PYTHON = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');

/** Resolved from the working directory: the repo root in dev, `/app` in the image. */
const MEASURE_SCRIPT = join(process.cwd(), 'scripts', 'measure-resume.py');

/** The prefix of the temp directory each render works in and removes. */
export const RENDER_DIR_PREFIX = 'sem-sotaque-render-';

/** Whether Python with `pypdf` and `pdftotext` are installed — what the measure needs. */
export function isMeasureAvailable(): boolean {
  try {
    execFileSync(PYTHON, ['-c', 'import pypdf'], { stdio: 'ignore' });
    // `pdftotext -v` prints its version and exits 99, so only a spawn error
    // (the binary missing) counts as absent.
    return spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).error === undefined;
  } catch {
    return false;
  }
}

/**
 * Render a Selection to a PDF and measure it. Throws `RenderError` when the
 * Selection is malformed (before anything is written), when Tectonic fails, or
 * when the measure cannot run. A résumé that breaks the page rules is not an
 * error: the broken rules come back in `medida.problems`.
 */
export async function renderResume(input: unknown): Promise<RenderedResume> {
  const selection = parseOrRefuse(selectionSchema, input, 'Selection');
  const dir = mkdtempSync(join(tmpdir(), RENDER_DIR_PREFIX));

  try {
    // Compiled asynchronously: the server keeps answering other people while a
    // résumé renders in the background (`renderSelectionToPdf` blocks).
    const texPath = join(dir, 'resume.tex');
    const pdfPath = join(dir, 'resume.pdf');
    writeFileSync(texPath, renderSelectionToTex(selection), 'utf8');
    await compileTexAsync(texPath, dir);
    const selectionPath = join(dir, 'selection.json');
    writeFileSync(selectionPath, JSON.stringify(selection), 'utf8');

    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(
        PYTHON,
        [MEASURE_SCRIPT, selectionPath, pdfPath, '--json'],
        { encoding: 'utf8' },
      ));
    } catch (error) {
      throw new RenderError(
        `measure-resume.py failed on the rendered PDF. Check that Python 3 with pypdf and poppler's pdftotext are installed.`,
        { cause: error },
      );
    }

    const medida = parseOrRefuse(medidaSchema, JSON.parse(stdout), 'measure-resume.py output');
    return { pdf: readFileSync(pdfPath), medida };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
