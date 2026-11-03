// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, inject, it } from 'vitest';

import { alcanceDaSessao, funil } from '@/admin/funil';

import {
  confirmarVaga,
  corpusDaSessao,
  criarAccomplishment,
  criarAffiliation,
  criarTester,
  criarVaga,
  curriculoEntregue,
  criarGeracao,
  gravarCabecalho,
  gravarLeitura,
  registrarConsentimento,
  registrarMetric,
  responderConsentimentoVagas,
  sessaoPorId,
  sessoesDoPainel,
  tentativasDaSessao,
  ultimaGeracao,
  vagaDaSessao,
} from '@/db';
import { db, fecharDb } from '@/db/client';
import { eventos, geracoes, sessoes } from '@/db/schema';
import { pdftotextDisponivel, textoDoPdf } from '@/import/texto';
import { criarClienteLlm, type LinhaChamada, type SdkMinimo } from '@/llm/cliente';
import { MODELO_PADRAO } from '@/llm/precos';
import { isMeasureAvailable, isTectonicAvailable, type Medida, type Selection } from '@/render';

import { gerarCurriculo, LIMITE_TENTATIVAS, type Violacoes } from './pipeline';

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);

type Bloco = Anthropic.Beta.BetaContentBlock;
let proximoId = 0;
const ferramenta = (name: string, input: unknown) =>
  ({
    id: `msg_${++proximoId}`,
    type: 'message',
    role: 'assistant',
    model: MODELO_PADRAO,
    content: [{ type: 'tool_use', id: `toolu_${++proximoId}`, name, input } as Bloco],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  }) as Anthropic.Beta.BetaMessage;

/** A model that replies with these tool calls, in order, and records what it was asked. */
function clienteFalso(roteiro: Anthropic.Beta.BetaMessage[]) {
  const pedidos: BetaMessageStreamParams[] = [];
  const linhas: LinhaChamada[] = [];
  const sdk: SdkMinimo = {
    beta: {
      messages: {
        stream(params) {
          pedidos.push(structuredClone(params));
          const msg = roteiro.shift();
          if (!msg) throw new Error('no scripted reply left');
          return { on() { return this; }, finalMessage: async () => msg };
        },
      },
    },
  };
  return { cliente: criarClienteLlm({ sdk, registrar: async (l) => linhas.push(l) }), pedidos, roteiro, linhas };
}

const leitura = (problemas: unknown[] = []) => ferramenta('registrar_leitura', { problemas });
const mudancas = (lista: Record<string, unknown>[]) =>
  ferramenta('aplicar_mudancas', {
    mudancas: lista.map((m) => ({ source: null, texto: null, depois_de: null, motivo: null, ...m })),
  });

/** A page that passes every page rule, without Tectonic. */
const paginaCheia = async (s: Selection) => ({
  pdf: Buffer.from('%PDF-1.7 fake'),
  medida: {
    pages: 1,
    fill: 98,
    groups: s.sections.flatMap((x) => x.groups.filter((g) => g.entries.some((e) => !e.label)).map((g) => ({ section: x.title, group: g.heading?.organisation ?? x.title, lines: g.entries.filter((e) => !e.label).map(() => 2) }))),
    orphans: [],
    problems: [],
  } satisfies Medida,
});

/** A session at `gerando` with a header, one employer and two records with numbers. */
async function sessaoPronta(opcoes: { confidencial?: boolean } = {}) {
  const { sessao } = await criarTester({ apelido: 'Persona', origem: 'teste' });
  await registrarConsentimento(sessao.id, 'v1');
  await db().update(sessoes).set({ estado: 'gerando' }).where(eq(sessoes.id, sessao.id));
  const af = await criarAffiliation(sessao.id, {
    organizacao: 'Banco Ipê do Sul',
    cargo: 'Desenvolvedor Back-end',
    periodoInicio: '2022-03',
    periodoConfirmado: true,
    stack: ['Go'],
    confidencial: opcoes.confidencial ?? false,
    descricaoPublica: 'um dos maiores bancos de crédito imobiliário do Sul',
  });
  const ac1 = await criarAccomplishment(sessao.id, { affiliationId: af.id, tipo: 'engineering', enunciado: 'Reescrevi a conciliação em Go: de 4 horas para 25 minutos.', ordem: 0 });
  await registrarMetric(ac1.id, { texto: '4 h → 25 min', valores: [4, 25], origem: 'afirmado' });
  const ac2 = await criarAccomplishment(sessao.id, { affiliationId: af.id, tipo: 'engineering', enunciado: 'Chave de idempotência: cobranças duplicadas de 30 por mês para 0.', ordem: 1 });
  await registrarMetric(ac2.id, { texto: '30 por mês → 0', valores: [30, 0], origem: 'afirmado' });
  await gravarCabecalho(sessao.id, { nome: 'Ada Teste', email: 'ada@example.com', linkedin: 'linkedin.com/in/ada-teste', github: null, local: 'Recife, Brazil' });
  await criarGeracao(sessao.id);
  return sessao.id;
}

