// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { ESTADOS_SESSAO } from '@/db/schema';

import { antesDaCasa } from './tela';

describe('antesDaCasa', () => {
  const v2 = { textoConsentimentoVersao: 'v2', recusouAvaliadorEm: null };

  it('asks for consent first, and nothing else once it is given: the rest is decided by route', () => {
    expect(Object.fromEntries(ESTADOS_SESSAO.map((e) => [e, antesDaCasa({ estado: e, ...v2 })]))).toEqual({
      novo: 'consentimento',
      consentiu: null,
      importou: null,
      interrogando: null,
      gerando: null,
      pronto: null,
      encerrado: null,
    });
  });

  it('shows consent v2 again to a v1 session in the middle of the interrogation, once', () => {
    const v1 = { estado: 'interrogando' as const, textoConsentimentoVersao: 'v1', recusouAvaliadorEm: null };
    expect(antesDaCasa(v1)).toBe('reconsentimento');
    expect(antesDaCasa({ ...v1, recusouAvaliadorEm: new Date() })).toBeNull();
    expect(antesDaCasa({ ...v1, estado: 'gerando' })).toBeNull();
  });
});
