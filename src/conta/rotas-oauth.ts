// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { entrar } from '@/db';
import { registrarErro } from '@/erros';
import { modo } from '@/modo';

import { COOKIE_CONTA, OPCOES_COOKIE_CONTA, opcoesDoCookie } from './acesso';
import { COOKIE_OAUTH, iniciar, lerIda, perfilDoRetorno, provedorDaRota, VALIDADE_OAUTH_S } from './oauth';

/**
 * The start of a sign-in (`GET /api/auth/<provedor>`, or the v0 link's
 * `/s/<token>/entrar/<provedor>` with `vincular`): off to the provider.
 */
export async function irParaOProvedor(request: Request, nome: string, vincular?: string): Promise<Response> {
  // MODO=local signs in nobody: there is one account, and it is already home.
  if (modo() === 'local') redirect('/casa');
  const provedor = provedorDaRota(nome);
  if (!provedor) return new Response(null, { status: 404 });
  const inicio = iniciar(provedor, new URL(request.url).origin, vincular);
  if (!inicio) redirect('/entrar?erro=1');
  (await cookies()).set(COOKIE_OAUTH, JSON.stringify(inicio.ida), opcoesDoCookie(VALIDADE_OAUTH_S));
  redirect(inicio.url.toString());
}

/**
 * The provider sent the browser back (`GET /api/auth/callback/<provedor>`).
 * A `state` that does not match, a refusal on the provider's page or a code
 * that does not trade goes back to `/entrar` with the error, and so does a v0
 * link that is unknown, erased or another account's (that one with its own message).
 * Otherwise the browser is signed in and goes home.
 */
export async function voltarDoProvedor(request: Request, nome: string): Promise<Response> {
  if (modo() === 'local') redirect('/casa');
  const jar = await cookies();
  const ida = lerIda(jar.get(COOKIE_OAUTH)?.value);
  jar.delete({ name: COOKIE_OAUTH, path: '/' });

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!ida || ida.provedor !== provedorDaRota(nome) || !code || state !== ida.state) redirect('/entrar?erro=1');

  let entrada;
  try {
    const perfil = await perfilDoRetorno(ida, code, url.origin);
    entrada = await entrar(perfil, { vincular: ida.vincular });
  } catch (erro) {
    // Before the sign-in there is no session: the error is recorded without one.
    await registrarErro({ origem: 'servidor', onde: 'oauth', erro, log: `sign-in with ${ida.provedor} failed:` });
    redirect('/entrar?erro=1');
  }
  // Signed in to nothing. Another account's link has its own message; one
  // erased (or never there) since the page was opened gets the plain error.
  if (entrada.tipo === 'link_de_outra_conta') redirect('/entrar?erro=link');
  if (entrada.tipo === 'link_invalido') redirect('/entrar?erro=1');

  jar.set(COOKIE_CONTA, entrada.acesso, OPCOES_COOKIE_CONTA);
  redirect('/casa');
}
