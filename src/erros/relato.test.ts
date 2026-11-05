// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { relatoDoNavegador } from './relato';

describe('relatoDoNavegador', () => {
  it('sends the kind, the screen, the class and the digest, never the message', () => {
    const erro = Object.assign(new TypeError('Reduzi o fechamento da Padaria Fictícia'), { digest: '998877' });
    const relato = relatoDoNavegador('limite', erro, '/casa/vagas/abc');

    expect(relato).toEqual({ tipo: 'limite', tela: '/casa/vagas/abc', classe: 'TypeError', digest: '998877' });
    expect(JSON.stringify(relato)).not.toContain('Padaria');
  });

  it('names a rejection that is not an Error by its type', () => {
    expect(relatoDoNavegador('promessa', 'texto qualquer', '/casa')).toEqual({ tipo: 'promessa', tela: '/casa', classe: 'string' });
  });

  it('keeps only the path of the screen: no query string, no hash', () => {
    expect(relatoDoNavegador('janela', new Error(), '/casa/conversa?x=nome#y').tela).toBe('/casa/conversa');
  });
});
