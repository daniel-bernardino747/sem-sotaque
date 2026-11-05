// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ErroImport } from '@/import/texto';
import { ErroLlm } from '@/llm/cliente';

import { CAMPOS_PERMITIDOS, formaDoErro, soPermitidos } from './forma';

/** A résumé line of an invented person, the kind of text a zod or model message carries. */
const CURRICULO = 'Reduzi o tempo de fechamento da Padaria Fictícia de 2 h para 15 min';

describe('formaDoErro', () => {
  it('keeps the class and drops the message and the stack, even when they carry résumé text', () => {
    const erro = new TypeError(`cannot read "${CURRICULO}"`);
    const forma = formaDoErro({ origem: 'servidor', onde: 'import', erro });

    expect(forma).toEqual({ origem: 'servidor', onde: 'import', classe: 'TypeError', codigo: null, digest: null });
    expect(JSON.stringify(forma)).not.toContain('Padaria');
  });

  it('drops a zod error message, which quotes the input', () => {
    const lido = z.object({ bullet: z.number() }).safeParse({ bullet: CURRICULO });
    const forma = formaDoErro({ origem: 'servidor', onde: 'geracao', erro: lido.error });

    expect(forma.classe).toBe('ZodError');
    expect(JSON.stringify(forma)).not.toContain('Padaria');
  });

  it("keeps the ErroLlm's motivo as the code", () => {
    const erro = new ErroLlm('teto', `session spending cap reached; ${CURRICULO}`);
    expect(formaDoErro({ origem: 'servidor', onde: 'turno', erro })).toMatchObject({ classe: 'ErroLlm', codigo: 'teto' });
  });

  it("keeps the ErroImport's codigo: what the person sent, never the text", () => {
    expect(formaDoErro({ origem: 'servidor', onde: 'import', erro: new ErroImport('sem_texto') })).toMatchObject({ classe: 'ErroImport', codigo: 'sem_texto' });
  });

  it('keeps an HTTP status, and a short code such as Postgres or Node give', () => {
    const http = Object.assign(new Error('Bad Request'), { status: 400 });
    const pg = Object.assign(new Error(CURRICULO), { code: '23505' });
    expect(formaDoErro({ origem: 'servidor', onde: 'stripe', erro: http }).codigo).toBe('400');
    expect(formaDoErro({ origem: 'servidor', onde: 'import', erro: pg }).codigo).toBe('23505');
  });

  it('drops a code that is not a short token', () => {
    const erro = Object.assign(new Error('x'), { code: CURRICULO });
    expect(formaDoErro({ origem: 'servidor', onde: 'import', erro }).codigo).toBeNull();
  });

  it("keeps Next's digest, from the error or given", () => {
    const erro = Object.assign(new Error('x'), { digest: '2938471923' });
    expect(formaDoErro({ origem: 'servidor', onde: 'requisicao', erro }).digest).toBe('2938471923');
    expect(formaDoErro({ origem: 'navegador', onde: '/casa', erro: 'boom', digest: 'abc' }).digest).toBe('abc');
  });

  it('names what is thrown without being an Error by its type, never its value', () => {
    expect(formaDoErro({ origem: 'servidor', onde: 'oauth', erro: CURRICULO }).classe).toBe('string');
    expect(formaDoErro({ origem: 'servidor', onde: 'oauth', erro: null }).classe).toBe('null');
  });
});

describe('soPermitidos', () => {
  it('keeps only the allowed fields, as short strings', () => {
    const registro = soPermitidos({
      origem: 'navegador',
      onde: '/casa',
      classe: 'TypeError',
      codigo: 'janela',
      digest: null,
      mensagem: CURRICULO,
      stack: `at ${CURRICULO}`,
      ip: '10.0.0.1',
    });
    expect(Object.keys(registro).sort()).toEqual([...CAMPOS_PERMITIDOS].sort());
    expect(JSON.stringify(registro)).not.toContain('Padaria');
    expect(registro).toMatchObject({ origem: 'navegador', onde: '/casa', classe: 'TypeError', codigo: 'janela', digest: null });
  });

  it('cuts a field that is too long', () => {
    expect(soPermitidos({ origem: 'servidor', onde: 'x'.repeat(500), classe: 'E' }).onde).toHaveLength(80);
  });
});
