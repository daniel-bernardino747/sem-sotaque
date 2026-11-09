// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The evaluator: a checkpoint reads the current subject, asks the Jev closed
 * questions about it (is the problem clear? the person's part? is there a
 * result? does she say how she knows?), and decides: continue with a new goal,
 * move on, or postpone. It also judges each Accomplishment's strength, which
 * orders the queue and weighs the coverage, and reads the notes the
 * questioner left for later.
 *
 * What goes to the Jev is pseudonymised and checked first (`./pseudonimo`).
 * When the Jev fails (error, timeout, an answer that does not fit), or the
 * person said no to it, the fixed rules of `decisaoDeReserva` decide that
 * checkpoint alone, and every failure is a row in the timeline.
 *
 * A Vaga's conversation (step 16) runs on the same functions with the Vaga's
 * id: its own plan and messages, the queue of `plano.ts` restricted to the
 * Vaga, no offer to stop, and the Vaga's company sent to the Jev as "Empresa X".
 * What it writes goes to the general Corpus.
 */
import { randomUUID } from 'node:crypto';

import {
  atualizarAccomplishment,
  atualizarCobertura,
  corpusDaSessao,
  decisoesDaSessao,
  gravarPlano,
  linhasDaSessao,
  mensagensDaSessao,
  planoDaSessao,
  registrarDecisao,
  sessaoPorId,
  textoImportado,
  vagaDaSessao,
  type Corpus,
  type LinhaOriginal,
  type Mensagem,
} from '@/db';
import { ESTADOS_SESSAO, type EstadoSessao, type Forca } from '@/db/schema';
import { MESES_PARA_IGNORAR_FORMACAO, mesesDeExperiencia } from '@/import/formacao';
import { affiliationFechada, ehFormacao } from '@/interrogatorio/estado';

import { ErroClassificador, type Classificador, type PedidoClassificador, type Questions, type Respostas } from './jev';
import {
  chaveDe,
  cobertura,
  decisaoDeReserva,
  destinoDoAccomplishment,
  fila,
  filaAberta,
  LIMIAR_COBERTURA,
  objetivoDeAccomplishment,
  objetivoDoAssunto,
  pendentesDaOferta,
  planoVazio,
  proximoAssunto,
  type Anotacao,
  type Assunto,
  type Decisao,
  type EstadoPlano,
  type FilaDaVaga,
  type Gatilho,
  type TipoAssunto,
} from './plano';
import { conferirPayload, protegidos, pseudonimizar, type Protegidos } from './pseudonimo';

export * from './plano';

export interface DepsAvaliador {
  /** The Jev, or null (no `TYPESAFE_API_KEY`, or the person did not accept it): the fixed rules decide. */
  classificador: Classificador | null;
}

export interface ResultadoCheckpoint {
  estado: EstadoPlano;
  /** The subject changed. */
  mudou: boolean;
  /** Nothing is left, or the person accepted the offer to stop. */
  encerrar: boolean;
}

/** A Jev answer counts as "yes" from here. */
const SIM = 0.5;
/** Without the Jev, the answer to the offer to stop reads as "stop" when it says so plainly. */
const QUER_PARAR = /\b(?:pode parar|parar aqui|para aqui|pode gerar|chega|encerr|termin|é isso|era isso|só isso|nada mais)/i;

// ---- the plan as stored ---------------------------------------------------------

/** A conversation's plan: the general one, or a Vaga's. */
export async function estadoDoPlano(sessaoId: string, vagaId: string | null = null): Promise<EstadoPlano | null> {
  const linha = await planoDaSessao(sessaoId, vagaId);
  if (!linha) return null;
  return {
    assunto: (linha.assunto as Assunto | null) ?? null,
    fila: linha.fila as string[],
    anotacoes: linha.anotacoes as Anotacao[],
    visitados: linha.visitados as string[],
    cobertura: linha.cobertura,
    ofertaFeita: linha.ofertaFeita,
    ultimoCheckpoint: linha.ultimoCheckpoint,
    retomados: linha.retomados as string[],
  };
}

/** A note's words without case, accents, quotes or punctuation: the same speech noted twice compares equal. */
const palavrasDa = (texto: string) =>
  texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The words that tell two notes apart: three letters or more, and every number. */
const palavrasQueContam = (texto: string) => new Set(palavrasDa(texto).split(' ').filter((p) => p.length >= 3 || /\d/.test(p)));

/**
 * The same thing noted again in other words: the words shared over all the
 * words (Jaccard) at least 0.7. Copies of one note measured 0.90–0.95; two
 * pieces of work at the same company, 0.50 at most.
 */
