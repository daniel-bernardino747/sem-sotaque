// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, inject, it } from 'vitest';

import { abrirConversaDaVaga, contarAlgoNovo, estadoDoPlano, filaAberta, perguntasEmAberto, planoVazio, retomar } from '@/avaliador';
import type { Classificador, Questions } from '@/avaliador/jev';
import {
  atualizarAccomplishment,
  confirmarVaga,
  corpusDaSessao,
  corpusMudou,
  criarTester,
  criarVaga,
  decisoesDaSessao,
  gravarImportacao,
  gravarLeitura,
  gravarPlano,
  iniciarInterrogatorio,
  mensagensDaSessao,
  registrarConsentimento,
  registrarMensagem,
  registrarMetric,
  responderConsentimentoVagas,
  sessaoPorId,
  vagaDaSessao,
  type Mensagem,
} from '@/db';
import { db, fecharDb } from '@/db/client';
import { accomplishments, affiliations, eventos, geracoes, sessoes } from '@/db/schema';
import { criarClienteLlm, type SdkMinimo } from '@/llm/cliente';
import { MODELO_PADRAO } from '@/llm/precos';

import { LIMITE_DURO } from './estado';
import { DESPEDIDA_DA_RETOMADA, DESPEDIDA_DA_VAGA, DESPEDIDA_DO_TETO, MENSAGENS_RECENTES, montarMensagens, OFERTA_DE_FIM, turno, usaJev } from './turno';

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);

type Bloco = Anthropic.Beta.BetaContentBlock;
let proximoId = 0;

const texto = (t: string): Bloco => ({ type: 'text', text: t, citations: null }) as Bloco;
const ferramenta = (name: string, input: unknown): Bloco =>
  ({ type: 'tool_use', id: `toolu_${++proximoId}`, name, input }) as Bloco;

