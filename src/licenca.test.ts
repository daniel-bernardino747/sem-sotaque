// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every source file carries the license notice, as the AGPL recommends: the
 * copyright line and a pointer to the license (step 24, CONTRIBUTING.md).
 */
const RAIZ = resolve(__dirname, '..');
const COPYRIGHT = 'Copyright (C) 2026 DB Software Solutions LTDA';
const SPDX = 'SPDX-License-Identifier: AGPL-3.0-or-later';

// The image leaves out .git (.dockerignore): there, nothing to list.
const SEM_GIT = !existsSync(join(RAIZ, '.git'));

const fontes = SEM_GIT ? [] : execFileSync('git', ['ls-files', '*.ts', '*.tsx', '*.py', '*.css'], { cwd: RAIZ, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

describe.skipIf(SEM_GIT)('the license notice', () => {
  it('opens every source file', () => {
    const sem = fontes.filter((f) => {
      const inicio = readFileSync(join(RAIZ, f), 'utf8').split('\n').slice(0, 3).join('\n');
      return !inicio.includes(COPYRIGHT) || !inicio.includes(SPDX);
    });
    expect(sem).toEqual([]);
  });
});
