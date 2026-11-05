// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, describe, expect, inject, it } from 'vitest';

import { sql } from 'drizzle-orm';

import { db, fecharDb } from './client';
import {
  apagarSessao,
  corpusDaSessao,
  criarAccomplishment,
  criarAffiliation,
  criarTester,
  ErroEstadoSessao,
  gravarImportacao,
  iniciarInterrogatorio,
  registrarChamadaLlm,
  registrarEvento,
  registrarMensagem,
  registrarMetric,
  sessaoPorToken,
} from './index';
import * as t from './schema';

const semBanco = !inject('bancoDisponivel');

afterAll(fecharDb);

describe.skipIf(semBanco)('banco', () => {
  describe('criarTester → sessaoPorToken', () => {
    it('opens a new session that the token finds', async () => {
      const { token, tester, sessao } = await criarTester({
        apelido: 'Fulana',
        origem: 'grupo de WhatsApp',
      });

      expect(token).toMatch(/^[A-Za-z0-9_-]{22,}$/);
      expect(sessao.estado).toBe('novo');

      const achada = await sessaoPorToken(token);
      expect(achada?.sessao.id).toBe(sessao.id);
      expect(achada?.tester).toMatchObject({ id: tester.id, apelido: 'Fulana' });
    });

    it('gives every Tester a different token', async () => {
      const a = await criarTester({ apelido: 'A', origem: 'LinkedIn' });
      const b = await criarTester({ apelido: 'B', origem: 'indicação', indicadoPor: a.tester.id });
      expect(a.token).not.toBe(b.token);
      expect(b.tester.indicadoPor).toBe(a.tester.id);
    });

    it('finds nothing for an unknown token', async () => {
      expect(await sessaoPorToken('nao-existe')).toBeNull();
    });
  });

  describe('corpusDaSessao', () => {
    it('assembles the affiliations and accomplishments with their metrics', async () => {
      const { sessao } = await criarTester({ apelido: 'Beltrano', origem: 'LinkedIn' });
      const outra = await criarTester({ apelido: 'Outro', origem: 'LinkedIn' });

      const empregador = await criarAffiliation(sessao.id, {
        organizacao: 'Banco Fictício',
        cargo: 'Engenheiro de Software',
        periodoInicio: '2021-03',
        stack: ['TypeScript', 'Postgres'],
        confidencial: true,
        descricaoPublica: 'A large Brazilian retail bank',
        ordem: 1,
      });
      const startup = await criarAffiliation(sessao.id, {
        organizacao: 'Startup Inventada',
        cargo: 'Dev Pleno',
        periodoInicio: '2019-01',
        periodoFim: '2021-02',
        ordem: 0,
      });
      await criarAffiliation(outra.sessao.id, { organizacao: 'Não é dela', cargo: 'x' });

      const fila = await criarAccomplishment(sessao.id, {
        affiliationId: empregador.id,
        tipo: 'engineering',
        enunciado: 'Troquei a fila de cadastro por um processamento em lote.',
        importanciaParaPessoa: 'alta',
        data: '2022-06',
      });
      const palestra = await criarAccomplishment(sessao.id, {
        tipo: 'talk',
        enunciado: 'Falei sobre filas num meetup.',
      });
      await registrarMetric(fila.id, {
        texto: '~2 min → 20 s por ficha',
        valores: [2, 20],
        origem: 'estimado',
        ancora: 'Quanto tempo levava antes e depois?',
      });
      await registrarMetric(fila.id, { texto: '3 times usam', valores: [3], origem: 'afirmado' });

      const corpus = await corpusDaSessao(sessao.id);

      expect(corpus.affiliations.map((a) => a.organizacao)).toEqual([
        'Startup Inventada',
        'Banco Fictício',
      ]);
      expect(corpus.affiliations[1]).toMatchObject({
        stack: ['TypeScript', 'Postgres'],
        confidencial: true,
        descricaoPublica: 'A large Brazilian retail bank',
        periodoFim: null,
      });

      expect(corpus.accomplishments).toHaveLength(2);
      const lida = corpus.accomplishments.find((a) => a.id === fila.id)!;
      expect(lida.affiliation?.organizacao).toBe('Banco Fictício');
      expect(lida.rascunho).toBe(false);
      expect(lida.metrics.map((m) => [m.texto, m.valores, m.origem])).toEqual([
        ['~2 min → 20 s por ficha', [2, 20], 'estimado'],
        ['3 times usam', [3], 'afirmado'],
      ]);

      const semNumero = corpus.accomplishments.find((a) => a.id === palestra.id)!;
      expect(semNumero.affiliation).toBeNull();
      expect(semNumero.metrics).toEqual([]);
      expect(semNumero.rascunho).toBe(true);

      expect(startup.periodoFim).toBe('2021-02');
    });
  });

  describe('registrarMetric', () => {
    it('refuses an estimate without the anchor that led to it', async () => {
      const { sessao } = await criarTester({ apelido: 'Ciclana', origem: 'LinkedIn' });
      const accomplishment = await criarAccomplishment(sessao.id, {
        tipo: 'engineering',
        enunciado: 'Cortei o tempo do deploy.',
      });

      await expect(
        registrarMetric(accomplishment.id, { texto: '~10x mais rápido', valores: [10], origem: 'estimado' }),
      ).rejects.toMatchObject({ cause: { constraint_name: 'metrics_estimado_tem_ancora' } });
      expect((await corpusDaSessao(sessao.id)).accomplishments[0].metrics).toEqual([]);
    });
  });

  describe('gravarImportacao', () => {
    async function consentida() {
      const criado = await criarTester({ apelido: 'Importa', origem: 'LinkedIn' });
      await db().update(t.sessoes).set({ estado: 'consentiu' }).where(sql`id = ${criado.sessao.id}`);
      return criado.sessao.id;
    }

    const corpusImportado = {
      affiliations: [
        { ref: 'a1', organizacao: 'Empresa Inventada', cargo: 'Dev', periodoOriginal: '2019 – 2021', stack: ['Go'] },
        { ref: 'a2', organizacao: 'Faculdade Inventada', cargo: 'ADS', periodoInicio: '2015-02', periodoFim: '2018-12' },
      ],
      accomplishments: [
        { ref: 'c1', affiliationRef: 'a1', tipo: 'engineering' as const, enunciado: 'Criei a API.' },
        { ref: 'c2', affiliationRef: 'a1', tipo: 'engineering' as const, enunciado: 'Escrevi os testes.' },
        { ref: 'c3', affiliationRef: null, tipo: 'project' as const, enunciado: 'Fiz um app.' },
      ],
      linhas: [
        { texto: '- Criei a API e escrevi os testes.', affiliationRef: 'a1', accomplishmentRefs: ['c1', 'c2'] },
        { texto: 'App pessoal', affiliationRef: null, accomplishmentRefs: ['c3'] },
        { texto: 'Stack: Go', affiliationRef: 'a1', accomplishmentRefs: [] },
      ],
    };

    it('writes the draft Corpus, the text, the state and the event in one go', async () => {
      const sessaoId = await consentida();

      const contagem = await gravarImportacao(sessaoId, {
        formato: 'pdf',
        textoExtraido: 'o texto do pdf',
        corpus: corpusImportado,
      });

      expect(contagem).toEqual({ affiliations: 2, accomplishments: 3, linhas: 3 });

      const corpus = await corpusDaSessao(sessaoId);
      expect(corpus.affiliations.map((a) => [a.organizacao, a.ordem, a.periodoOriginal])).toEqual([
        ['Empresa Inventada', 0, '2019 – 2021'],
        ['Faculdade Inventada', 1, null],
      ]);
      expect(corpus.accomplishments.map((a) => [a.enunciado, a.affiliation?.organizacao ?? null])).toEqual([
        ['Criei a API.', 'Empresa Inventada'],
        ['Escrevi os testes.', 'Empresa Inventada'],
        ['Fiz um app.', null],
      ]);
      expect(corpus.accomplishments.every((a) => a.rascunho)).toBe(true);

      // A line that became two accomplishments is linked to both.
      const linhas = await db().select().from(t.linhasOriginais).where(sql`sessao_id = ${sessaoId}`);
      const idDe = (enunciado: string) => corpus.accomplishments.find((a) => a.enunciado === enunciado)!.id;
      const daLinha = linhas.filter((l) => l.texto === '- Criei a API e escrevi os testes.');
      expect(daLinha.map((l) => l.accomplishmentId).sort()).toEqual(
        [idDe('Criei a API.'), idDe('Escrevi os testes.')].sort(),
      );
      expect(daLinha.every((l) => l.affiliationId === corpus.affiliations[0].id)).toBe(true);
      expect(linhas.find((l) => l.texto === 'Stack: Go')).toMatchObject({ accomplishmentId: null });

      const [importacao] = await db().select().from(t.importacoes).where(sql`sessao_id = ${sessaoId}`);
      expect(importacao).toMatchObject({ formato: 'pdf', textoExtraido: 'o texto do pdf' });

      const [sessao] = await db().select().from(t.sessoes).where(sql`id = ${sessaoId}`);
      expect(sessao.estado).toBe('importou');
      const eventos = await db().select().from(t.eventos).where(sql`sessao_id = ${sessaoId}`);
      expect(eventos).toMatchObject([
        { tipo: 'importou', dados: { formato: 'pdf', affiliations: 2, accomplishments: 3, linhas: 3 } },
      ]);
    });

    it('moves an imported session to the interrogation, once', async () => {
      const sessaoId = await consentida();
      expect((await iniciarInterrogatorio(sessaoId)).estado).toBe('consentiu');

      await gravarImportacao(sessaoId, { formato: 'texto', textoExtraido: 'cv', corpus: corpusImportado });
      expect((await iniciarInterrogatorio(sessaoId)).estado).toBe('interrogando');
      expect((await iniciarInterrogatorio(sessaoId)).estado).toBe('interrogando');
    });

    it('refuses a session that has not consented, or already imported, and writes nothing', async () => {
      const { sessao } = await criarTester({ apelido: 'Sem consentimento', origem: 'LinkedIn' });
      const dados = { formato: 'texto' as const, textoExtraido: 'cv', corpus: corpusImportado };
      await expect(gravarImportacao(sessao.id, dados)).rejects.toBeInstanceOf(ErroEstadoSessao);
      expect(await corpusDaSessao(sessao.id)).toEqual({ affiliations: [], accomplishments: [] });

      const sessaoId = await consentida();
      await gravarImportacao(sessaoId, dados);
      await expect(gravarImportacao(sessaoId, dados)).rejects.toBeInstanceOf(ErroEstadoSessao);
      expect((await corpusDaSessao(sessaoId)).affiliations).toHaveLength(2);
    });
  });

  describe('apagarSessao', () => {
    /** A session with a row in every table that can hold what a person said. */
    async function sessaoCheia() {
      const criado = await criarTester({ apelido: 'Apagável', origem: 'grupo de WhatsApp' });
      const sessaoId = criado.sessao.id;
      const affiliation = await criarAffiliation(sessaoId, { organizacao: 'Empresa X', cargo: 'Dev' });
      const accomplishment = await criarAccomplishment(sessaoId, {
        affiliationId: affiliation.id,
        tipo: 'engineering',
        enunciado: 'Algo que só ela sabe.',
      });
      const metric = await registrarMetric(accomplishment.id, { texto: '40%', valores: [40], origem: 'afirmado' });
      await registrarMensagem(sessaoId, {
        papel: 'pessoa',
        conteudo: 'não sei',
        accomplishmentId: accomplishment.id,
        latenciaMs: 1200,
        marcadores: ['nao_sei'],
      });
      await registrarEvento(sessaoId, 'link_aberto');
      await registrarEvento(sessaoId, 'importou', { formato: 'pdf' });
      const chamada = await registrarChamadaLlm({
        sessaoId,
        etapa: 'interrogatorio',
        modelo: 'modelo-de-teste',
        tokensEntrada: 1000,
        tokensSaida: 200,
        custoUsd: 0.0123,
        duracaoMs: 900,
        erro: 'texto que pode citar a pessoa',
      });

      // Tables later steps write through their own functions.
      await db().insert(t.importacoes).values({ sessaoId, formato: 'texto', textoExtraido: 'cv' });
      await db().insert(t.linhasOriginais).values({ sessaoId, texto: 'Fiz coisas', accomplishmentId: accomplishment.id });
      await db().insert(t.cabecalhos).values({ sessaoId, nome: 'Ada', email: 'a@exemplo.com', linkedin: 'x', local: 'Recife' });
      const [geracao] = await db().insert(t.geracoes).values({ sessaoId, versao: 1 }).returning();
      await db().insert(t.geracoes).values({ sessaoId, versao: 2 });
      const [selection] = await db().insert(t.selections).values({ sessaoId, geracaoId: geracao.id, json: { x: 1 } }).returning();
      const [render] = await db()
        .insert(t.renders)
        .values({ selectionId: selection.id, pdf: Buffer.from('%PDF-fake'), medida: { pages: 1 } })
        .returning();
      await db().insert(t.fechamento).values({ sessaoId, fundador: true, email: 'a@exemplo.com' });
      await db().insert(t.indicacoes).values({ sessaoId, nome: 'Amigo', contato: '11 9999-0000' });
      await db().insert(t.erros).values({ sessaoId, origem: 'navegador', onde: '/casa', classe: 'TypeError', digest: 'd1' });
      const [vaga] = await db()
        .insert(t.vagas)
        .values({ sessaoId, texto: 'A vaga colada', empresa: 'Acme', cargo: 'Dev', link: 'https://exemplo.com/v', rascunhos: [] })
        .returning();
      await db().insert(t.requisitos).values({ vagaId: vaga.id, sessaoId, texto: 'Node.js', tipo: 'obrigatorio', lacuna: true });
      await registrarEvento(sessaoId, 'vaga_criada', { vaga_id: vaga.id });
      await db().update(t.sessoes).set({ estado: 'interrogando' }).where(sql`id = ${sessaoId}`);

      return { ...criado, metricId: metric.id, renderId: render.id, chamadaId: chamada.id };
    }

    /** Rows per table that still point at the session, for every table with a `sessao_id`. */
    async function linhasDaSessao(sessaoId: string): Promise<Record<string, number>> {
      const tabelas = await db().execute<{ table_name: string }>(sql`
        select table_name from information_schema.columns
        where table_schema = 'public' and column_name = 'sessao_id'`);
      const contagem: Record<string, number> = {};
      for (const { table_name } of tabelas) {
        const [{ n }] = await db().execute<{ n: number }>(
          sql`select count(*)::int as n from ${sql.identifier(table_name)} where sessao_id = ${sessaoId}`,
        );
        if (n > 0) contagem[table_name] = n;
      }
      return contagem;
    }

    it('leaves no content behind: the session row, its emptied Vagas with their events, and the apagou event', async () => {
      const cheia = await sessaoCheia();
      const vizinha = await sessaoCheia();

      await apagarSessao(cheia.sessao.id);

      // apagou, vaga_criada and vaga_apagada; the Vaga row stays, emptied.
      expect(await linhasDaSessao(cheia.sessao.id)).toEqual({ eventos: 3, vagas: 1 });
      const [vaga] = await db().select().from(t.vagas).where(sql`sessao_id = ${cheia.sessao.id}`);
      expect(vaga).toMatchObject({ texto: null, empresa: null, cargo: null, link: null, rascunhos: null });
      expect(await sessaoPorToken(cheia.token)).toBeNull();

      const [sessao] = await db().select().from(t.sessoes).where(sql`id = ${cheia.sessao.id}`);
      expect(sessao).toMatchObject({ testerId: null, estado: 'interrogando' });
      expect(sessao.apagadaEm).toBeInstanceOf(Date);

      const eventos = await db().select().from(t.eventos).where(sql`sessao_id = ${cheia.sessao.id} and tipo = 'apagou'`);
      expect(eventos).toMatchObject([{ tipo: 'apagou', dados: { estado: 'interrogando' } }]);

      expect(await db().select().from(t.testers).where(sql`id = ${cheia.tester.id}`)).toEqual([]);
      expect(await db().select().from(t.metrics).where(sql`id = ${cheia.metricId}`)).toEqual([]);
      expect(await db().select().from(t.renders).where(sql`id = ${cheia.renderId}`)).toEqual([]);

      // The cost stays counted, unlinked from the person and without the error text.
      const [chamada] = await db().select().from(t.chamadasLlm).where(sql`id = ${cheia.chamadaId}`);
      expect(chamada).toMatchObject({ sessaoId: null, custoUsd: 0.0123, erro: null });

      // Nobody else's data goes with it.
      expect(await sessaoPorToken(vizinha.token)).not.toBeNull();
      expect(Object.keys(await linhasDaSessao(vizinha.sessao.id)).sort()).toEqual([
        'accomplishments',
        'affiliations',
        'cabecalhos',
        'chamadas_llm',
        'erros',
        'eventos',
        'fechamento',
        'geracoes',
        'importacoes',
        'indicacoes',
        'linhas_originais',
        'mensagens',
        'requisitos',
        'selections',
        'vagas',
      ]);
    });

    it('is idempotent', async () => {
      const cheia = await sessaoCheia();
      await apagarSessao(cheia.sessao.id);
      await apagarSessao(cheia.sessao.id);

      const eventos = await db().select().from(t.eventos).where(sql`sessao_id = ${cheia.sessao.id}`);
      expect(eventos.map((e) => e.tipo).sort()).toEqual(['apagou', 'vaga_apagada', 'vaga_criada']);
    });
  });
});
