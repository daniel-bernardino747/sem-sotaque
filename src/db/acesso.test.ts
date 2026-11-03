// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, describe, expect, inject, it } from 'vitest';

import { sql } from 'drizzle-orm';

import { db, fecharDb } from './client';
import {
  apagarSessao,
  criarTester,
  registrarAbertura,
  reaceitarConsentimento,
  registrarConsentimento,
  sessaoPorToken,
  situacaoDoLink,
} from './index';
import * as t from './schema';

const semBanco = !inject('bancoDisponivel');

afterAll(fecharDb);

async function eventosDa(sessaoId: string) {
  return db().select().from(t.eventos).where(sql`sessao_id = ${sessaoId}`).orderBy(t.eventos.createdAt);
}

describe.skipIf(semBanco)('acesso', () => {
  describe('o link do v0', () => {
    it('finds a live session', async () => {
      const { token, sessao } = await criarTester({ apelido: 'Ciclana', origem: 'LinkedIn' });
      expect(await sessaoPorToken(token)).toMatchObject({ sessao: { id: sessao.id } });
      expect(await situacaoDoLink(token, null)).toBe('vincular');
    });

    it('knows an erased token without keeping the token itself', async () => {
      const { token, sessao } = await criarTester({ apelido: 'Apagada', origem: 'LinkedIn' });
      await apagarSessao(sessao.id);

      expect(await situacaoDoLink(token, null)).toBe('apagado');

      const [linha] = await db().select().from(t.sessoes).where(sql`id = ${sessao.id}`);
      expect(JSON.stringify(linha)).not.toContain(token);
    });

    it('finds nothing for a token that never existed', async () => {
      expect(await situacaoDoLink('nunca-existiu', null)).toBe('nao_existe');
    });

    it('keeps the token out of the error when the query fails', async () => {
      // Postgres refuses a NUL byte in text, and a URL can carry one (%00).
      const token = 'segredo-do-link\u0000';
      const erro = await sessaoPorToken(token).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(Error);
      expect(String((erro as Error).message)).not.toContain('segredo-do-link');
      expect(JSON.stringify(erro)).not.toContain('segredo-do-link');
      expect((erro as Error).cause).toBeUndefined();
    });
  });

  describe('registrarAbertura', () => {
    it('records link_aberto only the first time', async () => {
      const { sessao } = await criarTester({ apelido: 'Abre', origem: 'LinkedIn' });
      // Two tabs opening the link for the first time at once.
      await Promise.all([1, 2, 3, 4].map(() => registrarAbertura(sessao.id)));
      await registrarAbertura(sessao.id);
      expect((await eventosDa(sessao.id)).map((e) => e.tipo)).toEqual(['link_aberto']);
    });

    it('records nothing for an erased session', async () => {
      const { sessao } = await criarTester({ apelido: 'Tarde', origem: 'LinkedIn' });
      await apagarSessao(sessao.id);
      await registrarAbertura(sessao.id);
      expect((await eventosDa(sessao.id)).map((e) => e.tipo)).toEqual(['apagou']);
    });
  });

  describe('registrarConsentimento', () => {
    it('moves a new session to consentiu, with the date, the text version and the event', async () => {
      const { sessao } = await criarTester({ apelido: 'Aceita', origem: 'LinkedIn' });
      const depois = await registrarConsentimento(sessao.id, 'v1');

      expect(depois).toMatchObject({ estado: 'consentiu', textoConsentimentoVersao: 'v1' });
      expect(depois.consentiuEm).toBeInstanceOf(Date);
      expect((await eventosDa(sessao.id)).map((e) => e.tipo)).toEqual(['consentiu']);
    });

    it('does nothing the second time, nor to a session already past consent', async () => {
      const { sessao } = await criarTester({ apelido: 'Duas', origem: 'LinkedIn' });
      const primeira = await registrarConsentimento(sessao.id, 'v1');
      const segunda = await registrarConsentimento(sessao.id, 'v2');
      expect(segunda).toEqual(primeira);

      await db().update(t.sessoes).set({ estado: 'interrogando' }).where(sql`id = ${sessao.id}`);
      const adiante = await registrarConsentimento(sessao.id, 'v2');
      expect(adiante.estado).toBe('interrogando');
      expect((await eventosDa(sessao.id)).map((e) => e.tipo)).toEqual(['consentiu']);
    });
  });

  describe('reaceitarConsentimento', () => {
    async function emInterrogatorioComV1() {
      const { sessao } = await criarTester({ apelido: 'Antiga', origem: 'LinkedIn' });
      await registrarConsentimento(sessao.id, 'v1');
      await db().update(t.sessoes).set({ estado: 'interrogando' }).where(sql`id = ${sessao.id}`);
      return sessao.id;
    }

    it('moves a v1 session mid-interrogation to v2, with an event that says it was a second acceptance', async () => {
      const id = await emInterrogatorioComV1();
      const depois = await reaceitarConsentimento(id, 'v2', true);
      expect(depois).toMatchObject({ estado: 'interrogando', textoConsentimentoVersao: 'v2', recusouAvaliadorEm: null });
      expect((await eventosDa(id)).map((e) => [e.tipo, e.dados])).toEqual([
        ['consentiu', { versao: 'v1' }],
        ['consentiu', { versao: 'v2', reaceite: true }],
      ]);
    });

    it('records a no, keeps v1, and asks nothing again', async () => {
      const id = await emInterrogatorioComV1();
      const depois = await reaceitarConsentimento(id, 'v2', false);
      expect(depois).toMatchObject({ textoConsentimentoVersao: 'v1' });
      expect(depois.recusouAvaliadorEm).toBeInstanceOf(Date);
      const deNovo = await reaceitarConsentimento(id, 'v2', true);
      expect(deNovo.textoConsentimentoVersao).toBe('v1');
    });

    it('changes nothing in a session that is not in the interrogation', async () => {
      const { sessao } = await criarTester({ apelido: 'Nova', origem: 'LinkedIn' });
      await registrarConsentimento(sessao.id, 'v1');
      expect((await reaceitarConsentimento(sessao.id, 'v2', true)).textoConsentimentoVersao).toBe('v1');
    });
  });
});
