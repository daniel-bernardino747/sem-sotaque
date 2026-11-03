// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { lerCabecalho } from './cabecalho';

const form = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ nome: 'Ana Inventada', email: 'ana@example.com', linkedin: 'linkedin.com/in/ana', github: '', local: 'Recife, Brazil', ...campos })) f.set(k, v);
  return f;
};

describe('lerCabecalho', () => {
  it('reads a complete header, GitHub optional, and turns a bare username into a link', () => {
    expect(lerCabecalho(form({}))).toEqual({
      ok: true,
      cabecalho: { nome: 'Ana Inventada', email: 'ana@example.com', linkedin: 'linkedin.com/in/ana', github: null, local: 'Recife, Brazil' },
    });
    expect(lerCabecalho(form({ github: '@ana-dev' }))).toMatchObject({ ok: true, cabecalho: { github: 'github.com/ana-dev' } });
  });

  it('says what is wrong, in Portuguese', () => {
    expect(lerCabecalho(form({ email: 'ana' }))).toEqual({ ok: false, erro: 'Esse e-mail não parece certo.' });
    expect(lerCabecalho(form({ linkedin: 'ana' }))).toMatchObject({ ok: false });
    expect(lerCabecalho(form({ local: 'Recife' }))).toMatchObject({ ok: false });
    expect(lerCabecalho(form({ local: 'Recife, Brazil (remoto)' }))).toMatchObject({ ok: false });
    expect(lerCabecalho(form({ github: 'https://gitlab.com/x/y' }))).toMatchObject({ ok: false });
  });
});
