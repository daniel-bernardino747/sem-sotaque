// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import type { AccomplishmentDoCorpus, Affiliation, Corpus, Metric } from '@/db';
import { Refs } from '@/interrogatorio/estado';
import type { ClienteLlm, PedidoLlm } from '@/llm/cliente';

import { conferirLeitura, descreverCorpusParaLeitura, lerVaga, MAXIMO_RASCUNHOS, type Leitura } from './leitura';

// ---- an invented Corpus: Bia, a backend dev at an invented fintech --------------

const quando = new Date('2026-01-01T00:00:00Z');

const fintech: Affiliation = {
  id: '00000000-0000-4000-8000-0000000000a1', sessaoId: 's', organizacao: 'Fintech Jangada', cargo: 'Backend Developer', tipo: 'emprego',
  anoConclusao: null, cursando: false, periodoOriginal: null, periodoInicio: '2022-03', periodoFim: null, stack: ['Node.js', 'PostgreSQL', 'AWS'],
  confidencial: false, descricaoPublica: null, periodoConfirmado: true, pulado: false, ordem: 0, createdAt: quando, atualizadoEm: quando,
};
const banco: Affiliation = {
  ...fintech, id: '00000000-0000-4000-8000-0000000000a2', organizacao: 'Banco Secreto', confidencial: true,
  descricaoPublica: 'a mid-sized Brazilian bank', stack: ['Java'], ordem: 1,
};

function metric(texto: string): Metric {
  return { id: `m-${texto}`, accomplishmentId: 'x', texto, valores: [], origem: 'afirmado', ancora: null, confirmadoEm: null, createdAt: quando, atualizadoEm: quando };
}

let n = 0;
function accomplishment(af: Affiliation, enunciado: string, metrics: Metric[], over: Partial<AccomplishmentDoCorpus> = {}): AccomplishmentDoCorpus {
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, sessaoId: 's', affiliationId: af.id, tipo: 'engineering', enunciado,
    importanciaParaPessoa: null, data: null, pulado: false, forca: null, adiado: false, adiadoVoltou: false, ordem: n,
    createdAt: quando, atualizadoEm: quando, affiliation: af, metrics, rascunho: metrics.length === 0, ...over,
  };
}

const filas = accomplishment(fintech, 'Moveu a conciliação de pagamentos para uma fila em SQS.', [metric('de 4 h para 15 min')]);
const api = accomplishment(fintech, 'Escreveu a API de extrato em Node.js.', [metric('~2 mil chamadas por minuto')]);
const rabbit = accomplishment(fintech, 'Usou RabbitMQ num serviço de notificação.', []);
const pulado = accomplishment(banco, 'Manteve um sistema legado em Java.', [], { pulado: true });
const rascunhos = [1, 2, 3, 4, 5, 6].map((i) => accomplishment(banco, `Rascunho ${i} sobre Java.`, []));

const corpus: Corpus = { affiliations: [fintech, banco], accomplishments: [filas, api, rabbit, pulado, ...rascunhos] };
const refs = new Refs(corpus, []);
const ref = (a: { id: string }) => refs.ref(a.id)!;

function leitura(over: Partial<Leitura> = {}): Leitura {
  return {
    empresa: 'Acme Payments',
    cargo: 'Backend Engineer',
    senioridade: 'Senior',
    lingua: 'en',
    requisitos: [
      { texto: 'Message queues (SQS, RabbitMQ)', tipo: 'obrigatorio', cobertos_por: [ref(filas)] },
      { texto: 'Node.js', tipo: 'obrigatorio', cobertos_por: [ref(api), ref(filas)] },
      { texto: 'Kubernetes', tipo: 'desejavel', cobertos_por: [] },
    ],
    rascunhos: [{ ref: ref(rabbit), motivo: 'A vaga pede filas; aqui você usou RabbitMQ.' }],
    ...over,
  };
}

describe('descreverCorpusParaLeitura', () => {
  const texto = descreverCorpusParaLeitura(corpus, refs);

  it('lists each Affiliation with its stack and records, and the drafts apart, by ref', () => {
    expect(texto).toContain(`${ref(fintech)} Fintech Jangada — Backend Developer`);
    expect(texto).toContain('stack: Node.js, PostgreSQL, AWS');
    expect(texto).toContain(`${ref(filas)} [engineering] Moveu a conciliação`);
    expect(texto).toContain('resultado: de 4 h para 15 min');
    expect(texto.split('## Drafts')[1]).toContain(`${ref(rabbit)} (em ${ref(fintech)})`);
  });

  it('never shows a confidential name, a skipped draft or a database id', () => {
    expect(texto).not.toContain('Banco Secreto');
    expect(texto).toContain('a mid-sized Brazilian bank');
    expect(texto).not.toContain('legado');
    expect(texto).not.toContain(filas.id);
  });
});

