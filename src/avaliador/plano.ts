// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The plan of the interrogation, as pure functions over the Corpus and the
 * `plano` row: what the questioner is on now, with which goal, what comes next,
 * and how much of the résumé is covered. The evaluator (`./index.ts`) calls
 * these at each checkpoint; the order is fixed here, the evaluator's judgement
 * comes in through each Accomplishment's `forca`.
 *
 * The order (decision 2 of step 10): accomplishments first, strongest first;
 * a company's block (period, what it is, whether it can be named) once its
 * accomplishments are done; then the degree; then what was postponed, once.
 * A note about something new opens before all of it.
 *
 * The retomada (step 14): once the interrogation has ended, the person can
 * come back to the open queue (`filaAberta`: the drafts, then what was
 * skipped, then what was postponed) or open "contar algo novo", a subject for
 * a record that does not exist yet. What one retomada opened (`retomados`)
 * does not come back in it, except a record postponed there, once.
 *
 * A Vaga's conversation (step 16) has a plan of its own, with the same motor
 * and a queue restricted to the Vaga (`Contexto.vaga`): the gaps the person
 * marked "já usei", in the posting's order, then the drafts its reading
 * brought. A gap is not a record: it lives only in this queue, and what it
 * becomes (an Accomplishment, a technology on a stack) goes to the Corpus.
 */
import type { AccomplishmentDoCorpus, Affiliation, Corpus } from '@/db';
import type { Forca } from '@/db/schema';
import type { PassoBloco } from '@/interrogatorio/bloco';
import { affiliationFechada, ehFormacao } from '@/interrogatorio/estado';

export type TipoAssunto = 'accomplishment' | 'affiliation' | 'anotacao' | 'novo' | 'oferta' | 'lacuna';

export interface Assunto {
  tipo: TipoAssunto;
  /** The record's id; the note's id; a fresh id for "contar algo novo"; a gap's Requisito id; `oferta` for the offer to stop. */
  id: string;
  /** What is still missing, as the questioner reads it ("falta: resultado"). */
  objetivo: string[];
  /** How many messages the session had when the subject opened: the questioner sees only what came after. */
  desde: number;
  /** A company's block or a degree's year, asked from the template (step 11). */
  bloco?: EstadoBloco;
}

export interface EstadoBloco {
  /** The steps already asked. */
  feitos: PassoBloco[];
  /** The step whose answer is awaited. */
  pendente: PassoBloco | null;
  /** The rule could not read an answer: the questioner has the subject from here. */
  modelo: boolean;
}

/** Something the person said that belongs to another subject, in her words. */
export interface Anotacao {
  id: string;
  texto: string;
  /** Not yet read by a checkpoint, about an existing accomplishment, something new, or about nothing. */
  destino: 'pendente' | 'accomplishment' | 'nova' | 'descartada';
  accomplishmentId: string | null;
}

export interface EstadoPlano {
  assunto: Assunto | null;
  fila: string[];
  anotacoes: Anotacao[];
  /** Keys (`affiliation:<id>`, `anotacao:<id>`, `lacuna:<id>`, `oferta`) of subjects that are done. */
  visitados: string[];
  cobertura: number;
  ofertaFeita: boolean;
  ultimoCheckpoint: number;
  /** The records the current retomada opened (step 14): they do not come back in it. */
  retomados: string[];
}

export const planoVazio = (): EstadoPlano => ({
  assunto: null,
  fila: [],
  anotacoes: [],
  visitados: [],
  cobertura: 0,
  ofertaFeita: false,
  ultimoCheckpoint: 0,
  retomados: [],
});

export const chaveDe = (a: { tipo: string; id: string }) => (a.tipo === 'oferta' ? 'oferta' : `${a.tipo}:${a.id}`);

/** Above this coverage, the questioner offers to stop. */
export const LIMIAR_COBERTURA = 70;
const PESO: Record<Forca, number> = { forte: 3, medio: 2, fraco: 1 };
const peso = (a: AccomplishmentDoCorpus) => PESO[a.forca ?? 'medio'];

/**
 * 0–100: the weight of what has a result over the weight of everything not
 * skipped, each record weighed by its strength (an unjudged one as medium).
 */
