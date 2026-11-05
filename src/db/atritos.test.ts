// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, describe, expect, inject, it } from 'vitest';

import { and, eq } from 'drizzle-orm';

import { ERROS_VALEM_A_PARTIR } from '../conteudo/consentimento';

import { db, fecharDb } from './client';
import { criarTester, registrarAtrito, registrarConsentimento, TURNO_OCUPADO_JANELA_MS } from './index';
import * as t from './schema';

const semBanco = !inject('bancoDisponivel');
const ANTES = new Date(ERROS_VALEM_A_PARTIR.getTime() - 60_000);

afterAll(fecharDb);

async function sessaoNa(versao: string) {
  const { sessao } = await criarTester({ apelido: 'Fulano Inventado', origem: 'teste' });
  await registrarConsentimento(sessao.id, versao, false);
  return sessao.id;
}

const atritosDa = (sessaoId: string, tipo: 'tentou_de_novo' | 'turno_ocupado') =>
  db().select().from(t.eventos).where(and(eq(t.eventos.sessaoId, sessaoId), eq(t.eventos.tipo, tipo)));

describe.skipIf(semBanco)('registrarAtrito', () => {
  it('records "tentou de novo" with where it was tapped', async () => {
    const sessaoId = await sessaoNa('v4');
    await registrarAtrito(sessaoId, 'tentou_de_novo', { onde: 'resultado' });
    await registrarAtrito(sessaoId, 'tentou_de_novo', { onde: 'resultado' });

    expect(await atritosDa(sessaoId, 'tentou_de_novo')).toMatchObject([{ dados: { onde: 'resultado' } }, { dados: { onde: 'resultado' } }]);
  });

  it('counts "turno ocupado" at most once per 10 s per session', async () => {
    const sessaoId = await sessaoNa('v4');
    const agora = new Date();
    const logo = new Date(agora.getTime() + TURNO_OCUPADO_JANELA_MS - 1000);
    const depois = new Date(agora.getTime() + TURNO_OCUPADO_JANELA_MS + 1000);

    expect(await registrarAtrito(sessaoId, 'turno_ocupado', {}, agora)).toBe(true);
    expect(await registrarAtrito(sessaoId, 'turno_ocupado', {}, logo)).toBe(false);
    expect(await registrarAtrito(sessaoId, 'turno_ocupado', {}, depois)).toBe(true);
    expect(await atritosDa(sessaoId, 'turno_ocupado')).toHaveLength(2);
  });

  it('records nothing for a v3 session before the date', async () => {
    const sessaoId = await sessaoNa('v3');
    await registrarAtrito(sessaoId, 'tentou_de_novo', { onde: 'chat' }, ANTES);
    await registrarAtrito(sessaoId, 'turno_ocupado', {}, ANTES);

    expect(await atritosDa(sessaoId, 'tentou_de_novo')).toEqual([]);
    expect(await atritosDa(sessaoId, 'turno_ocupado')).toEqual([]);
  });
});
