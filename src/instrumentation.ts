// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Instrumentation } from 'next';

/** What no code handled reaches here with its digest (step 26, `src/erros/requisicao.ts`). */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  // The database is only reachable from Node, never from the edge runtime.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { erroDaRequisicao } = await import('./erros/requisicao');
  await erroDaRequisicao(...args);
};