export function cobertura(corpus: Corpus): number {
  const vivos = corpus.accomplishments.filter((a) => !a.pulado);
  const total = vivos.reduce((s, a) => s + peso(a), 0);
  if (total === 0) return 0;
  const coberto = vivos.filter((a) => a.metrics.length > 0).reduce((s, a) => s + peso(a), 0);
  return Math.round((100 * coberto) / total);
}

export interface Contexto {
  /** Two years of work or more: a degree is asked for its year only. */
  experiente: boolean;
  /** The subject that just closed, for "the company's block comes after its last accomplishment". */
  anterior?: { tipo: TipoAssunto; id: string };
  /** The interrogation has ended and the person came back to it (step 14). */
  retomada?: boolean;
  /** A Vaga's conversation (step 16): its queue, and nothing else. */
  vaga?: FilaDaVaga;
}

/** What a Vaga's conversation asks about. */
export interface FilaDaVaga {
  /** The Requisitos marked "já usei", in the posting's order. */
  lacunas: string[];
  /** The drafts the reading brought, in its order. */
  rascunhos: string[];
}

const porForca = (a: AccomplishmentDoCorpus, b: AccomplishmentDoCorpus) => peso(b) - peso(a) || a.ordem - b.ordem;
const aberto = (a: AccomplishmentDoCorpus) => !a.pulado && a.metrics.length === 0;
const candidatos = (corpus: Corpus) => corpus.accomplishments.filter((a) => aberto(a) && !a.adiado).sort(porForca);
/** Skipped with no result: back only in a retomada. */
const puladoSemResultado = (a: AccomplishmentDoCorpus) => a.pulado && a.metrics.length === 0;

/**
 * What the general conversation can go back to once it has ended: the
 * drafts, strongest first, then what was skipped, then what was postponed.
 * The home counts it ("Continuar a conversa").
 */
export function filaAberta(corpus: Corpus): string[] {
  const pulados = corpus.accomplishments.filter(puladoSemResultado).sort(porForca);
  const adiados = corpus.accomplishments.filter((a) => aberto(a) && a.adiado).sort(porForca);
  return [...candidatos(corpus), ...pulados, ...adiados].map((a) => a.id);
}

/** A company whose block is still owed. */
const blocoDevido = (af: Affiliation, visitados: Set<string>) =>
  af.tipo === 'emprego' && !af.pulado && !affiliationFechada(af) && !visitados.has(`affiliation:${af.id}`);
/** A degree still owed: open, or closed but owed "something notable?" to someone with little work. */
const formacaoDevida = (af: Affiliation, visitados: Set<string>, experiente: boolean) =>
  ehFormacao(af) && !af.pulado && !visitados.has(`affiliation:${af.id}`) && (!affiliationFechada(af) || !experiente);

/**
 * A Vaga's queue: the gaps not yet asked, then the drafts it brought that are
 * still without a result and that this Vaga has not opened (`retomados`: a
 * Vaga's plan is never retaken, so what it opened stays out).
 */
function ordemDaVaga(corpus: Corpus, estado: EstadoPlano, vaga: FilaDaVaga, visitados: Set<string>) {
  const abertos = new Set(estado.retomados);
  const rascunhos = vaga.rascunhos.filter((id) => {
    const a = corpus.accomplishments.find((x) => x.id === id);
    return a && a.metrics.length === 0 && !abertos.has(id);
  });
  return [
    ...vaga.lacunas.filter((id) => !visitados.has(`lacuna:${id}`)).map((id) => ({ tipo: 'lacuna' as const, id })),
    ...rascunhos.map((id) => ({ tipo: 'accomplishment' as const, id })),
  ];
}

