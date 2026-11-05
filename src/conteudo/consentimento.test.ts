// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import {
  aceitouAvaliador,
  CONSENTIMENTO_VAGAS_VERSAO,
  CONSENTIMENTO_VERSAO,
  ERROS_VALEM_A_PARTIR,
  gravaErrosEAtritos,
  mostraAvisoDaPolitica,
  MUDOU_NO_V2,
  paragrafos,
  textoDoConsentimento,
} from './consentimento';

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
    expect(CONSENTIMENTO_VERSAO).toBe('v4');
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

  it('v4 is v3 with the errors in what is kept, by their kind and screen, never the text (step 26)', () => {
    const v3 = lido('v3');
    const v4 = lido('v4');
    for (const trecho of ['tipo do erro', 'tela', 'nunca', '90 dias']) expect(v4).toContain(trecho);
    expect(v3).not.toContain('tipo do erro');
    // Every other paragraph stays as v3 said it.
    const outros = (versao: string) =>
      textoDoConsentimento(versao)
        .map((p) => p.map((t) => t.texto).join(''))
        .filter((p) => !p.startsWith('O que fica guardado:'));
    expect(outros('v4')).toEqual(outros('v3'));
    expect(outros('v4')).toHaveLength(textoDoConsentimento('v3').length - 1);
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

describe('mostraAvisoDaPolitica', () => {
  const antes = new Date(ERROS_VALEM_A_PARTIR.getTime() - 1);

  it('warns a session of an older text until the date, and nobody after it', () => {
    for (const versao of ['v1', 'v2', 'v3']) {
      expect(mostraAvisoDaPolitica(versao, antes)).toBe(true);
      expect(mostraAvisoDaPolitica(versao, ERROS_VALEM_A_PARTIR)).toBe(false);
    }
  });

  it('never warns a session that accepted v4, or one that has not accepted anything yet', () => {
    expect(mostraAvisoDaPolitica('v4', antes)).toBe(false);
    expect(mostraAvisoDaPolitica(null, antes)).toBe(false);
  });
});

describe('gravaErrosEAtritos', () => {
  const antes = new Date(ERROS_VALEM_A_PARTIR.getTime() - 1);
  const depois = ERROS_VALEM_A_PARTIR;

  it('records a v4 session from the consent, before the date', () => {
    expect(gravaErrosEAtritos('v4', antes)).toBe(true);
  });

  it('records a session of an older text only from the date the banner announced', () => {
    for (const versao of ['v1', 'v2', 'v3', null]) {
      expect(gravaErrosEAtritos(versao, antes)).toBe(false);
      expect(gravaErrosEAtritos(versao, depois)).toBe(true);
    }
  });
});
