// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Typesets a plain-text resume fixture as a PDF with Tectonic, for the test
 * that pasting the text and uploading the PDF reach the same result.
 *
 *   npx tsx scripts/pdf-de-fixture.ts src/llm/__fixtures__/pleno.txt
 *
 * Writes the PDF beside the .txt. Only for invented fixtures: a tester's PDF
 * never goes to git.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const entrada = process.argv[2];
if (!entrada?.endsWith('.txt')) throw new Error('usage: pdf-de-fixture.ts <fixture.txt>');

const escapar = (s: string) => s.replace(/[\\&%#_$^~{}]/g, (c) => `\\${c}`);
const linhas = readFileSync(entrada, 'utf8')
  .split(/\r?\n/)
  .map((l) => (l.trim() ? `\\noindent ${escapar(l)}\\par` : '\\medskip'));

const tex = [
  '\\documentclass[11pt]{article}',
  '\\usepackage{fontspec}',
  '\\usepackage[margin=2cm]{geometry}',
  '\\pagestyle{empty}',
  '\\begin{document}',
  ...linhas,
  '\\end{document}',
].join('\n');

const dir = mkdtempSync(join(tmpdir(), 'sem-sotaque-fixture-'));
try {
  writeFileSync(join(dir, 'fixture.tex'), tex);
  execFileSync('tectonic', ['fixture.tex'], { cwd: dir, stdio: 'inherit' });
  const saida = entrada.replace(/\.txt$/, '.pdf');
  renameSync(join(dir, 'fixture.pdf'), saida);
  console.log(`wrote ${saida} from ${basename(entrada)}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
