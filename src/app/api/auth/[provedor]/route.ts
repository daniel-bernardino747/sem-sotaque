// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { irParaOProvedor } from '@/conta/rotas-oauth';

/** "Entrar com GitHub" / "Entrar com Google" on `/entrar`. */
export async function GET(request: Request, { params }: { params: Promise<{ provedor: string }> }) {
  return irParaOProvedor(request, (await params).provedor);
}
