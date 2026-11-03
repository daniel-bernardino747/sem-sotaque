// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The evaluator's timeline beside the transcript (step 10): each checkpoint
 * between the messages it came after, and the counts the notes of step 10
 * ask for. Pure.
 */

export type ItemDaLinha<M, D> = { tipo: 'mensagem'; item: M } | { tipo: 'decisao'; item: D };

/** Messages and decisions in time order; on a tie, the message first (the decision read it). */
export function linhaDoTempo<M extends { createdAt: Date }, D extends { createdAt: Date }>(mensagens: M[], decisoes: D[]): ItemDaLinha<M, D>[] {
  const itens: ItemDaLinha<M, D>[] = [
    ...mensagens.map((item) => ({ tipo: 'mensagem' as const, item })),
    ...decisoes.map((item) => ({ tipo: 'decisao' as const, item })),
  ];
  return itens
    .map((i, ordem) => ({ i, ordem }))
    .sort((a, b) => a.i.item.createdAt.getTime() - b.i.item.createdAt.getTime() || a.ordem - b.ordem)
    .map(({ i }) => i);
}

export function resumoDoAvaliador(decisoes: { decisao: string; backend: string; erro: string | null }[]) {
  // The offer and the person's pick at it are not checkpoints.
  const checkpoints = decisoes.filter((d) => d.decisao !== 'ofereceu_fim' && d.decisao !== 'escolheu');
  return {
    checkpoints: checkpoints.length,
    falhasDoJev: checkpoints.filter((d) => d.backend === 'reserva' && d.erro).length,
    /** Decided by the fixed rules with no failure: the person said no to the Jev. */
    semJev: checkpoints.filter((d) => d.backend === 'reserva' && !d.erro).length,
    ofereceuFim: decisoes.some((d) => d.decisao === 'ofereceu_fim'),
  };
}
