// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, inject, it } from 'vitest';

import { COOKIE_ADMIN, valorDoCookie } from '@/admin/acesso';
import { GET as pdfDoPainel } from '@/app/admin/sessoes/[id]/pdf/route';
import { criarTester, definirLeitura, registrarConsentimento, registrarMensagem, sessaoPorId } from '@/db';
import { db, fecharDb } from '@/db/client';
import * as t from '@/db/schema';

import { sessaoParaPainel } from './sessao';

const semBanco = !inject('bancoDisponivel');
afterAll(fecharDb);
let antes: string | undefined;
beforeEach(() => {
  antes = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = 'token-do-painel-para-os-testes';
});
afterEach(() => {
  if (antes === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = antes;
});

/** An invented person on the new consent, who did not tick "pode ler": a transcript and a delivered PDF. */
async function sessaoFechada() {
  const { sessao } = await criarTester({ apelido: 'Fulana Fechada', origem: 'teste da leitura' });
  await registrarConsentimento(sessao.id, 'v3', false);
  await registrarMensagem(sessao.id, { papel: 'assistente', conteudo: 'Quantas lojas usavam o sistema?' });
  await registrarMensagem(sessao.id, { papel: 'pessoa', conteudo: 'não sei', marcadores: ['nao_sei'] });
  await registrarMensagem(sessao.id, { papel: 'pessoa', conteudo: 'umas 40' });
  const [selection] = await db()
    .insert(t.selections)
    .values({ sessaoId: sessao.id, json: { version: 3 }, tentativa: 1, violacoes: {}, aprovada: true })
    .returning();
  await db().insert(t.renders).values({ selectionId: selection.id, pdf: Buffer.from('%PDF-1.4 falso'), medida: { pages: 1, fill: 50 } });
  const [geracao] = await db().insert(t.geracoes).values({ sessaoId: sessao.id, versao: 1, selectionId: selection.id }).returning();
  await db().update(t.selections).set({ geracaoId: geracao.id }).where(eq(t.selections.id, selection.id));
  return { sessaoId: sessao.id, selectionId: selection.id };
}

const pedirPdf = (sessaoId: string, selectionId?: string) =>
  pdfDoPainel(
    new Request(`http://localhost/admin/sessoes/${sessaoId}/pdf${selectionId ? `?selection=${selectionId}` : ''}`, {
      headers: { cookie: `${COOKIE_ADMIN}=${valorDoCookie()}` },
    }),
    { params: Promise.resolve({ id: sessaoId }) },
  );

describe.skipIf(semBanco)('a leitura do painel', () => {
  it('without the opt-in, the session shows only its numbers, and the PDF route refuses', async () => {
    const { sessaoId, selectionId } = await sessaoFechada();

    const painel = await sessaoParaPainel(sessaoId);
    expect(painel?.conteudo).toBeNull();
    expect(painel?.metricas).toMatchObject({ perguntas: 1, respostas: 2, naoSei: 1, tentativas: 1 });

    expect((await pedirPdf(sessaoId)).status).toBe(403);
    expect((await pedirPdf(sessaoId, selectionId)).status).toBe(403);
  });

  it('turning the opt-in on opens the content, and turning it off closes it again', async () => {
    const { sessaoId, selectionId } = await sessaoFechada();

    await definirLeitura(sessaoId, true);
    expect((await sessaoPorId(sessaoId))?.podeLerEm).toBeInstanceOf(Date);
    const aberto = await sessaoParaPainel(sessaoId);
    expect(aberto?.conteudo?.mensagens.map((m) => m.conteudo)).toEqual(['Quantas lojas usavam o sistema?', 'não sei', 'umas 40']);
    expect(aberto?.conteudo?.tentativas).toHaveLength(1);
    expect((await pedirPdf(sessaoId)).status).toBe(200);
    expect((await pedirPdf(sessaoId, selectionId)).status).toBe(200);

    await definirLeitura(sessaoId, false);
    expect((await sessaoPorId(sessaoId))?.podeLerEm).toBeNull();
    expect((await sessaoParaPainel(sessaoId))?.conteudo).toBeNull();
    expect((await pedirPdf(sessaoId)).status).toBe(403);
  });

  it('the v0 consent texts said Daniel reads: accepting them opens the reading', async () => {
    for (const versao of ['v1', 'v2']) {
      const { sessao } = await criarTester({ apelido: `Beltrana ${versao}`, origem: 'teste da leitura' });
      await registrarConsentimento(sessao.id, versao);
      expect((await sessaoPorId(sessao.id))?.podeLerEm).toBeInstanceOf(Date);
    }
  });

  it('an unknown session is null', async () => {
    expect(await sessaoParaPainel('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
