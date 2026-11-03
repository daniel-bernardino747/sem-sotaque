// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, afterEach, beforeEach, describe, expect, inject, it } from 'vitest';

import { eq } from 'drizzle-orm';

import { valorDoCookie, COOKIE_ADMIN } from '@/admin/acesso';
import { alcanceDaSessao } from '@/admin/funil';
import { montarPainel } from '@/admin/painel';
import { GET as pdfDoPainel } from '@/app/admin/sessoes/[id]/pdf/route';

import { db, fecharDb } from './client';
import {
  apagarSessao,
  criarAccomplishment,
  criarTester,
  registrarChamadaLlm,
  registrarConsentimento,
  registrarEvento,
  registrarMensagem,
  registrarMetric,
  salvarNotasDaniel,
  sessaoPorId,
  sessoesDoPainel,
  ancorasMaisUsadas,
  custoDaSessao,
  ultimasPerguntasDasParadas,
} from './index';
import * as t from './schema';

const semBanco = !inject('bancoDisponivel');
const TOKEN = 'token-do-painel-para-os-testes';

afterAll(fecharDb);
let antes: string | undefined;
beforeEach(() => {
  antes = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = TOKEN;
});
afterEach(() => {
  if (antes === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = antes;
});

async function sessaoComPdf() {
  const { sessao } = await criarTester({ apelido: 'Ciclana Painel', origem: 'teste do painel' });
  await registrarConsentimento(sessao.id, 'v1');
  const [selection] = await db()
    .insert(t.selections)
    .values({ sessaoId: sessao.id, json: { version: 3 }, tentativa: 1, violacoes: {}, aprovada: true })
    .returning();
  await db().insert(t.renders).values({ selectionId: selection.id, pdf: Buffer.from('%PDF-1.4 falso'), medida: { pages: 1, fill: 50 } });
  await db().insert(t.cabecalhos).values({ sessaoId: sessao.id, nome: 'Ciclana', email: 'c@exemplo.dev', linkedin: 'x', local: 'Recife, Brasil' });
  const [geracao] = await db().insert(t.geracoes).values({ sessaoId: sessao.id, versao: 1, selectionId: selection.id }).returning();
  await db().update(t.selections).set({ geracaoId: geracao.id }).where(eq(t.selections.id, selection.id));
  return { sessao, selection };
}

const pedir = (url: string, cookie?: string) =>
  new Request(url, { headers: cookie ? { cookie: `${COOKIE_ADMIN}=${cookie}` } : {} });

describe.skipIf(semBanco)('painel', () => {
  it('the PDF route answers 401 without the cookie, before reading anything', async () => {
    const { sessao, selection } = await sessaoComPdf();
    const url = `http://localhost/admin/sessoes/${sessao.id}/pdf`;
    const params = Promise.resolve({ id: sessao.id });

    expect((await pdfDoPainel(pedir(url), { params })).status).toBe(401);
    expect((await pdfDoPainel(pedir(url, 'errado'), { params })).status).toBe(401);
    expect((await pdfDoPainel(pedir(`${url}?selection=${selection.id}`), { params })).status).toBe(401);

    const ok = await pdfDoPainel(pedir(url, valorDoCookie()), { params });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('application/pdf');
    const tentativa = await pdfDoPainel(pedir(`${url}?selection=${selection.id}`, valorDoCookie()), { params });
    expect(tentativa.status).toBe(200);
    // Daniel opening it is not the person downloading it.
    const [render] = await db().select().from(t.renders).where(eq(t.renders.selectionId, selection.id));
    expect(render.baixadoEm).toBeNull();

    const outra = await criarTester({ apelido: 'Outra', origem: 'teste do painel' });
    await registrarConsentimento(outra.sessao.id, 'v1'); // readable: the 404 is the selection's, not the opt-in's
    const deOutra = await pdfDoPainel(pedir(`${url}?selection=${selection.id}`, valorDoCookie()), {
      params: Promise.resolve({ id: outra.sessao.id }),
    });
    expect(deOutra.status).toBe(404);
  });

  it('loads a session with its markers, cost, signal and review flag', async () => {
    const { sessao } = await sessaoComPdf();
    await db().update(t.geracoes).set({ revisar: true }).where(eq(t.geracoes.sessaoId, sessao.id));
    await db().update(t.sessoes).set({ estado: 'pronto', terminouInterrogatorioEm: new Date() }).where(eq(t.sessoes.id, sessao.id));
    await registrarMensagem(sessao.id, { papel: 'assistente', conteudo: 'Quantas lojas?' });
    await registrarMensagem(sessao.id, { papel: 'pessoa', conteudo: 'não sei', marcadores: ['nao_sei'] });
    await registrarMensagem(sessao.id, { papel: 'pessoa', conteudo: 'umas 40', marcadores: ['estimou'] });
    await registrarChamadaLlm({ sessaoId: sessao.id, etapa: 'interrogatorio', modelo: 'm', custoUsd: 0.5, duracaoMs: 1 });
    await registrarChamadaLlm({ sessaoId: sessao.id, etapa: 'interrogatorio', modelo: 'm', custoUsd: 0.25, duracaoMs: 1 });
    await registrarChamadaLlm({ sessaoId: sessao.id, etapa: 'selecao', modelo: 'm', custoUsd: 0.1, duracaoMs: 1 });
    await db().insert(t.fechamento).values({ sessaoId: sessao.id, fundador: true, pagaria: 'talvez' });
    await db().insert(t.indicacoes).values({ sessaoId: sessao.id, nome: 'Fulano', contato: 'zap' });
    await registrarEvento(sessao.id, 'pdf_baixado');

    const linha = (await sessoesDoPainel()).find((l) => l.id === sessao.id)!;
    expect(linha).toMatchObject({
      apelido: 'Ciclana Painel',
      origem: 'teste do painel',
      estado: 'pronto',
      naoSei: 1,
      fundador: true,
      pagaria: 'talvez',
      indicacoes: 1,
      revisar: true,
    });
    expect(linha.custo.interrogatorio).toBeCloseTo(0.75);
    expect(linha.custo.selecao).toBeCloseTo(0.1);
    expect(linha.custoNaoMedido).toBe(false);
    const alcance = alcanceDaSessao(linha);
    expect(alcance.parouEm).toBe('fundador_ou_indicou');
    expect(alcance.etapas.has('pdf_baixado')).toBe(true);
  });

  it('marks a session with a call through the subscription as cost not measured, and keeps it out of the price', async () => {
    const { sessao } = await criarTester({ apelido: 'Pela Assinatura', origem: 'teste do painel' });
    await registrarChamadaLlm({ sessaoId: sessao.id, etapa: 'interrogatorio', modelo: 'assinatura:claude-opus-5-5', custoUsd: 0, duracaoMs: 1 });
    // A session that also paid for a call is still not a measure of the price.
    await registrarChamadaLlm({ sessaoId: sessao.id, etapa: 'interrogatorio', modelo: 'm', custoUsd: 0.3, duracaoMs: 1 });

    const linhas = await sessoesDoPainel();
    const linha = linhas.find((l) => l.id === sessao.id)!;
    expect(linha.custoNaoMedido).toBe(true);
    const sozinha = montarPainel([linha]);
    expect(sozinha.custoPorEtapa.find((e) => e.chave === 'interrogatorio')?.resumo).toBeNull();
    expect((await custoDaSessao(sessao.id))[0]).toMatchObject({ etapa: 'interrogatorio', naoMedidas: 1 });
  });

  it('an erased session keeps its funnel steps but no notes, and refuses new ones', async () => {
    const { sessao } = await criarTester({ apelido: 'Apagável', origem: 'teste do painel' });
    await registrarConsentimento(sessao.id, 'v1');
    await registrarEvento(sessao.id, 'link_aberto');
    await registrarEvento(sessao.id, 'importou');
    expect(await salvarNotasDaniel(sessao.id, '  o import errou o período  ')).toBe(true);
    expect((await sessaoPorId(sessao.id))?.notasDaniel).toBe('o import errou o período');

    await apagarSessao(sessao.id);
    const apagada = await sessaoPorId(sessao.id);
    expect(apagada?.notasDaniel).toBeNull();
    expect(await salvarNotasDaniel(sessao.id, 'depois')).toBe(false);

    const linha = (await sessoesDoPainel()).find((l) => l.id === sessao.id)!;
    expect(linha.apelido).toBeNull();
    expect(linha.eventos).toHaveLength(1);
    expect(linha.eventos[0].dados).toEqual({ estado: 'consentiu', etapas: ['consentiu', 'importou', 'link_aberto'] });
    expect(alcanceDaSessao(linha).parouEm).toBe('importou');
  });

  it('groups the anchors and finds the last question of a stopped session', async () => {
    const { sessao } = await criarTester({ apelido: 'Parada', origem: 'teste do painel' });
    await db().update(t.sessoes).set({ estado: 'interrogando', podeLerEm: new Date() }).where(eq(t.sessoes.id, sessao.id));
    const ac = await criarAccomplishment(sessao.id, { tipo: 'engineering', enunciado: 'Migrou o checkout' });
    // The test database is never emptied: an anchor of this run only.
    const ancora = `Quantos usuários por dia, mais ou menos? (teste ${sessao.id})`;
    await registrarMetric(ac.id, { texto: '~200', valores: [200], origem: 'estimado', ancora });
    await registrarMetric(ac.id, { texto: '~3', valores: [3], origem: 'estimado', ancora: `  ${ancora.toUpperCase()} ` });

    const velha = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const pergunta = await registrarMensagem(sessao.id, { papel: 'assistente', conteudo: 'E quanto tempo levava antes?', accomplishmentId: ac.id });
    await db().update(t.mensagens).set({ createdAt: velha }).where(eq(t.mensagens.id, pergunta.id));

    const ancoras = await ancorasMaisUsadas(1000);
    expect(ancoras.find((a) => a.ancora === ancora.toLowerCase())?.n).toBe(2);

    const paradas = await ultimasPerguntasDasParadas();
    expect(paradas.find((p) => p.sessaoId === sessao.id)).toMatchObject({
      apelido: 'Parada',
      pergunta: 'E quanto tempo levava antes?',
      sobre: 'Migrou o checkout',
    });
    // Recent activity is not a stop.
    await registrarMensagem(sessao.id, { papel: 'pessoa', conteudo: 'umas 2 h' });
    expect((await ultimasPerguntasDasParadas()).find((p) => p.sessaoId === sessao.id)).toBeUndefined();
  });

  it('without the opt-in, a session lends no anchor and its stop shows no question', async () => {
    const { sessao } = await criarTester({ apelido: 'Parada Fechada', origem: 'teste do painel' });
    await db().update(t.sessoes).set({ estado: 'interrogando' }).where(eq(t.sessoes.id, sessao.id));
    const ac = await criarAccomplishment(sessao.id, { tipo: 'engineering', enunciado: 'Migrou o pagamento' });
    const ancora = `Quantos pedidos por hora? (teste ${sessao.id})`;
    await registrarMetric(ac.id, { texto: '~50', valores: [50], origem: 'estimado', ancora });
    const pergunta = await registrarMensagem(sessao.id, { papel: 'assistente', conteudo: 'E o pico?', accomplishmentId: ac.id });
    await db()
      .update(t.mensagens)
      .set({ createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) })
      .where(eq(t.mensagens.id, pergunta.id));

    expect((await ancorasMaisUsadas(1000)).find((a) => a.ancora === ancora.toLowerCase())).toBeUndefined();
    expect((await ultimasPerguntasDasParadas()).find((p) => p.sessaoId === sessao.id)).toMatchObject({
      apelido: 'Parada Fechada',
      pergunta: null,
      sobre: null,
    });
  });
});
