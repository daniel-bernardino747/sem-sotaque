// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { curriculoEntregue, registrarDownload, vagaDaSessao } from '@/db';

import { sessaoDaRota } from '../../../_sessao';

/**
 * A delivered Version of a Vaga's résumé (step 17): `?v=<n>`, or the newest
 * without it. Signed out goes to `/entrar`. Another account's Vaga, an emptied one or a Version that does
 * not exist is a 404. Inline for the page to show it; `?baixar=1` as a
 * download, which the funnel counts (`pdf_baixado`).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await sessaoDaRota();
  const vaga = await vagaDaSessao(sessao.id, id);
  if (!vaga) return new Response(null, { status: 404 });
  const busca = new URL(request.url).searchParams;
  const v = busca.get('v');
  const versao = v === null ? undefined : /^[1-9]\d{0,5}$/.test(v) ? Number(v) : NaN;
  if (Number.isNaN(versao)) return new Response(null, { status: 404 });
  const curriculo = await curriculoEntregue(sessao.id, versao, vaga.id);
  if (!curriculo) return new Response(null, { status: 404 });

  const baixar = busca.get('baixar') === '1';
  if (baixar) await registrarDownload(sessao.id, curriculo.renderId, vaga.id);

  return new Response(new Uint8Array(curriculo.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${baixar ? 'attachment' : 'inline'}; filename="resume-vaga-v${curriculo.versao}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