function resposta(content: Bloco[]): Anthropic.Beta.BetaMessage {
  return {
    id: `msg_${++proximoId}`,
    type: 'message',
    role: 'assistant',
    model: MODELO_PADRAO,
    content,
    stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as Anthropic.Beta.BetaMessage;
}

/** A client whose model replies with these messages, in order; text blocks are streamed. */
function clienteFalso(roteiro: Anthropic.Beta.BetaMessage[]) {
  const pedidos: BetaMessageStreamParams[] = [];
  const sdk: SdkMinimo = {
    beta: {
      messages: {
        stream(params) {
          // The turn appends to its own array between rounds: keep what was sent.
          pedidos.push(structuredClone(params));
          const msg = roteiro.shift();
          if (!msg) throw new Error('no scripted reply left');
          const ouvintes: ((d: string) => void)[] = [];
          return {
            on(_e: 'text', o: (d: string) => void) {
              ouvintes.push(o);
              return this;
            },
            async finalMessage() {
              for (const b of msg.content) if (b.type === 'text') ouvintes.forEach((o) => o(b.text));
              return msg;
            },
          };
        },
      },
    },
  };
  return { cliente: criarClienteLlm({ sdk, registrar: async () => {} }), pedidos };
}

/**
 * A Jev that judges strength by the record's text ("painel" strong, "frete"
 * weak, the rest medium) and decides what `decisao.valor` says.
 */
function jevFalso() {
  const decisao = { valor: 'continue' as 'continue' | 'move_on' | 'postpone', parar: false };
  const classificador: Classificador = {
    async classificar(p) {
      const responder = (nome: string, q: Questions[string]) => {
        if (q.type === 'score') {
          const alvo = JSON.stringify(nome.startsWith('strength_') ? (p.state as { items: { id: string }[] }).items.find((i) => `strength_${i.id}` === nome) : p.state);
          return { type: 'score', score: alvo.includes('painel') ? 2 : alvo.includes('frete') ? 0 : 1 };
        }
        if (q.type === 'choice') return { type: 'choice', choice: nome === 'decision' ? decisao.valor : 'none' };
        return { type: 'noul', noul: nome === 'wants_to_stop' && decisao.parar ? 0.9 : 0.1 };
      };
      return Object.fromEntries(Object.entries(p.questions).map(([n, q]) => [n, responder(n, q)])) as never;
    },
  };
  return { avaliador: { classificador }, decisao };
}

/** The `tool_result`s the model got back in the last request. */
function resultados(pedidos: BetaMessageStreamParams[]) {
  const ultima = pedidos.at(-1)!.messages.at(-1)!;
  return (ultima.content as Anthropic.Beta.BetaToolResultBlockParam[])
    .filter((r) => r.type === 'tool_result')
    .map((r) => ({ erro: Boolean(r.is_error), texto: String(r.content) }));
}

const tudo = (p: BetaMessageStreamParams) => JSON.stringify(p.messages);

/**
 * A session at `interrogando`: a shop with a strong record (the panel) and a
 * weak one (shipping), and a bank with a medium one. The questioner starts on
 * the panel.
 */
async function sessaoInterrogando() {
  const { sessao } = await criarTester({ apelido: 'Persona', origem: 'teste' });
  await registrarConsentimento(sessao.id, 'v2');
  await gravarImportacao(sessao.id, {
    formato: 'texto',
    textoExtraido:
      'Loja Inventada — Dev Pleno — 2019 – 2021\n- Fiz o painel de pedidos\n- Integrei o frete\nBanco Distante — Dev — 2017 – 2018\n- Migrei o legado',
    corpus: {
      affiliations: [
        { ref: 'a1', organizacao: 'Loja Inventada', cargo: 'Dev Pleno', periodoOriginal: '2019 – 2021', stack: [] },
        { ref: 'a2', organizacao: 'Banco Distante', cargo: 'Dev', periodoOriginal: '2017 – 2018', stack: [] },
      ],
      accomplishments: [
        { ref: 'c1', affiliationRef: 'a1', tipo: 'engineering', enunciado: 'Fiz o painel de pedidos' },
        { ref: 'c2', affiliationRef: 'a1', tipo: 'engineering', enunciado: 'Integrei o frete' },
        { ref: 'c3', affiliationRef: 'a2', tipo: 'engineering', enunciado: 'Migrei o legado' },
      ],
      linhas: [
        { texto: 'Fiz o painel de pedidos', affiliationRef: 'a1', accomplishmentRefs: ['c1'] },
        { texto: 'Integrei o frete', affiliationRef: 'a1', accomplishmentRefs: ['c2'] },
        { texto: 'Migrei o legado', affiliationRef: 'a2', accomplishmentRefs: ['c3'] },
      ],
    },
  });
  await iniciarInterrogatorio(sessao.id);
  const corpus = await corpusDaSessao(sessao.id);
  const [painel, frete, legado] = corpus.accomplishments;
  return { id: sessao.id, painel, frete, legado, loja: corpus.affiliations[0] };
}

/** The first question, on the panel. */
async function primeira(sessaoId: string, avaliador: { classificador: Classificador }, pergunta = 'Quantos pedidos por dia?') {
  await turno(sessaoId, { tipo: 'continuar' }, { avaliador, cliente: clienteFalso([resposta([texto(pergunta)])]).cliente });
}

const gatilhos = async (sessaoId: string) => (await decisoesDaSessao(sessaoId)).map((d) => d.gatilho);

describe('usaJev', () => {
  const chave = { TYPESAFE_API_KEY: 'ts-x' };

  it('hosted: only with the key and a consent that names the TypeSafe', () => {
    expect(usaJev('v2', chave)).toBe(true);
    expect(usaJev('v1', chave)).toBe(false);
    expect(usaJev(null, chave)).toBe(false);
  });

  it('without TYPESAFE_API_KEY, never: the fixed rules, with no failed call per checkpoint', () => {
    expect(usaJev('v2', {})).toBe(false);
    expect(usaJev('v2', { TYPESAFE_API_KEY: '' })).toBe(false);
    expect(usaJev(null, { MODO: 'local' })).toBe(false);
  });

  it('local: the key alone, since there is no consent screen', () => {
    expect(usaJev(null, { MODO: 'local', ...chave })).toBe(true);
  });
});

describe('montarMensagens', () => {
  const msg = (i: number, papel: Mensagem['papel']): Mensagem =>
    ({ id: String(i), papel, conteudo: `m${i}`, marcadores: [], createdAt: new Date() }) as unknown as Mensagem;

  it('sends the subject, its goal and only its last messages, ending on the person', () => {
    const historico = Array.from({ length: 30 }, (_, i) => msg(i, i % 2 ? 'pessoa' : 'assistente'));
    const lista = montarMensagens({ assunto: 'ASSUNTO', objetivo: ['falta: resultado'], mensagens: historico, primeira: false });
    expect(String(lista[0].content)).toContain('ASSUNTO');
    expect(String(lista[0].content)).toContain('- falta: resultado');
    expect(String(lista[0].content)).toContain('16 mensagens mais antigas');
    expect(lista).toHaveLength(MENSAGENS_RECENTES + 1);
    expect(lista.at(-1)).toMatchObject({ role: 'user', content: 'm29' });
  });

  it('asks for the first question, or for a transition into a new subject', () => {
    expect(montarMensagens({ assunto: 'A', objetivo: [], mensagens: [], primeira: true }).at(-1)!.content).toContain('primeira pergunta');
    expect(montarMensagens({ assunto: 'A', objetivo: [], mensagens: [], primeira: false }).at(-1)!.content).toContain('Assunto novo');
  });
});

describe.skipIf(semBanco)('turno', () => {
  it('asks the first question about the strongest accomplishment, and the questioner sees nothing else', async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    const { cliente, pedidos } = clienteFalso([resposta([texto('O painel mostrava o quê?')])]);
    const deltas: string[] = [];

    const r = await turno(s.id, { tipo: 'continuar' }, { avaliador, cliente, aoTexto: (d) => deltas.push(d) });

    expect(r.texto).toBe('O painel mostrava o quê?');
    expect(deltas.join('')).toBe(r.texto);
    expect(r.progresso).toMatchObject({ fechadas: 0, total: 5, cobertura: 0 });
    const [pergunta] = await mensagensDaSessao(s.id);
    expect(pergunta).toMatchObject({ papel: 'assistente', accomplishmentId: s.painel.id });

    const [pedido] = pedidos;
    expect(pedido.system).toEqual([expect.objectContaining({ cache_control: { type: 'ephemeral' } })]);
    expect(tudo(pedido)).toContain('Fiz o painel de pedidos');
    expect(tudo(pedido)).toContain('Loja Inventada');
    for (const fora of ['frete', 'Migrei', 'Banco Distante', 'ac2', 'af2']) expect(tudo(pedido)).not.toContain(fora);
  });

  it('records a stated number, refuses one the person never said, and calls the evaluator', async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador);

    const { cliente, pedidos } = clienteFalso([
      resposta([ferramenta('registrar_metric', { texto: '50 pedidos/dia', valores: [50], origem: 'afirmado', ancora: null })]),
      resposta([ferramenta('registrar_metric', { texto: '40 pedidos por dia', valores: [40], origem: 'afirmado', ancora: null })]),
      resposta([texto('Medido onde?')]),
    ]);
    await turno(s.id, { tipo: 'resposta', texto: 'uns 40 por dia, eu via no admin' }, { avaliador, cliente });

    expect(resultados([pedidos[1]])[0]).toMatchObject({ erro: true, texto: expect.stringContaining('não disse 50') });
    expect(resultados(pedidos)[0].erro).toBe(false);
    // The evaluator kept the subject and said what is still missing.
    expect(JSON.stringify(pedidos[2].messages.at(-1))).toContain('O avaliador manteve o assunto');
    expect((await corpusDaSessao(s.id)).accomplishments[0].metrics).toEqual([
      expect.objectContaining({ origem: 'afirmado', valores: [40], texto: '40 pedidos por dia' }),
    ]);
    expect(await gatilhos(s.id)).toEqual(['inicio', 'metric']);
  });

  it('makes one call when the question comes with the tools, nothing is refused and the subject stays', async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador);
    const { cliente, pedidos } = clienteFalso([
      resposta([texto('Medido onde?'), ferramenta('registrar_metric', { texto: '40 pedidos por dia', valores: [40], origem: 'afirmado', ancora: null })]),
    ]);
    const r = await turno(s.id, { tipo: 'resposta', texto: 'uns 40 por dia' }, { avaliador, cliente });

    expect(pedidos).toHaveLength(1);
    expect(r.texto).toBe('Medido onde?');
    expect((await corpusDaSessao(s.id)).accomplishments[0].metrics).toHaveLength(1);
    expect(await gatilhos(s.id)).toEqual(['inicio', 'metric']);
  });

  it('calls again, without the first question, when a tool was refused', async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador);
    const { cliente, pedidos } = clienteFalso([
      resposta([texto('Medido onde?'), ferramenta('registrar_metric', { texto: '50 pedidos', valores: [50], origem: 'afirmado', ancora: null })]),
      resposta([texto('Quantos eram, então?')]),
    ]);
    const r = await turno(s.id, { tipo: 'resposta', texto: 'uns 40 por dia' }, { avaliador, cliente });

    expect(pedidos).toHaveLength(2);
    expect(r.texto).toBe('Quantos eram, então?');
    // The message written with the refused tool never reached the person, and the model is told so.
    expect(JSON.stringify(pedidos[1].messages.at(-1))).toContain('não foi mostrada à pessoa');
  });

  it('does not say a message was dropped when the refused round wrote none', async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador);
    const { cliente, pedidos } = clienteFalso([
      resposta([ferramenta('registrar_metric', { texto: '50 pedidos', valores: [50], origem: 'afirmado', ancora: null })]),
      resposta([texto('Quantos eram, então?')]),
    ]);
    await turno(s.id, { tipo: 'resposta', texto: 'uns 40 por dia' }, { avaliador, cliente });

    expect(JSON.stringify(pedidos[1].messages.at(-1))).not.toContain('não foi mostrada à pessoa');
  });

  it('records an estimate only after the last question repeated the number', async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador, 'Quantas lojas usavam?');

    const semRepetir = clienteFalso([
      resposta([ferramenta('registrar_metric', { texto: '~30 lojas', valores: [30], origem: 'estimado', ancora: 'quantas lojas usavam' })]),
      resposta([texto('Então umas 30 lojas, você confirma?')]),
    ]);
    await turno(s.id, { tipo: 'resposta', texto: 'acho que umas 30' }, { avaliador, cliente: semRepetir.cliente });
    expect(resultados(semRepetir.pedidos)[0]).toMatchObject({ erro: true });
    expect((await corpusDaSessao(s.id)).accomplishments[0].metrics).toHaveLength(0);

    const confirmado = clienteFalso([
      resposta([ferramenta('registrar_metric', { texto: '~30 lojas', valores: [30], origem: 'estimado', ancora: 'quantas lojas usavam' })]),
      resposta([texto('E como você sabia disso?')]),
    ]);
    await turno(s.id, { tipo: 'resposta', texto: 'isso, confirmo' }, { avaliador, cliente: confirmado.cliente });
    const [metric] = (await corpusDaSessao(s.id)).accomplishments[0].metrics;
    expect(metric).toMatchObject({ origem: 'estimado', ancora: 'quantas lojas usavam', valores: [30] });
    expect(metric.confirmadoEm).toBeInstanceOf(Date);
    const fala = (await mensagensDaSessao(s.id)).find((m) => m.conteudo === 'isso, confirmo');
    expect(fala?.marcadores.sort()).toEqual(['confirmou', 'estimou']);
  });

  it("refuses a month the person did not say and confirms one she did, on the subject's company", async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador, 'Você fez isso quando?');
    const vazio = { organizacao: null, cargo: null, atual: null, confidencial: null, stack: null, ano_conclusao: null, cursando: null };
    const { cliente, pedidos } = clienteFalso([
      resposta([ferramenta('atualizar_affiliation', { ...vazio, periodo_inicio: '2019-01', periodo_fim: '2021-07', descricao_publica: null })]),
      resposta([
        ferramenta('atualizar_affiliation', { ...vazio, periodo_inicio: '2019-03', periodo_fim: '2021-07', descricao_publica: 'e-commerce de móveis, uns 200 mil clientes' }),
      ]),
      resposta([texto('E o painel, mostrava o quê?')]),
    ]);
    await turno(s.id, { tipo: 'resposta', texto: 'entrei em março e saí em julho de 2021. Era um e-commerce de móveis com uns 200 mil clientes' }, { avaliador, cliente });

    expect(resultados([pedidos[1]])[0].texto).toContain('mês 1');
    expect((await corpusDaSessao(s.id)).affiliations[0]).toMatchObject({ periodoInicio: '2019-03', periodoFim: '2021-07', periodoConfirmado: true });
  });

  it('"pular esta" skips the subject and the next question is about the next one, from a fresh context', async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador);
    const { cliente, pedidos } = clienteFalso([resposta([texto('Agora a migração. Era de quê?')])]);
    await turno(s.id, { tipo: 'pular' }, { avaliador, cliente });

    expect((await corpusDaSessao(s.id)).accomplishments[0].pulado).toBe(true);
    expect(tudo(pedidos[0])).toContain('Migrei o legado');
    expect(tudo(pedidos[0])).not.toContain('painel');
    expect(tudo(pedidos[0])).toContain('Assunto novo');
    expect((await mensagensDaSessao(s.id)).at(-1)).toMatchObject({ accomplishmentId: s.legado.id });
    const pulou = await db().select().from(eventos).where(and(eq(eventos.sessaoId, s.id), eq(eventos.tipo, 'pulou')));
    expect(pulou).toHaveLength(1);
    expect(await gatilhos(s.id)).toEqual(['inicio', 'pulou']);
  });

  it('"pular esta" on a subject that has its result moves on without skipping it', async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador);
    await registrarMetric(s.painel.id, { texto: '40 pedidos por dia', valores: [40], origem: 'afirmado' });
    await turno(s.id, { tipo: 'pular' }, { avaliador, cliente: clienteFalso([resposta([texto('Agora a migração.')])]).cliente });

    const [painel] = (await corpusDaSessao(s.id)).accomplishments;
    expect(painel.pulado).toBe(false);
    expect(painel.metrics).toHaveLength(1);
  });

  it('a checkpoint that moves on drops what was written and asks about the new subject', async () => {
    const s = await sessaoInterrogando();
    const { avaliador, decisao } = jevFalso();
    await primeira(s.id, avaliador);
    decisao.valor = 'move_on';
    const { cliente, pedidos } = clienteFalso([
      resposta([texto('Boa.'), ferramenta('registrar_metric', { texto: '40 pedidos por dia', valores: [40], origem: 'afirmado', ancora: null })]),
      resposta([texto('Agora a migração do legado. Era de quê?')]),
    ]);
    const visto: string[] = [];
    const r = await turno(s.id, { tipo: 'resposta', texto: 'uns 40 por dia, no admin' }, {
      avaliador,
      cliente,
      aoTexto: (d) => visto.push(d),
      aoReiniciar: () => visto.push('<reiniciar>'),
    });

    expect(visto).toEqual(['Boa.', '<reiniciar>', 'Agora a migração do legado. Era de quê?']);
    expect(r.texto).toBe('Agora a migração do legado. Era de quê?');
    expect(tudo(pedidos[1])).not.toContain('painel');
    expect((await mensagensDaSessao(s.id)).at(-1)).toMatchObject({ accomplishmentId: s.legado.id });
  });

  it('calls the evaluator on each trigger, and not on a note for later', async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador);

    // A note waits; the second question with no checkpoint is a trigger of its own.
    await turno(s.id, { tipo: 'resposta', texto: 'no banco eu também fiz um alerta' }, {
      avaliador,
      cliente: clienteFalso([resposta([ferramenta('anotar_para_depois', { texto: 'no banco eu também fiz um alerta' })]), resposta([texto('E o painel?')])]).cliente,
    });
    expect(await gatilhos(s.id)).toEqual(['inicio']);
    await turno(s.id, { tipo: 'resposta', texto: 'mostrava pedidos' }, { avaliador, cliente: clienteFalso([resposta([texto('Pra quem?')])]).cliente });
    expect(await gatilhos(s.id)).toEqual(['inicio', 'perguntas']);

    // Two "não sei" in a row.
    for (const fala of ['não sei', 'nem ideia']) {
      await turno(s.id, { tipo: 'resposta', texto: fala }, {
        avaliador,
        cliente: clienteFalso([resposta([ferramenta('marcar_nao_sei', {})]), resposta([texto('Quantas lojas usavam?')])]).cliente,
      });
    }
    expect((await gatilhos(s.id)).at(-1)).toBe('nao_sei');

    await turno(s.id, { tipo: 'resposta', texto: 'é isso' }, {
      avaliador,
      cliente: clienteFalso([resposta([ferramenta('concluir_assunto', {})]), resposta([texto('Quem mais fez?')])]).cliente,
    });
    expect((await gatilhos(s.id)).at(-1)).toBe('concluir');

    await turno(s.id, { tipo: 'resposta', texto: 'isso nem importa, deixa pra lá' }, {
      avaliador,
      cliente: clienteFalso([resposta([ferramenta('marcar_pulado', {})]), resposta([texto('Agora a migração.')])]).cliente,
    });
    expect((await gatilhos(s.id)).at(-1)).toBe('pulou');
    const pessoa = (await mensagensDaSessao(s.id)).filter((m) => m.papel === 'pessoa');
    expect(pessoa.filter((m) => m.marcadores.includes('nao_sei'))).toHaveLength(2);
    expect(pessoa.every((m) => typeof m.latenciaMs === 'number')).toBe(true);
  });

  it('marks a bare "sei lá" on its own, and calls the evaluator before the model on the second one in a row', async () => {
    const s = await sessaoInterrogando();
    const { avaliador, decisao } = jevFalso();
    await primeira(s.id, avaliador);
    await turno(s.id, { tipo: 'resposta', texto: 'sei lá' }, { avaliador, cliente: clienteFalso([resposta([texto('Quantas lojas usavam?')])]).cliente });
    expect((await mensagensDaSessao(s.id)).find((m) => m.conteudo === 'sei lá')?.marcadores).toEqual(['nao_sei']);
    expect(await gatilhos(s.id)).toEqual(['inicio']);

    decisao.valor = 'postpone';
    const { cliente, pedidos } = clienteFalso([resposta([texto('Agora a migração. Era de quê?')])]);
    await turno(s.id, { tipo: 'resposta', texto: 'não lembro' }, { avaliador, cliente });
    expect(await gatilhos(s.id)).toEqual(['inicio', 'nao_sei']);
    expect(tudo(pedidos[0])).toContain('Migrei o legado');
  });

  it('a bare "pula" works like the "pular esta" button', async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador);
    const { cliente, pedidos } = clienteFalso([resposta([texto('Agora a migração. Era de quê?')])]);
    await turno(s.id, { tipo: 'resposta', texto: 'pula essa' }, { avaliador, cliente });

    expect((await corpusDaSessao(s.id)).accomplishments[0].pulado).toBe(true);
    expect(tudo(pedidos[0])).toContain('Migrei o legado');
    expect(await gatilhos(s.id)).toEqual(['inicio', 'pulou']);
  });

  it("asks a company's block from the template and reads the answers, with no model call, then hands the next subject to the model", async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await atualizarAccomplishment(s.id, s.frete.id, { pulado: true });
    await primeira(s.id, avaliador);
    const semModelo = clienteFalso([]);

    const perguntas: string[] = [];
    perguntas.push((await turno(s.id, { tipo: 'pular' }, { avaliador, cliente: semModelo.cliente })).texto);
    for (const fala of ['março', 'julho', 'loja de móveis online']) {
      perguntas.push((await turno(s.id, { tipo: 'resposta', texto: fala }, { avaliador, cliente: semModelo.cliente })).texto);
    }
    expect(perguntas).toEqual([
      'Antes de deixar Loja Inventada para trás: em que mês de 2019 você entrou lá?',
      'E em que mês de 2021 você saiu? Se ainda está lá, é só dizer.',
      'Um recrutador lá fora nunca ouviu falar de Loja Inventada. Em uma frase, o que a empresa faz?',
      'O nome Loja Inventada pode aparecer no currículo?',
    ]);
    expect(semModelo.pedidos).toHaveLength(0);
    expect((await mensagensDaSessao(s.id)).at(-1)).toMatchObject({ affiliationId: s.loja.id });

    const { cliente, pedidos } = clienteFalso([resposta([texto('Agora a migração. Era de quê?')])]);
    await turno(s.id, { tipo: 'resposta', texto: 'pode sim' }, { avaliador, cliente });
    expect(pedidos).toHaveLength(1);
    expect(tudo(pedidos[0])).toContain('Migrei o legado');
    expect((await corpusDaSessao(s.id)).affiliations[0]).toMatchObject({
      periodoInicio: '2019-03',
      periodoFim: '2021-07',
      periodoConfirmado: true,
      descricaoPublica: 'loja de móveis online',
      confidencial: false,
    });
    expect((await gatilhos(s.id)).at(-1)).toBe('bloco');
  });

  it('hands the block to the questioner when the rule cannot read the answer, with the answer', async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await atualizarAccomplishment(s.id, s.frete.id, { pulado: true });
    await primeira(s.id, avaliador);
    await turno(s.id, { tipo: 'pular' }, { avaliador, cliente: clienteFalso([]).cliente });

    const { cliente, pedidos } = clienteFalso([resposta([texto('Logo depois da faculdade: em que mês foi isso?')])]);
    await turno(s.id, { tipo: 'resposta', texto: 'foi logo depois da faculdade' }, { avaliador, cliente });
    expect(pedidos).toHaveLength(1);
    expect(tudo(pedidos[0])).toContain('Loja Inventada');
    expect(tudo(pedidos[0])).toContain('foi logo depois da faculdade');

    // From here on, the questioner has the subject.
    const seguinte = clienteFalso([resposta([texto('E saiu quando?')])]);
    await turno(s.id, { tipo: 'resposta', texto: 'março' }, { avaliador, cliente: seguinte.cliente });
    expect(seguinte.pedidos).toHaveLength(1);
  });

  it('offers to stop with a fixed message once the coverage passes the threshold', async () => {
    const s = await sessaoInterrogando();
    const { avaliador, decisao } = jevFalso();
    await primeira(s.id, avaliador);
    await registrarMetric(s.legado.id, { texto: 'o legado foi desligado', valores: [], origem: 'qualitativo' });
    decisao.valor = 'move_on';
    const { cliente, pedidos } = clienteFalso([
      resposta([ferramenta('registrar_metric', { texto: '40 pedidos por dia', valores: [40], origem: 'afirmado', ancora: null })]),
    ]);
    const r = await turno(s.id, { tipo: 'resposta', texto: 'uns 40 por dia' }, { avaliador, cliente });

    expect(r.texto).toBe(OFERTA_DE_FIM);
    expect(pedidos).toHaveLength(1);
    expect(r.progresso.cobertura).toBe(83);
    expect((await mensagensDaSessao(s.id)).at(-1)).toMatchObject({ papel: 'assistente', conteudo: OFERTA_DE_FIM });
    expect(r.opcoes).toEqual([{ id: s.frete.id, rotulo: 'Integrei o frete (Loja Inventada)' }]);

    // Picking a pending subject: it is the person's message, and the next question is about it.
    const escolha = clienteFalso([resposta([texto('Voltando ao frete. O que ele resolvia?')])]);
    const depois = await turno(s.id, { tipo: 'escolher', id: s.frete.id }, { avaliador, cliente: escolha.cliente });
    expect(depois).toMatchObject({ texto: 'Voltando ao frete. O que ele resolvia?', opcoes: [] });
    expect(tudo(escolha.pedidos[0])).toContain('Integrei o frete');
    expect(tudo(escolha.pedidos[0])).toContain('Assunto novo');
    expect((await mensagensDaSessao(s.id)).slice(-2).map((m) => [m.papel, m.conteudo])).toEqual([
      ['pessoa', 'Integrei o frete (Loja Inventada)'],
      ['assistente', 'Voltando ao frete. O que ele resolvia?'],
    ]);
    await expect(turno(s.id, { tipo: 'escolher', id: s.frete.id }, { avaliador })).rejects.toThrow('offer');
  });

  it('rewrites a message that asks two things, once, and records only the rewrite', async () => {
    const s = await sessaoInterrogando();
    const { cliente, pedidos } = clienteFalso([resposta([texto('O painel mostrava o quê, e pra quem?')]), resposta([texto('O painel mostrava o quê?')])]);
    const visto: string[] = [];
    const r = await turno(s.id, { tipo: 'continuar' }, {
      avaliador: jevFalso().avaliador,
      cliente,
      aoTexto: (d) => visto.push(d),
      aoReiniciar: () => visto.push('<reiniciar>'),
    });

    expect(r.texto).toBe('O painel mostrava o quê?');
    expect(visto).toEqual(['O painel mostrava o quê, e pra quem?', '<reiniciar>', 'O painel mostrava o quê?']);
    expect(String(pedidos[1].messages.at(-1)!.content)).toContain('mais de uma coisa');
    expect((await mensagensDaSessao(s.id)).map((m) => m.conteudo)).toEqual(['O painel mostrava o quê?']);
  });

  it('"continuar" with the question already asked calls no model', async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador);
    const { cliente, pedidos } = clienteFalso([]);
    const r = await turno(s.id, { tipo: 'continuar' }, { avaliador, cliente });
    expect(r.texto).toBe('');
    expect(pedidos).toHaveLength(0);
  });

  it('refuses an estimate the person answered "não" to', async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador, 'Então umas 30 lojas, confirma?');
    const { cliente, pedidos } = clienteFalso([
      resposta([ferramenta('registrar_metric', { texto: '~30 lojas', valores: [30], origem: 'estimado', ancora: 'quantas lojas' })]),
      resposta([texto('Quantas então?')]),
    ]);
    await turno(s.id, { tipo: 'resposta', texto: 'não, menos que isso, umas 30 não' }, { avaliador, cliente });
    expect(resultados(pedidos)[0]).toMatchObject({ erro: true });
    expect((await corpusDaSessao(s.id)).accomplishments[0].metrics).toHaveLength(0);
  });

  it(`skips a subject on its own after ${LIMITE_DURO} questions`, async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador);
    for (let i = 1; i < LIMITE_DURO; i++) {
      await registrarMensagem(s.id, { papel: 'pessoa', conteudo: 'hum' });
      await registrarMensagem(s.id, { papel: 'assistente', conteudo: `pergunta ${i}?`, accomplishmentId: s.painel.id });
    }
    const { cliente } = clienteFalso([resposta([texto('Agora a migração.')])]);
    await turno(s.id, { tipo: 'resposta', texto: 'não sei mesmo' }, { avaliador, cliente });

    expect((await corpusDaSessao(s.id)).accomplishments[0].pulado).toBe(true);
    expect((await mensagensDaSessao(s.id)).at(-1)).toMatchObject({ accomplishmentId: s.legado.id });
  });

  it(`moves on after ${LIMITE_DURO} questions even when the subject already has its result`, async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador);
    await registrarMetric(s.painel.id, { texto: '40 pedidos por dia', valores: [40], origem: 'afirmado' });
    for (let i = 1; i < LIMITE_DURO; i++) {
      await registrarMensagem(s.id, { papel: 'pessoa', conteudo: 'hum' });
      await registrarMensagem(s.id, { papel: 'assistente', conteudo: `pergunta ${i}?`, accomplishmentId: s.painel.id });
    }
    await turno(s.id, { tipo: 'resposta', texto: 'é isso' }, { avaliador, cliente: clienteFalso([resposta([texto('Agora a migração.')])]).cliente });

    const [painel] = (await corpusDaSessao(s.id)).accomplishments;
    expect(painel).toMatchObject({ pulado: false });
    expect((await mensagensDaSessao(s.id)).at(-1)).toMatchObject({ accomplishmentId: s.legado.id });
  });

  it('ends the interrogation when the person asked', async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador);
    const r = await turno(s.id, { tipo: 'resposta', texto: 'chega, pode gerar' }, {
      avaliador,
      cliente: clienteFalso([resposta([ferramenta('encerrar_interrogatorio', {})]), resposta([texto('Valeu! Agora eu monto o currículo.')])]).cliente,
    });

    expect(r.encerrado).toBe(true);
    expect((await sessaoPorId(s.id))?.estado).toBe('gerando');
    const [terminou] = await db().select().from(eventos).where(and(eq(eventos.sessaoId, s.id), eq(eventos.tipo, 'terminou')));
    expect(terminou.dados).toEqual({ abertos: 5, total: 5, por: 'modelo' });
    await expect(turno(s.id, { tipo: 'resposta', texto: 'oi' }, { avaliador })).rejects.toThrow('gerando');
  });

  it('ends the interrogation with a fixed goodbye once the spending cap is reached', async () => {
    const s = await sessaoInterrogando();
    const { avaliador } = jevFalso();
    await primeira(s.id, avaliador);
    const chamadas: unknown[] = [];
    const sdk = { beta: { messages: { stream: () => { chamadas.push(1); throw new Error('called'); } } } };
    const cliente = criarClienteLlm({ sdk, registrar: async () => {}, gastoDaSessao: async () => 3.02, tetoSessaoUsd: 3 });
    const deltas: string[] = [];
    const r = await turno(s.id, { tipo: 'resposta', texto: 'uns 40 por dia' }, { avaliador, cliente, aoTexto: (d) => deltas.push(d) });

    expect(chamadas).toHaveLength(0);
    expect(r).toMatchObject({ texto: DESPEDIDA_DO_TETO, encerrado: true });
    expect(deltas.join('')).toBe(DESPEDIDA_DO_TETO);
    expect((await mensagensDaSessao(s.id)).slice(-2).map((m) => [m.papel, m.conteudo])).toEqual([
      ['pessoa', 'uns 40 por dia'],
      ['assistente', DESPEDIDA_DO_TETO],
    ]);
    expect((await sessaoPorId(s.id))?.estado).toBe('gerando');
    const [terminou] = await db().select().from(eventos).where(and(eq(eventos.sessaoId, s.id), eq(eventos.tipo, 'terminou')));
    expect(terminou.dados).toMatchObject({ por: 'teto' });
  });
});

