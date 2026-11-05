// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * What no code handled, from Next's `onRequestError` (`instrumentation.ts`):
 * recorded with the digest, so the screen that broke (`error.tsx`, which posts
 * the same digest) points to it. The session comes from the request's sign-in
 * cookie, read here because `cookies()` is not available outside a request.
 */
import type { Instrumentation } from 'next';

import { COOKIE_CONTA } from '../conta/acesso';
import { contaDoAcesso, sessaoDaConta } from '../db';

import { registrarErro } from './index';

/** `redirect()` and `notFound()` travel as errors: they are Next's flow, not a failure. */
const DO_NEXT = /^NEXT_(REDIRECT|HTTP_ERROR_FALLBACK|NOT_FOUND)/;

function cookie(headers: NodeJS.Dict<string | string[]>, nome: string): string | null {
  const bruto = headers.cookie;
  const texto = Array.isArray(bruto) ? bruto.join('; ') : (bruto ?? '');
  for (const parte of texto.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return v.join('=');
  }
  return null;
}

async function sessaoDoCookie(headers: NodeJS.Dict<string | string[]>): Promise<string | null> {
  try {
    const conta = await contaDoAcesso(cookie(headers, COOKIE_CONTA));
    return conta ? ((await sessaoDaConta(conta.id))?.id ?? null) : null;
  } catch {
    return null;
  }
}

export const erroDaRequisicao: Instrumentation.onRequestError = async (erro, request, contexto) => {
  const digest = (erro as { digest?: unknown } | null)?.digest;
  if (typeof digest === 'string' && DO_NEXT.test(digest)) return;
  await registrarErro({
    origem: 'servidor',
    onde: 'requisicao',
    erro,
    sessaoId: await sessaoDoCookie(request.headers),
    log: `${request.method} ${contexto.routePath} failed (digest ${typeof digest === 'string' ? digest : '?'}):`,
  });
};
