// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from 'next/navigation';

import { estadoDoPlano } from '@/avaliador';
import { vagaDaRota } from '../../../_sessao';
import { Conversa } from '../../../_telas/conversa';
import { Moldura } from '../../../_telas/moldura';

export const metadata = { robots: { index: false, follow: false } };

/**
 * A Vaga's conversation (`/vagas/<id>/conversa`, step 16): the same chat as
 * the general one, on the Vaga's own messages. Another account's Vaga is a
 * 404; a Vaga not yet confirmed, or with nothing open, goes back to its page.
 */
export default async function ConversaDaVaga({ params }: { params: Promise<{ id: string }> }) {
  const { sessao, vaga } = await vagaDaRota((await params).id);
  if (vaga.estagio !== 'confirmada' || !(await estadoDoPlano(sessao.id, vaga.id))?.assunto) {
    redirect(`/casa/vagas/${vaga.id}`);
  }

  return (
    <Moldura>
      <Conversa sessao={sessao} vagaId={vaga.id} />
    </Moldura>
  );
}
