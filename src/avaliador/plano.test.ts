// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import type { AccomplishmentDoCorpus, Affiliation, Corpus } from '@/db';

import {
  cobertura,
  decisaoDeReserva,
  destinoDoAccomplishment,
  fila,
  filaAberta,
  objetivoDeAccomplishment,
  objetivoDoAssunto,
  pendentesDaOferta,
  planoVazio,
  proximoAssunto,
  type EstadoPlano,
} from './plano';

const quando = new Date('2026-01-01T00:00:00Z');
let n = 0;
function af(over: Partial<Affiliation> = {}): Affiliation {
  n++;
  return {
    id: `af${n}`, sessaoId: 's', organizacao: `Org ${n}`, cargo: 'Dev', tipo: 'emprego', anoConclusao: null, cursando: false,
    periodoOriginal: '2019 – 2021', periodoInicio: null, periodoFim: null, stack: [], confidencial: false, descricaoPublica: null,
    periodoConfirmado: false, pulado: false, ordem: n, createdAt: quando, atualizadoEm: quando, ...over,
  };
}
function ac(lugar: Affiliation | null, over: Partial<AccomplishmentDoCorpus> = {}): AccomplishmentDoCorpus {
  n++;
  return {
    id: `ac${n}`, sessaoId: 's', affiliationId: lugar?.id ?? null, tipo: 'engineering', enunciado: `fez ${n}`, importanciaParaPessoa: null,
    data: null, pulado: false, forca: null, adiado: false, adiadoVoltou: false, ordem: n, createdAt: quando, atualizadoEm: quando, affiliation: lugar,
    metrics: [], rascunho: true, ...over,
  };
}
const metric = { id: 'm', accomplishmentId: 'x', texto: '4h → 25 min', valores: [4, 25], origem: 'afirmado' as const, ancora: null, confirmadoEm: null, createdAt: quando, atualizadoEm: quando };
const fechado = (a: AccomplishmentDoCorpus): AccomplishmentDoCorpus => ({ ...a, metrics: [metric], rascunho: false });

const estado = (over: Partial<EstadoPlano> = {}): EstadoPlano => ({ ...planoVazio(), ...over });
const chave = (a: { tipo: string; id: string } | null) => (a ? `${a.tipo}:${a.id}` : null);

describe('cobertura', () => {
  it('weighs what has a result by its strength, over what was not skipped', () => {
    const lugar = af();
    const forte = fechado(ac(lugar, { forca: 'forte' }));
    const medio = ac(lugar, { forca: 'medio' });
    const fraco = ac(lugar, { forca: 'fraco' });
    const pulado = ac(lugar, { forca: 'forte', pulado: true });
    expect(cobertura({ affiliations: [lugar], accomplishments: [forte, medio, fraco, pulado] })).toBe(50);
  });

  it('counts an unjudged record as medium, and an empty Corpus as nothing covered', () => {
    const lugar = af();
    expect(cobertura({ affiliations: [lugar], accomplishments: [fechado(ac(lugar)), ac(lugar, { forca: 'forte' })] })).toBe(40);
    expect(cobertura({ affiliations: [], accomplishments: [] })).toBe(0);
  });
});