/**
 * The same shop and bank after the interrogation ended (`pronto`): the panel
 * (strong) has its result, shipping was postponed, the legacy migration skipped, the
 * companies' blocks are done, and the last message is the goodbye.
 */
async function sessaoRetomada() {
  const s = await sessaoInterrogando();
  await registrarMetric(s.painel.id, { texto: '40 pedidos por dia', valores: [40], origem: 'afirmado' });
  // Judged in the interrogation, as the evaluator leaves them.
  await db().update(accomplishments).set({ forca: 'forte' }).where(eq(accomplishments.id, s.painel.id));
  await db().update(accomplishments).set({ adiado: true, forca: 'fraco' }).where(eq(accomplishments.id, s.frete.id));
  await db().update(accomplishments).set({ pulado: true }).where(eq(accomplishments.id, s.legado.id));
  await db().update(affiliations).set({ periodoConfirmado: true, periodoInicio: '2019-01', descricaoPublica: 'uma empresa inventada' }).where(eq(affiliations.sessaoId, s.id));
  await registrarMensagem(s.id, { papel: 'assistente', conteudo: 'Era isso. Vou montar o seu currículo com o que você me contou.' });
  await db().update(sessoes).set({ estado: 'pronto' }).where(eq(sessoes.id, s.id));
  return s;
}

