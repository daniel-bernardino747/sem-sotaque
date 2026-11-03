// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { voltarDoProvedor } from '@/conta/rotas-oauth';

/** Where GitHub and Google send the browser back (the callback URL of each OAuth app). */
export async function GET(request: Request, { params }: { params: Promise<{ provedor: string }> }) {
  return voltarDoProvedor(request, (await params).provedor);
}
