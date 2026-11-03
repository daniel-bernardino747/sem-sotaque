// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The Corpus as the generation reads it: the text the selection and the
 * rewrite get (refs, never database ids), the context the checks need, and
 * which records could still become a bullet.
 */
import type { AccomplishmentDoCorpus, Corpus } from '@/db';
import type { Refs } from '@/interrogatorio/estado';

import type { ContextoChecagem } from './checagens';
import { periodoDaAffiliation } from './rascunho';

/** A record that may become a bullet: it has a result. */
export const elegivel = (a: AccomplishmentDoCorpus) => a.metrics.length > 0;

export function contextoDasChecagens(corpus: Corpus): ContextoChecagem {
  return {
    accomplishments: new Map(
      corpus.accomplishments.map((a) => [
        a.id,
        { tipo: a.tipo, affiliationId: a.affiliationId, metrics: a.metrics.map((m) => ({ valores: m.valores, origem: m.origem })) },
      ]),
    ),
    affiliations: new Map(corpus.affiliations.map((a) => [a.id, { organizacao: a.organizacao, cargo: a.cargo, confidencial: a.confidencial }])),
  };
}

/** The records with a result that no bullet tells yet, by ref. */
export function registrosSemUso(corpus: Corpus, refs: Refs, usados: Set<string>): string[] {
  return corpus.accomplishments
    .filter((a) => elegivel(a) && !usados.has(a.id))
    .map((a) => refs.ref(a.id))
    .filter((r): r is string => Boolean(r));
}

function blocoAccomplishment(a: AccomplishmentDoCorpus, refs: Refs): string {
  const estado = elegivel(a) ? '' : '; RASCUNHO (sem resultado: não vira bullet)';
  const linhas = [
    `  ${refs.ref(a.id)} [${a.tipo}; importância para a pessoa: ${a.importanciaParaPessoa ?? 'não dita'}${estado}]`,
    `    enunciado: ${a.enunciado}`,
  ];
  for (const m of a.metrics) {
    const numeros = m.origem === 'qualitativo' ? 'sem número' : `números: ${m.valores.join(', ')}`;
    linhas.push(`    metric (${m.origem}): ${m.texto} — ${numeros}`);
  }
  return linhas.join('\n');
}

/** What the selection and the rewrite read: every Affiliation with its records. */
export function descreverCorpusParaGeracao(corpus: Corpus, refs: Refs): string {
  const blocos = corpus.affiliations.map((af) => {
    const periodo = periodoDaAffiliation(af);
    const doLugar = corpus.accomplishments.filter((a) => a.affiliationId === af.id);
    return [
      // A confidential name is not even shown to the model: the less it sees, the less it leaks.
      `${refs.ref(af.id)} ${af.confidencial ? '[CONFIDENCIAL: o nome nunca vai para a página; use a descrição pública]' : af.organizacao} — cargo: ${af.cargo}`,
      `  período: ${periodo ?? 'sem mês confirmado (o template não imprime período)'}`,
      `  descrição pública: ${af.descricaoPublica?.trim() || '(nenhuma: não explique a empresa por conta própria)'}`,
      `  stack: ${af.stack.length ? af.stack.join(', ') : '(nenhuma)'}`,
      ...(doLugar.length ? doLugar.map((a) => blocoAccomplishment(a, refs)) : ['  (nenhum accomplishment)']),
    ]
      .filter(Boolean)
      .join('\n');
  });
  const soltos = corpus.accomplishments.filter((a) => !a.affiliationId);
  if (soltos.length) blocos.push(['Fora de qualquer affiliation:', ...soltos.map((a) => blocoAccomplishment(a, refs))].join('\n'));
  return blocos.join('\n\n');
}
