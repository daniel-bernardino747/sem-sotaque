// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, describe, expect, inject, it } from 'vitest';

import { db, fecharDb } from './client';
import { apagarSessao, configuracaoDaInstancia, criarTester, gravarConfiguracao } from './index';
import * as t from './schema';

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);

// The only file that writes the instance's one row: the tests here run in order.
describe.skipIf(semBanco)('a configuração da instância', () => {
  it('is the API key until something is saved', async () => {
    await db().delete(t.configuracao);
    expect(await configuracaoDaInstancia()).toEqual({ caminho: 'api', modeloCodex: null });
  });

  it('keeps the last choice, in one row', async () => {
    await gravarConfiguracao({ caminho: 'assinatura_chatgpt', modeloCodex: 'um-modelo' });
    await gravarConfiguracao({ caminho: 'assinatura_claude', modeloCodex: null });
    expect(await configuracaoDaInstancia()).toEqual({ caminho: 'assinatura_claude', modeloCodex: null });
    expect(await db().select().from(t.configuracao)).toHaveLength(1);
  });

  it('a blank Codex model is the Codex default', async () => {
    await gravarConfiguracao({ caminho: 'assinatura_chatgpt', modeloCodex: '   ' });
    expect(await configuracaoDaInstancia()).toEqual({ caminho: 'assinatura_chatgpt', modeloCodex: null });
  });

  it('is the instance’s: erasing a person’s data leaves it', async () => {
    const { sessao } = await criarTester({ apelido: 'Inventada', origem: 'teste' });
    await gravarConfiguracao({ caminho: 'assinatura_claude', modeloCodex: null });
    await apagarSessao(sessao.id);
    expect((await configuracaoDaInstancia()).caminho).toBe('assinatura_claude');
  });
});
