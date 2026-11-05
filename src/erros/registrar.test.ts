// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, afterEach, describe, expect, inject, it, vi } from 'vitest';

import { eq, sql } from 'drizzle-orm';

import { ERROS_VALEM_A_PARTIR } from '@/conteudo/consentimento';
import { db, fecharDb } from '@/db/client';
import { apagarSessao, criarTester, limparErrosVencidos, registrarConsentimento } from '@/db';
import * as t from '@/db/schema';

import { registrarErro } from './index';

const semBanco = !inject('bancoDisponivel');
const ANTES = new Date(ERROS_VALEM_A_PARTIR.getTime() - 60_000);
const DEPOIS = new Date(ERROS_VALEM_A_PARTIR.getTime() + 60_000);
const DIA = 24 * 60 * 60 * 1000;

afterAll(fecharDb);
afterEach(() => vi.restoreAllMocks());

async function sessaoNa(versao: string) {
  const { sessao } = await criarTester({ apelido: 'Fulana Inventada', origem: 'teste' });
  await registrarConsentimento(sessao.id, versao, false);
  return sessao.id;
}

const errosDa = (sessaoId: string) => db().select().from(t.erros).where(eq(t.erros.sessaoId, sessaoId));
const erroComCurriculo = () => new TypeError('falhou em "Reduzi o fechamento da Padaria Fictícia de 2 h para 15 min"');

describe.skipIf(semBanco)('registrarErro', () => {
  it('records only the shape of the error, linked to the session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sessaoId = await sessaoNa('v4');

    await registrarErro({ origem: 'servidor', onde: 'import', erro: erroComCurriculo(), sessaoId }, { agora: ANTES, modo: 'hospedado' });

    const linhas = await errosDa(sessaoId);
    expect(linhas).toMatchObject([{ origem: 'servidor', onde: 'import', classe: 'TypeError', codigo: null, digest: null }]);
    expect(JSON.stringify(linhas)).not.toContain('Padaria');
  });

  it('keeps the console.error, with the message, for the container log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sessaoId = await sessaoNa('v4');

    await registrarErro({ origem: 'servidor', onde: 'import', erro: new Error('quebrou'), sessaoId, log: 'import failed:' }, { modo: 'hospedado' });

    expect(log).toHaveBeenCalledWith('import failed:', 'quebrou');
  });

  it('writes nothing in MODO=local: the terminal is the log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sessaoId = await sessaoNa('v4');

    await registrarErro({ origem: 'servidor', onde: 'import', erro: new Error('x'), sessaoId }, { agora: DEPOIS, modo: 'local' });

    expect(await errosDa(sessaoId)).toEqual([]);
    expect(log).toHaveBeenCalled();
  });

  it('records a v3 session only from the date the banner announced', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sessaoId = await sessaoNa('v3');

    await registrarErro({ origem: 'servidor', onde: 'turno', erro: new Error('x'), sessaoId }, { agora: ANTES, modo: 'hospedado' });
    expect(await errosDa(sessaoId)).toEqual([]);

    await registrarErro({ origem: 'servidor', onde: 'turno', erro: new Error('x'), sessaoId }, { agora: DEPOIS, modo: 'hospedado' });
    expect(await errosDa(sessaoId)).toHaveLength(1);
  });

  it('records an error without a session (OAuth, Stripe) with a null session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const digest = `oauth-${Date.now()}`;

    await registrarErro({ origem: 'servidor', onde: 'oauth', erro: new Error('x'), digest }, { agora: ANTES, modo: 'hospedado' });

    const linhas = await db().select().from(t.erros).where(eq(t.erros.digest, digest));
    expect(linhas).toMatchObject([{ sessaoId: null, onde: 'oauth' }]);
  });

  it('records nothing for an erased session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sessaoId = await sessaoNa('v4');
    await apagarSessao(sessaoId);

    await registrarErro({ origem: 'servidor', onde: 'geracao', erro: new Error('x'), sessaoId }, { modo: 'hospedado' });

    expect(await errosDa(sessaoId)).toEqual([]);
  });

  it('never throws when the write fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      registrarErro({ origem: 'servidor', onde: 'import', erro: new Error('x'), sessaoId: 'nao-e-um-uuid' }, { modo: 'hospedado' }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(2);
  });
});

describe.skipIf(semBanco)('limparErrosVencidos', () => {
  it('deletes the errors older than 90 days, with or without a session', async () => {
    const sessaoId = await sessaoNa('v4');
    const agora = new Date();
    const linha = (dias: number, sessao: string | null) => ({
      sessaoId: sessao,
      origem: 'servidor' as const,
      onde: 'limpeza',
      classe: 'Error',
      createdAt: new Date(agora.getTime() - dias * DIA),
    });
    await db().insert(t.erros).values([linha(91, sessaoId), linha(91, null), linha(89, sessaoId)]);

    await limparErrosVencidos(agora);

    const ficaram = await db().select().from(t.erros).where(sql`${t.erros.onde} = 'limpeza'`);
    expect(ficaram).toHaveLength(1);
    expect(ficaram[0].createdAt.getTime()).toBe(agora.getTime() - 89 * DIA);
  });
});
