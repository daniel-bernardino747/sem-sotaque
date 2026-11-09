// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from 'next/navigation';

import { exportarCorpus } from '@/arquivo-do-corpus/exportar';
import { sessaoAtual } from '@/conta/servidor';

/**
 * "Baixar meu Corpus" (step 27): the signed-in account's own Corpus file, as a
 * download. No subscription needed (C6): what the person told is hers to take.
 * The session comes from the sign-in, never from the URL, so no account
 * reaches another's; the file name has the day, never the person's name.
 */
export async function GET() {
  const sessao = await sessaoAtual();
  if (!sessao) redirect('/entrar');

  const arquivo = await exportarCorpus(sessao.id);
  return new Response(`${JSON.stringify(arquivo, null, 2)}\n`, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="corpus-sem-sotaque-${arquivo.exportadoEm.slice(0, 10)}.json"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
