// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { maisDeUmaPergunta } from './pergunta';

describe('maisDeUmaPergunta', () => {
  it('flags two question marks and one question that asks two things', () => {
    expect(maisDeUmaPergunta('Quantos usavam? E com que frequência?')).toBe(true);
    expect(maisDeUmaPergunta('Lá fora ninguém conhece. O que ela transporta, e pra quem?')).toBe(true);
    expect(maisDeUmaPergunta('Me explica: o que a Maracatu faz, pra quem, e de que tamanho ela é?')).toBe(true);
    expect(maisDeUmaPergunta('No painel, qual era o tempo antes e quanto ficou depois?')).toBe(true);
    expect(maisDeUmaPergunta('A loja vende o quê, e pra quem?')).toBe(true);
  });

  it('lets one ask through, with context and subordinate clauses around it', () => {
    expect(maisDeUmaPergunta('Agora o frete. Quantos pedidos por dia passavam por ali?')).toBe(false);
    expect(maisDeUmaPergunta('Quando o financeiro fazia na planilha, quanto tempo levava?')).toBe(false);
    expect(maisDeUmaPergunta('Um gringo não sabe o que é conciliação: quem dependia dela?')).toBe(false);
    expect(maisDeUmaPergunta('Anotado. Pode seguir.')).toBe(false);
    expect(maisDeUmaPergunta('Agora a Capibaribe. Pra quem nunca ouviu falar dela, ela transporta o quê?')).toBe(false);
    // "Com quem era cobrado", "pra quem acompanhava": a "quem" that opens a clause is not an ask.
    expect(maisDeUmaPergunta('Quando o antifraude caía, o que acontecia com quem estava tentando pagar?')).toBe(false);
    expect(maisDeUmaPergunta('Sem número mesmo: o que mudou na prática pra quem acompanhava as entregas?')).toBe(false);
  });
});
