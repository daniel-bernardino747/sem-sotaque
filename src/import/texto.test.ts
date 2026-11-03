// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ErroImport,
  LIMITE_PDF,
  normalizarTexto,
  pdftotextDisponivel,
  textoColado,
  textoDoPdf,
} from './texto';

const fixture = (nome: string) => new URL(`../llm/__fixtures__/${nome}`, import.meta.url);

/** A one-page PDF with nothing on it: what a scan looks like to pdftotext. */
const PDF_VAZIO = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n',
);

const semEspacos = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('normalizarTexto', () => {
  it('drops CRLF, form feeds, trailing spaces and runs of blank lines', () => {
    expect(normalizarTexto('  A\r\nB   \f\n\n\n\nC  ')).toBe('A\nB\n\nC');
  });

  it('collapses the column padding pdftotext -layout leaves inside a line', () => {
    expect(normalizarTexto('Cargo          2020 – 2022')).toBe('Cargo 2020 – 2022');
  });
});

describe('textoColado', () => {
  it('accepts a resume and normalizes it', () => {
    const texto = readFileSync(fixture('junior.txt'), 'utf8');
    expect(textoColado(texto)).toBe(normalizarTexto(texto));
  });

  it('refuses text too short to be a resume', () => {
    expect(() => textoColado('dev')).toThrow(expect.objectContaining({ codigo: 'curto' }));
  });

  it('refuses text far longer than a resume', () => {
    expect(() => textoColado('a '.repeat(30_000))).toThrow(
      expect.objectContaining({ codigo: 'longo' }),
    );
  });
});

describe.skipIf(!pdftotextDisponivel())('textoDoPdf', () => {
  it('reads the same words a pasted resume has', async () => {
    const doPdf = await textoDoPdf(readFileSync(fixture('pleno.pdf')));
    const colado = textoColado(readFileSync(fixture('pleno.txt'), 'utf8'));
    // The PDF wraps long lines where the text did not; the words are the same.
    expect(semEspacos(doPdf)).toBe(semEspacos(colado));
    expect(doPdf).toBe(normalizarTexto(doPdf));
  });

  it('asks for the text when the PDF has none (a scan)', async () => {
    await expect(textoDoPdf(PDF_VAZIO)).rejects.toMatchObject({ codigo: 'sem_texto' });
  });

  it('refuses a file that is not a PDF', async () => {
    await expect(textoDoPdf(Buffer.from('not a pdf at all'))).rejects.toMatchObject({
      codigo: 'nao_e_pdf',
    });
  });

  it('refuses a PDF over 5 MB before reading it', async () => {
    const grande = Buffer.alloc(LIMITE_PDF + 1);
    grande.write('%PDF-1.4');
    await expect(textoDoPdf(grande)).rejects.toBeInstanceOf(ErroImport);
    await expect(textoDoPdf(grande)).rejects.toMatchObject({ codigo: 'grande_demais' });
  });
});
