// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { alcanceDaSessao, duracao, funil, mediana, metaPara, resumo, type SessaoParaFunil } from './funil';

const base: SessaoParaFunil = {
  estado: 'novo',
  consentiuEm: null,
  terminouInterrogatorioEm: null,
  apagadaEm: null,
  eventos: [],
  fundador: false,
  indicacoes: 0,
};
const ev = (...tipos: string[]) => tipos.map((tipo) => ({ tipo, dados: {} }));

describe('alcanceDaSessao', () => {
  it('a link never opened reaches nothing', () => {
    const a = alcanceDaSessao(base);
    expect(a.parouEm).toBeNull();
    expect(a.etapas.size).toBe(0);
  });

  it('counts the earlier steps of a later one (a simulation never opens the link)', () => {
    const a = alcanceDaSessao({
      ...base,
      estado: 'pronto',
      consentiuEm: new Date(),
      terminouInterrogatorioEm: new Date(),
      eventos: ev('consentiu', 'importou', 'primeira_resposta', 'terminou', 'pdf_gerado'),
    });
    expect([...a.etapas]).toEqual(['link_aberto', 'consentiu', 'importou', 'primeira_resposta', 'terminou', 'pdf_gerado']);
    expect(a.parouEm).toBe('pdf_gerado');
  });

  it('stops mid-interrogation at the first answer', () => {
    const a = alcanceDaSessao({
      ...base,
      estado: 'interrogando',
      consentiuEm: new Date(),
      eventos: ev('link_aberto', 'consentiu', 'importou', 'primeira_resposta', 'nao_sei'),
    });
    expect(a.parouEm).toBe('primeira_resposta');
    expect(a.etapas.has('terminou')).toBe(false);
  });

  it('downloaded and founder count on their own, and each implies the PDF', () => {
    const fundadorSemBaixar = alcanceDaSessao({ ...base, estado: 'encerrado', fundador: true });
    expect(fundadorSemBaixar.etapas.has('pdf_gerado')).toBe(true);
    expect(fundadorSemBaixar.etapas.has('pdf_baixado')).toBe(false);
    expect(fundadorSemBaixar.parouEm).toBe('fundador_ou_indicou');

    const soBaixou = alcanceDaSessao({ ...base, estado: 'pronto', eventos: ev('pdf_baixado') });
    expect(soBaixou.parouEm).toBe('pdf_baixado');
    expect(soBaixou.etapas.has('fundador_ou_indicou')).toBe(false);

    const indicou = alcanceDaSessao({ ...base, estado: 'encerrado', eventos: ev('indicou') });
    expect(indicou.indicou).toBe(true);
    expect(indicou.etapas.has('fundador_ou_indicou')).toBe(true);
  });

  it('an erased session counts at the steps its apagou event kept', () => {
    const a = alcanceDaSessao({
      ...base,
      estado: 'encerrado',
      apagadaEm: new Date(),
      consentiuEm: new Date(),
      terminouInterrogatorioEm: new Date(),
      eventos: [{ tipo: 'apagou', dados: { estado: 'encerrado', etapas: ['consentiu', 'fundador', 'link_aberto', 'pdf_gerado'] } }],
    });
    expect(a.fundador).toBe(true);
    expect(a.parouEm).toBe('fundador_ou_indicou');
    expect(a.etapas.has('primeira_resposta')).toBe(true);
  });

  it('an older erasure without etapas falls back on the columns, and implies the link was opened', () => {
    const a = alcanceDaSessao({ ...base, estado: 'novo', apagadaEm: new Date(), eventos: [{ tipo: 'apagou', dados: { estado: 'novo' } }] });
    expect(a.parouEm).toBe('link_aberto');
    const b = alcanceDaSessao({
      ...base,
      estado: 'interrogando',
      consentiuEm: new Date(),
      apagadaEm: new Date(),
      eventos: [{ tipo: 'apagou', dados: { estado: 'interrogando' } }],
    });
    expect(b.parouEm).toBe('importou');
  });
});

describe('funil', () => {
  it('counts each step and where each one stopped', () => {
    const f = funil([
      alcanceDaSessao(base),
      alcanceDaSessao({ ...base, estado: 'consentiu', consentiuEm: new Date(), eventos: ev('link_aberto', 'consentiu') }),
      alcanceDaSessao({ ...base, estado: 'encerrado', fundador: true, eventos: ev('pdf_baixado') }),
    ]);
    expect(f.testers).toBe(3);
    expect(f.porEtapa.link_aberto).toBe(2);
    expect(f.porEtapa.consentiu).toBe(2);
    expect(f.porEtapa.terminou).toBe(1);
    expect(f.porEtapa.pdf_baixado).toBe(1);
    expect(f.porEtapa.fundador_ou_indicou).toBe(1);
    expect(f.pararamEm.get(null)).toBe(1);
    expect(f.pararamEm.get('consentiu')).toBe(1);
    expect(f.pararamEm.get('fundador_ou_indicou')).toBe(1);
  });
});

describe('números', () => {
  it('meta, mediana, resumo, duração', () => {
    expect(metaPara(10, 0.6)).toBe(6);
    expect(metaPara(10, 0.4)).toBe(4);
    expect(metaPara(7, 0.6)).toBe(5);
    expect(mediana([])).toBeNull();
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
    expect(resumo([1, 2, 6])).toEqual({ media: 3, mediana: 2, maximo: 6, n: 3 });
    expect(duracao(40_000)).toBe('40 s');
    expect(duracao(12 * 60_000)).toBe('12 min');
    expect(duracao(65 * 60_000)).toBe('1 h 05 min');
  });
});
