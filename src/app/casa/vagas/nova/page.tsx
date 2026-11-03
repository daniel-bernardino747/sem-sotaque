// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from 'next/navigation';

import { vagasLiberadas } from '@/db';

import { sessaoDaRota } from '../../_sessao';
import { Moldura } from '../../_telas/moldura';
import { VagaNova } from '../../_telas/vaga-nova';

export const metadata = { robots: { index: false, follow: false } };

/** "Achei uma vaga" (`/vagas/nova`). Closed until the gate opens (P5); the home says why. */
export default async function PaginaDaVagaNova() {
  const sessao = await sessaoDaRota();
  if (!(await vagasLiberadas(sessao.id))) redirect('/casa');

  return (
    <Moldura>
      <VagaNova sessao={sessao} />
    </Moldura>
  );
}
