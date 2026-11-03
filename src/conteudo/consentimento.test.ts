// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { aceitouAvaliador, CONSENTIMENTO_VAGAS_VERSAO, CONSENTIMENTO_VERSAO, MUDOU_NO_V2, paragrafos, textoDoConsentimento } from './consentimento';

describe('paragrafos', () => {
  it('splits on blank lines and marks the bold runs', () => {
    expect(paragrafos('Um **dois** três.\ncontinua\n\n**Só negrito**\n')).toEqual([
      [
        { texto: 'Um ', negrito: false },
        { texto: 'dois', negrito: true },
        { texto: ' três.\ncontinua', negrito: false },
      ],
      [{ texto: 'Só negrito', negrito: true }],
    ]);
  });
});

describe('textoDoConsentimento', () => {
  const lido = (versao?: string) =>
    textoDoConsentimento(versao)
      .flat()
      .map((s) => s.texto)
      .join('');

  it('keeps v2 as it was accepted: what step 03 required', () => {
    for (const trecho of ['currículo', 'respostas', 'tempo', 'lê tudo', 'Anthropic', 'divulgação', 'apagar', '24 h']) {
      expect(lido('v2')).toContain(trecho);
    }
  });

  it('the current version says nobody reads without the box, and where the data goes (step 22)', () => {
    expect(CONSENTIMENTO_VERSAO).toBe('v3');
    for (const trecho of ['currículo', 'respostas', 'tempo', 'ninguém', 'Pode ler', 'só números', 'Anthropic', 'divulgação', 'Apagar meus dados', 'hello@teamdbsolutions.com', 'cancela a assinatura']) {
      expect(lido()).toContain(trecho);
    }
    expect(lido()).not.toContain('lê tudo');
  });

  it('v2 and the current version name the TypeSafe, what goes to it and that it publishes no retention period', () => {
    for (const versao of ['v2', CONSENTIMENTO_VERSAO]) {
      for (const trecho of ['TypeSafe', 'sem o seu nome nem o nome das empresas', 'não publica por quanto tempo guarda']) {
        expect(lido(versao)).toContain(trecho);
      }
    }
    expect(MUDOU_NO_V2).toContain('TypeSafe');
  });

  it('the Vagas consent says what is kept, where it goes, that the link is never opened and how to erase', () => {
    for (const trecho of ['texto da vaga', 'Anthropic', 'nunca é aberto', 'Apagar esta vaga', 'Apagar meus dados', 'limite', 'Pode ler']) {
      expect(lido(CONSENTIMENTO_VAGAS_VERSAO)).toContain(trecho);
    }
  });

  it('keeps v1 as it was accepted', () => {
    expect(lido('v1')).not.toContain('TypeSafe');
  });
});

describe('aceitouAvaliador', () => {
  it('lets the evaluator run only from v2 on', () => {
    expect([null, 'v1', 'v2', 'v3'].map(aceitouAvaliador)).toEqual([false, false, true, true]);
  });
});
