// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * One turn of the interrogation, one subject at a time (step 10). The person's
 * input is recorded; the questioner (the model) reads only the current subject
 * (the record, its company's name and stack, the goal the evaluator gave and
 * the messages since the subject opened), calls its tools, and writes the next
 * question, which is streamed and recorded.
 *
 * The evaluator (`src/avaliador`) runs at checkpoints: before the model, when
 * the person skipped, answered the offer to stop, or got 2 questions with no
 * checkpoint; and after a tool round that recorded a result, skipped, got a
 * second "não sei", created a record, or suggested closing the subject. A
 * checkpoint that moves on throws away what the model wrote and starts the
 * round again on the new subject.
 *
 * The fixed prompt and the tools are cached; everything that changes per turn
 * comes after the cache breakpoint.
 *
 * The retomada (step 14): a session past `interrogando` (`pronto`,
 * `encerrado`) that came back from the home. Its turns are the same, but no
 * end of it ends the interrogation: the offer, the goodbye, the cap and the
 * model's `encerrar_interrogatorio` go back home, with nothing postponed
 * skipped and the state where it was.
 *
 * A Vaga's conversation (step 16, `opcoes.vagaId`): the same turn on the
 * Vaga's own messages and plan, read like a retomada. Its end goes back to the
 * Vaga's page, and what the person told stays in the general Corpus.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type Anthropic from '@anthropic-ai/sdk';

import {
  abrirConversaDaVaga,
  checkpoint,
  emRetomada,
  escolherAssunto,
  estadoDoPlano,
  iniciarPlano,
  opcoesDaOferta,
  pularAdiados,
  type Assunto,
  type DepsAvaliador,
  type EstadoPlano,
  type Gatilho,
  type OpcaoOferta,
} from '@/avaliador';
import { jev } from '@/avaliador/jev';
import { aceitouAvaliador } from '@/conteudo/consentimento';
import {
  atualizarAccomplishment,
  atualizarAffiliation,
  corpusDaSessao,
  falasDaSessao,
  gravarPlano,
  linhasDaSessao,
  mensagensDaSessao,
  registrarEvento,
  registrarMensagem,
  sessaoPorId,
  temEvento,
  terminarInterrogatorio,
  textoImportado,
  vagaDaSessao,
  type Corpus,
  type Mensagem,
  type Sessao,
} from '@/db';
import { MESES_PARA_IGNORAR_FORMACAO, mesesDeExperiencia } from '@/import/formacao';
import { ErroLlm, llm, type ClienteLlm } from '@/llm/cliente';
import { modo } from '@/modo';

import { lerResposta, perguntaDoBloco } from './bloco';
import {
  accomplishmentFechado,
  affiliationFechada,
  contagemPorRegistro,
  descreverAssunto,
  ehFormacao,
  LIMITE_DURO,
  progresso,
  type Progresso,
} from './estado';
import { ehNaoSei, ehPular } from './falas';
import { executarFerramenta, FERRAMENTAS, type ContextoFerramentas } from './ferramentas';
import { maisDeUmaPergunta } from './pergunta';

/** How many of the subject's last messages go to the model as they were. */
export const MENSAGENS_RECENTES = 14;
/** Model calls within one turn (tool rounds, subjects changed) before the turn gives up. */
const RODADAS_POR_TURNO = 10;
/** Checkpoints after tool rounds within one turn: the evaluator never loops. */
const CHECKPOINTS_POR_TURNO = 3;
/** The goodbye when the session's spending cap ends the interrogation: no model writes it. */
export const DESPEDIDA_DO_TETO =
  'Chegamos ao limite desta conversa. Vou montar o seu currículo com o que você já me contou.';
/** The goodbye when nothing is left, or the person took the offer to stop. */
export const DESPEDIDA_DO_FIM = 'Era isso. Vou montar o seu currículo com o que você me contou.';
/** The offer to stop, once the coverage passes the threshold (decision 7). */
/** The goodbye of a retomada that ran out or that the person ended: back home, the résumé as it was. */
export const DESPEDIDA_DA_RETOMADA =
  'Guardei tudo. O currículo não muda sozinho: quando quiser, gere de novo pela sua página.';