function mesmaAnotacao(a: string, b: string): boolean {
  const pa = palavrasQueContam(a);
  const pb = palavrasQueContam(b);
  const comuns = [...pa].filter((p) => pb.has(p)).length;
  const todas = pa.size + pb.size - comuns;
  return todas === 0 || comuns / todas >= 0.7;
}

/**
 * The questioner's `anotar_para_depois`: kept for the next checkpoint, which
 * reads it. The same thing again, even reworded, is not a second note: the
 * speech is still in the questioner's recent messages after a switch, and the
 * subject of a record created from a note shows that note (step 12: one Pix
 * alert noted three times became three records).
 */
export async function anotarParaDepois(sessaoId: string, texto: string, vagaId: string | null = null): Promise<void> {
  const estado = (await estadoDoPlano(sessaoId, vagaId)) ?? planoVazio();
  if (estado.anotacoes.some((n) => mesmaAnotacao(n.texto, texto))) return;
  estado.anotacoes.push({ id: randomUUID().slice(0, 8), texto, destino: 'pendente', accomplishmentId: null });
  await gravarPlano(sessaoId, estado, vagaId);
}

/** A pending subject the offer to stop shows: its resume line (or its statement) and where. */
export interface OpcaoOferta {
  id: string;
  rotulo: string;
}

const MAX_ROTULO = 90;

/** What the offer to stop lists under it; empty when the subject is not the offer. */
export async function opcoesDaOferta(sessaoId: string, vagaId: string | null = null): Promise<OpcaoOferta[]> {
  const d = await carregar(sessaoId, vagaId);
  if (d.estado.assunto?.tipo !== 'oferta') return [];
  return pendentesDaOferta(d.corpus, d.estado, d.ctx).map((id) => {
    const a = d.corpus.accomplishments.find((x) => x.id === id)!;
    const texto = d.linhas.find((l) => l.accomplishmentId === id)?.texto ?? a.enunciado;
    const curto = texto.length > MAX_ROTULO ? `${texto.slice(0, MAX_ROTULO - 1).trimEnd()}…` : texto;
    const af = a.affiliation;
    const onde = af ? (af.confidencial ? af.descricaoPublica : af.organizacao) : null;
    return { id, rotulo: onde ? `${curto} (${onde})` : curto };
  });
}

/**
 * The person picked one of the offer's pending subjects: it opens, and the
 * offer does not come back. Throws when the subject is not the offer or the
 * pick is not on its list.
 */
export async function escolherAssunto(sessaoId: string, id: string, vagaId: string | null = null): Promise<EstadoPlano> {
  const d = await carregar(sessaoId, vagaId);
  const estado = d.estado;
  if (estado.assunto?.tipo !== 'oferta') throw new Error('the subject is not the offer to stop');
  if (!pendentesDaOferta(d.corpus, estado, d.ctx).includes(id)) {
    throw new Error("the pick is not one of the offer's options");
  }
  const proximo = { tipo: 'accomplishment' as const, id };
  estado.assunto = await abrir(sessaoId, d, proximo);
  estado.fila = fila(d.corpus, estado, d.ctx);
  estado.ultimoCheckpoint = d.mensagens.length;
  await gravarPlano(sessaoId, estado, vagaId);
  await registrarDecisao(sessaoId, {
    vagaId,
    gatilho: 'oferta',
    assunto: { tipo: 'oferta', id: 'oferta' },
    decisao: 'escolheu',
    motivo: 'a pessoa escolheu voltar a um assunto pendente',
    cobertura: estado.cobertura,
    proximo,
    backend: 'pessoa',
    erro: null,
  });
  return estado;
}

/**
 * The person came back to the conversation from the home (step 14), after it
 * ended: a new retomada. The offer to stop can come again, nothing was opened
 * in it yet, and a subject that is no longer open (none, the offer, a record
 * that got its result, a company's block) is the first of the open queue, or
 * null when nothing is open.
 */
export async function retomar(sessaoId: string): Promise<EstadoPlano> {
  const d = await carregar(sessaoId);
  const estado = d.estado;
  estado.ofertaFeita = false;
  estado.retomados = [];
  // The subject the interrogation ended on stays only while it is still open
  // (a record in the open queue, a note, something new); otherwise the queue decides.
  const atual = estado.assunto;
  const segueAberto =
    atual?.tipo === 'accomplishment' ? filaAberta(d.corpus).includes(atual.id) : atual?.tipo === 'anotacao' || atual?.tipo === 'novo';
  if (!segueAberto) {
    const alvo = proximoAssunto(d.corpus, { ...estado, assunto: null }, d.ctx);
    estado.assunto = alvo ? await abrir(sessaoId, d, alvo) : null;
    await registrarDecisao(sessaoId, {
      gatilho: 'retomada',
      assunto: null,
      decisao: 'retomou',
      motivo: `${MOTIVO.retomada}: ${alvo ? 'o primeiro da fila aberta' : 'nada em aberto'}`,
      cobertura: estado.cobertura,
      proximo: alvo,
      backend: 'pessoa',
      erro: null,
    });
  }
  estado.fila = fila(d.corpus, estado, d.ctx);
  estado.ultimoCheckpoint = d.mensagens.length;
  await gravarPlano(sessaoId, estado);
  return estado;
}

