// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, inject, it } from 'vitest';

import {
  apagarSessao,
  apagarVaga,
  confirmarVaga,
  criarAccomplishment,
  criarAffiliation,
  criarTester,
  criarVaga,
  decisoesDaSessao,
  gravarLeitura,
  gravarPlano,
  mensagensDaSessao,
  planoDaSessao,
  registrarChamadaLlm,
  registrarEvento,
  registrarDecisao,
  registrarMensagem,
  registrarMetric,
  responderConsentimentoVagas,
  vagaDaSessao,
  vagasCriadas,
  vagasDaSessao,
  vagasLiberadas,
} from '@/db';
import { db, fecharDb } from '@/db/client';
import * as t from '@/db/schema';

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);

const COLADA: { texto: string; empresa: string | null; cargo: string | null; link: string | null } = {
  texto: 'Acme Payments is hiring a Backend Engineer. Requirements: Node.js, message queues. Nice to have: Kubernetes.',
  empresa: null,
  cargo: null,
  link: 'https://vagas.exemplo.com/acme/123',
};

/** An invented person past the interrogation, who accepted the Vagas consent. */
async function sessaoComVagas() {
  const criado = await criarTester({ apelido: 'Bia Inventada', origem: 'teste' });
  const sessaoId = criado.sessao.id;
  await db().update(t.sessoes).set({ estado: 'pronto' }).where(eq(t.sessoes.id, sessaoId));
  await responderConsentimentoVagas(sessaoId, true);
  const af = await criarAffiliation(sessaoId, { organizacao: 'Fintech Jangada', cargo: 'Backend Developer', stack: ['Node.js'] });
  const filas = await criarAccomplishment(sessaoId, { affiliationId: af.id, tipo: 'engineering', enunciado: 'Moveu a conciliação para uma fila.' });
  await registrarMetric(filas.id, { texto: 'de 4 h para 15 min', valores: [4, 15], origem: 'afirmado' });
  return { ...criado, sessaoId, filasId: filas.id };
}

async function criada(sessaoId: string, dados = COLADA) {
  const r = await criarVaga(sessaoId, dados);
  if (r.tipo !== 'criada') throw new Error(`expected a Vaga, got ${r.tipo}`);
  return r.vaga;
}

const leitura = (filasId: string, lingua: 'en' | 'pt' = 'en') => ({
  empresa: 'Acme Payments',
  cargo: 'Backend Engineer',
  senioridade: 'Senior',
  lingua,
  requisitos: [
    { texto: 'Message queues', tipo: 'obrigatorio' as const, accomplishmentIds: [filasId] },
    { texto: 'Kubernetes', tipo: 'desejavel' as const, accomplishmentIds: [] },
    { texto: 'Go', tipo: 'obrigatorio' as const, accomplishmentIds: [] },
  ],
  rascunhos: [],
});

