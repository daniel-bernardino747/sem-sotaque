// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, describe, expect, inject, it } from 'vitest';

import {
  atualizarAccomplishment,
  corpusDaSessao,
  criarAccomplishment,
  criarTester,
  decisoesDaSessao,
  gravarImportacao,
  iniciarInterrogatorio,
  registrarConsentimento,
  registrarMensagem,
  registrarMetric,
} from '@/db';
import { fecharDb } from '@/db/client';

import { anotarParaDepois, checkpoint, classificarProtegido, escolherAssunto, estadoDoPlano, iniciarPlano, opcoesDaOferta } from './index';
import { ErroClassificador, type Classificador, type Questions } from './jev';
import { protegidos } from './pseudonimo';

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);

type Responder = (nome: string, q: Questions[string], state: unknown) => unknown;

/** A Jev that answers each question with `responder`, and records what it was sent. */
function jevFalso(responder: Responder) {
  const pedidos: { state: unknown; questions: Questions }[] = [];
  const classificador: Classificador = {
    async classificar(p) {
      pedidos.push({ state: p.state, questions: p.questions });
      return Object.fromEntries(
        Object.entries(p.questions).map(([nome, q]) => [nome, { type: q.type, ...(responder(nome, q, p.state) as object) }]),
      ) as never;
    },
  };
  return { classificador, pedidos };
}

const sim = { noul: 0.9 };
const nao = { noul: 0.1 };
/** Strength by the item's text: "forte" in it is strong, "fraco" weak. */
const porTexto: Responder = (nome, q, state) => {
  if (q.type === 'score') {
    const item = nome.replace('strength_', '');
    const texto = JSON.stringify((state as { items?: { id: string; what: string }[] }).items?.find((i) => i.id === item) ?? state);
    return { score: texto.includes('forte') ? 2 : texto.includes('fraco') ? 0 : 1 };
  }
  if (q.type === 'choice') return { choice: nome === 'decision' ? 'move_on' : 'none' };
  return nao;
};

const foraDoAr: Classificador = {
  async classificar() {
    throw new ErroClassificador('api', 'timeout');
  },
};

async function sessao() {
  const { sessao } = await criarTester({ apelido: 'Persona', origem: 'teste' });
  await registrarConsentimento(sessao.id, 'v2');
  await gravarImportacao(sessao.id, {
    formato: 'texto',
    textoExtraido: 'Ada Inventada Souza\nLoja Inventada — Dev — 2019 – 2021\n- painel forte\n- frete fraco\n- relatório médio',
    corpus: {
      affiliations: [{ ref: 'a1', organizacao: 'Loja Inventada', cargo: 'Dev', periodoOriginal: '2019 – 2021', stack: [] }],
      accomplishments: [
        { ref: 'c1', affiliationRef: 'a1', tipo: 'engineering', enunciado: 'frete fraco' },
        { ref: 'c2', affiliationRef: 'a1', tipo: 'engineering', enunciado: 'painel forte' },
        { ref: 'c3', affiliationRef: 'a1', tipo: 'engineering', enunciado: 'relatório médio' },
      ],
      linhas: [],
    },
  });
  await iniciarInterrogatorio(sessao.id);
  const corpus = await corpusDaSessao(sessao.id);
  const [fraco, forte, medio] = corpus.accomplishments;
  return { id: sessao.id, af: corpus.affiliations[0], fraco, forte, medio };
}

describe('classificarProtegido', () => {
  const lista = protegidos({ curriculo: 'Ada Inventada Souza\n', organizacoes: ['Loja Inventada'] });
  it('refuses a payload with the person or an organisation, without calling', async () => {
    const { classificador, pedidos } = jevFalso(porTexto);
    for (const state of [{ x: 'a Ada fez' }, { x: 'na loja inventada' }]) {
      await expect(classificarProtegido(classificador, { sessaoId: 's', state, questions: {} }, lista)).rejects.toMatchObject({ motivo: 'payload' });
    }
    expect(pedidos).toHaveLength(0);
  });
});

