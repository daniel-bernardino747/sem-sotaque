// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, inject, it } from 'vitest';

import { cobertura, filaAberta } from '@/avaliador/plano';
import {
  corpusDaSessao,
  criarAffiliation,
  criarTester,
  ErroArquivoDoCorpus,
  ErroCorpusNaoVazio,
  ErroEstadoSessao,
  gravarCabecalho,
  gravarImportacao,
  importarCorpusDeArquivo,
  registrarConsentimento,
  registrarMetric,
} from '@/db';
import { db, fecharDb } from '@/db/client';
import * as t from '@/db/schema';

import { exportarCorpus } from './exportar';
import { arquivoInventado } from './inventado';

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);

const EXPORTADO_EM = new Date('2026-11-08T12:00:00.000Z');

async function sessaoNova(consentir = true): Promise<string> {
  const { sessao } = await criarTester({ apelido: 'Inventada', origem: 'teste' });
  if (consentir) await registrarConsentimento(sessao.id, 'v3', false);
  return sessao.id;
}

/**
 * The invented person's Corpus as the app builds it: the import of a résumé,
 * then what the interrogation and the evaluator write. Nothing here goes
 * through the file.
 */
async function corpusDeOrigem(): Promise<string> {
  const sessaoId = await sessaoNova();
  const f = arquivoInventado();
  await gravarImportacao(sessaoId, {
    formato: 'texto',
    textoExtraido: 'Fulana de Tal\nPadaria Inventada',
    corpus: {
      affiliations: f.affiliations.map((a) => ({
        ref: a.ref,
        organizacao: a.organizacao,
        cargo: a.cargo,
        tipo: a.tipo,
        anoConclusao: a.ano_conclusao,
        cursando: a.cursando,
        periodoOriginal: a.periodo_original,
        periodoInicio: a.periodo_inicio,
        periodoFim: a.periodo_fim,
        stack: a.stack,
        confidencial: a.confidencial,
        descricaoPublica: a.descricao_publica,
        periodoConfirmado: a.periodo_confirmado,
        pulado: a.pulado,
      })),
      accomplishments: f.accomplishments.map((a) => ({
        ref: a.ref,
        affiliationRef: a.affiliation_ref,
        tipo: a.tipo,
        enunciado: a.enunciado,
        importanciaParaPessoa: a.importancia_para_pessoa,
        data: a.data,
        pulado: a.pulado,
        forca: a.forca,
        adiado: a.adiado,
        adiadoVoltou: a.adiado_voltou,
      })),
      linhas: [
        { texto: 'Automação de fichas e relatórios', affiliationRef: 'af1', accomplishmentRefs: ['ac1', 'ac2'] },
        { texto: 'Suporte', affiliationRef: 'af1', accomplishmentRefs: ['ac3'] },
        { texto: 'Bacharel em Ciência da Computação', affiliationRef: 'af2', accomplishmentRefs: [] },
      ],
    },
  });
  const corpus = await corpusDaSessao(sessaoId);
  const fichas = corpus.accomplishments.find((a) => a.enunciado.startsWith('Automatizei'))!;
  for (const m of f.accomplishments[0].metrics) {
    await registrarMetric(fichas.id, {
      texto: m.texto,
      valores: m.valores,
      origem: m.origem,
      ancora: m.ancora,
      confirmadoEm: m.confirmado_em ? new Date(m.confirmado_em) : null,
    });
  }
  await gravarCabecalho(sessaoId, f.cabecalho!);
  return sessaoId;
}

/** The records by what they say: the ids change from one session to the other. */
const porEnunciado = async (sessaoId: string) => {
  const corpus = await corpusDaSessao(sessaoId);
  const enunciado = new Map(corpus.accomplishments.map((a) => [a.id, a.enunciado]));
  return { cobertura: cobertura(corpus), filaAberta: filaAberta(corpus).map((id) => enunciado.get(id)) };
};