describe.skipIf(semBanco)('vagas', () => {
  it('opens "Achei uma vaga" above 70% coverage, and keeps it open when the coverage drops', async () => {
    const { sessao } = await criarTester({ apelido: 'Portão', origem: 'teste' });
    expect(await vagasLiberadas(sessao.id)).toBe(false);

    await db().insert(t.plano).values({ sessaoId: sessao.id, cobertura: 70 });
    expect(await vagasLiberadas(sessao.id)).toBe(false);
    await db().update(t.plano).set({ cobertura: 71 }).where(eq(t.plano.sessaoId, sessao.id));
    expect(await vagasLiberadas(sessao.id)).toBe(true);

    await db().update(t.plano).set({ cobertura: 40 }).where(eq(t.plano.sessaoId, sessao.id));
    expect(await vagasLiberadas(sessao.id)).toBe(true);
  });

  it('opens it with a general résumé delivered, whatever the coverage', async () => {
    const { sessao } = await criarTester({ apelido: 'Com currículo', origem: 'teste' });
    const [geracao] = await db().insert(t.geracoes).values({ sessaoId: sessao.id, versao: 1, terminadaEm: new Date() }).returning();
    expect(await vagasLiberadas(sessao.id)).toBe(false);
    const [selection] = await db().insert(t.selections).values({ sessaoId: sessao.id, geracaoId: geracao.id, json: {} }).returning();
    await db().update(t.geracoes).set({ selectionId: selection.id }).where(eq(t.geracoes.id, geracao.id));
    expect(await vagasLiberadas(sessao.id)).toBe(true);
  });

  it('creates no Vaga without the consent, and asks again after a no', async () => {
    const { sessao } = await criarTester({ apelido: 'Recusou', origem: 'teste' });
    await responderConsentimentoVagas(sessao.id, false);
    expect(await criarVaga(sessao.id, COLADA)).toEqual({ tipo: 'recusada' });
    const [depois] = await db().select().from(t.sessoes).where(eq(t.sessoes.id, sessao.id));
    expect(depois.recusouVagasEm).toBeInstanceOf(Date);
    expect(depois.vagasConsentiuEm).toBeNull();
    expect(await vagasCriadas(sessao.id)).toBe(0);

    await responderConsentimentoVagas(sessao.id, true);
    expect((await criarVaga(sessao.id, COLADA)).tipo).toBe('criada');
  });

  it('records vaga_criada with the vaga_id', async () => {
    const { sessaoId } = await sessaoComVagas();
    const vaga = await criada(sessaoId);
    const eventos = await db().select().from(t.eventos).where(eq(t.eventos.sessaoId, sessaoId));
    expect(eventos).toMatchObject([{ tipo: 'vaga_criada', dados: { vaga_id: vaga.id } }]);
  });

  it('refuses the 16th Vaga, even with Vagas erased in between', async () => {
    const { sessaoId } = await sessaoComVagas();
    for (let i = 0; i < 15; i++) {
      const vaga = await criada(sessaoId);
      if (i % 3 === 0) await apagarVaga(sessaoId, vaga.id);
    }
    expect(await vagasDaSessao(sessaoId)).toHaveLength(10);
    expect(await criarVaga(sessaoId, COLADA)).toEqual({ tipo: 'limite' });

    // The panel raising the limit (step 19) lets one more in.
    await db().update(t.sessoes).set({ limiteVagas: 16 }).where(eq(t.sessoes.id, sessaoId));
    expect((await criarVaga(sessaoId, COLADA)).tipo).toBe('criada');
  });

  it('writes the reading once, fills only what the person left blank, and marks the gaps', async () => {
    const { sessaoId, filasId } = await sessaoComVagas();
    const vaga = await criada(sessaoId, { ...COLADA, cargo: 'Engenheira de backend' });

    expect(await gravarLeitura(vaga.id, leitura(filasId))).toBe(true);
    expect(await gravarLeitura(vaga.id, leitura(filasId))).toBe(false);

    const lida = await vagaDaSessao(sessaoId, vaga.id);
    expect(lida).toMatchObject({ estagio: 'lida', empresa: 'Acme Payments', cargo: 'Engenheira de backend', lingua: 'en', senioridade: 'Senior' });
    expect(lida!.requisitos.map((r) => [r.texto, r.lacuna, r.accomplishmentIds])).toEqual([
      ['Message queues', false, [filasId]],
      ['Kubernetes', true, []],
      ['Go', true, []],
    ]);
  });

  it('keeps the confirmed company, role and checklist, and answers only gaps of that Vaga', async () => {
    const { sessaoId, filasId } = await sessaoComVagas();
    const vaga = await criada(sessaoId);
    await gravarLeitura(vaga.id, leitura(filasId));
    const [coberto, kubernetes, go] = (await vagaDaSessao(sessaoId, vaga.id))!.requisitos;

    const outra = await sessaoComVagas();
    expect(await confirmarVaga(outra.sessaoId, vaga.id, { empresa: 'x', cargo: 'x', respostas: new Map() })).toBe(false);

    const respostas = new Map([
      [kubernetes.id, 'ja_usei' as const],
      [go.id, 'nao_usei' as const],
      [coberto.id, 'nao_usei' as const],
      ['nao-e-um-id', 'ja_usei' as const],
    ]);
    expect(await confirmarVaga(sessaoId, vaga.id, { empresa: 'Acme', cargo: 'Backend Engineer', respostas })).toBe(true);

    const confirmada = await vagaDaSessao(sessaoId, vaga.id);
    expect(confirmada).toMatchObject({ estagio: 'confirmada', empresa: 'Acme', cargo: 'Backend Engineer' });
    expect(confirmada!.requisitos.map((r) => r.resposta)).toEqual([null, 'ja_usei', 'nao_usei']);
  });

  it('shows a Vaga only to its own session, and not once erased', async () => {
    const dona = await sessaoComVagas();
    const outra = await sessaoComVagas();
    const vaga = await criada(dona.sessaoId);

    expect(await vagaDaSessao(dona.sessaoId, vaga.id)).not.toBeNull();
    expect(await vagaDaSessao(outra.sessaoId, vaga.id)).toBeNull();
    expect(await vagaDaSessao(dona.sessaoId, 'nao-e-um-uuid')).toBeNull();

    await apagarVaga(outra.sessaoId, vaga.id);
    expect(await vagaDaSessao(dona.sessaoId, vaga.id)).not.toBeNull();
    await apagarVaga(dona.sessaoId, vaga.id);
    expect(await vagaDaSessao(dona.sessaoId, vaga.id)).toBeNull();
  });

  it('"Apagar esta vaga" empties the row, deletes its Requisitos and keeps both events', async () => {
    const { sessaoId, filasId } = await sessaoComVagas();
    const vaga = await criada(sessaoId);
    const fica = await criada(sessaoId);
    await gravarLeitura(vaga.id, leitura(filasId));
    await gravarLeitura(fica.id, leitura(filasId));

    await apagarVaga(sessaoId, vaga.id);
    await apagarVaga(sessaoId, vaga.id);

    const [linha] = await db().select().from(t.vagas).where(eq(t.vagas.id, vaga.id));
    expect(linha).toMatchObject({ texto: null, empresa: null, cargo: null, link: null, senioridade: null, rascunhos: null });
    expect(linha.apagadaEm).toBeInstanceOf(Date);
    expect(await db().select().from(t.requisitos).where(eq(t.requisitos.vagaId, vaga.id))).toEqual([]);
    expect(await db().select().from(t.requisitos).where(eq(t.requisitos.vagaId, fica.id))).toHaveLength(3);

    const eventos = await db().select().from(t.eventos).where(eq(t.eventos.sessaoId, sessaoId));
    expect(eventos.filter((e) => (e.dados as { vaga_id?: string }).vaga_id === vaga.id).map((e) => e.tipo).sort()).toEqual([
      'vaga_apagada',
      'vaga_criada',
    ]);
  });

  it('"Apagar meus dados" leaves no posting, company, role or link, and the cost stays linked to each Vaga', async () => {
    const { sessaoId, filasId } = await sessaoComVagas();
    await registrarEvento(sessaoId, 'link_aberto');
    const vagas = [await criada(sessaoId), await criada(sessaoId), await criada(sessaoId)];
    await gravarLeitura(vagas[0].id, leitura(filasId));
    await confirmarVaga(sessaoId, vagas[0].id, { empresa: 'Acme', cargo: 'Backend', respostas: new Map() });
    await apagarVaga(sessaoId, vagas[2].id);
    const chamada = await registrarChamadaLlm({
      sessaoId,
      vagaId: vagas[0].id,
      etapa: 'leitura_vaga',
      modelo: 'modelo-de-teste',
      custoUsd: 0.05,
      duracaoMs: 900,
    });

    await apagarSessao(sessaoId);

    const linhas = await db().select().from(t.vagas).where(eq(t.vagas.sessaoId, sessaoId));
    expect(linhas).toHaveLength(3);
    for (const v of linhas) {
      expect(v).toMatchObject({ texto: null, empresa: null, cargo: null, link: null, senioridade: null, rascunhos: null });
      expect(v.apagadaEm).toBeInstanceOf(Date);
    }
    expect(await db().select().from(t.requisitos).where(eq(t.requisitos.sessaoId, sessaoId))).toEqual([]);

    const [custo] = await db().select().from(t.chamadasLlm).where(eq(t.chamadasLlm.id, chamada.id));
    expect(custo).toMatchObject({ sessaoId: null, vagaId: vagas[0].id, custoUsd: 0.05 });

    // One event per job survives, and the apagou.
    const eventos = await db().select().from(t.eventos).where(eq(t.eventos.sessaoId, sessaoId));
    const contagem = (tipo: string) => eventos.filter((e) => e.tipo === tipo).length;
    expect([contagem('vaga_criada'), contagem('vaga_apagada'), contagem('apagou'), contagem('link_aberto')]).toEqual([3, 3, 1, 0]);
  });
});