/**
 * "Contar algo novo": a subject for a record that does not exist yet, in
 * front of the queue. The questioner asks what the person wants to tell and
 * creates it with its tools; the subject that was open comes back in the queue.
 */
export async function contarAlgoNovo(sessaoId: string): Promise<EstadoPlano> {
  const d = await carregar(sessaoId);
  const estado = d.estado;
  if (d.retomada && estado.assunto?.tipo !== 'novo') {
    estado.ofertaFeita = false;
    estado.retomados = [];
  }
  const alvo = { tipo: 'novo' as const, id: randomUUID().slice(0, 8) };
  estado.assunto = await abrir(sessaoId, d, alvo);
  estado.fila = fila(d.corpus, estado, d.ctx);
  estado.ultimoCheckpoint = d.mensagens.length;
  await gravarPlano(sessaoId, estado);
  await registrarDecisao(sessaoId, {
    gatilho: 'novo',
    assunto: null,
    decisao: 'contar_algo_novo',
    motivo: MOTIVO.novo,
    cobertura: estado.cobertura,
    proximo: alvo,
    backend: 'pessoa',
    erro: null,
  });
  return estado;
}

/**
 * A Vaga's conversation opens (step 16), from the Vaga's page: its plan is
 * created the first time, and a subject that is no longer open (none, a gap
 * already asked, a record that got its result or was skipped) gives way to the
 * first of the Vaga's queue, or null when nothing is left. No Jev: the
 * strength of each record was judged in the general conversation.
 */
export async function abrirConversaDaVaga(sessaoId: string, vagaId: string): Promise<EstadoPlano> {
  const d = await carregar(sessaoId, vagaId);
  const estado = d.estado;
  if (!(estado.assunto && segueAberto(d, estado.assunto))) {
    const alvo = proximoAssunto(d.corpus, { ...estado, assunto: null }, d.ctx);
    estado.assunto = alvo ? await abrir(sessaoId, d, alvo) : null;
    await registrarDecisao(sessaoId, {
      vagaId,
      gatilho: 'retomada',
      assunto: null,
      decisao: 'abriu_vaga',
      motivo: `${MOTIVO.retomada}: ${alvo ? 'o primeiro da fila da vaga' : 'nada em aberto na vaga'}`,
      cobertura: estado.cobertura,
      proximo: alvo,
      backend: 'pessoa',
      erro: null,
    });
  }
  estado.fila = fila(d.corpus, estado, d.ctx);
  estado.ultimoCheckpoint = d.mensagens.length;
  await gravarPlano(sessaoId, estado, vagaId);
  return estado;
}

/** How many questions a Vaga's conversation still has: its queue, with the subject open now. */
export async function perguntasEmAberto(sessaoId: string, vagaId: string): Promise<number> {
  const d = await carregar(sessaoId, vagaId);
  const atual = d.estado.assunto;
  const depois = fila(d.corpus, { ...d.estado, assunto: null }, d.ctx).filter((k) => !atual || k !== chaveDe(atual));
  const agora = atual && segueAberto(d, atual) ? 1 : 0;
  return depois.length + agora;
}

/** At the end: what was postponed and never came back is skipped. */
export async function pularAdiados(sessaoId: string): Promise<void> {
  const corpus = await corpusDaSessao(sessaoId);
  for (const a of corpus.accomplishments) {
    if (a.adiado && !a.pulado && a.metrics.length === 0) await atualizarAccomplishment(sessaoId, a.id, { pulado: true });
  }
}

// ---- the Jev, guarded ---------------------------------------------------------------

/** Refuses, without calling, a payload that still names the person or an organisation. */
export async function classificarProtegido<Q extends Questions>(
  classificador: Classificador,
  pedido: PedidoClassificador<Q>,
  lista: Protegidos,
): Promise<Respostas<Q>> {
  const achados = conferirPayload({ state: pedido.state, questions: pedido.questions }, lista);
  if (achados.length) throw new ErroClassificador('payload', `payload refused: it still has ${achados.join(', ')}`);
  return classificador.classificar(pedido);
}

