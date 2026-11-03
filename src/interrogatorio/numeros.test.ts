// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { numerosDaFala, numeroFoiDito } from './numeros';

describe('numerosDaFala', () => {
  it('reads digits, decimal commas and thousand dots', () => {
    expect(numerosDaFala('uns 40 clientes, 2,5 horas')).toEqual(expect.arrayContaining([40, 2.5]));
    expect(numerosDaFala('R$ 1.200 por mês')).toEqual(expect.arrayContaining([1200]));
  });

  it('reads "mil" and "k" as thousands', () => {
    expect(numerosDaFala('uns 5 mil pedidos')).toEqual(expect.arrayContaining([5000]));
    expect(numerosDaFala('10k usuários')).toEqual(expect.arrayContaining([10000]));
    expect(numerosDaFala('1,5 milhão')).toEqual(expect.arrayContaining([1_500_000]));
  });

  it('reads number words in Portuguese', () => {
    expect(numerosDaFala('acho que uns dez')).toEqual(expect.arrayContaining([10]));
    expect(numerosDaFala('umas trinta pessoas')).toEqual(expect.arrayContaining([30]));
    expect(numerosDaFala('duas vezes por dia')).toEqual(expect.arrayContaining([2]));
    expect(numerosDaFala('vinte e cinco')).toEqual(expect.arrayContaining([25]));
    expect(numerosDaFala('dez mil')).toEqual(expect.arrayContaining([10000]));
  });

  it('does not read articles and "meio" as numbers', () => {
    expect(numerosDaFala('um sistema meio lento, uma vez')).toEqual([]);
  });

  it('does not read a number in a word that only contains one', () => {
    expect(numerosDaFala('alguém tomou um café')).not.toContain(1000);
    expect(numerosDaFala('dezembro')).not.toContain(10);
  });
});

describe('numeroFoiDito', () => {
  const falas = ['Era umas 2 horas por ficha', 'depois ficou 20 segundos', 'uns 3 mil por mês'];

  it('accepts a number the person said', () => {
    expect(numeroFoiDito(2, falas)).toBe(true);
    expect(numeroFoiDito(20, falas)).toBe(true);
    expect(numeroFoiDito(3000, falas)).toBe(true);
  });

  it('refuses a number nobody said', () => {
    expect(numeroFoiDito(30, falas)).toBe(false);
    expect(numeroFoiDito(50, falas)).toBe(false);
  });

  it('accepts a percentage the person gave as a fraction of what she said only if she said it', () => {
    expect(numeroFoiDito(90, ['reduziu 90%'])).toBe(true);
    expect(numeroFoiDito(90, ['de 10 pra 1'])).toBe(false);
  });
});
