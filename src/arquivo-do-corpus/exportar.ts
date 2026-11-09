// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * "Baixar meu Corpus" (step 27): a session's Corpus as the file. Apart from
 * `./index` so that the format reads without the database.
 */
import { cabecalhoDaSessao, corpusDaSessao, linhasDaSessao } from '@/db';

import { FORMATO, VERSAO, type ArquivoDoCorpus } from './index';

/**
 * The session's Corpus, with `af1…`/`ac1…` refs in place of the ids, in the
 * order the Corpus reads (`corpusDaSessao`). The original lines have no order
 * of their own (one import writes them at once), so they follow their record:
 * the same Corpus always gives the same file, but for `exportadoEm`.
 */
export async function exportarCorpus(sessaoId: string, agora: Date = new Date()): Promise<ArquivoDoCorpus> {
  const [corpus, linhas, cabecalho] = await Promise.all([
    corpusDaSessao(sessaoId),
    linhasDaSessao(sessaoId),
    cabecalhoDaSessao(sessaoId),
  ]);
  const refAffiliation = new Map(corpus.affiliations.map((a, i) => [a.id, `af${i + 1}`]));
  const refAccomplishment = new Map(corpus.accomplishments.map((a, i) => [a.id, `ac${i + 1}`]));
  const ref = (mapa: Map<string, string>, id: string | null) => (id === null ? null : (mapa.get(id) ?? null));
  /** Where a ref sits in the file: null after every record. */
  const posicao = (r: string | null) => (r === null ? Infinity : Number(r.slice(2)));

  return {
    formato: FORMATO,
    versao: VERSAO,
    exportadoEm: agora.toISOString(),
    cabecalho,
    affiliations: corpus.affiliations.map((a) => ({
      ref: refAffiliation.get(a.id)!,
      organizacao: a.organizacao,
      cargo: a.cargo,
      tipo: a.tipo,
      ano_conclusao: a.anoConclusao,
      cursando: a.cursando,
      periodo_original: a.periodoOriginal,
      periodo_inicio: a.periodoInicio,
      periodo_fim: a.periodoFim,
      stack: a.stack,
      confidencial: a.confidencial,
      descricao_publica: a.descricaoPublica,
      periodo_confirmado: a.periodoConfirmado,
      pulado: a.pulado,
    })),
    accomplishments: corpus.accomplishments.map((a) => ({
      ref: refAccomplishment.get(a.id)!,
      affiliation_ref: ref(refAffiliation, a.affiliationId),
      tipo: a.tipo,
      enunciado: a.enunciado,
      importancia_para_pessoa: a.importanciaParaPessoa,
      data: a.data,
      pulado: a.pulado,
      forca: a.forca,
      adiado: a.adiado,
      adiado_voltou: a.adiadoVoltou,
      metrics: a.metrics.map((m) => ({
        texto: m.texto,
        valores: m.valores,
        origem: m.origem,
        ancora: m.ancora,
        confirmado_em: m.confirmadoEm?.toISOString() ?? null,
      })),
    })),
    linhas_originais: linhas
      .map((l) => ({
        texto: l.texto,
        affiliation_ref: ref(refAffiliation, l.affiliationId),
        accomplishment_ref: ref(refAccomplishment, l.accomplishmentId),
      }))
      .sort(
        (x, y) =>
          posicao(x.accomplishment_ref) - posicao(y.accomplishment_ref) ||
          posicao(x.affiliation_ref) - posicao(y.affiliation_ref) ||
          x.texto.localeCompare(y.texto),
      ),
  };
}