type Resposta = { type: string; noul?: number; choice?: string; score?: number };

async function perguntar(
  deps: DepsAvaliador,
  sessaoId: string,
  lista: Protegidos,
  state: unknown,
  questions: Questions,
  vagaId: string | null = null,
): Promise<{ respostas: Record<string, Resposta> | null; erro: string | null }> {
  if (!deps.classificador || Object.keys(questions).length === 0) return { respostas: null, erro: null };
  const pedido = pseudonimizar({ state, questions }, lista);
  try {
    const respostas = await classificarProtegido(
      deps.classificador,
      { sessaoId, vagaId, state: pedido.state as never, questions: pedido.questions },
      lista,
    );
    return { respostas: respostas as Record<string, Resposta>, erro: null };
  } catch (e) {
    const motivo = e instanceof ErroClassificador ? `${e.motivo}: ${e.message}` : e instanceof Error ? e.message : String(e);
    return { respostas: null, erro: motivo };
  }
}

// ---- the questions --------------------------------------------------------------------

const FORCA: [string, string, string] = [
  'weak: routine duties or vague work anyone in the role would do, with no visible scope or outcome',
  'medium: a concrete piece of work with some scope, but a modest or unclear outcome',
  'strong: work with clear scope and impact (a system built or rebuilt, time or money saved, many users, a hard problem solved) that could lead a résumé',
];
const forcaDe = (score: number): Forca => (['fraco', 'medio', 'forte'] as const)[Math.max(0, Math.min(2, Math.round(score)))];

const DECISAO_ACCOMPLISHMENT = {
  continue: 'Worth one more question: the person is giving useful answers and something that matters (the result, how they know it, what was theirs) is still missing.',
  move_on: 'Done: a concrete result is recorded and it is clear how they know it, or there is nothing more to get from this item.',
  postpone: 'The person does not know the result right now, or the answers are going nowhere: better to come back to it later.',
};
const DECISAO_BLOCO = {
  continue: 'Something on the list `missing` is still unanswered and the person seems able to answer it.',
  move_on: 'Nothing on `missing` is left, or the person does not know or will not say.',
  postpone: 'The person does not know right now.',
};
const PARA_DECISAO: Record<string, Decisao> = { continue: 'continuar', move_on: 'trocar', postpone: 'adiar' };

const perguntasDeAccomplishment = (): Questions => ({
  problem: { type: 'noul', instructions: 'Reading `item` and `interview`, is it clear what problem or situation existed before this work, and for whom?' },
  contribution: { type: 'noul', instructions: 'Is it clear what this person did themselves, as opposed to the team?' },
  result: {
    type: 'noul',
    instructions: 'Has the person stated a concrete result of this work: a number, or a concrete change someone could point to? Results in `item.results_recorded` count.',
  },
  evidence: { type: 'noul', instructions: 'Has the person said how they know the result: where it was measured, by whom, or compared to what?' },
  decision: { type: 'choice', instructions: 'Given `item`, `interview` and `event`, what should the interviewer do next?', criteria: DECISAO_ACCOMPLISHMENT },
  strength: { type: 'score', instructions: 'How strong is `item` as evidence on a software engineer\'s résumé?', criteria: FORCA },
});

/** One question per pending note: which accomplishment (by item label) it is about, or something new. */
function perguntasDeAnotacoes(pendentes: Anotacao[], itens: { id: string; what: string }[]): Questions {
  const criterios = {
    ...Object.fromEntries(itens.map((i) => [i.id, i.what.slice(0, 300)])),
    new: 'Work, a project or a result that is not in the list',
    none: 'Not about any piece of work',
  };
  return Object.fromEntries(
    pendentes.map((n, i) => [`note_${i}`, { type: 'choice', instructions: `Which item of the list is \`notes[${i}]\` about?`, criteria: criterios }]),
  );
}

// ---- what the Jev reads ------------------------------------------------------------------

function conversaDesde(mensagens: Mensagem[], desde: number) {
  return mensagens
    .slice(desde)
    .filter((m) => m.papel !== 'sistema')
    .map((m) => ({ from: m.papel === 'assistente' ? 'interviewer' : 'person', text: m.conteudo }));
}

const EVENTO: Record<Gatilho, string> = {
  inicio: 'the interview is starting',
  metric: 'a result was just recorded',
  concluir: 'the interviewer thinks this item is done',
  pulou: 'the person skipped it',
  nao_sei: 'the person said "I don\'t know" twice in a row',
  perguntas: 'two questions were asked since the last check',
  oferta: 'the person answered the offer to stop',
  criou: 'a new item was created',
  bloco: 'the company questions were answered',
  retomada: 'the person came back to the interview',
  novo: 'the person wants to tell something new',
  stack: "a technology was added to a company's stack",
};