describe.skipIf(semBanco)('a conversa da vaga (passo 16)', () => {
  const plano = { assunto: null, fila: [], anotacoes: [], visitados: [], cobertura: 0, ofertaFeita: false, ultimoCheckpoint: 0, retomados: [] };

  it("keeps each Vaga's messages and plan apart from the general conversation's", async () => {
    const { sessaoId } = await sessaoComVagas();
    const vaga = await criada(sessaoId);
    await registrarMensagem(sessaoId, { papel: 'assistente', conteudo: 'Pergunta geral' });
    await registrarMensagem(sessaoId, { papel: 'assistente', conteudo: 'Pergunta da vaga', vagaId: vaga.id });
    await gravarPlano(sessaoId, { ...plano, visitados: ['geral'] });
    await gravarPlano(sessaoId, { ...plano, visitados: ['lacuna:x'] }, vaga.id);
    await gravarPlano(sessaoId, { ...plano, visitados: ['lacuna:y'] }, vaga.id);

    expect((await mensagensDaSessao(sessaoId)).map((m) => m.conteudo)).toEqual(['Pergunta geral']);
    expect((await mensagensDaSessao(sessaoId, vaga.id)).map((m) => m.conteudo)).toEqual(['Pergunta da vaga']);
    expect((await planoDaSessao(sessaoId))?.visitados).toEqual(['geral']);
    expect((await planoDaSessao(sessaoId, vaga.id))?.visitados).toEqual(['lacuna:y']);
  });

  it("keeps each Vaga's evaluator decisions apart from the general conversation's", async () => {
    const { sessaoId } = await sessaoComVagas();
    const vaga = await criada(sessaoId);
    const decisao = { gatilho: 'metric', assunto: null, decisao: 'trocar', motivo: 'm', cobertura: 0, proximo: null, backend: 'reserva', erro: null };
    await registrarDecisao(sessaoId, { ...decisao, motivo: 'geral' });
    await registrarDecisao(sessaoId, { ...decisao, motivo: 'da vaga', vagaId: vaga.id });

    expect((await decisoesDaSessao(sessaoId)).map((d) => d.motivo)).toEqual(['geral']);
    expect((await decisoesDaSessao(sessaoId, vaga.id)).map((d) => d.motivo)).toEqual(['da vaga']);
  });

  it('"Apagar esta vaga" deletes its messages and plan, and keeps what they became in the Corpus', async () => {
    const { sessaoId } = await sessaoComVagas();
    const vaga = await criada(sessaoId);
    const outra = await criada(sessaoId);
    await registrarMensagem(sessaoId, { papel: 'pessoa', conteudo: 'Usei Kafka na Acme', vagaId: vaga.id });
    await registrarMensagem(sessaoId, { papel: 'pessoa', conteudo: 'Usei Go', vagaId: outra.id });
    await gravarPlano(sessaoId, plano, vaga.id);
    await gravarPlano(sessaoId, plano, outra.id);
    const novo = await criarAccomplishment(sessaoId, { affiliationId: null, tipo: 'engineering', enunciado: 'Montou o consumidor Kafka.' });

    await apagarVaga(sessaoId, vaga.id);

    expect(await mensagensDaSessao(sessaoId, vaga.id)).toEqual([]);
    expect(await planoDaSessao(sessaoId, vaga.id)).toBeNull();
    expect(await mensagensDaSessao(sessaoId, outra.id)).toHaveLength(1);
    expect(await planoDaSessao(sessaoId, outra.id)).not.toBeNull();
    expect(await db().select().from(t.accomplishments).where(eq(t.accomplishments.id, novo.id))).toHaveLength(1);
  });
});
