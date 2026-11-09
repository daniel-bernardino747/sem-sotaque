// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { lerArquivoDeCorpus } from './index';
import { arquivoInventado } from './inventado';

const texto = (valor: unknown) => JSON.stringify(valor, null, 2);

/** The invented file with one change. */
function com(mudar: (arquivo: ReturnType<typeof arquivoInventado>) => void) {
  const arquivo = arquivoInventado();
  mudar(arquivo);
  return texto(arquivo);
}

function recusa(entrada: string): string {
  const lido = lerArquivoDeCorpus(entrada);
  if (lido.ok) throw new Error('expected the file to be refused');
  return lido.razao;
}

describe('lerArquivoDeCorpus', () => {
  it('reads a valid file as it is', () => {
    const lido = lerArquivoDeCorpus(texto(arquivoInventado()));
    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    expect(lido.arquivo.affiliations.map((a) => a.organizacao)).toEqual(['Padaria Inventada', 'Universidade Fictícia']);
    expect(lido.arquivo.accomplishments[0].metrics[0]).toMatchObject({ origem: 'estimado', ancora: 'Quantas fichas por dia?' });
    expect(lido.arquivo.cabecalho?.nome).toBe('Fulana de Tal');
  });

  it('refuses what is not JSON, or not a Corpus', () => {
    expect(recusa('%PDF-1.7')).toMatch(/não é um Corpus do sem-sotaque/);
    expect(recusa(texto({ formato: 'outra-coisa', versao: 1 }))).toMatch(/não é um Corpus do sem-sotaque/);
  });

  it('refuses a version it does not know', () => {
    expect(recusa(com((a) => Object.assign(a, { versao: 2 })))).toMatch(/versão 2/);
    expect(recusa(com((a) => Object.assign(a, { versao: 0 })))).toMatch(/versão 0/);
  });

  it('refuses an estimated Metric without its anchor', () => {
    const razao = recusa(com((a) => (a.accomplishments[0].metrics[0].ancora = null)));
    expect(razao).toMatch(/estimad.*âncora/);
  });

  it('refuses a confidential company without the public description', () => {
    const razao = recusa(
      com((a) => Object.assign(a.affiliations[0], { confidencial: true, descricao_publica: '  ' })),
    );
    expect(razao).toMatch(/confidencial.*descrição pública/);
  });

  it('refuses a date that is not YYYY-MM', () => {
    expect(recusa(com((a) => (a.affiliations[0].periodo_inicio = '03/2021')))).toMatch(/AAAA-MM/);
    expect(recusa(com((a) => (a.accomplishments[0].data = '2021-13')))).toMatch(/AAAA-MM/);
  });

  it('refuses a ref that points to nothing in the file', () => {
    expect(recusa(com((a) => (a.accomplishments[0].affiliation_ref = 'af9')))).toMatch(/af9/);
    expect(recusa(com((a) => (a.linhas_originais[0].accomplishment_ref = 'ac9')))).toMatch(/ac9/);
  });

  it('refuses two records with the same ref', () => {
    expect(recusa(com((a) => (a.accomplishments[1].ref = a.accomplishments[0].ref)))).toMatch(/repetida/);
  });

  it('refuses a value outside the enums, saying where', () => {
    expect(recusa(com((a) => Object.assign(a.accomplishments[0], { forca: 'fortissimo' })))).toMatch(/accomplishments\[0\]\.forca/);
  });
});
