// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from 'next/navigation';

import { emRetomada, estadoDoPlano } from '@/avaliador';

import { sessaoDaRota } from '../_sessao';
import { Conversa } from '../_telas/conversa';
import { Importar } from '../_telas/importar';
import { Moldura } from '../_telas/moldura';

export const metadata = { robots: { index: false, follow: false } };

/**
 * The general conversation (`/conversa`), by the session's own state: the
 * import before it, the interrogation, and after the résumé the retomada. With
 * the résumé owed (`gerando`) it is the résumé page; a retomada with nothing
 * open goes back home.
 */
export default async function PaginaDaConversa() {
  const sessao = await sessaoDaRota();
  if (sessao.estado === 'gerando') redirect('/casa/curriculo');
  if (emRetomada(sessao.estado) && !(await estadoDoPlano(sessao.id))?.assunto) redirect('/casa');

  return (
    <Moldura>
      {sessao.estado === 'consentiu' || sessao.estado === 'importou' ? (
        <Importar sessao={sessao} />
      ) : (
        <Conversa sessao={sessao} />
      )}
    </Moldura>
  );
}
