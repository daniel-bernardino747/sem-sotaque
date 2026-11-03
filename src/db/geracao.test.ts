// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, inject, it } from 'vitest';

import {
  apagarSessao,
  apagarVaga,
  atualizarAccomplishment,
  atualizarAffiliation,
  corpusMudou,
  criarAccomplishment,
  criarAffiliation,
  criarGeracao,
  confirmarVaga,
  criarTester,
  criarVaga,
  curriculoEntregue,
  entregarSelection,
  GERACOES_POR_VAGA,
  geracoesRestantes,
  gravarLeitura,
  gravarCabecalho,
  gravarTentativa,
  proximaTentativa,
  registrarDownload,
  registrarMetric,
  responderConsentimentoVagas,
  sessaoPorId,
  ultimaGeracao,
  versoesEntregues,
} from '@/db';
import { db, fecharDb } from '@/db/client';
import { eventos, geracoes, renders, selections, sessoes } from '@/db/schema';
import sample from '@/render/__fixtures__/sample-selection.json';

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);

const CABECALHO = { nome: 'Ada Teste', email: 'ada@example.com', linkedin: 'linkedin.com/in/ada', github: null, local: 'Recife, Brazil' };

async function sessaoEm(estado: 'gerando' | 'pronto' | 'encerrado' = 'gerando') {
  const { sessao } = await criarTester({ apelido: 'Persona', origem: 'teste' });
  await db().update(sessoes).set({ estado }).where(eq(sessoes.id, sessao.id));
  return sessao.id;
}

/** One attempt of the generation, delivered. */
async function entregar(sessaoId: string, geracaoId: string, pdf = '%PDF-fake', extra: Partial<Parameters<typeof entregarSelection>[2]> = {}) {
  const selectionId = await gravarTentativa(sessaoId, geracaoId, {
    json: sample,
    tentativa: await proximaTentativa(geracaoId),
    violacoes: {},
    aprovada: true,
    pdf: Buffer.from(pdf),
    medida: {},
  });
  return entregarSelection(sessaoId, geracaoId, { selectionId, revisar: false, evento: {}, ...extra });
}

/** An invented Vaga of the session, read (not yet confirmed), with one requirement. */
async function vagaLida(sessaoId: string) {
  await responderConsentimentoVagas(sessaoId, true);
  const criada = await criarVaga(sessaoId, { texto: 'Acme is hiring a Backend Engineer. Go.', empresa: 'Acme', cargo: 'Backend Engineer', link: null });
  if (criada.tipo !== 'criada') throw new Error(criada.tipo);
  await gravarLeitura(criada.vaga.id, {
    empresa: 'Acme',
    cargo: 'Backend Engineer',
    senioridade: null,
    lingua: 'en',
    requisitos: [{ texto: 'Go', tipo: 'obrigatorio', accomplishmentIds: [] }],
    rascunhos: [],
  });
  return criada.vaga.id;
}

async function vagaConfirmada(sessaoId: string) {
  const vagaId = await vagaLida(sessaoId);
  await confirmarVaga(sessaoId, vagaId, { empresa: 'Acme', cargo: 'Backend Engineer', respostas: new Map() });
  return vagaId;
}