describe('proximoAssunto', () => {
  it('starts with the strongest accomplishment, never with an Affiliation or a degree', () => {
    const curso = af({ tipo: 'graduacao', anoConclusao: null });
    const empresa = af();
    const fraco = ac(empresa, { forca: 'fraco' });
    const forte = ac(empresa, { forca: 'forte' });
    const corpus: Corpus = { affiliations: [curso, empresa], accomplishments: [fraco, forte] };
    expect(chave(proximoAssunto(corpus, estado(), { experiente: true }))).toBe(`accomplishment:${forte.id}`);
  });

  it("asks a company's block when its last accomplishment is done, before the next company's", () => {
    const a = af();
    const b = af();
    const deA = fechado(ac(a, { forca: 'forte' }));
    const deB = ac(b, { forca: 'fraco' });
    const corpus: Corpus = { affiliations: [a, b], accomplishments: [deA, deB] };
    expect(chave(proximoAssunto(corpus, estado(), { experiente: true, anterior: { tipo: 'accomplishment', id: deA.id } }))).toBe(`affiliation:${a.id}`);
    // Without having just left it, the block waits for the accomplishments to run out.
    expect(chave(proximoAssunto(corpus, estado(), { experiente: true }))).toBe(`accomplishment:${deB.id}`);
  });

  it('then the open blocks, then the degree, then each postponed record once', () => {
    const curso = af({ tipo: 'graduacao', anoConclusao: null });
    const empresa = af();
    const adiado = ac(empresa, { adiado: true, forca: 'forte' });
    const corpus: Corpus = { affiliations: [curso, empresa], accomplishments: [adiado] };
    const visitados: string[] = [];
    const ordem: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const proximo = proximoAssunto(corpus, estado({ visitados }), { experiente: true });
      ordem.push(chave(proximo));
      if (proximo) visitados.push(chave(proximo)!);
    }
    expect(ordem).toEqual([`affiliation:${empresa.id}`, `affiliation:${curso.id}`, `accomplishment:${adiado.id}`, `accomplishment:${adiado.id}`]);
    // Once back, it is not offered again.
    const voltou = { ...corpus, accomplishments: [{ ...adiado, adiadoVoltou: true }] };
    expect(proximoAssunto(voltou, estado({ visitados: [`affiliation:${empresa.id}`, `affiliation:${curso.id}`] }), { experiente: true })).toBeNull();
  });

  it('skips a closed degree when the person has 2 years of work, and keeps it for "something notable" when not', () => {
    const curso = af({ tipo: 'graduacao', anoConclusao: 2018 });
    const corpus: Corpus = { affiliations: [curso], accomplishments: [] };
    expect(proximoAssunto(corpus, estado(), { experiente: true })).toBeNull();
    expect(chave(proximoAssunto(corpus, estado(), { experiente: false }))).toBe(`affiliation:${curso.id}`);
  });

  it('opens a note about something new first', () => {
    const empresa = af();
    const corpus: Corpus = { affiliations: [empresa], accomplishments: [ac(empresa, { forca: 'forte' })] };
    const anotacoes = [{ id: 'n1', texto: 'também fiz um alerta de fraude', destino: 'nova' as const, accomplishmentId: null }];
    expect(chave(proximoAssunto(corpus, estado({ anotacoes }), { experiente: true }))).toBe('anotacao:n1');
  });
});

