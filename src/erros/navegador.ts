// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * What the browser posts when a screen breaks (step 26): the kind (`janela`
 * for `error`, `promessa` for `unhandledrejection`, `limite` for the error
 * boundary), the screen, the class and Next's digest. Nothing else is
 * accepted: a body with any other field is refused. Only from a signed-in
 * session, and up to `LIMITE_POR_HORA` errors an hour each; no IP is kept.
 */
import { z } from 'zod';

import { sessaoAtual } from '@/conta/servidor';
import { errosDaSessaoDesde } from '@/db/erros';
import { modo } from '@/modo';

import { TAMANHO_MAXIMO, TOKEN } from './forma';
import { registrarForma } from './index';

export const TIPOS_ERRO_NAVEGADOR = ['janela', 'promessa', 'limite'] as const;
export const LIMITE_POR_HORA = 50;
/** A body longer than this is not an error report. */
const CORPO_MAXIMO = 1024;
const HORA_MS = 60 * 60 * 1000;

const corpo = z
  .object({
    tipo: z.enum(TIPOS_ERRO_NAVEGADOR),
    /** The pathname, never the query string. */
    tela: z.string().regex(/^\/[A-Za-z0-9/_.~\-[\]]*$/).max(200),
    // Tokens, like the server's: a sentence here could carry what the person typed.
    classe: z.string().regex(TOKEN),
    digest: z.string().regex(TOKEN).optional(),
  })
  .strict();

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The screen as the route names it: a Vaga's id becomes `[id]`, so one screen counts as one. */
export function telaDaRota(caminho: string): string {
  return caminho.replace(UUID, '[id]').slice(0, TAMANHO_MAXIMO);
}

export async function receberErroDoNavegador(request: Request): Promise<Response> {
  if (modo() === 'local') return new Response(null, { status: 404 });
  const texto = await request.text();
  if (texto.length > CORPO_MAXIMO) return new Response(null, { status: 400 });
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return new Response(null, { status: 400 });
  }
  const lido = corpo.safeParse(json);
  if (!lido.success) return new Response(null, { status: 400 });

  const descartado = new Response(null, { status: 204 });
  const sessao = await sessaoAtual();
  if (!sessao) return descartado;
  if ((await errosDaSessaoDesde(sessao.id, 'navegador', new Date(Date.now() - HORA_MS))) >= LIMITE_POR_HORA) return descartado;

  const { tipo, tela, classe, digest } = lido.data;
  await registrarForma(
    { origem: 'navegador', onde: telaDaRota(tela), classe, codigo: tipo, digest: digest ?? null },
    sessao.id,
  );
  return new Response(null, { status: 204 });
}
