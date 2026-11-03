// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import type { ClienteLlm, PedidoLlm } from '../llm/cliente';
import { conferirExtracao, extrairCorpus, numerosDe, type Extracao } from './extracao';

const TEXTO = `Rodrigo Pinheiro
Desenvolvedor Back-end Pleno · Fintech Maracatu Pagamentos
mar 2022 – atual
- Reescrevi o serviço de conciliação de boletos em Go, reduzindo o tempo de processamento de 4 horas
para 25 minutos.
- Mentorei 2 desenvolvedores júnior.
Stack: Go, PostgreSQL`;

function extracaoValida(): Extracao {
  return {
    affiliations: [
      {
        ref: 'a1',
        organizacao: 'Fintech Maracatu Pagamentos',
        cargo: 'Desenvolvedor Back-end Pleno',
        tipo: 'emprego',
        periodo_original: 'mar 2022 – atual',
        periodo_inicio: '2022-03',
        periodo_fim: null,
        stack: ['Go', 'PostgreSQL'],
      },
    ],
    accomplishments: [
      {
        ref: 'c1',
        affiliation_ref: 'a1',
        tipo: 'engineering',
        enunciado:
          'Reescrevi o serviço de conciliação de boletos em Go, reduzindo o tempo de processamento de 4 horas para 25 minutos.',
      },
      { ref: 'c2', affiliation_ref: 'a1', tipo: 'engineering', enunciado: 'Mentorei 2 desenvolvedores júnior.' },
    ],
    linhas_originais: [
      {
        texto:
          '- Reescrevi o serviço de conciliação de boletos em Go, reduzindo o tempo de processamento de 4 horas para 25 minutos.',
        affiliation_ref: 'a1',
        accomplishment_refs: ['c1'],
      },
      { texto: '- Mentorei 2 desenvolvedores júnior.', affiliation_ref: 'a1', accomplishment_refs: ['c2'] },
    ],
  };
}

describe('numerosDe', () => {
  it('finds integers and decimals in either notation', () => {
    expect(numerosDe('de 4 horas para 2,5 min, 1.200 usuários e 30%')).toEqual(['4', '2,5', '1.200', '30']);
  });
});

describe('conferirExtracao', () => {
  it('accepts an extraction that only says what the text says', () => {
    expect(conferirExtracao(extracaoValida(), TEXTO)).toEqual([]);
  });

  it('flags a number that is not in the resume', () => {
    const e = extracaoValida();
    e.accomplishments[1].enunciado = 'Mentorei 2 desenvolvedores júnior, que foram promovidos em 6 meses.';
    expect(conferirExtracao(e, TEXTO)).toEqual([expect.stringMatching(/"6".*c2/)]);
  });

  it('flags a period whose year is not in the resume', () => {
    const e = extracaoValida();
    e.affiliations[0].periodo_fim = '2024-12';
    expect(conferirExtracao(e, TEXTO)).toEqual([expect.stringMatching(/2024.*a1/)]);
  });

  it('flags a technology that only appears inside another word', () => {
    const e = extracaoValida();
    e.affiliations[0].stack = ['Go', 'PostgreSQL', 'Rust', 'SQL'];
    // "Rust" is nowhere; "SQL" only inside "PostgreSQL" would be a substring hit, not a citation.
    expect(conferirExtracao(e, `${TEXTO}
algo`)).toEqual([
      expect.stringMatching(/"Rust"/),
      expect.stringMatching(/"SQL"/),
    ]);
  });

  it('flags a month that is not the one the resume wrote', () => {
    const e = extracaoValida();
    e.affiliations[0].periodo_inicio = '2022-04';
    expect(conferirExtracao(e, TEXTO)).toEqual([expect.stringMatching(/a1 has 2022-04/)]);
  });

  it('reads months written as numbers', () => {
    const e = extracaoValida();
    e.affiliations[0].periodo_original = '03/2022 – atual';
    expect(conferirExtracao(e, TEXTO.replace('mar 2022', '03/2022'))).toEqual([]);
  });

  it('flags an original line that is not in the resume as it came', () => {
    const e = extracaoValida();
    e.linhas_originais[1].texto = 'Mentoria de desenvolvedores júnior';
    expect(conferirExtracao(e, TEXTO)).toEqual([expect.stringMatching(/Mentoria/)]);
  });

  it('accepts an original line that the PDF wrapped across two lines', () => {
    // linhas_originais[0] spans "4 horas\npara 25 minutos" in TEXTO.
    expect(conferirExtracao(extracaoValida(), TEXTO)).toEqual([]);
  });

  it('flags references to things that were not extracted', () => {
    const e = extracaoValida();
    e.accomplishments[0].affiliation_ref = 'a9';
    e.linhas_originais[0].accomplishment_refs = ['c1', 'c7'];
    expect(conferirExtracao(e, TEXTO)).toEqual([
      expect.stringMatching(/a9/),
      expect.stringMatching(/c7/),
    ]);
  });

  it('flags an original line linked to nothing', () => {
    const e = extracaoValida();
    e.linhas_originais[1].affiliation_ref = null;
    e.linhas_originais[1].accomplishment_refs = [];
    expect(conferirExtracao(e, TEXTO)).toEqual([expect.stringMatching(/linked to nothing/)]);
  });
});