/** Runs the session's open generation. */
const gerar = async (sessaoId: string, deps: Parameters<typeof gerarCurriculo>[2]) =>
  gerarCurriculo(sessaoId, (await ultimaGeracao(sessaoId))!.id, deps);

const selecao = (organisation: string, primeiro: string, headerRole = 'Backend Engineer') =>
  ferramenta('entregar_curriculo', {
    header_role: headerRole,
    summary: null,
    sections: [
      {
        title: 'Experience',
        groups: [
          {
            affiliation_ref: 'af1',
            organisation,
            role: 'Backend Engineer',
            location: null,
            bullets: [
              { source: 'ac1', text: primeiro },
              { source: 'ac2', text: 'Ended duplicate charges, 30 a month to 0, with idempotency keys.' },
            ],
            stack: ['Go'],
          },
        ],
      },
    ],
  });

/** A page filled to 60%, otherwise fine. */
const paginaCurta = async (s: Selection) => {
  const r = await paginaCheia(s);
  return { ...r, medida: { ...r.medida, fill: 60 } };
};

describe.skipIf(semBanco)('gerarCurriculo', () => {
  it('bars a bullet whose number is not in its source, rewrites it, and delivers the attempt that passes', async () => {
    const sessaoId = await sessaoPronta();
    const { cliente, pedidos, roteiro } = clienteFalso([
      selecao('A home-loan bank', 'Cut reconciliation time by 90% by rewriting it in Go.'),
      leitura(),
      mudancas([{ acao: 'trocar', id: 'b1', texto: 'Cut reconciliation from 4 hours to 25 minutes by rewriting it in Go.' }]),
      leitura(),
    ]);

    const r = await gerar(sessaoId, { cliente, renderizar: paginaCheia });

    expect(r).toMatchObject({ aprovada: true, tentativas: 2 });
    expect(roteiro).toHaveLength(0);
    const [segunda, primeira] = await tentativasDaSessao(sessaoId);
    const v1 = primeira.violacoes as Violacoes;
    expect(primeira.aprovada).toBe(false);
    expect(v1.checagens).toEqual([expect.objectContaining({ id: 'b1', regra: 'numero_sem_origem' })]);
    // Two bullets is all this Affiliation has: a note, not a violation.
    expect(v1.notas).toHaveLength(1);
    expect(segunda.aprovada).toBe(true);
    expect(JSON.stringify(segunda.json)).toContain('from 4 hours to 25 minutes');

    // The rewrite was told which line and why; the Critic then read only that line.
    const pedidoReescrita = JSON.stringify(pedidos[2].messages);
    expect(pedidoReescrita).toContain('[b1] (checagem: numero_sem_origem)');
    expect(JSON.stringify(pedidos[3].messages)).toContain('Read only these lines, which were just rewritten: b1.');
    // The Critic never sees the Corpus.
    expect(JSON.stringify(pedidos[1].messages)).not.toContain('<corpus>');

    expect((await sessaoPorId(sessaoId))?.estado).toBe('pronto');
    const geracao = await ultimaGeracao(sessaoId);
    expect(geracao).toMatchObject({ selectionId: segunda.id, revisar: false, etapa: null });
    const gerado = await db().select().from(eventos).where(and(eq(eventos.sessaoId, sessaoId), eq(eventos.tipo, 'pdf_gerado')));
    expect(gerado[0].dados).toMatchObject({ tentativas: 2, revisar: false });
  });

  it(`delivers the best attempt and flags the session for review after ${LIMITE_TENTATIVAS} attempts`, async () => {
    const sessaoId = await sessaoPronta();
    const ruim = { id: 'b2', passe: 'prosa', gravidade: 'alta', problema: 'clumsy', sugestao: null };
    const roteiro = [selecao('A home-loan bank', 'Cut reconciliation from 4 hours to 25 minutes in Go.'), leitura([ruim])];
    for (let i = 1; i < LIMITE_TENTATIVAS; i++) {
      roteiro.push(mudancas([{ acao: 'trocar', id: 'b2', texto: `Ended duplicate charges, 30 a month to 0 (take ${i}).` }]), leitura([ruim]));
    }
    const { cliente } = clienteFalso(roteiro);

    const r = await gerar(sessaoId, { cliente, renderizar: paginaCheia });

    expect(r).toMatchObject({ aprovada: false, tentativas: LIMITE_TENTATIVAS });
    expect(await tentativasDaSessao(sessaoId)).toHaveLength(LIMITE_TENTATIVAS);
    expect(await ultimaGeracao(sessaoId)).toMatchObject({ revisar: true });
    expect((await sessaoPorId(sessaoId))?.estado).toBe('pronto');
  });

  it('generates a new version of a closed session without moving its state or its funnel', async () => {
    const sessaoId = await sessaoPronta();
    await gerar(sessaoId, { cliente: clienteFalso([selecao('Banco Ipê do Sul', 'Cut reconciliation from 4 hours to 25 minutes in Go.'), leitura()]).cliente, renderizar: paginaCheia });
    await db().update(sessoes).set({ estado: 'encerrado' }).where(eq(sessoes.id, sessaoId));
    const alcance = async () => alcanceDaSessao((await sessoesDoPainel()).find((l) => l.id === sessaoId)!);
    const antes = await alcance();

    await criarGeracao(sessaoId);
    await gerar(sessaoId, { cliente: clienteFalso([selecao('Banco Ipê do Sul', 'Cut reconciliation from 4 hours to 25 minutes in Go.'), leitura()]).cliente, renderizar: paginaCheia });

    expect((await sessaoPorId(sessaoId))?.estado).toBe('encerrado');
    expect(await ultimaGeracao(sessaoId)).toMatchObject({ versao: 2, revisar: false });
    expect((await curriculoEntregue(sessaoId))?.versao).toBe(2);
    const depois = await alcance();
    expect(depois).toEqual(antes);
    expect(funil([depois]).porEtapa).toEqual(funil([antes]).porEtapa);
  });

  it('accepts a Critic problem the rewrite answers with "the Corpus cannot fix it"', async () => {
    const sessaoId = await sessaoPronta();
    const pergunta = { id: 'b1', passe: 'recrutador', gravidade: 'alta', problema: 'how many invoices?', sugestao: null };
    const { cliente } = clienteFalso([
      selecao('A home-loan bank', 'Cut reconciliation from 4 hours to 25 minutes in Go.'),
      leitura([pergunta]),
      mudancas([{ acao: 'manter', id: 'b1', motivo: 'the record does not say how many' }]),
      leitura(),
    ]);

    const r = await gerar(sessaoId, { cliente, renderizar: paginaCheia });

    expect(r).toMatchObject({ aprovada: true, tentativas: 2 });
    expect(r.violacoes.mantidas).toEqual({ b1: 'the record does not say how many' });
  });
  it('accepts a short page when the rewrite, asked to fill it, adds nothing', async () => {
    const sessaoId = await sessaoPronta();
    // A record with a result and no Affiliation, which the selection leaves out.
    const solto = await criarAccomplishment(sessaoId, { affiliationId: null, tipo: 'engineering', enunciado: 'Organizei a escala de plantão.', ordem: 2 });
    await registrarMetric(solto.id, { texto: 'qualitativo', valores: [], origem: 'qualitativo' });
    const { cliente } = clienteFalso([
      selecao('A home-loan bank', 'Cut reconciliation from 4 hours to 25 minutes in Go.'),
      leitura(),
      // Answered on the group, not on [pagina]: what counts is that nothing was added.
      mudancas([{ acao: 'manter', id: 'g1', motivo: 'the record left cannot fill the page' }]),
      leitura(),
    ]);

    const r = await gerar(sessaoId, { cliente, renderizar: paginaCurta });

    const [, primeira] = await tentativasDaSessao(sessaoId);
    const v1 = primeira.violacoes as Violacoes;
    expect(v1.medida).toEqual([expect.objectContaining({ regra: 'pagina_curta', mensagem: expect.stringContaining('ac3') })]);
    expect(r).toMatchObject({ aprovada: true, tentativas: 2 });
    expect(r.violacoes.preenchimento_insuficiente).toMatchObject({ fill: 60 });
  });
});

