// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const { Apagado } = await import('./apagado');
const { avisoDeApagar } = await import('./apagar-dados');
const { Espera } = await import('./espera');

/** MODO=local has one person and no sign-in: no screen may talk of an account or of signing in. */
describe('os textos no MODO=local (step 23, achados)', () => {
  it('erasing says the account goes only where there is one', () => {
    expect(avisoDeApagar({ comConta: true, cancelaAssinatura: false })).toContain('a sua conta sai junto');
    expect(avisoDeApagar({ comConta: false, cancelaAssinatura: false })).not.toMatch(/conta/);
    expect(avisoDeApagar({ comConta: true, cancelaAssinatura: true })).toContain('A assinatura é cancelada na hora');
  });

  it('after erasing, local mode offers to start over instead of saying the account went', () => {
    const local = renderToStaticMarkup(createElement(Apagado, { deConta: true, local: true }));
    expect(local).not.toMatch(/conta|testado/);
    expect(local).toContain('href="/casa"');
    expect(renderToStaticMarkup(createElement(Apagado, { deConta: true }))).toContain('A sua conta saiu junto.');
  });

  it('the waiting screen never asks to sign in again', () => {
    expect(renderToStaticMarkup(createElement(Espera, { etapa: null }))).not.toMatch(/entrar/);
  });
});