const terminados = async (sessaoId: string) =>
  (await db().select().from(eventos).where(and(eq(eventos.sessaoId, sessaoId), eq(eventos.tipo, 'terminou')))).length;

describe.skipIf(semBanco)('turno na retomada (passo 14)', () => {
  it('resumes a session in pronto on what was skipped, and the offer to stop goes back home with nothing postponed skipped', async () => {
    const s = await sessaoRetomada();
    const { avaliador, decisao } = jevFalso();
    await retomar(s.id);

    // The goodbye is the last message, and still the reopened subject is owed a question.
    const abrir = clienteFalso([resposta([texto('Voltando à migração do legado: o que mudou depois dela?')])]);
    expect((await turno(s.id, { tipo: 'continuar' }, { avaliador, cliente: abrir.cliente })).texto).toContain('legado');
    expect(tudo(abrir.pedidos[0])).toContain('Migrei o legado');

    // Answering a skipped record un-skips it.
    decisao.valor = 'move_on';
    const r = await turno(s.id, { tipo: 'resposta', texto: 'o servidor antigo foi desligado' }, {
      avaliador,
      cliente: clienteFalso([resposta([ferramenta('registrar_metric', { texto: 'o servidor antigo foi desligado', valores: [], origem: 'qualitativo', ancora: null })])]).cliente,
    });
    expect((await corpusDaSessao(s.id)).accomplishments.find((a) => a.id === s.legado.id)).toMatchObject({ pulado: false });
    expect(r.texto).toBe(OFERTA_DE_FIM);

    decisao.parar = true;
    const fim = await turno(s.id, { tipo: 'resposta', texto: 'pode parar' }, { avaliador, cliente: clienteFalso([]).cliente });
    expect(fim).toMatchObject({ texto: DESPEDIDA_DA_RETOMADA, encerrado: true });
    expect((await sessaoPorId(s.id))?.estado).toBe('pronto');
    expect(await terminados(s.id)).toBe(0);
    expect((await corpusDaSessao(s.id)).accomplishments.find((a) => a.id === s.frete.id)).toMatchObject({ adiado: true, pulado: false });
    expect((await estadoDoPlano(s.id))?.assunto).toBeNull();
  });

  it('keeps a reopened record skipped when the person skips it again, and says goodbye home once the queue is empty', async () => {
    const s = await sessaoRetomada();
    const { avaliador } = jevFalso();
    await retomar(s.id);
    await turno(s.id, { tipo: 'continuar' }, { avaliador, cliente: clienteFalso([resposta([texto('E a migração do legado?')])]).cliente });

    // Skipped again, it stays skipped, and the coverage is back above the offer's threshold.
    const r = await turno(s.id, { tipo: 'pular' }, { avaliador, cliente: clienteFalso([]).cliente });
    expect(r.texto).toBe(OFERTA_DE_FIM);
    expect((await corpusDaSessao(s.id)).accomplishments.find((a) => a.id === s.legado.id)).toMatchObject({ pulado: true });
    expect(r.opcoes.map((o) => o.id)).toEqual([s.frete.id]);

    // The postponed one, picked under the offer and skipped by the person: the queue is empty.
    await turno(s.id, { tipo: 'escolher', id: s.frete.id }, { avaliador, cliente: clienteFalso([resposta([texto('E o frete, o que ele resolvia?')])]).cliente });
    const fim = await turno(s.id, { tipo: 'pular' }, { avaliador, cliente: clienteFalso([]).cliente });
    expect(fim).toMatchObject({ texto: DESPEDIDA_DA_RETOMADA, encerrado: true });
    expect((await sessaoPorId(s.id))?.estado).toBe('pronto');
    expect(await terminados(s.id)).toBe(0);
  });

  it('does not resume on the subject the interrogation ended on once it has its result', async () => {
    const s = await sessaoRetomada();
    await gravarPlano(s.id, { ...planoVazio(), assunto: { tipo: 'accomplishment', id: s.painel.id, objetivo: [], desde: 0 } });
    expect((await retomar(s.id)).assunto).toMatchObject({ tipo: 'accomplishment', id: s.legado.id });
  });

  it('"contar algo novo" opens a subject in front of the queue, and the record it creates is asked next', async () => {
    const s = await sessaoRetomada();
    await db().update(sessoes).set({ estado: 'encerrado' }).where(eq(sessoes.id, s.id));
    const { avaliador } = jevFalso();
    await contarAlgoNovo(s.id);
    expect((await estadoDoPlano(s.id))?.assunto).toMatchObject({ tipo: 'novo' });

    const abrir = clienteFalso([resposta([texto('O que você quer contar?')])]);
    await turno(s.id, { tipo: 'continuar' }, { avaliador, cliente: abrir.cliente });
    expect(tudo(abrir.pedidos[0])).toContain('Loja Inventada');

    const { cliente, pedidos } = clienteFalso([
      resposta([
        ferramenta('criar_accomplishment', { empresa: 'Loja Inventada', tipo: 'engineering', enunciado: 'Fiz o app de agendamento da loja' }),
        texto('Legal! E quanta gente usa?'),
      ]),
      resposta([texto('Sobre o app de agendamento: quantas pessoas usam por semana?')]),
    ]);
    const r = await turno(s.id, { tipo: 'resposta', texto: 'fiz o app de agendamento da loja' }, { avaliador, cliente });

    const novo = (await corpusDaSessao(s.id)).accomplishments.find((a) => a.enunciado === 'Fiz o app de agendamento da loja');
    expect(novo).toBeDefined();
    expect(r.texto).toBe('Sobre o app de agendamento: quantas pessoas usam por semana?');
    expect(tudo(pedidos[1])).toContain('Fiz o app de agendamento da loja');
    expect((await mensagensDaSessao(s.id)).at(-1)).toMatchObject({ accomplishmentId: novo!.id });
    expect((await sessaoPorId(s.id))?.estado).toBe('encerrado');
  });
});