describe('conferirLeitura', () => {
  it('turns refs into ids and marks a Requisito no record covers as a gap', () => {
    const conferida = conferirLeitura(leitura(), corpus, refs);
    expect(conferida).toMatchObject({ empresa: 'Acme Payments', cargo: 'Backend Engineer', senioridade: 'Senior', lingua: 'en' });
    expect(conferida.requisitos).toEqual([
      { texto: 'Message queues (SQS, RabbitMQ)', tipo: 'obrigatorio', accomplishmentIds: [filas.id] },
      { texto: 'Node.js', tipo: 'obrigatorio', accomplishmentIds: [api.id, filas.id] },
      { texto: 'Kubernetes', tipo: 'desejavel', accomplishmentIds: [] },
    ]);
    expect(conferida.rascunhos).toEqual([{ accomplishmentId: rabbit.id, motivo: 'A vaga pede filas; aqui você usou RabbitMQ.' }]);
  });

  it('makes a Requisito covered only by an invented id a gap', () => {
    const conferida = conferirLeitura(
      leitura({
        requisitos: [
          { texto: 'Go', tipo: 'obrigatorio', cobertos_por: ['ac99'] },
          { texto: 'Terraform', tipo: 'obrigatorio', cobertos_por: [filas.id] },
          { texto: 'Node.js', tipo: 'obrigatorio', cobertos_por: ['ac77', ref(api)] },
        ],
      }),
      corpus,
      refs,
    );
    expect(conferida.requisitos.map((r) => r.accomplishmentIds)).toEqual([[], [], [api.id]]);
  });

  it('never lets a draft, a skipped record or an Affiliation cover a Requisito', () => {
    const conferida = conferirLeitura(
      leitura({ requisitos: [{ texto: 'Java', tipo: 'obrigatorio', cobertos_por: [ref(rabbit), ref(pulado), ref(banco)] }] }),
      corpus,
      refs,
    );
    expect(conferida.requisitos[0].accomplishmentIds).toEqual([]);
  });

  it('keeps only real drafts, once each, and at most five', () => {
    const conferida = conferirLeitura(
      leitura({
        rascunhos: [
          { ref: ref(filas), motivo: 'é um registro, não rascunho' },
          { ref: 'ac99', motivo: 'inventado' },
          { ref: ref(pulado), motivo: 'pulado' },
          ...rascunhos.map((r) => ({ ref: ref(r), motivo: 'Java' })),
          { ref: ref(rascunhos[0]), motivo: 'de novo' },
        ],
      }),
      corpus,
      refs,
    );
    expect(conferida.rascunhos.map((r) => r.accomplishmentId)).toEqual(rascunhos.slice(0, MAXIMO_RASCUNHOS).map((r) => r.id));
  });

  it('turns a blank company or role into null', () => {
    expect(conferirLeitura(leitura({ empresa: '  ', cargo: '' }), corpus, refs)).toMatchObject({ empresa: null, cargo: null });
  });
});

// ---- lerVaga, against a scripted model -------------------------------------------

type Mensagem = Anthropic.Beta.BetaMessage;
const chamadaDaTool = (input: unknown, id = 'toolu_1'): Mensagem =>
  ({ content: [{ type: 'tool_use', id, name: 'registrar_leitura', input }], stop_reason: 'tool_use' }) as unknown as Mensagem;

function clienteFalso(respostas: Mensagem[]) {
  const pedidos: PedidoLlm[] = [];
  const cliente: ClienteLlm = {
    async chamar(pedido) {
      pedidos.push(structuredClone(pedido));
      const r = respostas.shift();
      if (!r) throw new Error('no scripted reply left');
      return r;
    },
  };
  return { cliente, pedidos };
}

const VAGA = 'Acme Payments is hiring a Senior Backend Engineer. Requirements: Node.js, message queues. Nice to have: Kubernetes.';

describe('lerVaga', () => {
  it('reads the posting against the Corpus, tagged with its stage, session and Vaga', async () => {
    const { cliente, pedidos } = clienteFalso([chamadaDaTool(leitura())]);

    const lida = await lerVaga(VAGA, corpus, { sessaoId: 's1', vagaId: 'v1', cliente });

    expect(lida.requisitos[2]).toEqual({ texto: 'Kubernetes', tipo: 'desejavel', accomplishmentIds: [] });
    expect(pedidos[0]).toMatchObject({ etapa: 'leitura_vaga', sessaoId: 's1', vagaId: 'v1' });
    expect(pedidos[0].params.model).toBeUndefined(); // MODELO_PADRAO
    const enviado = JSON.stringify(pedidos[0].params.messages);
    expect(enviado).toContain('Acme Payments is hiring');
    expect(enviado).toContain('Fintech Jangada');
  });

  it('sends an invalid reply back and accepts the corrected one', async () => {
    const { cliente, pedidos } = clienteFalso([chamadaDaTool({ empresa: 'x' }, 'toolu_1'), chamadaDaTool(leitura(), 'toolu_2')]);

    await lerVaga(VAGA, corpus, { sessaoId: 's1', vagaId: 'v1', cliente });

    expect(pedidos[1].params.messages.at(-1)!.content).toEqual([
      expect.objectContaining({ type: 'tool_result', tool_use_id: 'toolu_1', is_error: true }),
    ]);
  });

  it('gives up after three replies that do not validate', async () => {
    const ruim = () => chamadaDaTool({ lingua: 'klingon' });
    const { cliente } = clienteFalso([ruim(), ruim(), ruim()]);
    await expect(lerVaga(VAGA, corpus, { sessaoId: 's1', vagaId: 'v1', cliente })).rejects.toThrow(/3 times/);
  });

  it('never trusts a reply cut off at max_tokens', async () => {
    const cortada = { ...chamadaDaTool(leitura()), stop_reason: 'max_tokens' } as Mensagem;
    const { cliente } = clienteFalso([cortada]);
    await expect(lerVaga(VAGA, corpus, { sessaoId: 's1', vagaId: 'v1', cliente })).rejects.toThrow(/max_tokens/);
  });
});
