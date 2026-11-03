// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq } from 'drizzle-orm';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, inject, it, vi } from 'vitest';

import { assinarConta } from '@/assinatura/falso';
import { COOKIE_CONTA } from '@/conta/acesso';
import { lerOpiniao } from '@/sessao/fechamento';

/** The browser's cookies, as `next/headers` would read them in a request. */
const navegador = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) => (navegador.has(nome) ? { name: nome, value: navegador.get(nome) } : undefined),
  }),
}));
const { GET: baixarPdf } = await import('@/app/casa/pdf/route');
const { POST: sairDaSecao } = await import('@/app/casa/fim/route');
const { FimDaSessao } = await import('@/app/casa/_telas/fim-da-sessao');

import { db, fecharDb } from './client';
import {
  apagarSessao,
  criarTester,
  encerrarSessao,
  entrar,
  fechamentoDaSessao,
  gravarOpiniao,
  registrarConsentimento,
  registrarIndicacoes,
  sessaoPorId,
} from './index';
import * as t from './schema';

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);

/** A session whose résumé was delivered (`pronto`): consented at the entry, header, PDF. */
async function sessaoPronta() {
  const criado = await criarTester({ apelido: 'Fim Inventada', origem: 'teste' });
  const sessaoId = criado.sessao.id;
  await registrarConsentimento(sessaoId, 'v1');
  const [selection] = await db().insert(t.selections).values({ sessaoId, json: { x: 1 }, aprovada: true }).returning();
  await db().insert(t.renders).values({ selectionId: selection.id, pdf: Buffer.from('%PDF-1.7 fim'), medida: { pages: 1 } });
  await db().insert(t.cabecalhos).values({
    sessaoId,
    nome: 'Fim Inventada',
    email: 'fim@example.com',
    linkedin: 'linkedin.com/in/fim',
    local: 'Recife, Brazil',
  });
  await db().insert(t.geracoes).values({ sessaoId, versao: 1, selectionId: selection.id });
  await db().update(t.sessoes).set({ estado: 'pronto' }).where(eq(t.sessoes.id, sessaoId));
  return { ...criado, sessaoId };
}

const estado = async (sessaoId: string) =>
  (await db().select({ estado: t.sessoes.estado }).from(t.sessoes).where(eq(t.sessoes.id, sessaoId)))[0].estado;
const eventos = (sessaoId: string) =>
  db().select({ tipo: t.eventos.tipo, dados: t.eventos.dados }).from(t.eventos).where(eq(t.eventos.sessaoId, sessaoId)).orderBy(t.eventos.createdAt);
/** Signs in, through the session's old link, as the person who owns it, subscribed (step 21). */
async function entrarNa(token: string) {
  const r = await entrar({ provedor: 'github', idNoProvedor: `fim-${token}`, email: null, nome: null }, { vincular: token });
  if (r.tipo !== 'entrou') throw new Error(r.tipo);
  await assinarConta(r.conta.id);
  navegador.set(COOKIE_CONTA, r.acesso);
}