function itemDe(corpus: Corpus, linhas: LinhaOriginal[], id: string) {
  const a = corpus.accomplishments.find((x) => x.id === id);
  if (!a) return null;
  return {
    what: a.enunciado,
    resume_line: linhas.filter((l) => l.accomplishmentId === id).map((l) => l.texto),
    results_recorded: a.metrics.map((m) => m.texto),
    organisation: a.affiliation?.organizacao ?? null,
    role: a.affiliation?.cargo ?? null,
    stack: a.affiliation?.stack ?? [],
  };
}

const itensAbertos = (corpus: Corpus) =>
  corpus.accomplishments.filter((a) => !a.pulado).map((a, i) => ({ id: `item_${i}`, accomplishmentId: a.id, what: a.enunciado }));

// ---- the checkpoint ---------------------------------------------------------------------

const MOTIVO: Record<Gatilho, string> = {
  inicio: 'início do interrogatório',
  metric: 'metric gravada',
  concluir: 'o questionador sugeriu concluir',
  pulou: 'a pessoa pulou',
  nao_sei: 'segundo "não sei" seguido',
  perguntas: '2 perguntas sem outro gatilho',
  oferta: 'resposta à oferta de fim',
  criou: 'registro novo criado',
  bloco: 'bloco da empresa respondido',
  retomada: 'a pessoa voltou à conversa',
  novo: 'a pessoa pediu para contar algo novo',
  stack: 'tecnologia acrescentada à stack',
};

/** The interrogation has ended and the person came back to it (step 14): the state never goes back. */
export const emRetomada = (estado: EstadoSessao | undefined) =>
  estado !== undefined && ESTADOS_SESSAO.indexOf(estado) > ESTADOS_SESSAO.indexOf('interrogando');

async function carregar(sessaoId: string, vagaId: string | null = null) {
  const [corpus, mensagens, linhas, texto, estado, sessao, vagaLida] = await Promise.all([
    corpusDaSessao(sessaoId),
    mensagensDaSessao(sessaoId, vagaId),
    linhasDaSessao(sessaoId),
    textoImportado(sessaoId),
    estadoDoPlano(sessaoId, vagaId),
    sessaoPorId(sessaoId),
    vagaId ? vagaDaSessao(sessaoId, vagaId) : null,
  ]);
  if (vagaId && !vagaLida) throw new Error(`no live Vaga ${vagaId} in this session`);
  const lista = protegidos({ curriculo: texto, organizacoes: corpus.affiliations.map((a) => a.organizacao), vaga: vagaLida?.empresa });
  const experiente = mesesDeExperiencia(corpus.affiliations) >= MESES_PARA_IGNORAR_FORMACAO;
  // A Vaga's conversation reads like a retomada: what it opened does not come back in it.
  const retomada = emRetomada(sessao?.estado) || Boolean(vagaId);
  const lacunas = (vagaLida?.requisitos ?? []).filter((r) => r.lacuna && r.resposta === 'ja_usei');
  const vaga: FilaDaVaga | undefined = vagaLida
    ? { lacunas: lacunas.map((r) => r.id), rascunhos: (vagaLida.rascunhos ?? []).map((r) => r.accomplishmentId) }
    : undefined;
  return {
    corpus,
    mensagens,
    linhas,
    lista,
    experiente,
    retomada,
    vagaId,
    /** A gap's requirement, in the posting's words. */
    requisitos: new Map(lacunas.map((r) => [r.id, r.texto])),
    ctx: { experiente, retomada, vaga },
    estado: estado ?? planoVazio(),
  };
}

type Carregado = Awaited<ReturnType<typeof carregar>>;

/**
 * A Vaga's subject that is still worth a question: a gap not asked, a record
 * with no result (one the general conversation skipped too, as the Vaga's
 * queue asks it), a note.
 */
function segueAberto(d: Carregado, assunto: Assunto): boolean {
  if (assunto.tipo === 'lacuna') return d.requisitos.has(assunto.id) && !d.estado.visitados.includes(chaveDe(assunto));
  if (assunto.tipo === 'accomplishment') {
    const a = d.corpus.accomplishments.find((x) => x.id === assunto.id);
    return Boolean(a && a.metrics.length === 0);
  }
  return assunto.tipo === 'anotacao';
}

/**
 * Opens a subject: its goal, a postponed record marked as back, and, in a
 * retomada, the record kept in `retomados` so it does not come back in it.
 */
