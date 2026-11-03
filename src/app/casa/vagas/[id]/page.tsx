// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { perguntasEmAberto } from '@/avaliador';
import { emAndamento, ultimaGeracao } from '@/db';
import { garantirGeracao } from '@/geracao/segundo-plano';
import { garantirLeitura } from '@/vaga';

import { vagaDaRota } from '../../_sessao';
import { Espera } from '../../_telas/espera';
import { Moldura } from '../../_telas/moldura';
import { Vaga } from '../../_telas/vaga';

export const metadata = { robots: { index: false, follow: false } };

/**
 * A Vaga (`/casa/vagas/<id>`; another account's is a 404, `vagaDaRota`). A reading or a
 * generation that died with the process starts again here; while the Vaga's
 * résumé is being written, the page is the waiting screen.
 */
export default async function PaginaDaVaga({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { sessao, vaga } = await vagaDaRota((await params).id);
  if (vaga.estagio === 'lendo') await garantirLeitura(sessao.id, vaga.id);
  if (vaga.estagio === 'confirmada') {
    const geracao = await ultimaGeracao(sessao.id, vaga.id);
    if (geracao && emAndamento(geracao)) {
      await garantirGeracao(sessao.id, { vagaId: vaga.id });
      return (
        <Moldura>
          <Espera etapa={geracao.etapa} />
        </Moldura>
      );
    }
  }
  const emAberto = vaga.estagio === 'confirmada' ? await perguntasEmAberto(sessao.id, vaga.id) : null;

  return (
    <Moldura>
      <Vaga sessaoId={sessao.id} vaga={vaga} salvo={(await searchParams).salvo === '1'} emAberto={emAberto} />
    </Moldura>
  );
}
