// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { assinarConta } from '@/assinatura/falso';
import { entrar, sessaoDaConta } from '@/db';
import { fecharDb } from '@/db/client';

/** The browser's cookies, as `next/headers` would read them in a request. */
const navegador = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) => (navegador.has(nome) ? { name: nome, value: navegador.get(nome) } : undefined),
  }),
}));

const { COOKIE_CONTA } = await import('./acesso');
const { aceitarConsentimento, mudarLeitura } = await import('@/app/casa/acoes');
const { sessaoParaPainel } = await import('@/admin/sessao');

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);
beforeEach(() => navegador.clear());

/** What `redirect()` throws: Next reads the digest. */
async function destino(promessa: Promise<unknown>): Promise<string | unknown> {
  try {
    return await promessa;
  } catch (e) {
    const digest = (e as { digest?: string }).digest;
    if (digest?.startsWith('NEXT_REDIRECT')) return `redirect ${digest.split(';')[2]}`;
    throw e;
  }
}

let n = 0;
/** An invented person, signed in and subscribed, at the consent. */
async function entrou() {
  n += 1;
  const r = await entrar({ provedor: 'google', idNoProvedor: `leitura-${Date.now()}-${n}`, email: null, nome: 'Inventada' });
  if (r.tipo !== 'entrou') throw new Error(r.tipo);
  await assinarConta(r.conta.id);
  navegador.set(COOKIE_CONTA, r.acesso);
  return r.conta;
}

const formulario = (campos: Record<string, string>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.set(k, v);
  return form;
};

describe.skipIf(semBanco)('o opt-in de leitura', () => {
  it('the consent alone does not let Daniel read', async () => {
    const conta = await entrou();
    expect(await destino(aceitarConsentimento(formulario({ aceito: 'sim' })))).toBe('redirect /casa');
    const sessao = await sessaoDaConta(conta.id);
    expect(sessao?.estado).toBe('consentiu');
    expect(sessao?.textoConsentimentoVersao).toBe('v3');
    expect(sessao?.podeLerEm).toBeNull();
  });

  it('the separate box, ticked, does', async () => {
    const conta = await entrou();
    await destino(aceitarConsentimento(formulario({ aceito: 'sim', pode_ler: 'sim' })));
    expect((await sessaoDaConta(conta.id))?.podeLerEm).toBeInstanceOf(Date);
  });

  it('the box without the consent changes nothing', async () => {
    const conta = await entrou();
    await destino(aceitarConsentimento(formulario({ pode_ler: 'sim' })));
    const sessao = await sessaoDaConta(conta.id);
    expect(sessao?.estado).toBe('novo');
    expect(sessao?.podeLerEm).toBeNull();
  });

  it('at home, turning it on opens the panel and turning it off closes it again', async () => {
    const conta = await entrou();
    await destino(aceitarConsentimento(formulario({ aceito: 'sim' })));
    const id = (await sessaoDaConta(conta.id))!.id;
    expect((await sessaoParaPainel(id))?.conteudo).toBeNull();

    expect(await destino(mudarLeitura(formulario({ leitura: 'ligar' })))).toBe('redirect /casa');
    expect((await sessaoParaPainel(id))?.conteudo).not.toBeNull();

    expect(await destino(mudarLeitura(formulario({ leitura: 'desligar' })))).toBe('redirect /casa');
    expect((await sessaoParaPainel(id))?.conteudo).toBeNull();
  });

  it('signed out, the switch sends to /entrar and changes nothing', async () => {
    expect(await destino(mudarLeitura(formulario({ leitura: 'ligar' })))).toBe('redirect /entrar');
  });
});
