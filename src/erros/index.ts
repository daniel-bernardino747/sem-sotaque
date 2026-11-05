// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The one place an error is recorded (step 26). The `console.error` stays, with
 * the message, for the container log while it lasts; the database gets only
 * the shape (`./forma`). In `MODO=local` nothing is written: whoever runs it
 * sees the terminal. Recording never throws into the caller.
 */
import { gravarErro, limparErrosVencidos } from '@/db/erros';
import { modo as modoDoAmbiente, type Modo } from '@/modo';

import { formaDoErro, type OrigemErro } from './forma';

export { formaDoErro, soPermitidos, type FormaDoErro, type OrigemErro } from './forma';

export interface ErroARegistrar {
  origem: OrigemErro;
  /** The stage (`import`, `turno`, `geracao`…) or the screen. */
  onde: string;
  /** Raw, as caught: only its shape is kept. */
  erro: unknown;
  sessaoId?: string | null;
  digest?: string | null;
  /** What the container log says before the message; defaults to `onde`. */
  log?: string;
}

/** The cleanup of the 90 days runs at most this often per process: no cron. */
const LIMPEZA_A_CADA_MS = 60 * 60 * 1000;
let ultimaLimpeza = 0;

export async function registrarErro(
  entrada: ErroARegistrar,
  opcoes: { agora?: Date; modo?: Modo } = {},
): Promise<void> {
  const { erro } = entrada;
  console.error(entrada.log ?? `${entrada.onde} failed:`, erro instanceof Error ? erro.message : erro);
  try {
    if ((opcoes.modo ?? modoDoAmbiente()) === 'local') return;
    const agora = opcoes.agora ?? new Date();
    await gravarErro(formaDoErro(entrada), entrada.sessaoId ?? null, agora);
    if (Date.now() - ultimaLimpeza >= LIMPEZA_A_CADA_MS) {
      ultimaLimpeza = Date.now();
      await limparErrosVencidos(agora);
    }
  } catch (falha) {
    console.error('recording the error failed:', falha instanceof Error ? falha.message : falha);
  }
}
