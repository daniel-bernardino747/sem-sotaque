// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { lerConfirmacao, lerVagaColada, MIN_TEXTO } from './entrada';

const form = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
};
const POSTING = 'We are hiring. '.repeat(Math.ceil(MIN_TEXTO / 15));

describe('lerVagaColada', () => {
  it('takes the posting, and turns blank optional fields into null', () => {
    expect(lerVagaColada(form({ texto: `  ${POSTING}  `, empresa: ' ', cargo: 'Backend', link: '' }))).toEqual({
      ok: true,
      dados: { texto: POSTING.trim(), empresa: null, cargo: 'Backend', link: null },
    });
  });

  it('refuses a title instead of a posting', () => {
    expect(lerVagaColada(form({ texto: 'Senior Backend Engineer' }))).toMatchObject({ ok: false });
  });

  it('accepts only a web address as the link', () => {
    expect(lerVagaColada(form({ texto: POSTING, link: 'https://vagas.exemplo.com/1' }))).toMatchObject({ ok: true });
    for (const link of ['javascript:alert(1)', 'vagas.exemplo.com', 'https://a b']) {
      expect(lerVagaColada(form({ texto: POSTING, link }))).toMatchObject({ ok: false });
    }
  });
});

describe('lerConfirmacao', () => {
  it('reads the company, the role and each marked gap', () => {
    const lido = lerConfirmacao(form({ empresa: 'Acme', cargo: '', 'lacuna-r1': 'ja_usei', 'lacuna-r2': 'nao_usei', 'lacuna-r3': 'talvez', outro: 'x' }));
    expect(lido).toEqual({
      ok: true,
      dados: { empresa: 'Acme', cargo: null, respostas: new Map([['r1', 'ja_usei'], ['r2', 'nao_usei']]) },
    });
  });
});