/**
 * An invented Vaga of a ready session, confirmed, and its generation open:
 * Go (required, covered by the reconciliation), idempotent payments (nice to
 * have, covered), Kubernetes (required, a gap marked "não usei") and Rust
 * (nice to have, a gap with no answer).
 */
async function vagaPronta(sessaoId: string) {
  const [conciliacao, idempotencia] = (await corpusDaSessao(sessaoId)).accomplishments.map((a) => a.id);
  await responderConsentimentoVagas(sessaoId, true);
  const criada = await criarVaga(sessaoId, { texto: 'Lagoa Pay is hiring a Senior Backend Engineer…', empresa: 'Lagoa Pay', cargo: 'Senior Backend Engineer', link: null });
  if (criada.tipo !== 'criada') throw new Error(criada.tipo);
  const vagaId = criada.vaga.id;
  await gravarLeitura(vagaId, {
    empresa: 'Lagoa Pay',
    cargo: 'Senior Backend Engineer',
    senioridade: 'Senior',
    lingua: 'en',
    requisitos: [
      { texto: 'Go', tipo: 'obrigatorio', accomplishmentIds: [conciliacao] },
      { texto: 'Idempotent payment APIs', tipo: 'desejavel', accomplishmentIds: [idempotencia] },
      { texto: 'Kubernetes', tipo: 'obrigatorio', accomplishmentIds: [] },
      { texto: 'Rust', tipo: 'desejavel', accomplishmentIds: [] },
    ],
    rascunhos: [],
  });
  const requisitos = (await vagaDaSessao(sessaoId, vagaId))!.requisitos;
  const kubernetes = requisitos.find((r) => r.texto === 'Kubernetes')!;
  await confirmarVaga(sessaoId, vagaId, { empresa: 'Lagoa Pay', cargo: 'Senior Backend Engineer', respostas: new Map([[kubernetes.id, 'nao_usei']]) });
  const geracao = await criarGeracao(sessaoId, vagaId);
  if (!geracao) throw new Error('no generation');
  return { vagaId, geracaoId: geracao.id, requisitos, conciliacao, idempotencia };
}