/**
 * The retomada's shop and bank, with a general résumé generated, and a Vaga at
 * an invented company: Kafka and Docker are gaps the person marked "já usei",
 * Rust one she marked "não usei", and the reading brought the shipping draft.
 */
async function sessaoComVaga() {
  const s = await sessaoRetomada();
  await db().insert(geracoes).values({ sessaoId: s.id, versao: 1, iniciadaEm: new Date(Date.now() - 60_000) });
  await responderConsentimentoVagas(s.id, true);
  const criada = await criarVaga(s.id, { texto: 'Acme Payments: Kafka, Docker, Rust.', empresa: null, cargo: null, link: null });
  if (criada.tipo !== 'criada') throw new Error(criada.tipo);
  const vagaId = criada.vaga.id;
  await gravarLeitura(vagaId, {
    empresa: 'Acme Payments',
    cargo: 'Backend Engineer',
    senioridade: null,
    lingua: 'en',
    requisitos: [
      { texto: 'An order dashboard', tipo: 'obrigatorio', accomplishmentIds: [s.painel.id] },
      { texto: 'Kafka, the way Acme Payments runs it', tipo: 'obrigatorio', accomplishmentIds: [] },
      { texto: 'Docker', tipo: 'desejavel', accomplishmentIds: [] },
      { texto: 'Rust', tipo: 'desejavel', accomplishmentIds: [] },
    ],
    rascunhos: [{ accomplishmentId: s.frete.id, motivo: 'a vaga fala de logística' }],
  });
  const lida = (await vagaDaSessao(s.id, vagaId))!;
  const [, kafka, docker, rust] = lida.requisitos;
  await confirmarVaga(s.id, vagaId, {
    empresa: 'Acme Payments',
    cargo: 'Backend Engineer',
    respostas: new Map([
      [kafka.id, 'ja_usei'],
      [docker.id, 'ja_usei'],
      [rust.id, 'nao_usei'],
    ]),
  });
  return { ...s, vagaId, kafka, docker, rust };
}

