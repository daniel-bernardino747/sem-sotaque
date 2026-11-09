// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * An invented person's Corpus file, for the tests: a bakery with an estimated
 * and a stated Metric, a degree, a skipped draft, a postponed one and a line of
 * the old résumé that became two records. Nobody real.
 */
import type { ArquivoDoCorpus } from './index';

export function arquivoInventado(): ArquivoDoCorpus {
  return {
    formato: 'sem-sotaque/corpus',
    versao: 1,
    exportadoEm: '2026-11-08T12:00:00.000Z',
    cabecalho: {
      nome: 'Fulana de Tal',
      email: 'fulana@example.com',
      linkedin: 'linkedin.com/in/fulana-inventada',
      github: null,
      local: 'Recife, Brasil',
    },
    affiliations: [
      {
        ref: 'af1',
        organizacao: 'Padaria Inventada',
        cargo: 'Desenvolvedora Backend',
        tipo: 'emprego',
        ano_conclusao: null,
        cursando: false,
        periodo_original: 'Mar 2021 – Presente',
        periodo_inicio: '2021-03',
        periodo_fim: null,
        stack: ['TypeScript', 'Postgres'],
        confidencial: false,
        descricao_publica: 'A bakery chain with 40 stores',
        periodo_confirmado: true,
        pulado: false,
      },
      {
        ref: 'af2',
        organizacao: 'Universidade Fictícia',
        cargo: 'Ciência da Computação',
        tipo: 'graduacao',
        ano_conclusao: 2020,
        cursando: false,
        periodo_original: '2016 – 2020',
        periodo_inicio: null,
        periodo_fim: null,
        stack: [],
        confidencial: false,
        descricao_publica: null,
        periodo_confirmado: false,
        pulado: false,
      },
    ],
    accomplishments: [
      {
        ref: 'ac1',
        affiliation_ref: 'af1',
        tipo: 'engineering',
        enunciado: 'Automatizei o cadastro de fichas técnicas, que era feito à mão em planilha.',
        importancia_para_pessoa: 'alta',
        data: '2022-05',
        pulado: false,
        forca: 'forte',
        adiado: false,
        adiado_voltou: false,
        metrics: [
          {
            texto: '~2 min → 20 s por ficha',
            valores: [2, 20],
            origem: 'estimado',
            ancora: 'Quantas fichas por dia?',
            confirmado_em: '2026-10-30T15:04:05.123Z',
          },
          { texto: '40 lojas usando', valores: [40], origem: 'afirmado', ancora: null, confirmado_em: null },
        ],
      },
      {
        ref: 'ac2',
        affiliation_ref: 'af1',
        tipo: 'engineering',
        enunciado: 'Migrei os relatórios de vendas para o Postgres.',
        importancia_para_pessoa: null,
        data: null,
        pulado: false,
        forca: 'medio',
        adiado: true,
        adiado_voltou: false,
        metrics: [],
      },
      {
        ref: 'ac3',
        affiliation_ref: 'af1',
        tipo: 'engineering',
        enunciado: 'Cuidei do plantão de suporte.',
        importancia_para_pessoa: 'baixa',
        data: null,
        pulado: true,
        forca: 'fraco',
        adiado: false,
        adiado_voltou: false,
        metrics: [],
      },
      {
        ref: 'ac4',
        affiliation_ref: null,
        tipo: 'open-source',
        enunciado: 'Mantenho uma biblioteca de validação de CPF.',
        importancia_para_pessoa: null,
        data: '2023-01',
        pulado: false,
        forca: null,
        adiado: false,
        adiado_voltou: false,
        metrics: [],
      },
    ],
    linhas_originais: [
      { texto: 'Automação de fichas e relatórios', affiliation_ref: 'af1', accomplishment_ref: 'ac1' },
      { texto: 'Automação de fichas e relatórios', affiliation_ref: 'af1', accomplishment_ref: 'ac2' },
      { texto: 'Suporte', affiliation_ref: 'af1', accomplishment_ref: 'ac3' },
      { texto: 'Bacharel em Ciência da Computação', affiliation_ref: 'af2', accomplishment_ref: null },
    ],
  };
}
