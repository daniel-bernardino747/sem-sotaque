// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The import, end to end: resume in (a PDF or pasted text), draft Corpus out,
 * session moved to `importou`. The extraction is in `./extracao`, the text in
 * `./texto`, the writing in `gravarImportacao`.
 */
import { gravarImportacao, type CorpusImportado } from '../db';
import { llm, type ClienteLlm } from '../llm/cliente';
import { extrairCorpus, type Extracao } from './extracao';
import { aplicarRegrasDeFormacao } from './formacao';
import { textoColado, textoDoPdf } from './texto';

export { ErroImport } from './texto';

export type EntradaImport = { formato: 'pdf'; pdf: Buffer } | { formato: 'texto'; texto: string };

export function paraCorpusImportado(extracao: Extracao): CorpusImportado {
  return {
    affiliations: extracao.affiliations.map((a) => ({
      ref: a.ref,
      organizacao: a.organizacao,
      cargo: a.cargo,
      tipo: a.tipo,
      periodoOriginal: a.periodo_original,
      periodoInicio: a.periodo_inicio,
      periodoFim: a.periodo_fim,
      stack: a.stack,
    })),
    accomplishments: extracao.accomplishments.map((c) => ({
      ref: c.ref,
      affiliationRef: c.affiliation_ref,
      tipo: c.tipo,
      enunciado: c.enunciado,
    })),
    linhas: extracao.linhas_originais.map((l) => ({
      texto: l.texto,
      affiliationRef: l.affiliation_ref,
      accomplishmentRefs: l.accomplishment_refs,
    })),
  };
}

/**
 * Reads the resume, extracts the draft Corpus and writes it. Throws
 * `ErroImport` for what the person sent (a scan, an oversized PDF, too little
 * text) before any model call, and `ErroEstadoSessao` if the session is not at
 * `consentiu`.
 */
export async function importarCurriculo(
  sessaoId: string,
  entrada: EntradaImport,
  cliente: ClienteLlm = llm(),
) {
  const texto = entrada.formato === 'pdf' ? await textoDoPdf(entrada.pdf) : textoColado(entrada.texto);
  const extracao = await extrairCorpus(texto, { sessaoId, cliente });
  return gravarImportacao(sessaoId, {
    formato: entrada.formato,
    textoExtraido: texto,
    corpus: aplicarRegrasDeFormacao(paraCorpusImportado(extracao)),
  });
}