async function abrir(sessaoId: string, d: Carregado, alvo: { tipo: TipoAssunto; id: string }): Promise<Assunto> {
  if (alvo.tipo === 'accomplishment') {
    const a = d.corpus.accomplishments.find((x) => x.id === alvo.id);
    // A Vaga asking a postponed draft does not spend the general conversation's "once more".
    if (a?.adiado && !a.adiadoVoltou && !d.vagaId) {
      await atualizarAccomplishment(sessaoId, a.id, { adiadoVoltou: true });
      a.adiadoVoltou = true;
    }
    if (d.retomada && !d.estado.retomados.includes(alvo.id)) d.estado.retomados.push(alvo.id);
  }
  return { ...alvo, objetivo: objetivoDoAssunto(d.corpus, alvo, d.ctx), desde: d.mensagens.length };
}

/**
 * The first checkpoint: every accomplishment judged, the first subject chosen.
 * One that already has a strength keeps it: a Corpus file brings the
 * evaluator's judgement with it (step 27, C2), and asking again would undo it.
 */
export async function iniciarPlano(sessaoId: string, deps: DepsAvaliador): Promise<EstadoPlano> {
  const d = await carregar(sessaoId);
  const semForca = new Set(d.corpus.accomplishments.filter((a) => a.forca === null).map((a) => a.id));
  const itens = itensAbertos(d.corpus).filter((i) => semForca.has(i.accomplishmentId));
  const { respostas, erro } = await perguntar(
    deps,
    sessaoId,
    d.lista,
    { items: itens.map((i) => ({ id: i.id, ...itemDe(d.corpus, d.linhas, i.accomplishmentId) })) },
    Object.fromEntries(
      itens.map((i) => [`strength_${i.id}`, { type: 'score', instructions: `How strong is the item \`${i.id}\` of \`items\` as evidence on a software engineer's résumé?`, criteria: FORCA }]),
    ),
  );
  if (respostas) {
    for (const i of itens) {
      const forca = forcaDe(respostas[`strength_${i.id}`].score ?? 1);
      await atualizarAccomplishment(sessaoId, i.accomplishmentId, { forca });
      const a = d.corpus.accomplishments.find((x) => x.id === i.accomplishmentId)!;
      a.forca = forca;
    }
  }
  const estado = d.estado;
  const alvo = proximoAssunto(d.corpus, estado, d.ctx);
  estado.assunto = alvo ? await abrir(sessaoId, d, alvo) : null;
  if (respostas || !deps.classificador || itens.length === 0) estado.cobertura = cobertura(d.corpus);
  estado.fila = fila(d.corpus, estado, d.ctx);
  estado.ultimoCheckpoint = d.mensagens.length;
  await gravarPlano(sessaoId, estado);
  await registrarDecisao(sessaoId, {
    gatilho: 'inicio',
    assunto: null,
    decisao: 'plano_inicial',
    motivo: `${MOTIVO.inicio}: ${itens.length} accomplishments ${respostas ? 'avaliados' : 'na ordem do currículo'}${erro ? ' (regra de reserva)' : ''}`,
    cobertura: estado.cobertura,
    proximo: alvo,
    backend: respostas ? 'jev' : 'reserva',
    erro,
  });
  return estado;
}

/**
 * One checkpoint on the current subject. Reads and writes the plan; the caller
 * (the turn) rebuilds the questioner's context when `mudou`.
 */
