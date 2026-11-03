// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import { assinarConta } from '@/assinatura/falso';
import { criarVaga, entrar, responderConsentimentoVagas, sessaoDaConta } from '@/db';
import { db, fecharDb } from '@/db/client';
import * as t from '@/db/schema';

/** The browser's cookies, as `next/headers` would read them in a request. */
const navegador = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) => (navegador.has(nome) ? { name: nome, value: navegador.get(nome) } : undefined),
  }),
}));

const { COOKIE_CONTA } = await import('./acesso');
const { sessaoDaRota, vagaDaRota } = await import('@/app/casa/_sessao');
const { GET: pdfDaVaga } = await import('@/app/casa/vagas/[id]/pdf/route');

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);
beforeEach(() => navegador.clear());

/** What `redirect()` and `notFound()` throw: Next reads the digest. */
async function interrompe(promessa: Promise<unknown>): Promise<string> {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  );
  const digest = (erro as { digest?: string } | null)?.digest;
  if (!digest) throw new Error(`expected a redirect or a 404, got ${String(erro)}`);
  if (digest.startsWith('NEXT_REDIRECT')) return `redirect ${digest.split(';')[2]}`;
  if (digest === 'NEXT_HTTP_ERROR_FALLBACK;404') return '404';
  return digest;
}

let n = 0;
/** An invented person, signed in, past the interrogation, with one Vaga. */
async function pessoaComVaga() {
  n += 1;
  const r = await entrar({ provedor: 'github', idNoProvedor: `rotas-${Date.now()}-${n}`, email: null, nome: 'Inventada' });
  if (r.tipo !== 'entrou') throw new Error(r.tipo);
  await assinarConta(r.conta.id);
  const sessao = (await sessaoDaConta(r.conta.id))!;
  await db()
    .update(t.sessoes)
    .set({ estado: 'pronto', consentiuEm: new Date(), textoConsentimentoVersao: 'v2' })
    .where(eq(t.sessoes.id, sessao.id));
  await responderConsentimentoVagas(sessao.id, true);
  const criacao = await criarVaga(sessao.id, { texto: 'Acme is hiring a Backend Engineer.', empresa: null, cargo: null, link: null });
  if (criacao.tipo !== 'criada') throw new Error(criacao.tipo);
  return { acesso: r.acesso, sessaoId: sessao.id, vagaId: criacao.vaga.id };
}

const pedirPdf = (vagaId: string) =>
  pdfDaVaga(new Request(`http://localhost:3000/casa/vagas/${vagaId}/pdf`), { params: Promise.resolve({ id: vagaId }) });

describe.skipIf(semBanco)('as rotas atrás do login', () => {
  it('without signing in, a route sends to /entrar', async () => {
    const { vagaId } = await pessoaComVaga();
    expect(await interrompe(sessaoDaRota())).toBe('redirect /entrar');
    expect(await interrompe(vagaDaRota(vagaId))).toBe('redirect /entrar');
    expect(await interrompe(pedirPdf(vagaId))).toBe('redirect /entrar');
  });

  it('a cookie that no longer signs in anyone is the same as none', async () => {
    const { vagaId } = await pessoaComVaga();
    navegador.set(COOKIE_CONTA, 'cookie-velho');
    expect(await interrompe(vagaDaRota(vagaId))).toBe('redirect /entrar');
  });

  it('signed in, the Vaga is there', async () => {
    const { acesso, sessaoId, vagaId } = await pessoaComVaga();
    navegador.set(COOKIE_CONTA, acesso);
    expect((await sessaoDaRota()).id).toBe(sessaoId);
    expect(await vagaDaRota(vagaId)).toMatchObject({ sessao: { id: sessaoId }, vaga: { id: vagaId } });
  });

  it("another account's Vaga is a 404", async () => {
    const dona = await pessoaComVaga();
    const outra = await pessoaComVaga();
    navegador.set(COOKIE_CONTA, outra.acesso);
    expect(await interrompe(vagaDaRota(dona.vagaId))).toBe('404');
    expect((await pedirPdf(dona.vagaId)).status).toBe(404);
  });

  it('before the consent, a route below the home goes to the home', async () => {
    const r = await entrar({ provedor: 'google', idNoProvedor: `rotas-novo-${Date.now()}`, email: null, nome: null });
    if (r.tipo !== 'entrou') throw new Error(r.tipo);
    await assinarConta(r.conta.id);
    navegador.set(COOKIE_CONTA, r.acesso);
    expect(await interrompe(sessaoDaRota())).toBe('redirect /casa');
  });
});