function ordem(corpus: Corpus, estado: EstadoPlano, ctx: Contexto): { tipo: TipoAssunto; id: string }[] {
  const visitados = new Set(estado.visitados);
  const lista: { tipo: TipoAssunto; id: string }[] = [];
  for (const n of estado.anotacoes) {
    if (n.destino === 'nova' && !visitados.has(`anotacao:${n.id}`)) lista.push({ tipo: 'anotacao', id: n.id });
  }
  // In a Vaga, what the person asked about comes first; a note, after it.
  if (ctx.vaga) return [...ordemDaVaga(corpus, estado, ctx.vaga, visitados), ...lista];
  const retomados = new Set(ctx.retomada ? estado.retomados : []);
  const abertos = candidatos(corpus).filter((a) => !retomados.has(a.id));
  const deixou = ctx.anterior?.tipo === 'accomplishment' ? corpus.accomplishments.find((a) => a.id === ctx.anterior!.id) : undefined;
  const lugar = deixou?.affiliationId ? corpus.affiliations.find((af) => af.id === deixou.affiliationId) : undefined;
  if (lugar && blocoDevido(lugar, visitados) && !abertos.some((a) => a.affiliationId === lugar.id)) {
    lista.push({ tipo: 'affiliation', id: lugar.id });
  }
  lista.push(...abertos.map((a) => ({ tipo: 'accomplishment' as const, id: a.id })));
  for (const af of corpus.affiliations) if (blocoDevido(af, visitados)) lista.push({ tipo: 'affiliation', id: af.id });
  for (const af of corpus.affiliations) if (formacaoDevida(af, visitados, ctx.experiente)) lista.push({ tipo: 'affiliation', id: af.id });
  if (ctx.retomada) {
    const pulados = corpus.accomplishments.filter((a) => puladoSemResultado(a) && !retomados.has(a.id)).sort(porForca);
    lista.push(...pulados.map((a) => ({ tipo: 'accomplishment' as const, id: a.id })));
  }
  // Back once, even in a retomada that already opened it: postponing is not skipping.
  // One a previous retomada brought back and left without a result (it ended
  // first) comes back in the next one, as the home counts it.
  const devolvido = (a: AccomplishmentDoCorpus) => !a.adiadoVoltou || (ctx.retomada === true && !retomados.has(a.id));
  const adiados = corpus.accomplishments.filter((a) => aberto(a) && a.adiado && devolvido(a)).sort(porForca);
  lista.push(...adiados.map((a) => ({ tipo: 'accomplishment' as const, id: a.id })));

  const vistos = new Set<string>();
  return lista.filter((a) => !vistos.has(chaveDe(a)) && vistos.add(chaveDe(a)));
}

/** The subject after the current one, or null when nothing is left. */
export function proximoAssunto(corpus: Corpus, estado: EstadoPlano, ctx: Contexto): { tipo: TipoAssunto; id: string } | null {
  const atual = estado.assunto ? chaveDe(estado.assunto) : null;
  return ordem(corpus, estado, ctx).find((a) => chaveDe(a) !== atual) ?? null;
}

/** At the offer to stop: up to 4 accomplishments still in the queue, in its order (strongest first). */
export function pendentesDaOferta(corpus: Corpus, estado: EstadoPlano, ctx: Contexto): string[] {
  return ordem(corpus, estado, ctx)
    .filter((a) => a.tipo === 'accomplishment')
    .slice(0, 4)
    .map((a) => a.id);
}

/** What comes after the current subject, as keys: the panel's snapshot. */
export function fila(corpus: Corpus, estado: EstadoPlano, ctx: Contexto): string[] {
  const atual = estado.assunto ? chaveDe(estado.assunto) : null;
  return ordem(corpus, estado, ctx).map(chaveDe).filter((k) => k !== atual);
}