describe.skipIf(semBanco)('gerações com histórico', () => {
  it('needs the header first, and numbers the versions of a session from 1', async () => {
    const sessaoId = await sessaoEm();
    expect(await criarGeracao(sessaoId)).toBeNull();

    expect(await gravarCabecalho(sessaoId, CABECALHO)).toBe(true);
    const primeira = await criarGeracao(sessaoId);
    expect(primeira).toMatchObject({ versao: 1, terminadaEm: null });
    await entregar(sessaoId, primeira!.id);

    const segunda = await criarGeracao(sessaoId);
    expect(segunda).toMatchObject({ versao: 2 });
    expect((await ultimaGeracao(sessaoId))?.id).toBe(segunda!.id);
  });

  it('refuses a new generation while one is running, and allows one after a failure', async () => {
    const sessaoId = await sessaoEm();
    await gravarCabecalho(sessaoId, CABECALHO);
    const rodando = await criarGeracao(sessaoId);
    expect(await criarGeracao(sessaoId)).toBeNull();

    await db().execute(sql`update geracoes set erro = 'falhou' where id = ${rodando!.id}`);
    expect(await criarGeracao(sessaoId)).toMatchObject({ versao: 2 });
  });

  it('counts attempts within one generation, and writes none to a delivered one or to another session', async () => {
    const sessaoId = await sessaoEm();
    const outra = await sessaoEm();
    await gravarCabecalho(sessaoId, CABECALHO);
    const g1 = (await criarGeracao(sessaoId))!;
    await entregar(sessaoId, g1.id);
    const g2 = (await criarGeracao(sessaoId))!;
    expect(await proximaTentativa(g2.id)).toBe(1);

    const tentativa = { json: sample, tentativa: 1, violacoes: {}, aprovada: true, pdf: Buffer.from('x'), medida: {} };
    await expect(gravarTentativa(sessaoId, g1.id, tentativa)).rejects.toThrow();
    await expect(gravarTentativa(outra, g2.id, tentativa)).rejects.toThrow();
  });

  it('moves gerando → pronto on the first delivery, and never moves the state after it', async () => {
    const sessaoId = await sessaoEm();
    await gravarCabecalho(sessaoId, CABECALHO);
    const g1 = (await criarGeracao(sessaoId))!;
    expect(await entregar(sessaoId, g1.id)).toBe(true);
    expect((await sessaoPorId(sessaoId))?.estado).toBe('pronto');

    await db().update(sessoes).set({ estado: 'encerrado' }).where(eq(sessoes.id, sessaoId));
    const g2 = (await criarGeracao(sessaoId))!;
    expect(await entregar(sessaoId, g2.id)).toBe(true);
    expect((await sessaoPorId(sessaoId))?.estado).toBe('encerrado');
    expect((await ultimaGeracao(sessaoId))?.terminadaEm).toBeInstanceOf(Date);
  });

  it('opens each delivered version, the last one by default', async () => {
    const sessaoId = await sessaoEm();
    await gravarCabecalho(sessaoId, CABECALHO);
    await entregar(sessaoId, (await criarGeracao(sessaoId))!.id, '%PDF-v1');
    await entregar(sessaoId, (await criarGeracao(sessaoId))!.id, '%PDF-v2');

    expect((await curriculoEntregue(sessaoId))?.pdf.toString()).toBe('%PDF-v2');
    expect((await curriculoEntregue(sessaoId, 1))?.pdf.toString()).toBe('%PDF-v1');
    expect(await curriculoEntregue(sessaoId, 3)).toBeNull();
    expect((await versoesEntregues(sessaoId)).map((v) => v.versao)).toEqual([2, 1]);
  });

  it('says the Corpus changed when something the résumé can say is newer than the last generation', async () => {
    const sessaoId = await sessaoEm('pronto');
    const af = await criarAffiliation(sessaoId, { organizacao: 'Loja X', cargo: 'Dev' });
    const ac = await criarAccomplishment(sessaoId, { affiliationId: af.id, tipo: 'engineering', enunciado: 'Fiz.' });
    expect(await corpusMudou(sessaoId)).toBe(false);

    await gravarCabecalho(sessaoId, CABECALHO);
    const g = (await criarGeracao(sessaoId))!;
    await db().execute(sql`update geracoes set iniciada_em = now() where id = ${g.id}`);
    await entregar(sessaoId, g.id);
    expect(await corpusMudou(sessaoId)).toBe(false);

    // The evaluator's bookkeeping is not a change.
    await atualizarAccomplishment(sessaoId, ac.id, { forca: 'forte', adiado: true, pulado: true });
    expect(await corpusMudou(sessaoId)).toBe(false);

    await registrarMetric(ac.id, { texto: '40%', valores: [40], origem: 'afirmado' });
    expect(await corpusMudou(sessaoId)).toBe(true);

    const g2 = (await criarGeracao(sessaoId))!;
    await db().execute(sql`update geracoes set iniciada_em = now() where id = ${g2.id}`);
    expect(await corpusMudou(sessaoId)).toBe(false);
    await atualizarAffiliation(sessaoId, af.id, { stack: ['Go'] });
    expect(await corpusMudou(sessaoId)).toBe(true);
  });

  it('keeps the header editable, and refuses it once the session is erased', async () => {
    const sessaoId = await sessaoEm('pronto');
    expect(await gravarCabecalho(sessaoId, CABECALHO)).toBe(true);
    expect(await gravarCabecalho(sessaoId, { ...CABECALHO, local: 'Lisbon, Portugal' })).toBe(true);
    await apagarSessao(sessaoId);
    expect(await gravarCabecalho(sessaoId, CABECALHO)).toBe(false);
    expect(await criarGeracao(sessaoId)).toBeNull();
  });
});