describe.skipIf(semBanco)('o fim da sessão', () => {
  it('for who pays (step 22): the referral and the testimonial, without the founder price or "pagaria?"', async () => {
    const { sessaoId } = await sessaoPronta();
    const html = renderToStaticMarkup(await FimDaSessao({ sessao: (await sessaoPorId(sessaoId))! }));
    expect(html).toContain('name="contato"');
    expect(html).toContain('name="depoimento_pode_usar"');
    expect(html).not.toMatch(/fundador|Garantir meu preço|name="whatsapp"/i);
    expect(html).not.toMatch(/pagaria|de graça/i);
  });

  it('records every referral and an indicou event with how many, never who', async () => {
    const { sessaoId } = await sessaoPronta();
    await registrarIndicacoes(sessaoId, [
      { nome: 'Beto Inventado', contato: '11 98888-0000' },
      { nome: 'Carla Inventada', contato: 'linkedin.com/in/carla' },
    ]);
    await registrarIndicacoes(sessaoId, [{ nome: 'Duda Inventada', contato: '21 97777-0000' }]);

    const linhas = await db().select().from(t.indicacoes).where(eq(t.indicacoes.sessaoId, sessaoId));
    expect(linhas.map((l) => l.nome).sort()).toEqual(['Beto Inventado', 'Carla Inventada', 'Duda Inventada']);
    expect((await fechamentoDaSessao(sessaoId)).indicacoes).toBe(3);
    const indicou = (await eventos(sessaoId)).filter((e) => e.tipo === 'indicou');
    expect(indicou.map((e) => e.dados)).toEqual([{ quantas: 2 }, { quantas: 1 }]);
    expect(JSON.stringify(indicou)).not.toContain('Inventad');
    expect(await estado(sessaoId)).toBe('encerrado');
  });

  it('records the testimonial and the comment in fechamento', async () => {
    const { sessaoId } = await sessaoPronta();
    const f = new FormData();
    f.set('depoimento', 'Gostei das perguntas.');
    f.set('depoimento_pode_usar', 'sim');
    f.set('comentario', 'O PDF demorou.');
    const lido = lerOpiniao(f);
    if (!lido.ok) throw new Error(lido.erro);
    await gravarOpiniao(sessaoId, lido.dados);

    expect((await fechamentoDaSessao(sessaoId)).fechamento).toMatchObject({
      fundador: false,
      pagaria: null,
      depoimento: 'Gostei das perguntas.',
      depoimentoPodeUsar: true,
      comentario: 'O PDF demorou.',
    });
  });

  it('keeps the testimonial private when only the entry consent was given', async () => {
    const { sessaoId } = await sessaoPronta();
    const [sessao] = await db().select().from(t.sessoes).where(eq(t.sessoes.id, sessaoId));
    expect(sessao.consentiuEm).toBeInstanceOf(Date);

    const f = new FormData();
    f.set('depoimento', 'Pode melhorar.');
    const lido = lerOpiniao(f);
    if (!lido.ok) throw new Error(lido.erro);
    await gravarOpiniao(sessaoId, lido.dados);

    expect((await fechamentoDaSessao(sessaoId)).fechamento).toMatchObject({ depoimento: 'Pode melhorar.', depoimentoPodeUsar: false });
  });

  it('writes nothing before the résumé was delivered or after the data was erased', async () => {
    const gerando = await criarTester({ apelido: 'Gerando', origem: 'teste' });
    await db().update(t.sessoes).set({ estado: 'gerando' }).where(eq(t.sessoes.id, gerando.sessao.id));
    expect(await registrarIndicacoes(gerando.sessao.id, [{ nome: 'X', contato: 'y' }])).toBe(false);
    await encerrarSessao(gerando.sessao.id);
    expect(await estado(gerando.sessao.id)).toBe('gerando');

    const apagada = await sessaoPronta();
    await apagarSessao(apagada.sessaoId);
    expect(await registrarIndicacoes(apagada.sessaoId, [{ nome: 'X', contato: 'y' }])).toBe(false);
    expect(await db().select().from(t.indicacoes).where(eq(t.indicacoes.sessaoId, apagada.sessaoId))).toEqual([]);
  });

  it('leaving without filling anything closes the session and the PDF is still there', async () => {
    const { token, sessaoId } = await sessaoPronta();
    await entrarNa(token);

    const saida = await sairDaSecao();
    expect(saida.status).toBe(204);
    expect(await estado(sessaoId)).toBe('encerrado');
    expect((await fechamentoDaSessao(sessaoId)).fechamento).toBeNull();

    const pdf = await baixarPdf(new Request('http://localhost/casa/pdf?baixar=1'));
    expect(pdf.status).toBe(200);
    expect(Buffer.from(await pdf.arrayBuffer()).toString()).toBe('%PDF-1.7 fim');
    expect((await eventos(sessaoId)).map((e) => e.tipo)).toContain('pdf_baixado');

    // Still takes the answers after leaving and coming back.
    expect(await registrarIndicacoes(sessaoId, [{ nome: 'Outra Inventada', contato: '81 99999-0000' }])).toBe(true);

    // And still erases, the account with it: the PDF route sends to the sign-in.
    await apagarSessao(sessaoId);
    const depois = await baixarPdf(new Request('http://localhost/casa/pdf')).catch((e: { digest?: string }) => e.digest);
    expect(depois).toMatch(/^NEXT_REDIRECT;replace;\/entrar;/);
  });
});
