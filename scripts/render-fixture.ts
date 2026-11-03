// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Render the fixture Selection through the whole pipeline and print its measure.
 *
 *     npm run render:fixture [-- --out <file.pdf>]
 *
 * Proves the toolchain end to end (Tectonic, pdftotext, pypdf) wherever it runs:
 * the Dockerfile runs it at build time to warm Tectonic's cache. The PDF is only
 * written when `--out` asks for it.
 */
import { writeFileSync } from 'node:fs';

import { renderResume } from '../src/render/index.ts';
import sampleSelection from '../src/render/__fixtures__/sample-selection.json' with { type: 'json' };

const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : undefined;

const started = performance.now();
const { pdf, medida } = await renderResume(sampleSelection);
const seconds = (performance.now() - started) / 1000;

if (out !== undefined) writeFileSync(out, pdf);
console.log(JSON.stringify({ seconds: Number(seconds.toFixed(2)), bytes: pdf.length, medida }, null, 2));
