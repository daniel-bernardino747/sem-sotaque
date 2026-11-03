// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The resume as text, from either door: an uploaded PDF (through `pdftotext
 * -layout`, which is in the image) or text the person pasted. Both come out
 * through `normalizarTexto`, so the extraction reads the same thing either way.
 *
 * The PDF itself is never kept: it lives in a temporary directory for the
 * length of the `pdftotext` run and is deleted in `finally`.
 */
import { execFile, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { LIMITE_PDF } from './limites';

const execFileAsync = promisify(execFile);

export { LIMITE_PDF };
/** Under this, there is nothing to extract: a scan, or a stray paste. */
const MINIMO_CARACTERES = 80;
/** A long resume plus a LinkedIn profile fits with room to spare. */
const MAXIMO_CARACTERES = 40_000;

export type CodigoErroImport = 'grande_demais' | 'nao_e_pdf' | 'sem_texto' | 'curto' | 'longo';

/** A problem with what the person sent, with the message to show them. */
export class ErroImport extends Error {
  constructor(readonly codigo: CodigoErroImport) {
    super(MENSAGENS[codigo]);
    this.name = 'ErroImport';
  }
}

const MENSAGENS: Record<CodigoErroImport, string> = {
  grande_demais: 'O PDF passa de 5 MB. Tente exportar de novo ou cole o texto do currículo.',
  nao_e_pdf: 'Esse arquivo não é um PDF. Envie o PDF do currículo ou cole o texto.',
  sem_texto:
    'Não consegui ler texto nesse PDF: ele parece ser uma imagem escaneada. Cole o texto do currículo na caixa de texto.',
  curto: 'O texto está curto demais para ser um currículo. Cole o currículo inteiro.',
  longo: 'O texto está longo demais. Cole só o currículo, ou só o "Sobre" e as experiências do LinkedIn.',
};

export function normalizarTexto(texto: string): string {
  return texto
    .replace(/\r\n?/g, '\n')
    .replace(/[\f\u0000]/g, '\n')
    .split('\n')
    .map((linha) => linha.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function conferirTamanho(texto: string, codigoCurto: CodigoErroImport): string {
  if (texto.length < MINIMO_CARACTERES) throw new ErroImport(codigoCurto);
  if (texto.length > MAXIMO_CARACTERES) throw new ErroImport('longo');
  return texto;
}

export function textoColado(texto: string): string {
  return conferirTamanho(normalizarTexto(texto), 'curto');
}

export function pdftotextDisponivel(): boolean {
  // `pdftotext -v` exits 99 on purpose; only a spawn error means it is missing.
  return spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).error === undefined;
}

export async function textoDoPdf(pdf: Buffer): Promise<string> {
  if (pdf.length > LIMITE_PDF) throw new ErroImport('grande_demais');
  if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new ErroImport('nao_e_pdf');

  const dir = await mkdtemp(join(tmpdir(), 'sem-sotaque-import-'));
  try {
    const caminho = join(dir, 'curriculo.pdf');
    await writeFile(caminho, pdf);
    let saida: string;
    try {
      ({ stdout: saida } = await execFileAsync(
        'pdftotext',
        ['-layout', '-enc', 'UTF-8', caminho, '-'],
        { encoding: 'utf8', timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
      ));
    } catch {
      // pdftotext refuses what it cannot parse: for the person, it is not a PDF.
      throw new ErroImport('nao_e_pdf');
    }
    return conferirTamanho(normalizarTexto(saida), 'sem_texto');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
