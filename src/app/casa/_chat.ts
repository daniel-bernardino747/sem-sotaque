// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from 'zod';

import type { OpcaoOferta } from '@/avaliador';
import type { Progresso } from '@/interrogatorio/estado';
import { emSerie, ocupada } from '@/interrogatorio/trava';
import { ErroTurno, turno, type Entrada } from '@/interrogatorio/turno';

/** The interrogation's events, one JSON object per line. */
export type EventoChat =
  | { t: 'texto'; d: string }
  /** Drop what streamed: the question is being rewritten. */
  | { t: 'reiniciar' }
  | { t: 'fim'; progresso: Progresso; encerrado: boolean; opcoes: OpcaoOferta[] }
  | { t: 'erro'; mensagem: string };

const corpo = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('resposta'), texto: z.string().trim().min(1).max(4000) }),
  z.object({ tipo: z.literal('pular') }),
  z.object({ tipo: z.literal('continuar') }),
  z.object({ tipo: z.literal('escolher'), id: z.string().uuid() }),
]);

/**
 * A turn of a conversation, streamed: the person's answer (or "pular esta", a
 * pick under the offer to stop, or nothing to get the next question) in, the
 * question out as it is written. The general conversation and each Vaga's
 * (step 16) have their own messages and share one lock.
 * The caller has checked that the session may talk.
 */
export async function turnoEmFluxo(request: Request, sessaoId: string, vagaId: string | null = null): Promise<Response> {
  const lido = corpo.safeParse(await request.json().catch(() => null));
  if (!lido.success) return new Response(null, { status: 400 });
  const entrada: Entrada = lido.data;

  // One turn per session at a time: a double tap or a second tab gets a 409
  // rather than two answers interleaved. A Vaga's conversation shares the lock,
  // since it writes the same Corpus as the general one.
  if (ocupada(sessaoId)) return new Response(null, { status: 409 });

  const codificar = new TextEncoder();
  // The person can leave mid-turn (closed tab, phone locked). The turn goes on
  // without them, so the question is saved and waiting when they come back:
  // a write to a stream nobody reads must not throw into the model call.
  let saiu = false;
  const fluxo = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (evento: EventoChat) => {
        if (saiu) return;
        try {
          controller.enqueue(codificar.encode(`${JSON.stringify(evento)}\n`));
        } catch {
          saiu = true;
        }
      };
      try {
        const r = await emSerie(sessaoId, () =>
          turno(sessaoId, entrada, {
            vagaId,
            aoTexto: (d) => enviar({ t: 'texto', d }),
            aoReiniciar: () => enviar({ t: 'reiniciar' }),
          }),
        );
        enviar({ t: 'fim', progresso: r.progresso, encerrado: r.encerrado, opcoes: r.opcoes });
      } catch (erro) {
        if (!(erro instanceof ErroTurno)) {
          // The session id, never the token: the token is the person's credential.
          console.error(`interrogation turn failed for session ${sessaoId}:`, erro instanceof Error ? erro.message : erro);
        }
        enviar({ t: 'erro', mensagem: 'Não consegui continuar agora. Tente de novo em instantes.' });
      } finally {
        if (!saiu) controller.close();
      }
    },
    cancel() {
      saiu = true;
    },
  });

  return new Response(fluxo, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