/** The goodbye of a retomada when the session's spending cap is reached. */
export const DESPEDIDA_DO_TETO_NA_RETOMADA =
  'Chegamos ao limite desta conversa. O que você me contou está guardado para o próximo currículo.';
/** The goodbye of a Vaga's conversation (step 16): back to the Vaga, what she told kept for every résumé. */
export const DESPEDIDA_DA_VAGA =
  'Era isso desta vaga. O que você me contou ficou guardado e vale também para as próximas vagas.';
export const OFERTA_DE_FIM =
  'Já tenho o suficiente para um currículo forte. Quer parar aqui ou tem mais alguma coisa que você quer que entre?';

export type Entrada =
  | { tipo: 'resposta'; texto: string }
  /** "Pular esta": the current subject is skipped. */
  | { tipo: 'pular' }
  /** No new input: the first question, or a turn that never got its question. */
  | { tipo: 'continuar' }
  /** At the offer to stop, one of the pending subjects it listed (step 11). */
  | { tipo: 'escolher'; id: string };

export interface ResultadoTurno {
  /** The question (or the goodbye) written; empty if the turn had nothing to say. */
  texto: string;
  encerrado: boolean;
  progresso: Progresso;
  /** Under the offer to stop: the pending subjects the person can go back to. */
  opcoes: OpcaoOferta[];
}

export class ErroTurno extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroTurno';
  }
}

let promptFixo: string | undefined;
function prompt(): string {
  promptFixo ??= readFileSync(path.join(process.cwd(), 'src/interrogatorio/prompt.md'), 'utf8');
  return promptFixo;
}

/**
 * Whether a session's evaluator is the Jev. Never without `TYPESAFE_API_KEY`
 * (step 23, Q21: the Jev is optional, and without it every checkpoint would
 * fail its call before falling back). Hosted, only once the person accepted a
 * consent that names the TypeSafe; in `MODO=local` there is no consent screen,
 * and whoever put the key in `.env` already chose it.
 */
export function usaJev(versaoConsentimento: string | null, env: Record<string, string | undefined> = process.env): boolean {
  if (!env.TYPESAFE_API_KEY) return false;
  return modo(env) === 'local' || aceitouAvaliador(versaoConsentimento);
}

/** The evaluator a session gets: the Jev when `usaJev` says so, the fixed rules otherwise. */
export function avaliadorDaSessao(sessao: Pick<Sessao, 'textoConsentimentoVersao'>): DepsAvaliador {
  return { classificador: usaJev(sessao.textoConsentimentoVersao) ? jev() : null };
}

export async function progressoDaSessao(sessaoId: string): Promise<Progresso> {
  const [corpus, plano] = await Promise.all([corpusDaSessao(sessaoId), estadoDoPlano(sessaoId)]);
  return progresso(corpus, plano?.cobertura ?? 0);
}

const papelDaMensagem = (m: Mensagem): 'user' | 'assistant' => (m.papel === 'assistente' ? 'assistant' : 'user');

function textoDaMensagem(m: Mensagem): string {
  if (m.papel === 'sistema') return `[sistema] ${m.conteudo}`;
  return m.conteudo;
}

