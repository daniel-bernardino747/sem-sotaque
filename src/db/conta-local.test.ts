// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, describe, expect, inject, it } from 'vitest';

import { antesDaCasa } from '@/sessao/tela';

import { apagarSessao, contaLocal, criarVaga, sessaoDaConta } from '.';
import { fecharDb } from './client';

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);

describe.skipIf(semBanco)('contaLocal (MODO=local)', () => {
  it('is one account, the same on every call, even two at once', async () => {
    const [a, b] = await Promise.all([contaLocal(), contaLocal()]);
    const c = await contaLocal();
    expect(a.id).toBe(b.id);
    expect(c.id).toBe(a.id);
    expect(a.provedor).toBe('local');
  });

  it('comes with a session past the consent: the home opens, and the Vagas need no consent and have no limit', async () => {
    const sessao = (await sessaoDaConta((await contaLocal()).id))!;
    expect(sessao).not.toBeNull();
    expect(antesDaCasa(sessao)).toBeNull();
    expect(sessao.textoConsentimentoVersao).toBe('local');
    expect(sessao.vagasConsentiuEm).not.toBeNull();
    expect(sessao.limiteVagas).toBeGreaterThan(1_000_000);
    const criacao = await criarVaga(sessao.id, { texto: 'Acme is hiring a Backend Engineer.', empresa: null, cargo: null, link: null });
    expect(criacao.tipo).toBe('criada');
  });

  it('after erasing the data, the next access starts over with a new one', async () => {
    const antes = await contaLocal();
    const sessao = (await sessaoDaConta(antes.id))!;
    await apagarSessao(sessao.id);
    const depois = await contaLocal();
    expect(depois.id).not.toBe(antes.id);
    expect((await sessaoDaConta(depois.id))?.id).not.toBe(sessao.id);
  });
});