const mapa = (linhas: { requisito: string; linha: string | null }[], perguntas: { linha: string; pergunta: string }[] = []) =>
  ferramenta('registrar_mapa', { mapa: linhas, perguntas });

/** The text of every message of a request, flattened. */
const textoDo = (p: BetaMessageStreamParams) => JSON.stringify(p.messages);

describe.skipIf(semBanco)('o currículo da vaga (passo 17)', () => {
  it('aims the selection at the job, maps every requirement to a line of the page, and keeps the interview questions', async () => {
    const sessaoId = await sessaoPronta();
    const { vagaId, geracaoId, requisitos, conciliacao, idempotencia } = await vagaPronta(sessaoId);
    const { cliente, pedidos, roteiro, linhas } = clienteFalso([
      selecao('A home-loan bank', 'Cut reconciliation from 4 hours to 25 minutes in Go.'),
      leitura(),
      // r4 cites a line that is not on the page: "não coberto".
      mapa(
        [
          { requisito: 'r1', linha: 'b1' },
          { requisito: 'r2', linha: 'b2' },
          { requisito: 'r3', linha: null },
          { requisito: 'r4', linha: 'b9' },
        ],
        [{ linha: 'b1', pergunta: 'How many invoices did the nightly reconciliation handle?' }],
      ),
    ]);

    const r = await gerarCurriculo(sessaoId, geracaoId, { cliente, renderizar: paginaCheia });

    expect(r).toMatchObject({ aprovada: true, tentativas: 1 });
    expect(roteiro).toHaveLength(0);

    // The selection gets the job: its role, the required before the nice to have, and what the person never used.
    const pedidoSelecao = textoDo(pedidos[0]);
    expect(pedidoSelecao).toContain('<job>');
    expect(pedidoSelecao).toContain('Senior Backend Engineer');
    expect(pedidoSelecao.indexOf('Kubernetes')).toBeLessThan(pedidoSelecao.indexOf('Idempotent payment APIs'));
    expect(pedidoSelecao).toMatch(/not_used[^]*Kubernetes[^]*Rust/);
    // The Critic of the attempt sees the job too, to judge the headline and the summary.
    expect(textoDo(pedidos[1])).toContain('<job>');
    // The map is one more call, after the delivery, on the page as delivered.
    expect(pedidos[2].tools?.map((t) => ('name' in t ? t.name : ''))).toEqual(['registrar_mapa']);
    expect(textoDo(pedidos[2])).toContain('[b1]');
    expect(textoDo(pedidos[2])).not.toContain('<corpus>');

    // Every call of the generation is counted for the Vaga.
    expect(linhas.map((l) => [l.etapa, l.vagaId])).toEqual([
      ['selecao', vagaId],
      ['critico', vagaId],
      ['mapa_vaga', vagaId],
    ]);

    const idDe = (texto: string) => requisitos.find((x) => x.texto === texto)!.id;
    const entregue = await curriculoEntregue(sessaoId, 1, vagaId);
    expect(entregue?.mapa).toEqual([
      { requisitoId: idDe('Go'), accomplishmentId: conciliacao, naStack: false },
      { requisitoId: idDe('Idempotent payment APIs'), accomplishmentId: idempotencia, naStack: false },
      { requisitoId: idDe('Kubernetes'), accomplishmentId: null, naStack: false },
      { requisitoId: idDe('Rust'), accomplishmentId: null, naStack: false },
    ]);
    const [linha] = await db().select().from(geracoes).where(eq(geracoes.id, geracaoId));
    expect(linha.perguntasEntrevista).toEqual([{ accomplishmentId: conciliacao, pergunta: 'How many invoices did the nightly reconciliation handle?' }]);

    // A Vaga's résumé leaves the general one and the session's state alone.
    expect((await sessaoPorId(sessaoId))?.estado).toBe('gerando');
    expect(await curriculoEntregue(sessaoId)).toBeNull();
  });

  it('never rewrites for a requirement no line covers, even when the Critic of the attempt flags it', async () => {
    const sessaoId = await sessaoPronta();
    const { geracaoId } = await vagaPronta(sessaoId);
    const ausente = { id: 'summary', passe: 'requisito_ausente', gravidade: 'alta', problema: 'The job requires Kubernetes and no line shows it.', sugestao: null };
    const { cliente, roteiro } = clienteFalso([
      selecao('A home-loan bank', 'Cut reconciliation from 4 hours to 25 minutes in Go.'),
      leitura([ausente]),
      mapa([{ requisito: 'r3', linha: null }]),
    ]);

    const r = await gerarCurriculo(sessaoId, geracaoId, { cliente, renderizar: paginaCheia });

    expect(r).toMatchObject({ aprovada: true, tentativas: 1 });
    expect(r.violacoes.critico).toEqual([]);
    expect(roteiro).toHaveLength(0);
  });

  it('keeps the aim of the summary as a note: a missing requirement filed under the aim is not rewritten either', async () => {
    const sessaoId = await sessaoPronta();
    const { geracaoId } = await vagaPronta(sessaoId);
    const mira = { id: 'summary', passe: 'mira', gravidade: 'alta', problema: 'The summary does not mention Kubernetes, the main ask.', sugestao: 'Backend engineer running Go services on Kubernetes.' };
    const { cliente, roteiro } = clienteFalso([
      selecao('A home-loan bank', 'Cut reconciliation from 4 hours to 25 minutes in Go.'),
      leitura([mira]),
      mapa([]),
    ]);

    const r = await gerarCurriculo(sessaoId, geracaoId, { cliente, renderizar: paginaCheia });

    expect(r).toMatchObject({ aprovada: true, tentativas: 1 });
    expect(r.violacoes.critico).toEqual([expect.objectContaining({ id: 'summary', regra: 'mira', gravidade: 'baixa' })]);
    expect(roteiro).toHaveLength(0);
  });

  it("takes the seniority and a role the Corpus does not hold out of the headline", async () => {
    const sessaoId = await sessaoPronta();
    const { vagaId, geracaoId } = await vagaPronta(sessaoId);
    const { cliente } = clienteFalso([
      selecao('A home-loan bank', 'Cut reconciliation from 4 hours to 25 minutes in Go.', 'Senior Platform Engineer'),
      leitura(),
      mudancas([{ acao: 'trocar', id: 'header_role', texto: 'Backend Engineer' }]),
      leitura(),
      mapa([]),
    ]);

    const r = await gerarCurriculo(sessaoId, geracaoId, { cliente, renderizar: paginaCheia });

    const [, primeira] = await tentativasDaSessao(sessaoId);
    expect((primeira.violacoes as Violacoes).checagens.map((p) => [p.id, p.regra])).toEqual([
      ['header_role', 'senioridade'],
      ['header_role', 'cargo_sem_lastro'],
    ]);
    expect(r).toMatchObject({ aprovada: true, tentativas: 2 });
    const entregue = await curriculoEntregue(sessaoId, 1, vagaId);
    expect((entregue?.selection.json as Selection).header.role).toBe('Backend Engineer');
  });

  it('maps the delivered version, even when it is not the last attempt', async () => {
    const sessaoId = await sessaoPronta();
    const { vagaId, geracaoId, requisitos, idempotencia } = await vagaPronta(sessaoId);
    const prosa = { id: 'b1', passe: 'prosa', gravidade: 'alta', problema: 'clumsy', sugestao: null };
    // The first attempt only has the Critic against it; every rewrite after it is worse (a number not in the record, b2 gone).
    const roteiro = [selecao('A home-loan bank', 'Cut reconciliation from 4 hours to 25 minutes in Go.'), leitura([prosa])];
    for (let i = 1; i < LIMITE_TENTATIVAS; i++) {
      const trocar = { acao: 'trocar', id: 'b1', texto: `Cut reconciliation time by 9${i}% in Go.` };
      roteiro.push(mudancas(i === 1 ? [trocar, { acao: 'remover', id: 'b2' }] : [trocar]), leitura());
    }
    roteiro.push(mapa([{ requisito: 'r2', linha: 'b2' }]));
    const { cliente, pedidos } = clienteFalso(roteiro);

    const r = await gerarCurriculo(sessaoId, geracaoId, { cliente, renderizar: paginaCheia });

    expect(r).toMatchObject({ aprovada: false, tentativas: LIMITE_TENTATIVAS });
    const tentativas = await tentativasDaSessao(sessaoId);
    const primeira = tentativas.find((t) => t.tentativa === 1)!;
    const [linha] = await db().select().from(geracoes).where(eq(geracoes.id, geracaoId));
    expect(linha.selectionId).toBe(primeira.id);

    const pedidoMapa = textoDo(pedidos.at(-1)!);
    expect(pedidoMapa).toContain('from 4 hours to 25 minutes');
    expect(pedidoMapa).not.toContain('by 9');
    const idempotente = requisitos.find((x) => x.texto === 'Idempotent payment APIs')!.id;
    expect((await curriculoEntregue(sessaoId, 1, vagaId))?.mapa).toContainEqual({ requisitoId: idempotente, accomplishmentId: idempotencia, naStack: false });
  });
});