export async function checkpoint(
  sessaoId: string,
  gatilho: Gatilho,
  deps: DepsAvaliador,
  opcoes: { criado?: string | null; vagaId?: string | null } = {},
): Promise<ResultadoCheckpoint> {
  const vagaId = opcoes.vagaId ?? null;
  const d = await carregar(sessaoId, vagaId);
  const { corpus, mensagens, experiente } = d;
  const estado = d.estado;
  const atual = estado.assunto;
  if (!atual) return { estado, mudou: false, encerrar: true };

  // ---- the questions for this subject, and the pending notes ----
  const pendentes = estado.anotacoes.filter((n) => n.destino === 'pendente');
  const itens = itensAbertos(corpus);
  const conversa = conversaDesde(mensagens, atual.desde);
  const ultimaFala = [...mensagens].reverse().find((m) => m.papel === 'pessoa')?.conteudo ?? '';
  // The answer to the offer is read like a note: the Jev says whether it names
  // a record already there, something new, or nothing. Without the Jev, nothing
  // is guessed from it.
  let notaDaOferta: Anotacao | null = null;
  if (atual.tipo === 'oferta' && gatilho === 'oferta' && ultimaFala && deps.classificador) {
    notaDaOferta = { id: randomUUID().slice(0, 8), texto: ultimaFala, destino: 'pendente', accomplishmentId: null };
    estado.anotacoes.push(notaDaOferta);
    pendentes.push(notaDaOferta);
  }
  let state: Record<string, unknown> = { interview: conversa, event: EVENTO[gatilho] };
  let questions: Questions = {};
  if (atual.tipo === 'accomplishment') {
    state = { ...state, item: itemDe(corpus, d.linhas, atual.id) };
    questions = perguntasDeAccomplishment();
  } else if (atual.tipo === 'affiliation') {
    const af = corpus.affiliations.find((a) => a.id === atual.id);
    state = { ...state, item: { organisation: af?.organizacao, kind: af && ehFormacao(af) ? 'degree' : 'employer', missing: atual.objetivo } };
    questions = { decision: { type: 'choice', instructions: 'Given `item.missing` and `interview`, what should the interviewer do next?', criteria: DECISAO_BLOCO } };
  } else if (atual.tipo === 'anotacao' || atual.tipo === 'novo') {
    questions = { decision: { type: 'choice', instructions: 'Is what the person mentioned understood well enough to be recorded?', criteria: DECISAO_BLOCO } };
  } else if (atual.tipo === 'lacuna') {
    state = { ...state, item: { requirement: d.requisitos.get(atual.id) ?? '' } };
    questions = {
      decision: {
        type: 'choice',
        instructions: 'Is it clear where and how the person used `item.requirement`, well enough to record it?',
        criteria: DECISAO_BLOCO,
      },
    };
  } else if (gatilho !== 'pulou') {
    // "Pular esta" on the offer is "go on": nothing to ask.
    state = { offer: conversa.filter((c) => c.from === 'interviewer').at(-1)?.text ?? '', answer: ultimaFala };
    questions = {
      wants_to_stop: { type: 'noul', instructions: 'In `answer`, does the person want to stop here and get the résumé now?' },
    };
  }
  if (pendentes.length) {
    state = { ...state, notes: pendentes.map((n) => n.texto), items: itens.map(({ id, what }) => ({ id, what })) };
    questions = { ...questions, ...perguntasDeAnotacoes(pendentes, itens) };
  }
  const { respostas, erro } = await perguntar(deps, sessaoId, d.lista, state, questions, vagaId);
  const backend = respostas ? 'jev' : 'reserva';
  const sim = (nome: string) => (respostas?.[nome]?.noul ?? 0) >= SIM;

  // ---- the notes ----
  pendentes.forEach((n, i) => {
    const escolha = respostas?.[`note_${i}`]?.choice;
    const item = itens.find((x) => x.id === escolha);
    if (item) Object.assign(n, { destino: 'accomplishment', accomplishmentId: item.accomplishmentId });
    else if (escolha === 'none') n.destino = 'descartada';
    // Without the Jev, a note is asked about as it is: the questioner reads it.
    else n.destino = 'nova';
  });
  if (notaDaOferta && !respostas) estado.anotacoes = estado.anotacoes.filter((n) => n !== notaDaOferta);

  // ---- the decision ----
  let decisao: Decisao | 'parar' | 'seguir';
  let faltas: string[] = [];
  if (atual.tipo === 'oferta') {
    const querParar = respostas ? sim('wants_to_stop') : gatilho === 'oferta' && QUER_PARAR.test(ultimaFala);
    decisao = querParar ? 'parar' : 'seguir';
  } else {
    const escolha = respostas?.decision?.choice;
    decisao = escolha ? PARA_DECISAO[escolha] : decisaoDeReserva(gatilho);
    if (gatilho === 'pulou' || gatilho === 'criou' || gatilho === 'bloco' || gatilho === 'stack') decisao = 'trocar';
  }

  let mudou = false;
  let encerrar = false;
  if (atual.tipo === 'accomplishment') {
    const a = corpus.accomplishments.find((x) => x.id === atual.id);
    if (respostas && a) {
      const forca = forcaDe(respostas.strength?.score ?? 1);
      if (forca !== a.forca) await atualizarAccomplishment(sessaoId, a.id, { forca });
      a.forca = forca;
      faltas = objetivoDeAccomplishment({ problema: sim('problem'), contribuicao: sim('contribution'), resultado: sim('result') || a.metrics.length > 0, comoSabe: sim('evidence') }, a);
      // A result said and not recorded holds the subject, whatever the Jev
      // decided: the "2 perguntas" checkpoint runs before the questioner reads
      // the answer, and moving on would lose the number.
      if (sim('result') && a.metrics.length === 0 && gatilho !== 'pulou') decisao = 'continuar';
    }
    // The questioner asking a second time to close a record that has its
    // result: the subject moves on, whatever the Jev decided.
    if (a?.metrics.length && gatilho === 'concluir' && decisao === 'continuar') {
      const antes = (await decisoesDaSessao(sessaoId, vagaId)).filter((x) => x.gatilho === 'concluir' && (x.assunto as { id?: string } | null)?.id === a.id);
      if (antes.length) decisao = 'trocar';
    }
    const destino = a ? destinoDoAccomplishment(a, decisao as Decisao) : 'pulado';
    if (destino === 'fica') {
      if (respostas) atual.objetivo = faltas;
    } else {
      mudou = true;
      if (a && destino === 'adiado') {
        await atualizarAccomplishment(sessaoId, a.id, { adiado: true });
        a.adiado = true;
      } else if (a && destino === 'pulado' && !a.pulado) {
        await atualizarAccomplishment(sessaoId, a.id, { pulado: true });
        a.pulado = true;
      }
    }
  } else if (atual.tipo === 'affiliation') {
    const af = corpus.affiliations.find((x) => x.id === atual.id);
    // A closed degree owes "something notable?" once: one question asked, and it is done.
    const perguntou = mensagens.slice(atual.desde).some((m) => m.papel === 'assistente');
    const pronta = !af || af.pulado || (affiliationFechada(af) && (experiente || !ehFormacao(af) || perguntou));
    if (pronta) decisao = 'trocar';
    mudou = decisao !== 'continuar';
    faltas = atual.objetivo;
  } else if (atual.tipo === 'anotacao' || atual.tipo === 'novo' || atual.tipo === 'lacuna') {
    mudou = decisao !== 'continuar';
    // The record created from the note carries it: its subject shows what was said.
    const nota = estado.anotacoes.find((n) => n.id === atual.id);
    if (nota && opcoes.criado) Object.assign(nota, { destino: 'accomplishment', accomplishmentId: opcoes.criado });
  } else {
    mudou = true;
    encerrar = decisao === 'parar';
  }

  if (respostas || !deps.classificador) {
    estado.cobertura = cobertura(corpus);
    // What a Vaga's conversation recorded is the general Corpus's: the home shows its coverage.
    if (vagaId) await atualizarCobertura(sessaoId, estado.cobertura);
  }

  // ---- the next subject ----
  let proximo: { tipo: TipoAssunto; id: string } | null = null;
  if (mudou && !encerrar) {
    if (atual.tipo !== 'accomplishment') estado.visitados.push(chaveDe(atual));
    // What the person just told about becomes the next subject, while it is fresh.
    // A record the person named in her answer to the offer comes next too.
    const citado = notaDaOferta?.destino === 'accomplishment' ? notaDaOferta.accomplishmentId : null;
    proximo = opcoes.criado
      ? { tipo: 'accomplishment', id: opcoes.criado }
      : citado
        ? { tipo: 'accomplishment', id: citado }
        : proximoAssunto(corpus, { ...estado, assunto: null }, { ...d.ctx, anterior: atual });
    if (!proximo) encerrar = true;
  }
  await registrarDecisao(sessaoId, {
    vagaId,
    gatilho,
    assunto: { tipo: atual.tipo, id: atual.id },
    decisao,
    motivo: `${MOTIVO[gatilho]}; ${faltas.length ? faltas.join('; ') : 'nada falta'} → ${decisao}${backend === 'reserva' ? ' (regra de reserva)' : ''}`,
    cobertura: estado.cobertura,
    proximo,
    backend,
    erro,
  });

  // A Vaga's queue is short and asked for: no offer to stop in it.
  if (proximo && !vagaId && !estado.ofertaFeita && estado.cobertura >= LIMIAR_COBERTURA && backend === 'jev') {
    const restantes = fila(corpus, { ...estado, assunto: null }, d.ctx).length;
    estado.ofertaFeita = true;
    await registrarDecisao(sessaoId, {
      gatilho,
      assunto: null,
      decisao: 'ofereceu_fim',
      motivo: `cobertura ${estado.cobertura}% passou de ${LIMIAR_COBERTURA}%, com ${restantes} assuntos restantes`,
      cobertura: estado.cobertura,
      proximo: { tipo: 'oferta', id: 'oferta' },
      backend,
      erro: null,
    });
    proximo = { tipo: 'oferta', id: 'oferta' };
  }

  if (encerrar) estado.assunto = null;
  else if (proximo) estado.assunto = await abrir(sessaoId, d, proximo);
  estado.fila = fila(corpus, estado, d.ctx);
  estado.ultimoCheckpoint = mensagens.length;
  await gravarPlano(sessaoId, estado, vagaId);
  return { estado, mudou, encerrar };
}
