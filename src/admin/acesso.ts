// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The panel's lock: one `ADMIN_TOKEN`, typed once into a form, then an
 * httpOnly cookie. No user accounts (step 08).
 *
 * The cookie never holds the token itself, only an HMAC of a fixed label keyed
 * by it: a leaked cookie does not reveal the token, and changing `ADMIN_TOKEN`
 * logs every browser out. Without an `ADMIN_TOKEN` of at least
 * `MINIMO_TOKEN` characters the panel is closed to everyone.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_ADMIN = 'sem_sotaque_admin';
export const MINIMO_TOKEN = 16;
/** 30 days. */
export const VALIDADE_S = 30 * 24 * 60 * 60;

function segredo(): string | null {
  const token = process.env.ADMIN_TOKEN?.trim();
  return token && token.length >= MINIMO_TOKEN ? token : null;
}

export const painelConfigurado = () => segredo() !== null;

function assinatura(token: string): string {
  return createHmac('sha256', token).update('sem-sotaque painel v1').digest('base64url');
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Whether what was typed into the form is the token (compared in constant time). */
export function tokenConfere(digitado: string): boolean {
  const token = segredo();
  return token !== null && iguais(assinatura(digitado.trim()), assinatura(token));
}

/** The cookie value for a browser that typed the right token. */
export function valorDoCookie(): string {
  const token = segredo();
  if (!token) throw new Error('ADMIN_TOKEN is not set');
  return assinatura(token);
}

export function cookieValido(valor: string | undefined | null): boolean {
  const token = segredo();
  return token !== null && typeof valor === 'string' && iguais(valor, assinatura(token));
}

/** The admin cookie in a request's `Cookie` header, for route handlers. */
export function cookieDaRequisicao(request: Request): string | undefined {
  const cabecalho = request.headers.get('cookie') ?? '';
  for (const parte of cabecalho.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === COOKIE_ADMIN) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return undefined;
}

export const requisicaoAutorizada = (request: Request) => cookieValido(cookieDaRequisicao(request));