/** The messages that go to the model: the subject and its goal first, then its conversation. */
export function montarMensagens(dados: {
  assunto: string;
  objetivo: string[];
  /** The messages since the subject opened. */
  mensagens: Mensagem[];
  /** No question was ever asked in this session. */
  primeira: boolean;
}): Anthropic.Beta.BetaMessageParam[] {
  const recentes = dados.mensagens.slice(-MENSAGENS_RECENTES);
  const omitidas = dados.mensagens.length - recentes.length;
  const abertura = [
    '<assunto>',
    dados.assunto,
    '</assunto>',
    '<objetivo>',
    ...(dados.objetivo.length ? dados.objetivo.map((o) => `- ${o}`) : ['- nada falta: se não há o que perguntar, chame concluir_assunto']),
    '</objetivo>',
    ...(omitidas > 0 ? [`As ${omitidas} mensagens mais antigas deste assunto não estão aqui: o que importa delas está gravado acima.`] : []),
  ].join('\n');

  const lista: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: abertura }];
  for (const m of recentes) lista.push({ role: papelDaMensagem(m), content: textoDaMensagem(m) });
  if (recentes.length === 0) {
    lista.push({
      role: 'user',
      content: dados.primeira
        ? '[sistema] A pessoa acabou de chegar do import. Faça a primeira pergunta.'
        : '[sistema] Assunto novo. Diga em meia frase do que vai falar agora e faça a primeira pergunta.',
    });
  } else if (lista[lista.length - 1].role === 'assistant') {
    lista.push({ role: 'user', content: '[sistema] A pessoa voltou. Continue de onde parou.' });
  }
  return lista;
}

/** The record behind a subject is still open: not closed, not skipped. */
function registroAberto(corpus: Corpus, assunto: Assunto): boolean {
  if (assunto.tipo === 'accomplishment') {
    const a = corpus.accomplishments.find((x) => x.id === assunto.id);
    return Boolean(a && !accomplishmentFechado(a));
  }
  if (assunto.tipo === 'affiliation') {
    const a = corpus.affiliations.find((x) => x.id === assunto.id);
    return Boolean(a && !affiliationFechada(a));
  }
  return false;
}

const idsDo = (assunto: Assunto | null) => ({
  accomplishmentId: assunto?.tipo === 'accomplishment' ? assunto.id : null,
  affiliationId: assunto?.tipo === 'affiliation' ? assunto.id : null,
});

/**
 * The end of the interrogation, by the person, the evaluator or the cap: what
 * was postponed and never came back is skipped, and the session moves to
 * `gerando` with how many things were left open.
 */
export async function encerrarInterrogatorio(sessaoId: string, por: 'pessoa' | 'modelo' | 'teto' | 'avaliador'): Promise<void> {
  await pularAdiados(sessaoId);
  const { fechadas, total } = progresso(await corpusDaSessao(sessaoId));
  await terminarInterrogatorio(sessaoId, { abertos: total - fechadas, total, por });
}

async function pular(sessaoId: string, assunto: Assunto, motivo: string, por: 'pessoa' | 'limite', vagaId: string | null) {
  if (assunto.tipo === 'accomplishment') await atualizarAccomplishment(sessaoId, assunto.id, { pulado: true });
  else if (assunto.tipo === 'affiliation') await atualizarAffiliation(sessaoId, assunto.id, { pulado: true });
  await registrarMensagem(sessaoId, { papel: 'sistema', conteudo: motivo, marcadores: ['pulou'], vagaId, ...idsDo(assunto) });
  await registrarEvento(sessaoId, 'pulou', { por });
}

/** Assistant messages since a point: the questions asked. */
const perguntasDesde = (historico: Mensagem[], desde: number) =>
  historico.slice(desde).filter((m) => m.papel === 'assistente').length;

/** Which of the round's triggers the checkpoint runs on. */
const PRIORIDADE: Gatilho[] = ['pulou', 'metric', 'criou', 'stack', 'nao_sei', 'concluir'];

/**
 * Runs one turn. `aoTexto` gets the question as it streams, and `aoReiniciar`
 * says to drop it (a rewrite, or a new subject, follows). Throws `ErroTurno` if
 * the session is not being interrogated.
 */
