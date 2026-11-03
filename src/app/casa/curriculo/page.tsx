// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from 'next/navigation';

import { emRetomada } from '@/avaliador';

import { sessaoDaRota } from '../_sessao';
import { Moldura } from '../_telas/moldura';
import { Curriculo } from '../_telas/resultado';

export const metadata = { robots: { index: false, follow: false } };

/**
 * The general résumé (`/curriculo`): the header, the waiting screen, the
 * newest Version and its history, "gerar de novo" and the end of the v0. It
 * exists once the interrogation has ended; before, the home says so.
 */
export default async function PaginaDoCurriculo() {
  const sessao = await sessaoDaRota();
  if (!emRetomada(sessao.estado)) redirect('/casa');

  return (
    <Moldura>
      <Curriculo sessao={sessao} />
    </Moldura>
  );
}
