// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The panel's summary: from the rows `sessoesDoPainel` loads to the criterion,
 * the funnel, the session list and the numbers for the price. Pure.
 */
import type { LinhaDoPainel } from '@/db/painel';

import {
  alcanceDaSessao,
  funil,
  META_COMPLETAM,
  META_FUNDADOR_OU_INDICOU,
  metaPara,
  resumo,
  mediana,
  type Alcance,
  type Funil,
} from './funil';

export const ETAPAS_DE_CUSTO = [
  { chave: 'import', nome: 'Import', etapas: ['import'] },
  { chave: 'interrogatorio', nome: 'Interrogatório', etapas: ['interrogatorio'] },
  { chave: 'selecao', nome: 'Seleção', etapas: ['selecao'] },
  { chave: 'critico', nome: 'Crítico', etapas: ['critico'] },
  { chave: 'reescrita', nome: 'Reescrita', etapas: ['reescrita'] },
  { chave: 'geracao', nome: 'Geração (seleção + crítico + reescrita)', etapas: ['selecao', 'critico', 'reescrita'] },
  { chave: 'total', nome: 'Sessão inteira', etapas: ['import', 'interrogatorio', 'selecao', 'critico', 'reescrita'] },
] as const;

export interface SessaoDaLista extends LinhaDoPainel {
  alcance: Alcance;
  /** First to last activity (events and messages); null for an erased session. */
  tempoTotalMs: number | null;
  /** First message to the end of the interrogation. */
  tempoInterrogatorioMs: number | null;
  custoTotal: number;
}

export interface Criterio {
  testers: number;
  linkAberto: number;
  consentiram: number;
  completaram: number;
  fundadorOuIndicou: number;
  metaCompletam: number;
  metaFundadorOuIndicou: number;
}

export interface Painel {
  criterio: Criterio;
  funil: Funil;
  sessoes: SessaoDaLista[];
  custoPorEtapa: { chave: string; nome: string; resumo: ReturnType<typeof resumo> }[];
  tempoMedianoInterrogatorioMs: number | null;
  sessoesComInterrogatorioCompleto: number;
}

function tempos(l: LinhaDoPainel): { total: number | null; interrogatorio: number | null } {
  if (l.apagadaEm) return { total: null, interrogatorio: null };
  const marcas = [
    ...l.eventos.filter((e) => e.tipo !== 'apagou').map((e) => e.createdAt.getTime()),
    ...(l.primeiraMensagem ? [l.primeiraMensagem.getTime()] : []),
    ...(l.ultimaMensagem ? [l.ultimaMensagem.getTime()] : []),
  ];
  const total = marcas.length ? Math.max(...marcas) - Math.min(...marcas) : null;
  const interrogatorio =
    l.primeiraMensagem && l.terminouInterrogatorioEm
      ? l.terminouInterrogatorioEm.getTime() - l.primeiraMensagem.getTime()
      : null;
  return { total, interrogatorio };
}

export function montarPainel(linhas: LinhaDoPainel[]): Painel {
  const sessoes: SessaoDaLista[] = linhas.map((l) => {
    const t = tempos(l);
    return {
      ...l,
      alcance: alcanceDaSessao(l),
      tempoTotalMs: t.total,
      tempoInterrogatorioMs: t.interrogatorio,
      custoTotal: Object.values(l.custo).reduce((a, b) => a + b, 0),
    };
  });
  const f = funil(sessoes.map((s) => s.alcance));

  const criterio: Criterio = {
    testers: f.testers,
    linkAberto: f.porEtapa.link_aberto,
    consentiram: f.porEtapa.consentiu,
    completaram: f.porEtapa.terminou,
    fundadorOuIndicou: f.porEtapa.fundador_ou_indicou,
    metaCompletam: metaPara(f.testers, META_COMPLETAM),
    metaFundadorOuIndicou: metaPara(f.testers, META_FUNDADOR_OU_INDICOU),
  };

  // A session through the subscription cost nothing measurable: it stays out of the measured cost (docs/decisoes.md, decision 8).
  const custoPorEtapa = ETAPAS_DE_CUSTO.map(({ chave, nome, etapas }) => {
    const valores = sessoes
      .filter((s) => !s.custoNaoMedido)
      .map((s) => etapas.reduce((soma, e) => soma + (s.custo[e] ?? 0), 0))
      .filter((v) => v > 0);
    return { chave, nome, resumo: resumo(valores) };
  });

  const interrogatorios = sessoes.flatMap((s) => (s.tempoInterrogatorioMs === null ? [] : [s.tempoInterrogatorioMs]));
  return {
    criterio,
    funil: f,
    sessoes,
    custoPorEtapa,
    tempoMedianoInterrogatorioMs: mediana(interrogatorios),
    sessoesComInterrogatorioCompleto: interrogatorios.length,
  };
}
