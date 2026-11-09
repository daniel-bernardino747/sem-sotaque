// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { conferirPayload, nomeDaPessoa, protegidos, pseudonimizar } from './pseudonimo';

const CURRICULO = `Rodrigo Albuquerque Pinheiro
Desenvolvedor Back-end Pleno
Recife, PE · rodrigo.pinheiro@exemplo.dev

EXPERIÊNCIA`;

const lista = protegidos({
  curriculo: CURRICULO,
  organizacoes: ['Fintech Maracatu Pagamentos', 'Transportadora Capibaribe', 'Universidade Federal Inventada de Pernambuco'],
});

describe('nomeDaPessoa', () => {
  it('reads the name from the first line of the resume, and nothing when it is not a name', () => {
    expect(nomeDaPessoa(CURRICULO)).toBe('Rodrigo Albuquerque Pinheiro');
    expect(nomeDaPessoa('Desenvolvedor Back-end · 2019\nRodrigo')).toBeNull();
    expect(nomeDaPessoa('EXPERIÊNCIA PROFISSIONAL')).toBeNull();
  });
});

describe('pseudonimizar', () => {
  it('swaps each organisation, whole or by its own word, for "Empresa A/B", and the person for [pessoa]', () => {
    const texto = 'Na Fintech Maracatu Pagamentos (a Maracatu) eu e o Rodrigo saímos da Transportadora Capibaribe. Escreve pra rodrigo@x.dev';
    expect(pseudonimizar(texto, lista)).toBe(
      'Na Empresa A (a Empresa A) eu e o [pessoa] saímos da Empresa B. Escreve pra [email]',
    );
  });

  it('ignores case and accents, and leaves generic words alone', () => {
    expect(pseudonimizar('na MARACATÚ de pagamentos, perto da universidade', lista)).toBe('na Empresa A de pagamentos, perto da universidade');
  });

  it('walks a JSON payload', () => {
    expect(pseudonimizar({ a: ['Capibaribe', { b: 'Pinheiro' }], n: 3 }, lista)).toEqual({ a: ['Empresa B', { b: '[pessoa]' }], n: 3 });
  });
});

describe('conferirPayload', () => {
  it('finds the person or an organisation anywhere in the payload', () => {
    expect(conferirPayload({ state: { conversa: ['falei com a maracatu'] }, questions: {} }, lista)).toEqual(['maracatu']);
    expect(conferirPayload({ state: 'Albuquerque' }, lista)).toEqual(['albuquerque']);
    expect(conferirPayload({ state: 'mande para alguem@exemplo.dev' }, lista)).toEqual(['an e-mail address']);
    expect(conferirPayload({ state: 'me liga no (81) 99876-5432' }, lista)).toEqual(['a phone number']);
    expect(conferirPayload({ state: 'veja github.com/fulano' }, lista)).toEqual(['a link']);
  });

  it('passes a pseudonymised payload', () => {
    const payload = pseudonimizar({ state: 'Rodrigo reescreveu a conciliação na Maracatu' }, lista);
    expect(conferirPayload(payload, lista)).toEqual([]);
  });
});

describe('a empresa da vaga (passo 16)', () => {
  const comVaga = protegidos({ curriculo: CURRICULO, organizacoes: ['Fintech Maracatu Pagamentos'], vaga: 'Acme Payments' });

  it('swaps the company of the Vaga for "Empresa X", whole or by its own word', () => {
    expect(pseudonimizar('A vaga da Acme Payments pede Kafka; na Acme usam Go. Eu estava na Maracatu.', comVaga)).toBe(
      'A vaga da Empresa X pede Kafka; na Empresa X usam Go. Eu estava na Empresa A.',
    );
  });

  it('refuses a payload where the company of the Vaga is still there', () => {
    expect(conferirPayload({ state: { item: { requirement: 'Kafka at ACME scale' } } }, comVaga)).toEqual(['acme']);
  });

  it('never labels a Corpus organisation "Empresa X"', () => {
    const muitas = protegidos({ curriculo: '', organizacoes: Array.from({ length: 30 }, (_, i) => `Org Inventada${i}`) });
    expect(muitas.organizacoes.map((o) => o.rotulo)).not.toContain('Empresa X');
  });
});

describe('um Corpus que veio de um arquivo (passo 27)', () => {
  it('takes the person from the header when the imported text has no name on its first line', () => {
    const doArquivo = protegidos({ curriculo: '{\n  "formato": "sem-sotaque/corpus"', nome: 'Fulana Inventada de Tal', organizacoes: [] });
    expect(pseudonimizar({ fala: 'a Fulana Inventada fez o painel' }, doArquivo)).toEqual({ fala: 'a [pessoa] [pessoa] fez o painel' });
  });
});
