// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The documentation is part of the open code (step 24): a contributor follows
 * the steps by their links, so none of them may lead nowhere.
 */
const RAIZ = resolve(__dirname, '..');

// The image leaves out .git (.dockerignore): there, nothing to list.
const SEM_GIT = !existsSync(join(RAIZ, '.git'));

const markdowns = SEM_GIT ? [] : execFileSync('git', ['ls-files', '*.md'], { cwd: RAIZ, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && existsSync(join(RAIZ, f)));

/** The relative targets of the Markdown links, `[x](alvo#ancora)`, outside code. */
function alvos(texto: string): string[] {
  const semCodigo = texto.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  return [...semCodigo.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1].split('#')[0])
    .filter((alvo) => alvo && !/^[a-z]+:/i.test(alvo));
}

describe.skipIf(SEM_GIT)('the documentation', () => {
  it('has no dead relative link', async () => {
    const mortos: string[] = [];
    for (const arquivo of markdowns) {
      const texto = await readFile(join(RAIZ, arquivo), 'utf8');
      for (const alvo of alvos(texto)) {
        if (!existsSync(resolve(RAIZ, dirname(arquivo), decodeURIComponent(alvo)))) mortos.push(`${arquivo} → ${alvo}`);
      }
    }
    expect(mortos).toEqual([]);
  });
});
