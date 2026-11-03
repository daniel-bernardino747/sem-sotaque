// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { notFound, unauthorized } from 'next/navigation';

import { modo } from '@/modo';

import { COOKIE_ADMIN, cookieValido } from './acesso';

/**
 * Every page and Server Action of `/admin` calls this first: without the
 * cookie it answers 401 with the token form (`app/admin/unauthorized.tsx`).
 * Not in the layout: a layout does not re-run on every navigation, and it
 * renders in parallel with the page.
 */
export async function exigirAdmin(): Promise<void> {
  // MODO=local has no panel: the same 404 as any other path, not the token form.
  if (modo() === 'local') {
    await connection();
    notFound();
  }
  const valor = (await cookies()).get(COOKIE_ADMIN)?.value;
  if (!cookieValido(valor)) unauthorized();
}