describe.skipIf(semBanco)('as versões de uma vaga (passo 17)', () => {
  it("numbers a Vaga's versions apart from the general résumé's, once the Vaga is confirmed", async () => {
    const sessaoId = await sessaoEm('pronto');
    await gravarCabecalho(sessaoId, CABECALHO);
    const vagaId = await vagaLida(sessaoId);
    expect(await criarGeracao(sessaoId, vagaId)).toBeNull();
    await confirmarVaga(sessaoId, vagaId, { empresa: 'Acme', cargo: 'Backend Engineer', respostas: new Map() });

    const geral = (await criarGeracao(sessaoId))!;
    const daVaga = await criarGeracao(sessaoId, vagaId);
    expect(daVaga).toMatchObject({ versao: 1, vagaId });
    expect(geral).toMatchObject({ versao: 1, vagaId: null });
    // One running per résumé: the general one and the Vaga's do not block each other.
    expect(await criarGeracao(sessaoId, vagaId)).toBeNull();
    expect((await ultimaGeracao(sessaoId))?.id).toBe(geral.id);
    expect((await ultimaGeracao(sessaoId, vagaId))?.id).toBe(daVaga!.id);

    await entregar(sessaoId, daVaga!.id, '%PDF-vaga');
    expect(await curriculoEntregue(sessaoId)).toBeNull();
    expect((await curriculoEntregue(sessaoId, 1, vagaId))?.pdf.toString()).toBe('%PDF-vaga');
    expect(await versoesEntregues(sessaoId)).toEqual([]);
    expect((await versoesEntregues(sessaoId, vagaId)).map((v) => v.versao)).toEqual([1]);
  });

  it(`refuses generation ${GERACOES_POR_VAGA + 1} of a Vaga, and versions 1 to ${GERACOES_POR_VAGA} still open`, async () => {
    const sessaoId = await sessaoEm('pronto');
    await gravarCabecalho(sessaoId, CABECALHO);
    const vagaId = await vagaConfirmada(sessaoId);
    expect(await geracoesRestantes(sessaoId, vagaId)).toBe(GERACOES_POR_VAGA);

    for (let v = 1; v <= GERACOES_POR_VAGA; v++) {
      await entregar(sessaoId, (await criarGeracao(sessaoId, vagaId))!.id, `%PDF-v${v}`);
    }
    expect(await geracoesRestantes(sessaoId, vagaId)).toBe(0);
    expect(await criarGeracao(sessaoId, vagaId)).toBeNull();

    for (let v = 1; v <= GERACOES_POR_VAGA; v++) {
      expect((await curriculoEntregue(sessaoId, v, vagaId))?.pdf.toString()).toBe(`%PDF-v${v}`);
    }
    // The general résumé has no such limit.
    expect(await criarGeracao(sessaoId)).toMatchObject({ versao: 1 });
  });

  it("keeps the Vaga's map and interview questions, records vaga_gerada and leaves the state and pdf_gerado alone", async () => {
    const sessaoId = await sessaoEm('gerando');
    await gravarCabecalho(sessaoId, CABECALHO);
    const vagaId = await vagaConfirmada(sessaoId);
    const g = (await criarGeracao(sessaoId, vagaId))!;
    const mapa = [{ requisitoId: 'r', accomplishmentId: null, naStack: false }];
    const perguntas = [{ accomplishmentId: null, pergunta: 'What was the hardest part?' }];

    expect(await entregar(sessaoId, g.id, '%PDF', { mapa, perguntas })).toBe(true);

    const [linha] = await db().select().from(geracoes).where(eq(geracoes.id, g.id));
    expect(linha).toMatchObject({ mapa, perguntasEntrevista: perguntas });
    expect((await sessaoPorId(sessaoId))?.estado).toBe('gerando');
    const tipos = await db().select().from(eventos).where(eq(eventos.sessaoId, sessaoId));
    expect(tipos.filter((e) => e.tipo === 'pdf_gerado')).toEqual([]);
    expect(tipos.filter((e) => e.tipo === 'vaga_gerada').map((e) => e.dados)).toEqual([expect.objectContaining({ vaga_id: vagaId, versao: 1 })]);
  });

  it("counts a Vaga's download for that Vaga", async () => {
    const sessaoId = await sessaoEm('pronto');
    await gravarCabecalho(sessaoId, CABECALHO);
    const vagaId = await vagaConfirmada(sessaoId);
    await entregar(sessaoId, (await criarGeracao(sessaoId, vagaId))!.id);
    const { renderId } = (await curriculoEntregue(sessaoId, 1, vagaId))!;

    await registrarDownload(sessaoId, renderId, vagaId);

    const baixados = await db().select().from(eventos).where(eq(eventos.sessaoId, sessaoId));
    expect(baixados.filter((e) => e.tipo === 'pdf_baixado').map((e) => e.dados)).toEqual([{ vaga_id: vagaId }]);
  });

  it('"Apagar esta vaga" deletes its versions, map and questions, and the general résumé stays', async () => {
    const sessaoId = await sessaoEm('pronto');
    await gravarCabecalho(sessaoId, CABECALHO);
    const vagaId = await vagaConfirmada(sessaoId);
    await entregar(sessaoId, (await criarGeracao(sessaoId))!.id, '%PDF-geral');
    const g = (await criarGeracao(sessaoId, vagaId))!;
    await entregar(sessaoId, g.id, '%PDF-vaga', { mapa: [], perguntas: [{ accomplishmentId: null, pergunta: 'Why Go?' }] });

    await apagarVaga(sessaoId, vagaId);

    expect(await db().select().from(geracoes).where(eq(geracoes.vagaId, vagaId))).toEqual([]);
    expect(await db().select().from(selections).where(eq(selections.geracaoId, g.id))).toEqual([]);
    expect((await curriculoEntregue(sessaoId))?.pdf.toString()).toBe('%PDF-geral');
    const pdfs = await db().select({ id: renders.id }).from(renders).innerJoin(selections, eq(selections.id, renders.selectionId)).where(eq(selections.sessaoId, sessaoId));
    expect(pdfs).toHaveLength(1);
    // The funnel keeps the job's step: vaga_gerada holds only ids.
    await apagarSessao(sessaoId);
    const sobrou = await db().select().from(eventos).where(eq(eventos.sessaoId, sessaoId));
    expect(sobrou.filter((e) => e.tipo === 'vaga_gerada')).toHaveLength(1);
  });
});