describe.skipIf(semBanco)('the evaluator', () => {
  it('starts with the strongest accomplishment, judged by the Jev, on a pseudonymised payload', async () => {
    const s = await sessao();
    const { classificador, pedidos } = jevFalso(porTexto);
    const estado = await iniciarPlano(s.id, { classificador });

    expect(estado.assunto).toMatchObject({ tipo: 'accomplishment', id: s.forte.id });
    expect(estado.fila).toEqual([`accomplishment:${s.medio.id}`, `accomplishment:${s.fraco.id}`, `affiliation:${s.af.id}`]);
    expect(JSON.stringify(pedidos)).not.toMatch(/Inventada|Ada/);
    expect(JSON.stringify(pedidos)).toContain('Empresa A');
    const corpus = await corpusDaSessao(s.id);
    expect(corpus.accomplishments.map((a) => a.forca)).toEqual(['fraco', 'forte', 'medio']);
    expect(await decisoesDaSessao(s.id)).toEqual([expect.objectContaining({ gatilho: 'inicio', decisao: 'plano_inicial', backend: 'jev' })]);
  });

  it('keeps a subject with a new goal from what came back "no"', async () => {
    const s = await sessao();
    await iniciarPlano(s.id, { classificador: jevFalso(porTexto).classificador });
    const { classificador } = jevFalso((nome, q) =>
      nome === 'decision' ? { choice: 'continue' } : q.type === 'score' ? { score: 2 } : nome === 'problem' || nome === 'contribution' ? sim : nao,
    );
    const r = await checkpoint(s.id, 'perguntas', { classificador });
    expect(r.mudou).toBe(false);
    expect(r.estado.assunto?.objetivo).toEqual(['falta: resultado', 'falta: como ela sabe o resultado', 'se sobrar: o quanto isto importa para ela (uma vez, leve)']);
  });

  it('holds a subject whose result was said and not recorded, whatever the Jev decides', async () => {
    const s = await sessao();
    await iniciarPlano(s.id, { classificador: jevFalso(porTexto).classificador });
    const { classificador } = jevFalso((nome, q) => (nome === 'decision' ? { choice: 'move_on' } : q.type === 'score' ? { score: 2 } : nome === 'result' ? sim : nao));
    const r = await checkpoint(s.id, 'perguntas', { classificador });
    expect(r.mudou).toBe(false);
    expect(r.estado.assunto?.objetivo[0]).toMatch(/^falta: gravar o resultado/);
    expect((await decisoesDaSessao(s.id)).at(-1)).toMatchObject({ decisao: 'continuar' });

    // Skipped, it moves on all the same.
    expect((await checkpoint(s.id, 'pulou', { classificador })).mudou).toBe(true);
  });

  it('moves on the second time the questioner suggests closing a record that has its result', async () => {
    const s = await sessao();
    await iniciarPlano(s.id, { classificador: jevFalso(porTexto).classificador });
    const manter = jevFalso((nome, q) => (nome === 'decision' ? { choice: 'continue' } : q.type === 'score' ? { score: 2 } : nao));
    expect((await checkpoint(s.id, 'concluir', manter)).mudou).toBe(false);

    await registrarMetric(s.forte.id, { texto: '40 pedidos por dia', valores: [40], origem: 'afirmado' });
    expect((await checkpoint(s.id, 'concluir', manter)).mudou).toBe(true);
    expect((await decisoesDaSessao(s.id)).at(-1)).toMatchObject({ gatilho: 'concluir', decisao: 'trocar' });
  });

  it('postpones a record left without a result, and brings it back once, at the end', async () => {
    const s = await sessao();
    const { classificador } = jevFalso(porTexto);
    await iniciarPlano(s.id, { classificador });
    const adiar = jevFalso((nome, q) => (nome === 'decision' ? { choice: 'postpone' } : q.type === 'score' ? { score: 2 } : nao));
    const r = await checkpoint(s.id, 'nao_sei', { classificador: adiar.classificador });

    expect(r.mudou).toBe(true);
    expect(r.estado.assunto).toMatchObject({ tipo: 'accomplishment', id: s.medio.id });
    expect(r.estado.fila.at(-1)).toBe(`accomplishment:${s.forte.id}`);
    expect((await corpusDaSessao(s.id)).accomplishments[1]).toMatchObject({ adiado: true, adiadoVoltou: false });

    // The others are done; it comes back with its one goal, then ends skipped.
    for (const a of [s.medio, s.fraco]) await atualizarAccomplishment(s.id, a.id, { pulado: true });
    await checkpoint(s.id, 'pulou', { classificador });
    const bloco = await checkpoint(s.id, 'pulou', { classificador: jevFalso((n) => (n === 'decision' ? { choice: 'move_on' } : nao)).classificador });
    expect(bloco.estado.assunto).toMatchObject({ tipo: 'accomplishment', id: s.forte.id, objetivo: ['falta: um resultado qualitativo concreto; se não houver, pule este assunto'] });
    expect((await corpusDaSessao(s.id)).accomplishments[1].adiadoVoltou).toBe(true);

    const fim = await checkpoint(s.id, 'nao_sei', { classificador: adiar.classificador });
    expect(fim.encerrar).toBe(true);
    expect((await corpusDaSessao(s.id)).accomplishments[1].pulado).toBe(true);
  });

  it('falls back to the fixed rules when the Jev is out, without recomputing the coverage', async () => {
    const s = await sessao();
    await iniciarPlano(s.id, { classificador: jevFalso(porTexto).classificador });
    await registrarMetric(s.forte.id, { texto: '40 pedidos por dia', valores: [40], origem: 'afirmado' });

    const r = await checkpoint(s.id, 'metric', { classificador: foraDoAr });
    expect(r.estado.assunto).toMatchObject({ id: s.medio.id });
    expect(r.estado.cobertura).toBe(0);
    const ultima = (await decisoesDaSessao(s.id)).at(-1);
    expect(ultima).toMatchObject({ gatilho: 'metric', decisao: 'trocar', backend: 'reserva', erro: expect.stringContaining('timeout') });

    expect((await checkpoint(s.id, 'perguntas', { classificador: foraDoAr })).mudou).toBe(false);
    expect((await checkpoint(s.id, 'nao_sei', { classificador: foraDoAr })).estado.assunto).toMatchObject({ id: s.fraco.id });
  });

  it('offers to stop once the coverage passes the threshold, and stops when the person wants to', async () => {
    const s = await sessao();
    const { classificador } = jevFalso(porTexto);
    await iniciarPlano(s.id, { classificador });
    await registrarMetric(s.forte.id, { texto: '40 pedidos por dia', valores: [40], origem: 'afirmado' });
    await registrarMetric(s.medio.id, { texto: 'o financeiro largou a planilha', valores: [], origem: 'qualitativo' });

    const r = await checkpoint(s.id, 'metric', { classificador });
    expect(r.estado.cobertura).toBe(83);
    expect(r.estado.assunto).toMatchObject({ tipo: 'oferta' });
    expect((await decisoesDaSessao(s.id)).at(-1)).toMatchObject({ decisao: 'ofereceu_fim' });

    await registrarMensagem(s.id, { papel: 'assistente', conteudo: 'Já tenho o suficiente. Quer parar aqui?' });
    await registrarMensagem(s.id, { papel: 'pessoa', conteudo: 'pode parar' });
    const parar = jevFalso((nome) => (nome === 'wants_to_stop' ? sim : nao));
    const fim = await checkpoint(s.id, 'oferta', { classificador: parar.classificador });
    expect(fim.encerrar).toBe(true);
  });

  it('lists what is pending at the offer, and opens the one the person picks', async () => {
    const s = await sessao();
    const { classificador } = jevFalso(porTexto);
    await iniciarPlano(s.id, { classificador });
    await registrarMetric(s.forte.id, { texto: '40 pedidos por dia', valores: [40], origem: 'afirmado' });
    await registrarMetric(s.medio.id, { texto: 'o financeiro largou a planilha', valores: [], origem: 'qualitativo' });
    await checkpoint(s.id, 'metric', { classificador });

    const opcoes = await opcoesDaOferta(s.id);
    expect(opcoes).toEqual([{ id: s.fraco.id, rotulo: 'frete fraco (Loja Inventada)' }]);

    await registrarMensagem(s.id, { papel: 'assistente', conteudo: 'Já tenho o suficiente. Quer parar aqui?' });
    const estado = await escolherAssunto(s.id, s.fraco.id);
    expect(estado.assunto).toMatchObject({ tipo: 'accomplishment', id: s.fraco.id });
    expect(estado.ofertaFeita).toBe(true);
    expect((await decisoesDaSessao(s.id)).at(-1)).toMatchObject({ gatilho: 'oferta', decisao: 'escolheu', backend: 'pessoa' });
    expect(await opcoesDaOferta(s.id)).toEqual([]);
  });

  it('goes to the record the person names in her answer to the offer, without creating it again', async () => {
    const s = await sessao();
    const { classificador } = jevFalso(porTexto);
    await iniciarPlano(s.id, { classificador });
    await registrarMetric(s.forte.id, { texto: '40 pedidos por dia', valores: [40], origem: 'afirmado' });
    await registrarMetric(s.medio.id, { texto: 'o financeiro largou a planilha', valores: [], origem: 'qualitativo' });
    await checkpoint(s.id, 'metric', { classificador });

    await registrarMensagem(s.id, { papel: 'assistente', conteudo: 'Já tenho o suficiente. Quer parar aqui?' });
    await registrarMensagem(s.id, { papel: 'pessoa', conteudo: 'só mais uma: o frete, que eu integrei' });
    // item_0 is the first open record: the shipping one.
    const citou = jevFalso((nome) => (nome === 'note_0' ? { choice: 'item_0' } : nao));
    const r = await checkpoint(s.id, 'oferta', { classificador: citou.classificador });

    expect(r.estado.assunto).toMatchObject({ tipo: 'accomplishment', id: s.fraco.id });
    expect(r.estado.anotacoes).toEqual([expect.objectContaining({ destino: 'accomplishment', accomplishmentId: s.fraco.id })]);
  });

  it('refuses a pick outside the offer or outside its list', async () => {
    const s = await sessao();
    await iniciarPlano(s.id, { classificador: jevFalso(porTexto).classificador });
    await expect(escolherAssunto(s.id, s.fraco.id)).rejects.toThrow('offer');
  });

  it('turns what the person said about something new into a subject of its own, at the next checkpoint', async () => {
    const s = await sessao();
    await iniciarPlano(s.id, { classificador: jevFalso(porTexto).classificador });
    await anotarParaDepois(s.id, 'também fiz um alerta de fraude no Pix');
    expect((await estadoDoPlano(s.id))!.anotacoes).toEqual([expect.objectContaining({ destino: 'pendente' })]);

    const { classificador, pedidos } = jevFalso((nome, q) =>
      nome === 'decision' ? { choice: 'move_on' } : nome.startsWith('note_') ? { choice: 'new' } : q.type === 'score' ? { score: 1 } : nao,
    );
    const r = await checkpoint(s.id, 'concluir', { classificador });
    expect(Object.keys(pedidos[0].questions)).toContain('note_0');
    expect(r.estado.assunto).toMatchObject({ tipo: 'anotacao' });
  });

  it('ties a note to the record created from it, so the record carries what was said', async () => {
    const s = await sessao();
    const { classificador } = jevFalso((nome, q) =>
      nome === 'decision' ? { choice: 'move_on' } : nome.startsWith('note_') ? { choice: 'new' } : q.type === 'score' ? { score: 1 } : nao,
    );
    await iniciarPlano(s.id, { classificador });
    await anotarParaDepois(s.id, 'também fiz um alerta de fraude no Pix');
    await checkpoint(s.id, 'concluir', { classificador });

    const novo = await criarAccomplishment(s.id, { affiliationId: s.af.id, tipo: 'engineering', enunciado: 'alerta de fraude no Pix' });
    const r = await checkpoint(s.id, 'criou', { classificador }, { criado: novo.id });
    expect(r.estado.assunto).toMatchObject({ tipo: 'accomplishment', id: novo.id });
    expect(r.estado.anotacoes).toEqual([expect.objectContaining({ destino: 'accomplishment', accomplishmentId: novo.id })]);
  });

  it('keeps one note when the questioner notes the same words again', async () => {
    const s = await sessao();
    await iniciarPlano(s.id, { classificador: jevFalso(porTexto).classificador });
    await anotarParaDepois(s.id, 'Na Loja: montei também um alerta de fraude no Pix.');
    await anotarParaDepois(s.id, 'Na Loja: "montei também um alerta de fraude no Pix"');
    expect((await estadoDoPlano(s.id))!.anotacoes).toHaveLength(1);
  });

  it('keeps one note when the questioner notes the same thing again in other words', async () => {
    const s = await sessao();
    await iniciarPlano(s.id, { classificador: jevFalso(porTexto).classificador });
    await anotarParaDepois(s.id, 'Na Loja Inventada: eu montei o alerta de fraude por velocidade de Pix, que barrou uns R$ 50 mil de fraude no primeiro mês. Ficou de fora do currículo.');
    await anotarParaDepois(s.id, 'Na Loja, ficou de fora do currículo: eu montei o alerta de fraude por velocidade de Pix, que barrou uns R$ 50 mil de fraude no primeiro mês.');
    expect((await estadoDoPlano(s.id))!.anotacoes).toHaveLength(1);
  });

  it('keeps two notes about different work at the same place', async () => {
    const s = await sessao();
    await iniciarPlano(s.id, { classificador: jevFalso(porTexto).classificador });
    await anotarParaDepois(s.id, 'Na Loja: montei também um alerta de fraude no Pix.');
    await anotarParaDepois(s.id, 'Na Loja: montei também o painel de conciliação do Pix.');
    await anotarParaDepois(s.id, 'Na Loja: montei o alerta de fraude no Pix, que barrou uns R$ 80 mil.');
    expect((await estadoDoPlano(s.id))!.anotacoes).toHaveLength(3);
  });

  it('drops a note about nothing, without tying it to any record', async () => {
    const s = await sessao();
    await iniciarPlano(s.id, { classificador: jevFalso(porTexto).classificador });
    await anotarParaDepois(s.id, 'hoje tá calor');
    const { classificador } = jevFalso((nome) => (nome === 'decision' ? { choice: 'continue' } : nome.startsWith('note_') ? { choice: 'none' } : nao));
    const r = await checkpoint(s.id, 'perguntas', { classificador });
    expect(r.estado.anotacoes).toEqual([expect.objectContaining({ destino: 'descartada', accomplishmentId: null })]);
  });

  it('stops on a plain "pode parar" to the offer when the Jev is out', async () => {
    const s = await sessao();
    await iniciarPlano(s.id, { classificador: jevFalso(porTexto).classificador });
    await registrarMetric(s.forte.id, { texto: '40 pedidos por dia', valores: [40], origem: 'afirmado' });
    await registrarMetric(s.medio.id, { texto: 'o financeiro largou a planilha', valores: [], origem: 'qualitativo' });
    await checkpoint(s.id, 'metric', { classificador: jevFalso(porTexto).classificador });
    await registrarMensagem(s.id, { papel: 'assistente', conteudo: 'Quer parar aqui?' });
    await registrarMensagem(s.id, { papel: 'pessoa', conteudo: 'pode parar, tá ótimo' });
    expect((await checkpoint(s.id, 'oferta', { classificador: foraDoAr })).encerrar).toBe(true);
  });

  it('closes a degree after its one question, even on the fixed rules', async () => {
    const { sessao: nova } = await criarTester({ apelido: 'Junior', origem: 'teste' });
    await registrarConsentimento(nova.id, 'v1');
    await gravarImportacao(nova.id, {
      formato: 'texto',
      textoExtraido: 'Faculdade Inventada — ADS — 2022 – 2024',
      corpus: {
        affiliations: [{ ref: 'a1', organizacao: 'Faculdade Inventada', cargo: 'ADS', tipo: 'graduacao', anoConclusao: 2024, periodoOriginal: '2022 – 2024', stack: [] }],
        accomplishments: [],
        linhas: [],
      },
    });
    await iniciarInterrogatorio(nova.id);
    const inicio = await iniciarPlano(nova.id, { classificador: null });
    expect(inicio.assunto).toMatchObject({ tipo: 'affiliation' });
    await registrarMensagem(nova.id, { papel: 'assistente', conteudo: 'Teve algo notável no curso?' });
    await registrarMensagem(nova.id, { papel: 'pessoa', conteudo: 'não' });
    expect((await checkpoint(nova.id, 'concluir', { classificador: null })).encerrar).toBe(true);
  });

  it('runs without the Jev at all for a session that said no to it', async () => {
    const s = await sessao();
    const estado = await iniciarPlano(s.id, { classificador: null });
    expect(estado.assunto?.tipo).toBe('accomplishment');
    expect((await decisoesDaSessao(s.id))[0]).toMatchObject({ backend: 'reserva', erro: null });
  });
});