describe.skipIf(semBanco)('turno na conversa da vaga (passo 16)', () => {
  it('asks the gaps, then the draft the reading brought, puts what comes out in the Corpus and ends back at the Vaga', async () => {
    const s = await sessaoComVaga();
    const { avaliador, decisao } = jevFalso();
    const enviados: unknown[] = [];
    const classificador: Classificador = {
      classificar: (p) => {
        enviados.push(p.state);
        return avaliador.classificador.classificar(p);
      },
    };
    const deps = { avaliador: { classificador }, vagaId: s.vagaId };
    const geraisAntes = (await mensagensDaSessao(s.id)).length;

    expect((await abrirConversaDaVaga(s.id, s.vagaId)).assunto).toMatchObject({ tipo: 'lacuna', id: s.kafka.id });
    expect(await perguntasEmAberto(s.id, s.vagaId)).toBe(3);
    // The general open queue never shows a gap that is not a record yet.
    expect(filaAberta(await corpusDaSessao(s.id))).toEqual([s.legado.id, s.frete.id]);

    // The questioner sees the requirement and the companies with their stack, and nothing else of the Vaga.
    const abrir = clienteFalso([resposta([texto('Onde você usou Kafka?')])]);
    await turno(s.id, { tipo: 'continuar' }, { ...deps, cliente: abrir.cliente });
    expect(tudo(abrir.pedidos[0])).toContain('Kafka, the way Acme Payments runs it');
    expect(tudo(abrir.pedidos[0])).toContain('Loja Inventada');
    for (const fora of ['Docker', 'Rust', 'frete', 'Backend Engineer']) expect(tudo(abrir.pedidos[0])).not.toContain(fora);

    // The gap becomes a record, which is asked next.
    const criar = clienteFalso([
      resposta([
        ferramenta('criar_accomplishment', { empresa: 'Loja Inventada', tipo: 'engineering', enunciado: 'Montei a fila de pedidos em Kafka' }),
        texto('E quantos pedidos passavam?'),
      ]),
      resposta([texto('Quantos pedidos passavam pela fila?')]),
    ]);
    await turno(s.id, { tipo: 'resposta', texto: 'montei a fila de pedidos da loja em Kafka' }, { ...deps, cliente: criar.cliente });
    const kafka = (await corpusDaSessao(s.id)).accomplishments.find((a) => a.enunciado === 'Montei a fila de pedidos em Kafka')!;
    expect((await estadoDoPlano(s.id, s.vagaId))?.assunto).toMatchObject({ tipo: 'accomplishment', id: kafka.id });

    // Its result moves on to the next gap.
    decisao.valor = 'move_on';
    const metric = clienteFalso([
      resposta([ferramenta('registrar_metric', { texto: '500 pedidos por hora', valores: [500], origem: 'afirmado', ancora: null }), texto('Certo.')]),
      resposta([texto('E o Docker, onde você usa?')]),
    ]);
    await turno(s.id, { tipo: 'resposta', texto: 'uns 500 pedidos por hora, via no Grafana' }, { ...deps, cliente: metric.cliente });
    expect((await estadoDoPlano(s.id, s.vagaId))?.assunto).toMatchObject({ tipo: 'lacuna', id: s.docker.id });

    // A gap that was a tool of the day-to-day goes on the company's stack.
    const stack = clienteFalso([
      resposta([ferramenta('acrescentar_stack', { empresa: 'Loja Inventada', tecnologias: ['Docker'] })]),
      resposta([texto('Agora o frete: o que ele resolvia?')]),
    ]);
    await turno(s.id, { tipo: 'resposta', texto: 'uso docker todo dia na loja' }, { ...deps, cliente: stack.cliente });
    expect((await corpusDaSessao(s.id)).affiliations.find((a) => a.organizacao === 'Loja Inventada')?.stack).toContain('Docker');
    expect((await estadoDoPlano(s.id, s.vagaId))?.assunto).toMatchObject({ tipo: 'accomplishment', id: s.frete.id });

    // The last one skipped: back to the Vaga, the session where it was.
    const fim = await turno(s.id, { tipo: 'pular' }, { ...deps, cliente: clienteFalso([]).cliente });
    expect(fim).toMatchObject({ texto: DESPEDIDA_DA_VAGA, encerrado: true });
    expect(await perguntasEmAberto(s.id, s.vagaId)).toBe(0);
    expect((await sessaoPorId(s.id))?.estado).toBe('pronto');
    expect(await terminados(s.id)).toBe(0);

    // What came out is the general Corpus's, and the general résumé knows it.
    expect((await corpusDaSessao(s.id)).accomplishments.find((a) => a.id === kafka.id)?.metrics).toHaveLength(1);
    expect(await corpusMudou(s.id)).toBe(true);

    // Each chat holds only its own messages.
    expect(await mensagensDaSessao(s.id)).toHaveLength(geraisAntes);
    const daVaga = await mensagensDaSessao(s.id, s.vagaId);
    expect(daVaga.map((m) => m.conteudo)).toContain('Onde você usou Kafka?');
    expect(daVaga.every((m) => m.vagaId === s.vagaId)).toBe(true);

    // The Jev got "Empresa X", never the Vaga's company.
    expect(JSON.stringify(enviados)).toContain('Empresa X');
    expect(JSON.stringify(enviados)).not.toMatch(/acme/i);
  });

  it('refuses a stack for a company the person does not have', async () => {
    const s = await sessaoComVaga();
    const { avaliador } = jevFalso();
    await abrirConversaDaVaga(s.id, s.vagaId);
    await turno(s.id, { tipo: 'continuar' }, { avaliador, vagaId: s.vagaId, cliente: clienteFalso([resposta([texto('Onde você usou Kafka?')])]).cliente });
    const { cliente, pedidos } = clienteFalso([
      resposta([ferramenta('acrescentar_stack', { empresa: 'Empresa Que Não Existe', tecnologias: ['Kafka'] }), texto('Em qual empresa?')]),
      resposta([texto('Em qual empresa foi?')]),
    ]);
    await turno(s.id, { tipo: 'resposta', texto: 'usei numa empresa' }, { avaliador, vagaId: s.vagaId, cliente });
    expect(resultados(pedidos)).toEqual([{ erro: true, texto: expect.stringContaining('Empresa Que Não Existe') }]);
    expect((await corpusDaSessao(s.id)).affiliations.every((a) => !a.stack.includes('Kafka'))).toBe(true);
  });

  it('refuses a stack on a degree: only a company the questioner was shown', async () => {
    const s = await sessaoComVaga();
    const { avaliador } = jevFalso();
    await db().insert(affiliations).values({ sessaoId: s.id, organizacao: 'Faculdade Inventada', cargo: 'Computação', tipo: 'graduacao', ordem: 9 });
    await abrirConversaDaVaga(s.id, s.vagaId);
    await turno(s.id, { tipo: 'continuar' }, { avaliador, vagaId: s.vagaId, cliente: clienteFalso([resposta([texto('Onde você usou Kafka?')])]).cliente });
    const { cliente, pedidos } = clienteFalso([
      resposta([ferramenta('acrescentar_stack', { empresa: 'Faculdade Inventada', tecnologias: ['Kafka'] }), texto('Em qual empresa?')]),
      resposta([texto('Em qual empresa foi?')]),
    ]);
    await turno(s.id, { tipo: 'resposta', texto: 'usei na faculdade' }, { avaliador, vagaId: s.vagaId, cliente });
    expect(resultados(pedidos)).toEqual([{ erro: true, texto: expect.stringContaining('Faculdade Inventada') }]);
  });

  it('keeps open, and counts, a draft the Vaga brought that the general conversation had skipped', async () => {
    const s = await sessaoComVaga();
    await atualizarAccomplishment(s.id, s.frete.id, { pulado: true });
    const naFrente = { tipo: 'accomplishment' as const, id: s.frete.id, objetivo: [], desde: 0 };
    await gravarPlano(s.id, { ...planoVazio(), assunto: naFrente, visitados: [`lacuna:${s.kafka.id}`, `lacuna:${s.docker.id}`], retomados: [s.frete.id] }, s.vagaId);

    expect(await perguntasEmAberto(s.id, s.vagaId)).toBe(1);
    expect((await abrirConversaDaVaga(s.id, s.vagaId)).assunto).toMatchObject({ tipo: 'accomplishment', id: s.frete.id });
  });

  it("accepts in the Vaga's conversation a number the person said in the general one", async () => {
    const s = await sessaoComVaga();
    const { avaliador } = jevFalso();
    await registrarMensagem(s.id, { papel: 'pessoa', conteudo: 'o frete levava 3 dias para fechar' });
    await abrirConversaDaVaga(s.id, s.vagaId);
    await turno(s.id, { tipo: 'continuar' }, { avaliador, vagaId: s.vagaId, cliente: clienteFalso([resposta([texto('Onde você usou Kafka?')])]).cliente });
    const { cliente } = clienteFalso([
      resposta([
        ferramenta('criar_accomplishment', { empresa: 'Loja Inventada', tipo: 'engineering', enunciado: 'Montou a fila do frete em Kafka, que levava 3 dias' }),
        texto('E o que mudou?'),
      ]),
      resposta([texto('E o que mudou com a fila?')]),
    ]);
    await turno(s.id, { tipo: 'resposta', texto: 'montei a fila do frete em Kafka' }, { avaliador, vagaId: s.vagaId, cliente });
    const enunciados = (await corpusDaSessao(s.id)).accomplishments.map((a) => a.enunciado);
    expect(enunciados).toContain('Montou a fila do frete em Kafka, que levava 3 dias');
  });
});
