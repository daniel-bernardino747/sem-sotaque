// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * How the app runs (step 23, docs/decisoes.md Q6): `hospedado` is the product
 * Daniel hosts, for paying people; `local` is a developer running it on their
 * own machine, alone, with their own Claude subscription or API key. One
 * codebase: what differs between the two asks this function, read on the
 * server, never the client.
 *
 * `MODO` unset or empty is `hospedado`. Any other value is an error rather
 * than a silent default, so `MODO=lcoal` does not quietly run the hosted mode.
 */
export type Modo = 'local' | 'hospedado';

export function modo(env: Record<string, string | undefined> = process.env): Modo {
  const valor = env.MODO ?? '';
  if (valor === '' || valor === 'hospedado') return 'hospedado';
  if (valor === 'local') return 'local';
  throw new Error(`MODO="${valor}" is not a mode: use "local" or "hospedado" (empty is hospedado)`);
}
