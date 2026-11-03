// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The sign-in with GitHub and Google (step 20), by hand over `arctic` (the
 * OAuth clients) rather than a whole auth library: the account and the
 * sign-ins are two tables of ours, like the panel's lock.
 *
 * The flow: `/api/auth/<provedor>` (or `/s/<token>/entrar/<provedor>`, which
 * also carries the v0 link to adopt) sets a short-lived cookie with the
 * `state` and the PKCE verifier and sends the browser to the provider; the
 * provider sends it back to `/api/auth/callback/<provedor>`, which checks the
 * `state`, trades the code and reads who the person is.
 */
import { decodeIdToken, generateCodeVerifier, generateState, GitHub, Google } from 'arctic';
import { z } from 'zod';

import type { Perfil } from '@/db/contas';
import { PROVEDORES, type Provedor } from '@/db/schema';

export const COOKIE_OAUTH = 'sem_sotaque_oauth';
/** Ten minutes to go to GitHub or Google and come back. */
export const VALIDADE_OAUTH_S = 10 * 60;

export const NOMES: Record<Provedor, string> = { github: 'GitHub', google: 'Google' };

export function provedorDaRota(nome: string): Provedor | null {
  return (PROVEDORES as readonly string[]).includes(nome) ? (nome as Provedor) : null;
}

const VARIAVEIS: Record<Provedor, [string, string]> = {
  github: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
  google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
};

function credenciais(provedor: Provedor): [string, string] | null {
  const [id, segredo] = VARIAVEIS[provedor].map((v) => process.env[v]?.trim());
  return id && segredo ? [id, segredo] : null;
}

/** The providers with an OAuth app set up here; `/entrar` shows only these. */
export const provedoresConfigurados = (): Provedor[] => PROVEDORES.filter((p) => credenciais(p) !== null);

/**
 * Where the provider sends the browser back: `APP_URL`, or in dev the origin
 * the request came on. Production requires `APP_URL`: behind the proxy the
 * request's origin is an internal host the OAuth apps do not know.
 */
export function urlDeRetorno(provedor: Provedor, origem: string): string {
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl && process.env.NODE_ENV === 'production') throw new Error('APP_URL is not set');
  const base = (appUrl || origem).replace(/\/+$/, '');
  return `${base}/api/auth/callback/${provedor}`;
}

function cliente(provedor: Provedor, origem: string) {
  const c = credenciais(provedor);
  if (!c) return null;
  const retorno = urlDeRetorno(provedor, origem);
  return provedor === 'github' ? new GitHub(c[0], c[1], retorno) : new Google(c[0], c[1], retorno);
}

/** What the OAuth cookie holds between leaving and coming back. */
const idaSchema = z.object({
  provedor: z.enum(PROVEDORES),
  state: z.string().min(1),
  verifier: z.string().min(1),
  vincular: z.string().min(1).optional(),
});
export type Ida = z.infer<typeof idaSchema>;

export function lerIda(valor: string | undefined): Ida | null {
  if (!valor) return null;
  try {
    const lido = idaSchema.safeParse(JSON.parse(valor));
    return lido.success ? lido.data : null;
  } catch {
    return null;
  }
}

/** The provider's authorization URL and the cookie to set, or null if the provider is not set up. */
export function iniciar(provedor: Provedor, origem: string, vincular?: string): { url: URL; ida: Ida } | null {
  const c = cliente(provedor, origem);
  if (!c) return null;
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url =
    c instanceof GitHub
      ? c.createAuthorizationURL(state, ['read:user', 'user:email'])
      : c.createAuthorizationURL(state, verifier, ['openid', 'profile', 'email']);
  return { url, ida: { provedor, state, verifier, ...(vincular ? { vincular } : {}) } };
}

const usuarioGithub = z.object({ id: z.number(), login: z.string(), name: z.string().nullable(), email: z.string().nullable() });
const emailsGithub = z.array(z.object({ email: z.string(), primary: z.boolean(), verified: z.boolean() }));
const tokenGoogle = z.object({ sub: z.string().min(1), email: z.string().optional(), name: z.string().optional() });

async function github(caminho: string, accessToken: string): Promise<unknown> {
  const r = await fetch(`https://api.github.com${caminho}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'sem-sotaque' },
  });
  if (!r.ok) throw new Error(`GitHub ${caminho}: ${r.status}`);
  return r.json();
}

/**
 * Trades the code the provider sent back for who the person is. Throws on any
 * failure (a stale code, the provider down): the callback answers with the
 * sign-in page and its error.
 */
export async function perfilDoRetorno(ida: Ida, code: string, origem: string): Promise<Perfil> {
  const c = cliente(ida.provedor, origem);
  if (!c) throw new Error(`${ida.provedor} is not set up`);

  if (c instanceof GitHub) {
    const tokens = await c.validateAuthorizationCode(code);
    const usuario = usuarioGithub.parse(await github('/user', tokens.accessToken()));
    let email = usuario.email;
    if (!email) {
      // A private e-mail is not in `/user`; the primary verified one is here.
      const emails = emailsGithub.parse(await github('/user/emails', tokens.accessToken()));
      email = emails.find((e) => e.primary && e.verified)?.email ?? null;
    }
    return { provedor: 'github', idNoProvedor: String(usuario.id), email, nome: usuario.name ?? usuario.login };
  }

  const tokens = await c.validateAuthorizationCode(code, ida.verifier);
  // Straight from Google's token endpoint over TLS: the signature need not be checked again.
  const claims = tokenGoogle.parse(decodeIdToken(tokens.idToken()));
  return { provedor: 'google', idNoProvedor: claims.sub, email: claims.email ?? null, nome: claims.name ?? null };
}