const comPdf = !semBanco && isTectonicAvailable() && isMeasureAvailable() && pdftotextDisponivel();

describe.skipIf(!comPdf)('confidencial no PDF', () => {
  it('never prints a confidential Affiliation by name (pdftotext)', async () => {
    const sessaoId = await sessaoPronta({ confidencial: true });
    const { cliente } = clienteFalso([
      // The model slips: the name is on the page. The check bars it; the rewrite puts the description.
      selecao('Banco Ipê do Sul', 'Cut reconciliation from 4 hours to 25 minutes in Go.'),
      leitura(),
      mudancas([{ acao: 'trocar', id: 'g1.organisation', texto: "One of southern Brazil's largest home-loan banks" }]),
      leitura(),
    ]);

    const r = await gerar(sessaoId, { cliente });

    const [, primeira] = await tentativasDaSessao(sessaoId);
    expect((primeira.violacoes as Violacoes).checagens.map((p) => p.regra)).toContain('confidencial_pelo_nome');
    expect(r.violacoes.checagens).toEqual([]);
    // A short page with nothing left to add is accepted, never padded.
    expect(r.violacoes.preenchimento_insuficiente).toBeDefined();

    const entregue = await curriculoEntregue(sessaoId);
    const texto = await textoDoPdf(entregue!.pdf);
    expect(texto).toContain('largest home-loan banks');
    expect(texto.normalize('NFD').replace(/\p{M}/gu, '')).not.toMatch(/Ipe/i);
  }, 60_000);
});
