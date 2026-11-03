// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { irParaOProvedor } from '@/conta/rotas-oauth';

/**
 * The sign-in from a v0 link's page: the same as `/api/auth/<provedor>`, with
 * the token carried to the callback, which links its Tester to the account.
 * Under `/s/`, so the token stays out of the request log like the link itself.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string; provedor: string }> }) {
  const { token, provedor } = await params;
  return irParaOProvedor(request, provedor, token);
}
