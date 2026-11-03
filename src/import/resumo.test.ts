// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { fraseDoImport } from './resumo';

describe('fraseDoImport', () => {
  it('counts experiences and things done', () => {
    expect(fraseDoImport(3, 14)).toBe('Encontrei 3 experiências e 14 coisas que você fez.');
  });

  it('uses the singular for one', () => {
    expect(fraseDoImport(1, 1)).toBe('Encontrei 1 experiência e 1 coisa que você fez.');
  });

  it('says so when nothing came out', () => {
    expect(fraseDoImport(0, 0)).toMatch(/^Não encontrei/);
  });
});
