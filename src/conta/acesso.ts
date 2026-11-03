// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The sign-in cookie (step 20). It holds a random value; the database keeps
 * only its SHA-256 (`acessos`), so "Sair" and erasing the account end it on
 * the server, not just in the browser.
 */
import { VALIDADE_ACESSO_S } from '@/db/contas';

export const COOKIE_CONTA = 'sem_sotaque_conta';

/**
 * httpOnly; `secure` in production; `lax` so the redirect back from GitHub or
 * Google (a top-level GET from their site) still carries it.
 */
export const opcoesDoCookie = (maxAge: number) =>
  ({
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }) as const;

export const OPCOES_COOKIE_CONTA = opcoesDoCookie(VALIDADE_ACESSO_S);
