// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { curriculoEntregue, registrarDownload } from '@/db';

import { sessaoDaRota } from '../_sessao';

/**
 * A delivered Version of the general résumé: `?v=<n>`, or the newest without
 * it. Inline for the page to show it; `?baixar=1` as a download, which the
 * funnel counts (`pdf_baixado`).
 */
export async function GET(request: Request) {
  const sessao = await sessaoDaRota();
  const busca = new URL(request.url).searchParams;
  const v = busca.get('v');
  const versao = v === null ? undefined : /^[1-9]\d{0,5}$/.test(v) ? Number(v) : NaN;
  if (Number.isNaN(versao)) return new Response(null, { status: 404 });
  const curriculo = await curriculoEntregue(sessao.id, versao);
  if (!curriculo) return new Response(null, { status: 404 });

  const baixar = busca.get('baixar') === '1';
  if (baixar) await registrarDownload(sessao.id, curriculo.renderId);

  return new Response(new Uint8Array(curriculo.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${baixar ? 'attachment' : 'inline'}; filename="resume-v${curriculo.versao}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
