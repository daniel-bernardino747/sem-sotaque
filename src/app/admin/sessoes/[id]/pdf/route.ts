// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { requisicaoAutorizada } from '@/admin/acesso';
import { pdfParaPainel } from '@/admin/sessao';
import { modo } from '@/modo';

import { ehUuid } from '../../../_formato';

/**
 * A session's PDF for Daniel: the delivered one, or `?selection=<id>` for any
 * attempt. 401 without the admin cookie, before anything is read; 403 when
 * the person did not let Daniel read (step 22). Opening it here never counts
 * as the person's download.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // MODO=local has no panel (exigirAdmin): the same 404 here.
  if (modo() === 'local') return new Response(null, { status: 404 });
  if (!requisicaoAutorizada(request)) return new Response('401: entre no painel primeiro.', { status: 401 });
  const { id } = await params;
  const selection = new URL(request.url).searchParams.get('selection');
  if (!ehUuid(id) || (selection !== null && !ehUuid(selection))) return new Response(null, { status: 404 });

  const pdf = await pdfParaPainel(id, selection);
  if (pdf === 'fechado') return new Response('403: a pessoa não liberou a leitura.', { status: 403 });
  if (!pdf) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="resume.pdf"',
      'Cache-Control': 'private, no-store',
    },
  });
}
