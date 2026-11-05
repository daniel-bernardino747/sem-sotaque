// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { assinarConta } from '@/assinatura/falso';
import { entrar, registrarConsentimento, sessaoDaConta } from '@/db';
import { db, fecharDb } from '@/db/client';
import * as t from '@/db/schema';

/** The browser's cookies, as `next/headers` would read them in a request. */
const navegador = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) => (navegador.has(nome) ? { name: nome, value: navegador.get(nome) } : undefined),
  }),
}));

const { COOKIE_CONTA } = await import('@/conta/acesso');
const { enviarCurriculo } = await import('@/app/casa/acoes');

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);
beforeEach(() => navegador.clear());

describe.skipIf(semBanco)('os erros do servidor', () => {
  it('a broken file at the import is recorded with its stage and code, and the form still says what to do', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await entrar({ provedor: 'github', idNoProvedor: `servidor-${Date.now()}`, email: null, nome: 'Inventada' });
    if (r.tipo !== 'entrou') throw new Error(r.tipo);
    await assinarConta(r.conta.id);
    navegador.set(COOKIE_CONTA, r.acesso);
    const sessao = (await sessaoDaConta(r.conta.id))!;
    await registrarConsentimento(sessao.id, 'v4', false);

    const form = new FormData();
    form.set('pdf', new File([Buffer.from('isto não é um pdf')], 'cv.pdf', { type: 'application/pdf' }));
    const estado = await enviarCurriculo({ erro: null, texto: '' }, form);

    expect(estado.erro).toContain('não é um PDF');
    expect(await db().select().from(t.erros).where(eq(t.erros.sessaoId, sessao.id))).toMatchObject([
      { origem: 'servidor', onde: 'import', classe: 'ErroImport', codigo: 'nao_e_pdf' },
    ]);
  });
});
