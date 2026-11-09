// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { entrar, importarCorpusDeArquivo, registrarConsentimento, sessaoDaConta } from '@/db';
import { fecharDb } from '@/db/client';

import { arquivoInventado } from './inventado';

/** The browser's cookies, as `next/headers` would read them in a request. */
const navegador = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) => (navegador.has(nome) ? { name: nome, value: navegador.get(nome) } : undefined),
    delete: () => {},
  }),
}));

const { COOKIE_CONTA } = await import('@/conta/acesso');
const { GET: baixar } = await import('@/app/casa/exportar/arquivo/route');

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);
beforeEach(() => navegador.clear());

let n = 0;
/** An invented person signed in with no subscription, whose Corpus has `empresa` in it. */
async function semAssinatura(empresa: string) {
  n += 1;
  const r = await entrar({ provedor: 'google', idNoProvedor: `exportar-${Date.now()}-${n}`, email: null, nome: 'Inventada' });
  if (r.tipo !== 'entrou') throw new Error(r.tipo);
  const sessao = (await sessaoDaConta(r.conta.id))!;
  await registrarConsentimento(sessao.id, 'v3', false);
  const arquivo = arquivoInventado();
  arquivo.affiliations[0].organizacao = empresa;
  await importarCorpusDeArquivo(sessao.id, JSON.stringify(arquivo));
  return r.acesso;
}

/** What `redirect()` throws: Next reads the digest. */
async function redireciona(promessa: Promise<unknown>): Promise<string> {
  const erro = (await promessa.then(
    () => null,
    (e: unknown) => e,
  )) as { digest?: string } | null;
  if (!erro?.digest?.startsWith('NEXT_REDIRECT')) throw new Error(`expected a redirect, got ${String(erro)}`);
  return erro.digest.split(';')[2];
}

describe.skipIf(semBanco)('Baixar meu Corpus', () => {
  it('an account without a subscription downloads its own Corpus, as an attachment without its name', async () => {
    navegador.set(COOKIE_CONTA, await semAssinatura('Padaria da Fulana'));
    const resposta = await baixar();

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('Content-Disposition')).toMatch(/^attachment; filename="corpus-sem-sotaque-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(resposta.headers.get('Cache-Control')).toBe('private, no-store');
    const arquivo = await resposta.json();
    expect(arquivo.formato).toBe('sem-sotaque/corpus');
    expect(arquivo.affiliations[0].organizacao).toBe('Padaria da Fulana');
  });

  it('an account never gets another’s', async () => {
    await semAssinatura('Empresa da Outra');
    navegador.set(COOKIE_CONTA, await semAssinatura('Empresa Minha'));
    const texto = await (await baixar()).text();
    expect(texto).toContain('Empresa Minha');
    expect(texto).not.toContain('Empresa da Outra');
  });

  it('signed out, it sends to the sign-in', async () => {
    expect(await redireciona(baixar())).toBe('/entrar');
  });
});