describe('a retomada (passo 14)', () => {
  it('the open queue is the drafts first, strongest first, then what was skipped, then what was postponed', () => {
    const empresa = af();
    const fraco = ac(empresa, { forca: 'fraco' });
    const forte = ac(empresa, { forca: 'forte' });
    const pulado = ac(empresa, { forca: 'forte', pulado: true });
    const adiado = ac(empresa, { forca: 'forte', adiado: true });
    const feito = fechado(ac(empresa));
    const puladoComNumero = fechado(ac(empresa, { pulado: true }));
    const corpus: Corpus = { affiliations: [empresa], accomplishments: [adiado, fraco, pulado, feito, forte, puladoComNumero] };
    expect(filaAberta(corpus)).toEqual([forte.id, fraco.id, pulado.id, adiado.id]);
  });

  it('brings the skipped ones back after the drafts, and never what this retomada already opened', () => {
    const empresa = { ...af(), periodoConfirmado: true, periodoInicio: '2020-01', descricaoPublica: 'uma loja' };
    const rascunho = ac(empresa, { forca: 'fraco' });
    const pulado = ac(empresa, { forca: 'forte', pulado: true });
    const corpus: Corpus = { affiliations: [empresa], accomplishments: [rascunho, pulado] };
    const ctx = { experiente: true, retomada: true };
    expect(chave(proximoAssunto(corpus, estado(), ctx))).toBe(`accomplishment:${rascunho.id}`);
    expect(chave(proximoAssunto(corpus, estado({ retomados: [rascunho.id] }), ctx))).toBe(`accomplishment:${pulado.id}`);
    // Skipped again in this retomada: it does not come back until the next one.
    expect(proximoAssunto(corpus, estado({ retomados: [rascunho.id, pulado.id] }), ctx)).toBeNull();
    // Outside the retomada, a skipped record is done.
    expect(chave(proximoAssunto(corpus, estado(), { experiente: true }))).toBe(`accomplishment:${rascunho.id}`);
    expect(proximoAssunto(corpus, estado({ assunto: { tipo: 'accomplishment', id: rascunho.id, objetivo: [], desde: 0 } }), { experiente: true })).toBeNull();
  });

  it('brings a record postponed in this retomada back once, at the end', () => {
    const empresa = { ...af(), periodoConfirmado: true, periodoInicio: '2020-01', descricaoPublica: 'uma loja' };
    const adiado = ac(empresa, { adiado: true });
    const ctx = { experiente: true, retomada: true };
    const corpus: Corpus = { affiliations: [empresa], accomplishments: [adiado] };
    expect(chave(proximoAssunto(corpus, estado({ retomados: [adiado.id] }), ctx))).toBe(`accomplishment:${adiado.id}`);
    const voltou: Corpus = { ...corpus, accomplishments: [{ ...adiado, adiadoVoltou: true }] };
    expect(proximoAssunto(voltou, estado({ retomados: [adiado.id] }), ctx)).toBeNull();
  });

  it('brings back, in a new retomada, a postponed record the last one opened and left without a result', () => {
    const empresa = { ...af(), periodoConfirmado: true, periodoInicio: '2020-01', descricaoPublica: 'uma loja' };
    const preso = ac(empresa, { adiado: true, adiadoVoltou: true });
    const corpus: Corpus = { affiliations: [empresa], accomplishments: [preso] };
    expect(filaAberta(corpus)).toEqual([preso.id]);
    expect(chave(proximoAssunto(corpus, estado(), { experiente: true, retomada: true }))).toBe(`accomplishment:${preso.id}`);
  });

  it('gives a reopened record the usual goal, and "contar algo novo" its own', () => {
    const empresa = af();
    const volta = ac(empresa, { adiado: true, adiadoVoltou: true, pulado: true });
    const corpus: Corpus = { affiliations: [empresa], accomplishments: [volta] };
    expect(objetivoDoAssunto(corpus, { tipo: 'accomplishment', id: volta.id }, { experiente: true, retomada: true })).toContain('falta: resultado');
    expect(objetivoDoAssunto(corpus, { tipo: 'novo', id: 'n1' }, { experiente: true })).toEqual([
      'falta: saber o que a pessoa quer contar (um trabalho, um projeto ou um resultado que ainda não está aqui) e criar o registro',
    ]);
  });
});

describe('pendentesDaOferta', () => {
  it('lists up to 4 accomplishments still in the queue, strongest first, with no block or degree', () => {
    const empresa = af();
    const curso = af({ tipo: 'graduacao' });
    const fortes = [ac(empresa, { forca: 'forte' }), ac(empresa, { forca: 'forte' })];
    const medios = [ac(empresa, { forca: 'medio' }), ac(empresa, { forca: 'medio' })];
    const fraco = ac(empresa, { forca: 'fraco' });
    const feito = fechado(ac(empresa, { forca: 'forte' }));
    const corpus: Corpus = { affiliations: [empresa, curso], accomplishments: [fraco, ...medios, feito, ...fortes] };
    const oferta = estado({ assunto: { tipo: 'oferta', id: 'oferta', objetivo: [], desde: 0 } });

    expect(pendentesDaOferta(corpus, oferta, { experiente: false })).toEqual([...fortes, ...medios].map((a) => a.id));
  });
});