export async function turno(
  sessaoId: string,
  entrada: Entrada,
  opcoes: {
    cliente?: ClienteLlm;
    /** The evaluator; by default, the one the session's consent allows. */
    avaliador?: DepsAvaliador;
    aoTexto?: (delta: string) => void;
    /** What streamed so far is discarded: a rewrite follows. */
    aoReiniciar?: () => void;
    /** A Vaga's conversation (step 16); none is the general one. */
    vagaId?: string | null;
  } = {},
): Promise<ResultadoTurno> {
  const cliente = opcoes.cliente ?? llm();
  const vagaId = opcoes.vagaId ?? null;
  const sessao = await sessaoPorId(sessaoId);
  // `gerando` is between the two: the résumé is owed first. A Vaga's conversation does not wait for it.
  const estados = vagaId ? ['interrogando', 'gerando', 'pronto', 'encerrado'] : ['interrogando', 'pronto', 'encerrado'];
  if (!sessao || !estados.includes(sessao.estado) || sessao.apagadaEm) {
    throw new ErroTurno(`session is ${sessao?.estado ?? 'missing'}, not interrogando`);
  }
  const vaga = vagaId ? await vagaDaSessao(sessaoId, vagaId) : null;
  if (vagaId && !vaga) throw new ErroTurno(`no live Vaga ${vagaId} in this session`);
  /** A gap's requirement, in the posting's words: the questioner sees it, and nothing else of the Vaga. */
  const requisitoDe = (a: Assunto) => (a.tipo === 'lacuna' ? vaga?.requisitos.find((r) => r.id === a.id)?.texto : undefined);
  const deps = opcoes.avaliador ?? avaliadorDaSessao(sessao);
  // A Vaga's conversation ends like a retomada: back where it came from, the interrogation untouched.
  const retomada = emRetomada(sessao.estado) || Boolean(vagaId);

  /** A message no model writes (the offer, a goodbye), streamed and recorded like a question. */
  async function fixo(texto: string, assunto: Assunto | null, encerrarPor?: 'pessoa' | 'avaliador' | 'teto'): Promise<ResultadoTurno> {
    // A retomada ends back home: its own goodbye, and the interrogation is not ended again.
    if (retomada && encerrarPor) {
      texto = encerrarPor === 'teto' ? DESPEDIDA_DO_TETO_NA_RETOMADA : vagaId ? DESPEDIDA_DA_VAGA : DESPEDIDA_DA_RETOMADA;
    }
    opcoes.aoTexto?.(texto);
    await registrarMensagem(sessaoId, { papel: 'assistente', conteudo: texto, vagaId, ...idsDo(assunto) });
    if (encerrarPor && !retomada) await encerrarInterrogatorio(sessaoId, encerrarPor);
    const pendentes = texto === OFERTA_DE_FIM ? await opcoesDaOferta(sessaoId, vagaId) : [];
    return { texto, encerrado: Boolean(encerrarPor), progresso: await progressoDaSessao(sessaoId), opcoes: pendentes };
  }

  // ---- the person's input ----
  let historico = await mensagensDaSessao(sessaoId, vagaId);
  const ultimaDoAssistente = [...historico].reverse().find((m) => m.papel === 'assistente');
  // A bare "não sei" or "pula" is read here, with no model call (step 11).
  let naoSei = false;
  let pedePular = entrada.tipo === 'pular';
  if (entrada.tipo === 'resposta') {
    const texto = entrada.texto.trim();
    if (!texto) throw new ErroTurno('empty answer');
    naoSei = ehNaoSei(texto);
    pedePular = ehPular(texto);
    const latenciaMs = ultimaDoAssistente ? Date.now() - ultimaDoAssistente.createdAt.getTime() : null;
    await registrarMensagem(sessaoId, { papel: 'pessoa', conteudo: texto, latenciaMs, vagaId, marcadores: naoSei ? ['nao_sei'] : [] });
    if (naoSei) await registrarEvento(sessaoId, 'nao_sei');
    if (!(await temEvento(sessaoId, 'primeira_resposta'))) await registrarEvento(sessaoId, 'primeira_resposta');
  } else if (entrada.tipo === 'escolher') {
    // What the person tapped reads as what she said.
    const opcao = (await opcoesDaOferta(sessaoId, vagaId)).find((o) => o.id === entrada.id);
    if (!opcao) throw new ErroTurno('not one of the offer to stop options');
    await registrarMensagem(sessaoId, { papel: 'pessoa', conteudo: opcao.rotulo, vagaId });
  } else if (entrada.tipo === 'continuar' && historico.at(-1)?.papel === 'assistente') {
    // "Continuar" when the last question is already there: nothing is owed,
    // unless a subject opened after it (a retomada, "contar algo novo").
    const aberto = (await estadoDoPlano(sessaoId, vagaId))?.assunto;
    if (!aberto || aberto.desde < historico.length) {
      return { texto: '', encerrado: false, progresso: await progressoDaSessao(sessaoId), opcoes: [] };
    }
  }

  let estado: EstadoPlano =
    (await estadoDoPlano(sessaoId, vagaId)) ?? (vagaId ? await abrirConversaDaVaga(sessaoId, vagaId) : await iniciarPlano(sessaoId, deps));
  if (entrada.tipo === 'escolher') estado = await escolherAssunto(sessaoId, entrada.id, vagaId);

  // A skipped record reopened in a retomada stays skipped until the person answers about it.
  if (retomada && entrada.tipo === 'resposta' && !pedePular && estado.assunto) {
    const { tipo, id } = estado.assunto;
    const registro =
      tipo === 'accomplishment'
        ? (await corpusDaSessao(sessaoId)).accomplishments.find((a) => a.id === id)
        : tipo === 'affiliation'
          ? (await corpusDaSessao(sessaoId)).affiliations.find((a) => a.id === id)
          : undefined;
    if (registro?.pulado) {
      if (tipo === 'accomplishment') await atualizarAccomplishment(sessaoId, id, { pulado: false });
      else await atualizarAffiliation(sessaoId, id, { pulado: false });
    }
  }

  // ---- the checkpoints before the model ----
  let gatilho: Gatilho | null = null;
  let corpus = await corpusDaSessao(sessaoId);
  if (pedePular) {
    if (estado.assunto && registroAberto(corpus, estado.assunto)) {
      await pular(sessaoId, estado.assunto, 'A pessoa apertou "pular esta": este assunto está pulado.', 'pessoa', vagaId);
    } else {
      await registrarMensagem(sessaoId, {
        papel: 'sistema',
        conteudo: 'A pessoa apertou "pular esta": ela não quer responder a última pergunta.',
        marcadores: ['pulou'],
        vagaId,
      });
      await registrarEvento(sessaoId, 'pulou', { por: 'pessoa' });
    }
    gatilho = 'pulou';
  }
  historico = await mensagensDaSessao(sessaoId, vagaId);
  const atual = estado.assunto;
  // The hard limit holds for every subject: an open record is skipped, one with
  // its result (or a note) just moves on. A record reopened in a retomada
  // counts from when it reopened.
  const perguntas = !atual
    ? 0
    : retomada
      ? perguntasDesde(historico, atual.desde)
      : Math.max(contagemPorRegistro(historico).get(atual.id)?.perguntas ?? 0, perguntasDesde(historico, atual.desde));
  if (!gatilho && atual && atual.tipo !== 'oferta' && perguntas >= LIMITE_DURO) {
    if (registroAberto(corpus, atual)) {
      await pular(sessaoId, atual, `O limite de ${LIMITE_DURO} perguntas sobre este assunto acabou: ele está pulado.`, 'limite', vagaId);
    }
    gatilho = 'pulou';
  }
  if (!gatilho && atual?.tipo === 'oferta' && entrada.tipo === 'resposta') gatilho = 'oferta';
  // A block from the template reads its own answers, "não sei" included.
  const emBloco = atual?.tipo === 'affiliation' && !atual.bloco?.modelo;
  if (!gatilho && atual && naoSei && !emBloco) {
    const falas = historico.slice(atual.desde).filter((m) => m.papel === 'pessoa');
    if (falas.at(-2)?.marcadores.includes('nao_sei')) gatilho = 'nao_sei';
  }
  if (!gatilho && atual && !emBloco && entrada.tipo === 'resposta' && perguntasDesde(historico, Math.max(atual.desde, estado.ultimoCheckpoint)) >= 2) {
    gatilho = 'perguntas';
  }
  if (gatilho) {
    const r = await checkpoint(sessaoId, gatilho, deps, { vagaId });
    estado = r.estado;
    if (r.encerrar) return fixo(DESPEDIDA_DO_FIM, null, atual?.tipo === 'oferta' && gatilho === 'oferta' ? 'pessoa' : 'avaliador');
  }
  if (!estado.assunto) return fixo(DESPEDIDA_DO_FIM, null, 'avaliador');
  if (estado.assunto.tipo === 'oferta') return fixo(OFERTA_DE_FIM, null);

  // ---- a company's block or a degree's year, from the template ----

  /**
   * Reads the answer to the step just asked and asks the next one, with no
   * model (step 11). Null when the questioner has the subject: the rule could
   * not read an answer, a degree still owes "algo notável" (a conversation),
   * or the block ended and the next subject is not a block.
   */
  async function blocoSemModelo(fala: string | null): Promise<ResultadoTurno | null> {
    for (let vez = 0; vez < RODADAS_POR_TURNO; vez++) {
      const a = estado.assunto;
      if (a?.tipo !== 'affiliation' || a.bloco?.modelo) return null;
      corpus = await corpusDaSessao(sessaoId);
      let af = corpus.affiliations.find((x) => x.id === a.id);
      if (!af) return null;
      const bloco = a.bloco ?? { feitos: [], pendente: null, modelo: false };
      if (fala !== null && bloco.pendente) {
        const leitura = lerResposta(af, bloco.pendente, fala);
        if (!leitura) {
          a.bloco = { ...bloco, modelo: true };
          await gravarPlano(sessaoId, estado, vagaId);
          return null;
        }
        if (Object.keys(leitura.campos).length) af = await atualizarAffiliation(sessaoId, af.id, leitura.campos);
        bloco.feitos = [...bloco.feitos, bloco.pendente];
        bloco.pendente = null;
      }
      fala = null;
      const proxima = perguntaDoBloco(af, bloco.feitos);
      if (proxima) {
        a.bloco = { ...bloco, pendente: proxima.passo };
        await gravarPlano(sessaoId, estado, vagaId);
        return fixo(proxima.texto, a);
      }
      if (ehFormacao(af) && mesesDeExperiencia(corpus.affiliations) < MESES_PARA_IGNORAR_FORMACAO) {
        a.bloco = { ...bloco, modelo: true };
        await gravarPlano(sessaoId, estado, vagaId);
        return null;
      }
      const r = await checkpoint(sessaoId, 'bloco', deps, { vagaId });
      estado = r.estado;
      if (r.encerrar || !estado.assunto) return fixo(DESPEDIDA_DO_FIM, null, 'avaliador');
      if (estado.assunto.tipo === 'oferta') return fixo(OFERTA_DE_FIM, null);
    }
    return null;
  }

  const antesDoBloco = estado.assunto.id;
  const doBloco = await blocoSemModelo(entrada.tipo === 'resposta' ? entrada.texto.trim() : null);
  if (doBloco) return doBloco;
  if (!estado.assunto) return fixo(DESPEDIDA_DO_FIM, null, 'avaliador');

  // ---- the questioner, on the current subject only ----
  const textoOriginal = [await textoImportado(sessaoId), ...(await linhasDaSessao(sessaoId)).map((l) => l.texto)].join('\n');
  let assunto = estado.assunto;
  let reescreveu = false;
  const primeira = !historico.some((m) => m.papel === 'assistente');

  async function preparar(a: Assunto, comResposta: boolean) {
    historico = await mensagensDaSessao(sessaoId, vagaId);
    corpus = await corpusDaSessao(sessaoId);
    const linhas = await linhasDaSessao(sessaoId);
    const doAssunto = historico.slice(a.desde);
    const ultima = historico[historico.length - 1];
    const anterior = historico[historico.length - 2];
    const respostaAtual =
      comResposta && ultima?.papel === 'pessoa' && anterior?.papel === 'assistente'
        ? { pergunta: anterior.conteudo, fala: ultima.conteudo, mensagemId: ultima.id }
        : null;
    const falasAntes = doAssunto.filter((m) => m.papel === 'pessoa' && m.id !== respostaAtual?.mensagemId);
    const ctx: ContextoFerramentas = {
      sessaoId,
      vagaId,
      corpus,
      assunto: a,
      // Every conversation of the session: the rule is "said in this session", not in this chat.
      falasDaPessoa: await falasDaSessao(sessaoId),
      textoOriginal,
      respostaAtual,
      naoSeiAnterior: Boolean(falasAntes.at(-1)?.marcadores.includes('nao_sei')),
      gatilhos: new Set(),
      criado: null,
      encerrado: false,
    };
    const conversa = montarMensagens({
      assunto: descreverAssunto({ corpus, linhas, assunto: a, anotacoes: estado.anotacoes, requisito: requisitoDe(a) }),
      objetivo: a.objetivo,
      mensagens: doAssunto,
      primeira: primeira && doAssunto.length === 0,
    });
    return { ctx, conversa };
  }

  // The person's answer is about this subject only if the block did not move on.
  let { ctx, conversa } = await preparar(assunto, entrada.tipo === 'resposta' && assunto.id === antesDoBloco);
  const partes: string[] = [];
  let parteAtual = '';
  let checkpoints = 0;
  /** What streamed is dropped: the screen clears it, and it is not recorded. */
  const descartar = () => {
    if (partes.length || parteAtual) opcoes.aoReiniciar?.();
    partes.length = 0;
  };
  for (let rodada = 1; ; rodada++) {
    if (rodada > RODADAS_POR_TURNO) throw new Error(`the turn took more than ${RODADAS_POR_TURNO} model calls`);
    parteAtual = '';
    const resposta = await cliente.chamar({
      etapa: 'interrogatorio',
      sessaoId,
      vagaId,
      params: {
        max_tokens: 16_000,
        output_config: { effort: 'medium' },
        // The turn's own prefix (subject and its messages) is sent again in
        // every tool round: cache it at the last block too.
        cache_control: { type: 'ephemeral' },
        system: [{ type: 'text', text: prompt(), cache_control: { type: 'ephemeral' } }],
        tools: FERRAMENTAS,
        messages: conversa,
      },
      aoTexto: (delta) => {
        // Two text blocks of separate rounds read as two paragraphs.
        if (parteAtual === '' && partes.length) opcoes.aoTexto?.('\n\n');
        parteAtual += delta;
        opcoes.aoTexto?.(delta);
      },
    }).catch((erro: unknown) => {
      if (erro instanceof ErroLlm && erro.motivo === 'teto') return null;
      throw erro;
    });
    if (!resposta) {
      // The session's spending cap: the model cannot be called again, so the
      // interrogation ends here with what was gathered, and generation (which
      // has its own margin past the cap) writes the résumé.
      descartar();
      return fixo(DESPEDIDA_DO_TETO, null, 'teto');
    }
    if (resposta.stop_reason === 'max_tokens') throw new Error('the turn hit max_tokens');
    if (parteAtual.trim()) partes.push(parteAtual.trim());

    conversa.push({ role: 'assistant', content: resposta.content });
    const chamadas = resposta.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    const resultados: (Anthropic.Beta.BetaToolResultBlockParam | Anthropic.Beta.BetaTextBlockParam)[] = [];
    let recusou = false;
    for (const chamada of chamadas) {
      const r = await executarFerramenta(chamada.name, chamada.input, ctx);
      recusou ||= !r.ok;
      resultados.push({ type: 'tool_result', tool_use_id: chamada.id, content: r.texto, ...(r.ok ? {} : { is_error: true }) });
    }
    // A question written before a refused tool may rest on it: it is written
    // again. The model is told the person never saw it, or it "corrects" what
    // she never read and shows her the refusal.
    if (recusou && partes.length) {
      resultados.push({
        type: 'text',
        text: '[sistema] A mensagem que você escreveu junto não foi mostrada à pessoa. Escreva de novo do zero, sem citar a anterior nem a recusa.',
      });
    }
    if (chamadas.length) conversa.push({ role: 'user', content: resultados });
    if (recusou) descartar();

    // ---- the checkpoint after the round ----
    const g = PRIORIDADE.find((x) => ctx.gatilhos.has(x));
    ctx.gatilhos.clear();
    if (g && !ctx.encerrado && checkpoints < CHECKPOINTS_POR_TURNO) {
      checkpoints++;
      const r = await checkpoint(sessaoId, g, deps, { criado: ctx.criado, vagaId });
      estado = r.estado;
      if (r.encerrar || !estado.assunto) {
        descartar();
        return fixo(DESPEDIDA_DO_FIM, null, 'avaliador');
      }
      if (r.mudou) {
        // A new subject: what was written is about the old one.
        descartar();
        if (estado.assunto.tipo === 'oferta') return fixo(OFERTA_DE_FIM, null);
        const doBlocoNovo = await blocoSemModelo(null);
        if (doBlocoNovo) return doBlocoNovo;
        if (!estado.assunto) return fixo(DESPEDIDA_DO_FIM, null, 'avaliador');
        assunto = estado.assunto;
        reescreveu = false;
        ({ ctx, conversa } = await preparar(assunto, false));
        continue;
      }
      resultados.push({
        type: 'text',
        text: `[sistema] O avaliador manteve o assunto. Objetivo agora:\n${(estado.assunto.objetivo.length ? estado.assunto.objetivo : ['nada falta']).map((o) => `- ${o}`).join('\n')}`,
      });
    }

    // No question yet, or it rested on a refused tool: the model is called again.
    if (recusou || !partes.length) {
      if (!chamadas.length) break;
      continue;
    }
    // One question per message: a message that asks two things is rewritten
    // once, and the screen drops what it streamed for the rewrite.
    if (!reescreveu && maisDeUmaPergunta(partes.join('\n\n'))) {
      reescreveu = true;
      partes.length = 0;
      opcoes.aoReiniciar?.();
      const pedido =
        '[sistema] Essa mensagem pede mais de uma coisa. Reescreva-a inteira com uma pergunta só, a mais importante; a outra fica para a próxima mensagem. Não comente a reescrita.';
      if (chamadas.length) resultados.push({ type: 'text', text: pedido });
      else conversa.push({ role: 'user', content: pedido });
      continue;
    }
    // The question came with the tools, nothing was refused and the subject
    // stayed: no call back to the model (step 11).
    break;
  }

  // ---- the question, recorded with what it is about ----
  const texto = partes.join('\n\n');
  if (texto) await registrarMensagem(sessaoId, { papel: 'assistente', conteudo: texto, vagaId, ...idsDo(assunto) });
  if (ctx.encerrado && retomada) {
    // The person wants to stop the retomada (or the Vaga's conversation): back where she came from, nothing open until she comes back.
    const atualizado = await estadoDoPlano(sessaoId, vagaId);
    if (atualizado) await gravarPlano(sessaoId, { ...atualizado, assunto: null }, vagaId);
  } else if (ctx.encerrado) {
    await encerrarInterrogatorio(sessaoId, 'modelo');
  }
  return { texto, encerrado: ctx.encerrado, progresso: await progressoDaSessao(sessaoId), opcoes: [] };
}
