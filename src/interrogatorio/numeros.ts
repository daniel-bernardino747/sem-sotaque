// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * "Every number in a Metric was said by the person": the numbers a message
 * contains, the way people write them in a chat — digits ("2,5", "1.200"),
 * thousands ("5 mil", "10k") and words ("uns dez", "vinte e cinco").
 */

const UNIDADES: Record<string, number> = {
  // "um"/"uma" are left out: as articles they are in every sentence.
  zero: 0, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14,
  catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
};
const DEZENAS: Record<string, number> = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70,
  oitenta: 80, noventa: 90,
};
const CENTENAS: Record<string, number> = {
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800,
  novecentos: 900,
};
const MULTIPLICADORES: Record<string, number> = {
  mil: 1_000, k: 1_000, milhao: 1_000_000, milhoes: 1_000_000, mi: 1_000_000,
  bilhao: 1_000_000_000, bilhoes: 1_000_000_000, bi: 1_000_000_000,
};

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** "1.200" can be twelve hundred or one point two; "2,5" is two and a half. */
function leituras(escrito: string): number[] {
  const opcoes = new Set<number>();
  const soDigitos = escrito.replace(/[.,]/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(escrito)) opcoes.add(Number(soDigitos));
  const decimal = Number(escrito.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  if (Number.isFinite(decimal)) opcoes.add(decimal);
  const ponto = Number(escrito.replace(',', '.'));
  if (Number.isFinite(ponto)) opcoes.add(ponto);
  return [...opcoes];
}

/** The numbers spelled out in words: "vinte e cinco", "dez mil". */
function porExtenso(palavras: string[]): number[] {
  const achados: number[] = [];
  let atual: number | null = null;
  const fechar = () => {
    if (atual !== null) achados.push(atual);
    atual = null;
  };
  for (const palavra of palavras) {
    const valor = UNIDADES[palavra] ?? DEZENAS[palavra] ?? CENTENAS[palavra];
    if (valor !== undefined) {
      atual = (atual ?? 0) + valor;
    } else if (palavra === 'e' && atual !== null) {
      continue;
    } else if (palavra in MULTIPLICADORES && palavra.length > 2) {
      atual = (atual ?? 1) * MULTIPLICADORES[palavra];
      fechar();
    } else {
      fechar();
    }
  }
  fechar();
  return achados;
}

export function numerosDaFala(texto: string, { porExtenso: palavras = true } = {}): number[] {
  const limpo = semAcento(texto);
  const achados: number[] = [];

  for (const m of limpo.matchAll(/(\d+(?:[.,]\d+)*)\s*(k\b|mil\b|milhao\b|milhoes\b|mi\b|bilhao\b|bilhoes\b|bi\b)?/g)) {
    const [, escrito, sufixo] = m;
    for (const valor of leituras(escrito)) {
      achados.push(valor);
      if (sufixo) achados.push(valor * MULTIPLICADORES[sufixo]);
    }
  }

  if (palavras) achados.push(...porExtenso(limpo.match(/\p{L}+/gu) ?? []));
  return [...new Set(achados)];
}

const igual = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** Did one of these messages say `valor`? */
export function numeroFoiDito(valor: number, falas: string[]): boolean {
  return falas.some((fala) => numerosDaFala(fala).some((n) => igual(n, valor)));
}