// ---- extrairCorpus, against a scripted model -----------------------------------

type Mensagem = Anthropic.Beta.BetaMessage;

function resposta(content: Mensagem['content'], stop_reason: Mensagem['stop_reason'] = 'tool_use'): Mensagem {
  return { content, stop_reason } as Mensagem;
}

const chamadaDaTool = (input: unknown, id = 'toolu_1'): Mensagem =>
  resposta([{ type: 'tool_use', id, name: 'registrar_corpus', input } as Anthropic.Beta.BetaToolUseBlock]);

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

describe('extrairCorpus', () => {
  it('returns the extraction the model registered, tagged with its stage and session', async () => {
    const { cliente, pedidos } = clienteFalso([chamadaDaTool(extracaoValida())]);

    const extracao = await extrairCorpus(TEXTO, { sessaoId: 's1', cliente });

    expect(extracao).toEqual(extracaoValida());
    expect(pedidos[0]).toMatchObject({ etapa: 'import', sessaoId: 's1' });
    expect(JSON.stringify(pedidos[0].params.messages)).toContain('Fintech Maracatu');
  });

  it('sends the problems back and accepts the corrected extraction', async () => {
    const inventada = extracaoValida();
    inventada.accomplishments[1].enunciado = 'Mentorei 2 devs por 18 meses.';
    const { cliente, pedidos } = clienteFalso([
      chamadaDaTool(inventada, 'toolu_1'),
      chamadaDaTool(extracaoValida(), 'toolu_2'),
    ]);

    const extracao = await extrairCorpus(TEXTO, { sessaoId: 's1', cliente });

    expect(extracao.accomplishments[1].enunciado).toBe('Mentorei 2 desenvolvedores júnior.');
    const ultima = pedidos[1].params.messages.at(-1)!;
    expect(ultima.content).toEqual([
      expect.objectContaining({ type: 'tool_result', tool_use_id: 'toolu_1', is_error: true }),
    ]);
    expect(JSON.stringify(ultima.content)).toContain('18');
  });

  it('rejects a schema-invalid call and retries', async () => {
    const { cliente } = clienteFalso([
      chamadaDaTool({ affiliations: 'nope' }),
      chamadaDaTool(extracaoValida(), 'toolu_2'),
    ]);
    await expect(extrairCorpus(TEXTO, { sessaoId: null, cliente })).resolves.toEqual(extracaoValida());
  });

  it('asks again when the model answers in text instead of calling the tool', async () => {
    const { cliente, pedidos } = clienteFalso([
      resposta([{ type: 'text', text: 'Aqui está.', citations: null }], 'end_turn'),
      chamadaDaTool(extracaoValida()),
    ]);
    await extrairCorpus(TEXTO, { sessaoId: null, cliente });
    expect(JSON.stringify(pedidos[1].params.messages.at(-1))).toContain('registrar_corpus');
  });

  it('gives up after three attempts', async () => {
    const inventada = extracaoValida();
    inventada.accomplishments[0].enunciado = 'Cortei 99% do tempo.';
    const { cliente } = clienteFalso([chamadaDaTool(inventada), chamadaDaTool(inventada), chamadaDaTool(inventada)]);
    await expect(extrairCorpus(TEXTO, { sessaoId: null, cliente })).rejects.toThrow(/99/);
  });

  it('never runs a tool input cut off by max_tokens', async () => {
    const { cliente } = clienteFalso([
      resposta(chamadaDaTool(extracaoValida()).content, 'max_tokens'),
    ]);
    await expect(extrairCorpus(TEXTO, { sessaoId: null, cliente })).rejects.toThrow(/max_tokens/);
  });
});
