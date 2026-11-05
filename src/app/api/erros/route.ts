// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { receberErroDoNavegador } from '@/erros/navegador';

/** A screen's error, from the browser (step 26, `src/erros/navegador.ts`). */
export async function POST(request: Request): Promise<Response> {
  return receberErroDoNavegador(request);
}