describe('fila', () => {
  it('lists what comes after the current subject, in order', () => {
    const empresa = af();
    const forte = ac(empresa, { forca: 'forte' });
    const fraco = ac(empresa, { forca: 'fraco' });
    const corpus: Corpus = { affiliations: [empresa], accomplishments: [fraco, forte] };
    expect(fila(corpus, estado({ assunto: { tipo: 'accomplishment', id: forte.id, objetivo: [], desde: 0 } }), { experiente: true })).toEqual([
      `accomplishment:${fraco.id}`,
      `affiliation:${empresa.id}`,
    ]);
  });
});

describe('objetivoDoAssunto', () => {
  it('asks a company for its period, what it is and whether it can be named', () => {
    const empresa = af();
    const corpus: Corpus = { affiliations: [empresa], accomplishments: [] };
    expect(objetivoDoAssunto(corpus, { tipo: 'affiliation', id: empresa.id }, { experiente: true })).toEqual([
      'falta: mês e ano de início e de fim (ou se ainda está lá)',
      'falta: o que a empresa é, para um recrutador estrangeiro',
      'falta: se o nome pode aparecer no currículo',
    ]);
    const pronta = { ...empresa, periodoConfirmado: true, periodoInicio: '2019-03', descricaoPublica: 'uma loja' };
    expect(objetivoDoAssunto({ ...corpus, affiliations: [pronta] }, { tipo: 'affiliation', id: empresa.id }, { experiente: true })).toEqual([
      'falta: se o nome pode aparecer no currículo',
    ]);
  });

  it('asks a degree for its year only, and once for something notable under 2 years of work', () => {
    const curso = af({ tipo: 'graduacao' });
    const corpus: Corpus = { affiliations: [curso], accomplishments: [] };
    expect(objetivoDoAssunto(corpus, { tipo: 'affiliation', id: curso.id }, { experiente: true })).toEqual([
      'falta: o ano de conclusão (ou, se ainda está cursando, a previsão)',
    ]);
    expect(objetivoDoAssunto(corpus, { tipo: 'affiliation', id: curso.id }, { experiente: false })).toContain(
      'falta: se houve algo notável no curso (TCC, prêmio, monitoria): pergunte uma vez só',
    );
  });

  it('gives a postponed record coming back one goal only', () => {
    const empresa = af();
    const volta = ac(empresa, { adiado: true, adiadoVoltou: true });
    expect(objetivoDoAssunto({ affiliations: [empresa], accomplishments: [volta] }, { tipo: 'accomplishment', id: volta.id }, { experiente: true })).toEqual([
      'falta: um resultado qualitativo concreto; se não houver, pule este assunto',
    ]);
  });
});

describe('objetivoDeAccomplishment', () => {
  const visto = { problema: true, contribuicao: true, resultado: true, comoSabe: false };
  it('asks first to record a result the person already said, with how she knows it only if there is room', () => {
    expect(objetivoDeAccomplishment(visto, ac(null, { importanciaParaPessoa: 'alta' }))).toEqual([
      'falta: gravar o resultado que ela já disse (registrar_metric), mesmo sem saber como ela sabe',
      'se sobrar: como ela sabe o resultado',
    ]);
  });

  it('asks how she knows a result already recorded', () => {
    expect(objetivoDeAccomplishment(visto, fechado(ac(null, { importanciaParaPessoa: 'alta' })))).toEqual(['falta: como ela sabe o resultado']);
  });
});