/** The goal of a subject that is opening, from what the Corpus is missing. */
export function objetivoDoAssunto(
  corpus: Corpus,
  assunto: { tipo: TipoAssunto; id: string },
  ctx: Pick<Contexto, 'experiente' | 'retomada'>,
): string[] {
  if (assunto.tipo === 'oferta') return ['ofereça o fim: o que foi coberto já dá um currículo forte'];
  if (assunto.tipo === 'anotacao') return ['falta: entender o que é isto que a pessoa citou, para virar um registro'];
  if (assunto.tipo === 'lacuna') {
    return [
      'falta: onde e como a pessoa usou isto (em qual empresa ou projeto, fazendo o quê)',
      'falta: gravar o que ela contou: um trabalho com cenário vira registro (criar_accomplishment); uma ferramenta do dia a dia numa empresa vai para a stack dela (acrescentar_stack)',
    ];
  }
  if (assunto.tipo === 'novo') {
    return ['falta: saber o que a pessoa quer contar (um trabalho, um projeto ou um resultado que ainda não está aqui) e criar o registro'];
  }
  if (assunto.tipo === 'accomplishment') {
    const a = corpus.accomplishments.find((x) => x.id === assunto.id);
    // Reopened in a retomada, a record gets the usual goal: the person came back for it.
    if (a?.adiadoVoltou && !ctx.retomada) return ['falta: um resultado qualitativo concreto; se não houver, pule este assunto'];
    return objetivoDeAccomplishment({ problema: false, contribuicao: false, resultado: Boolean(a?.metrics.length), comoSabe: false }, a);
  }
  const af = corpus.affiliations.find((x) => x.id === assunto.id);
  if (!af) return [];
  if (ehFormacao(af)) {
    return [
      ...(af.anoConclusao ? [] : ['falta: o ano de conclusão (ou, se ainda está cursando, a previsão)']),
      ...(ctx.experiente ? [] : ['falta: se houve algo notável no curso (TCC, prêmio, monitoria): pergunte uma vez só']),
    ];
  }
  return [
    ...(af.periodoConfirmado ? [] : ['falta: mês e ano de início e de fim (ou se ainda está lá)']),
    ...(af.descricaoPublica?.trim() ? [] : ['falta: o que a empresa é, para um recrutador estrangeiro']),
    'falta: se o nome pode aparecer no currículo',
  ];
}

/** What a checkpoint saw (yes or no) about an accomplishment. */
export interface Visto {
  problema: boolean;
  contribuicao: boolean;
  resultado: boolean;
  comoSabe: boolean;
}

/**
 * The goal from what came back "no": no one writes it, the template does. A
 * result the person said and nobody recorded comes first; how she knows it
 * never holds it back.
 */
export function objetivoDeAccomplishment(
  visto: Visto,
  a?: Pick<AccomplishmentDoCorpus, 'importanciaParaPessoa' | 'metrics'>,
): string[] {
  const semGravar = visto.resultado && a?.metrics.length === 0;
  return [
    ...(semGravar ? ['falta: gravar o resultado que ela já disse (registrar_metric), mesmo sem saber como ela sabe'] : []),
    ...(visto.problema ? [] : ['falta: o problema (o que existia antes, para quem)']),
    ...(visto.contribuicao ? [] : ['falta: o que foi da pessoa, não do time']),
    ...(visto.resultado ? [] : ['falta: resultado']),
    ...(visto.comoSabe ? [] : [`${semGravar ? 'se sobrar' : 'falta'}: como ela sabe o resultado`]),
    ...(a && !a.importanciaParaPessoa ? ['se sobrar: o quanto isto importa para ela (uma vez, leve)'] : []),
  ];
}

export type Decisao = 'continuar' | 'trocar' | 'adiar';
export type Gatilho =
  | 'inicio'
  | 'metric'
  | 'concluir'
  | 'pulou'
  | 'nao_sei'
  | 'perguntas'
  | 'oferta'
  | 'criou'
  | 'bloco'
  /** From the home (step 14): the conversation opened again, or "contar algo novo". */
  | 'retomada'
  | 'novo'
  /** A gap became a technology on a company's stack (step 16). */
  | 'stack';

/** Where an accomplishment ends after a decision. */
export function destinoDoAccomplishment(
  a: Pick<AccomplishmentDoCorpus, 'pulado' | 'metrics' | 'adiadoVoltou'>,
  decisao: Decisao,
): 'fica' | 'fechado' | 'adiado' | 'pulado' {
  if (a.pulado) return 'pulado';
  if (decisao === 'continuar') return 'fica';
  if (a.metrics.length) return 'fechado';
  return a.adiadoVoltou ? 'pulado' : 'adiado';
}

/** The fixed rules when the Jev is out (decision 13): one checkpoint at a time. */
export function decisaoDeReserva(gatilho: Gatilho): Decisao {
  if (gatilho === 'metric' || gatilho === 'pulou' || gatilho === 'criou' || gatilho === 'bloco' || gatilho === 'stack') return 'trocar';
  if (gatilho === 'nao_sei') return 'adiar';
  return 'continuar';
}