describe.skipIf(semBanco)('o Arquivo do Corpus, ida e volta', () => {
  it('exports the Corpus with refs in place of the ids', async () => {
    const origem = await corpusDeOrigem();
    expect(await exportarCorpus(origem, EXPORTADO_EM)).toEqual(arquivoInventado());
  });

  it('exported, imported into a new session and exported again, is the same file', async () => {
    const origem = await corpusDeOrigem();
    const arquivo = await exportarCorpus(origem, EXPORTADO_EM);

    const destino = await sessaoNova();
    await importarCorpusDeArquivo(destino, JSON.stringify(arquivo, null, 2));

    expect(await exportarCorpus(destino, EXPORTADO_EM)).toEqual(arquivo);
  });

  it('imported, the coverage and the open queue are the origin’s', async () => {
    const origem = await corpusDeOrigem();
    const destino = await sessaoNova();
    await importarCorpusDeArquivo(destino, JSON.stringify(await exportarCorpus(origem)));

    const esperado = {
      cobertura: 43,
      filaAberta: [
        'Mantenho uma biblioteca de validação de CPF.',
        'Cuidei do plantão de suporte.',
        'Migrei os relatórios de vendas para o Postgres.',
      ],
    };
    expect(await porEnunciado(origem)).toEqual(esperado);
    expect(await porEnunciado(destino)).toEqual(esperado);
  });

  it('moves the session to importou, with the file as the provenance', async () => {
    const destino = await sessaoNova();
    const texto = JSON.stringify(arquivoInventado());
    await importarCorpusDeArquivo(destino, texto);

    const [sessao] = await db().select().from(t.sessoes).where(eq(t.sessoes.id, destino));
    expect(sessao.estado).toBe('importou');
    expect(await db().select({ formato: t.importacoes.formato, texto: t.importacoes.textoExtraido }).from(t.importacoes).where(eq(t.importacoes.sessaoId, destino))).toEqual([
      { formato: 'corpus', texto },
    ]);
    const [evento] = await db()
      .select()
      .from(t.eventos)
      .where(and(eq(t.eventos.sessaoId, destino), eq(t.eventos.tipo, 'importou')));
    expect(evento.dados).toEqual({ formato: 'corpus', affiliations: 2, accomplishments: 4, linhas: 4 });
  });

  it('keeps the header the session already has', async () => {
    const destino = await sessaoNova();
    const meu = { nome: 'Outra Pessoa', email: 'outra@example.com', linkedin: 'linkedin.com/in/outra', github: null, local: 'Natal' };
    await gravarCabecalho(destino, meu);
    await importarCorpusDeArquivo(destino, JSON.stringify(arquivoInventado()));
    expect((await exportarCorpus(destino)).cabecalho).toEqual(meu);
  });

  describe('refused, with nothing written', () => {
    /** Everything a session's Corpus and import hold, counted. */
    async function nadaGravado(sessaoId: string, estado: t.EstadoSessao) {
      const [sessao] = await db().select().from(t.sessoes).where(eq(t.sessoes.id, sessaoId));
      expect(sessao.estado).toBe(estado);
      for (const tabela of [t.affiliations, t.accomplishments, t.linhasOriginais, t.importacoes, t.cabecalhos]) {
        expect(await db().select().from(tabela).where(eq(tabela.sessaoId, sessaoId))).toEqual([]);
      }
    }

    const quebrados: [string, (a: ReturnType<typeof arquivoInventado>) => void][] = [
      ['an estimated Metric without its anchor', (a) => (a.accomplishments[0].metrics[0].ancora = null)],
      ['a confidential company without the description', (a) => Object.assign(a.affiliations[0], { confidencial: true, descricao_publica: null })],
      ['a date outside YYYY-MM', (a) => (a.accomplishments[0].data = '2022-5')],
      ['a loose ref', (a) => (a.linhas_originais[2].accomplishment_ref = 'ac7')],
      ['an unknown version', (a) => Object.assign(a, { versao: 3 })],
    ];
    for (const [caso, quebrar] of quebrados) {
      it(`a file with ${caso}`, async () => {
        const destino = await sessaoNova();
        const arquivo = arquivoInventado();
        quebrar(arquivo);
        await expect(importarCorpusDeArquivo(destino, JSON.stringify(arquivo))).rejects.toThrow(ErroArquivoDoCorpus);
        await nadaGravado(destino, 'consentiu');
      });
    }

    it('a session that has not consented', async () => {
      const destino = await sessaoNova(false);
      await expect(importarCorpusDeArquivo(destino, JSON.stringify(arquivoInventado()))).rejects.toThrow(ErroEstadoSessao);
      await nadaGravado(destino, 'novo');
    });

    it('a session that already has a Corpus', async () => {
      const importada = await corpusDeOrigem();
      await expect(importarCorpusDeArquivo(importada, JSON.stringify(arquivoInventado()))).rejects.toThrow(ErroEstadoSessao);

      // At `consentiu` with a record already written: not over it either.
      const comRegistro = await sessaoNova();
      await criarAffiliation(comRegistro, { organizacao: 'Já estava', cargo: 'Dev' });
      await expect(importarCorpusDeArquivo(comRegistro, JSON.stringify(arquivoInventado()))).rejects.toThrow(ErroCorpusNaoVazio);
      expect((await corpusDaSessao(comRegistro)).affiliations.map((a) => a.organizacao)).toEqual(['Já estava']);
    });
  });
});