describe('destinoDoAccomplishment', () => {
  const lugar = af();
  it('postpones a record left without a result, and skips it the second time', () => {
    expect(destinoDoAccomplishment(ac(lugar), 'trocar')).toBe('adiado');
    expect(destinoDoAccomplishment(ac(lugar), 'adiar')).toBe('adiado');
    expect(destinoDoAccomplishment(ac(lugar, { adiado: true, adiadoVoltou: true }), 'adiar')).toBe('pulado');
    expect(destinoDoAccomplishment(ac(lugar, { adiado: true, adiadoVoltou: true }), 'trocar')).toBe('pulado');
  });

  it('closes a record with a result when the decision moves on, and keeps any record that continues', () => {
    expect(destinoDoAccomplishment(fechado(ac(lugar)), 'adiar')).toBe('fechado');
    expect(destinoDoAccomplishment(fechado(ac(lugar)), 'continuar')).toBe('fica');
    expect(destinoDoAccomplishment(ac(lugar, { pulado: true }), 'continuar')).toBe('pulado');
    expect(destinoDoAccomplishment(ac(lugar), 'continuar')).toBe('fica');
  });
});

describe('decisaoDeReserva', () => {
  it('follows the fixed rules when the Jev is out', () => {
    expect(decisaoDeReserva('metric')).toBe('trocar');
    expect(decisaoDeReserva('nao_sei')).toBe('adiar');
    expect(decisaoDeReserva('pulou')).toBe('trocar');
    expect(decisaoDeReserva('concluir')).toBe('continuar');
    expect(decisaoDeReserva('perguntas')).toBe('continuar');
  });
});

describe('a fila da vaga (passo 16)', () => {
  const empresa = af();
  const coberto = fechado(ac(empresa, { forca: 'forte' }));
  const rascunhoForte = ac(empresa, { forca: 'forte' });
  const trazido = ac(empresa, { forca: 'fraco' });
  const corpus: Corpus = { affiliations: [empresa], accomplishments: [coberto, rascunhoForte, trazido] };
  const vaga = { lacunas: ['req1', 'req2'], rascunhos: [trazido.id, coberto.id] };
  const ctx = { experiente: true, retomada: true, vaga };

  it('asks the gaps marked "já usei" in their order, then the drafts the reading brought, and nothing else', () => {
    expect(chave(proximoAssunto(corpus, estado(), ctx))).toBe('lacuna:req1');
    // A draft the reading brought that already has its result is not asked; the Corpus's other drafts are not either.
    expect(fila(corpus, estado(), ctx)).toEqual(['lacuna:req1', 'lacuna:req2', `accomplishment:${trazido.id}`]);
  });

  it('leaves out a gap already asked and a draft this Vaga already opened', () => {
    const depois = estado({ visitados: ['lacuna:req1'], retomados: [trazido.id] });
    expect(fila(corpus, depois, ctx)).toEqual(['lacuna:req2']);
    expect(proximoAssunto(corpus, estado({ visitados: ['lacuna:req1', 'lacuna:req2'], retomados: [trazido.id] }), ctx)).toBeNull();
  });

  it("asks a note left in the Vaga's conversation only after the Vaga's own queue", () => {
    const nota = { id: 'n1', texto: 'está lá desde 2022', destino: 'nova' as const, accomplishmentId: null };
    expect(fila(corpus, estado({ anotacoes: [nota] }), ctx)).toEqual([
      'lacuna:req1',
      'lacuna:req2',
      `accomplishment:${trazido.id}`,
      'anotacao:n1',
    ]);
  });

  it('keeps a gap out of the general open queue, which reads only the Corpus', () => {
    expect(filaAberta(corpus)).not.toContain('req1');
    expect(fila(corpus, estado(), { experiente: true, retomada: true }).some((k) => k.startsWith('lacuna:'))).toBe(false);
  });

  it('gives a gap the goal of finding where and how the person used it, and the record it becomes', () => {
    const objetivo = objetivoDoAssunto(corpus, { tipo: 'lacuna', id: 'req1' }, ctx);
    expect(objetivo.join('\n')).toMatch(/onde e como/);
    expect(objetivo.join('\n')).toMatch(/acrescentar_stack/);
  });

  it('moves on from a gap when a stack was added, without the Jev', () => {
    expect(decisaoDeReserva('stack')).toBe('trocar');
  });
});
