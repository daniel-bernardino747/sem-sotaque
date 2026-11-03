// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * One thing at a time per session: a turn, or "terminei". In-process, which is
 * enough for the single app instance of v0; with more than one instance this
 * becomes a Postgres advisory lock.
 */
const filas = new Map<string, Promise<unknown>>();

/** A turn or an ending is running for this session. */
export function ocupada(sessaoId: string): boolean {
  return filas.has(sessaoId);
}

/** Runs `fn` after whatever is running for the session has finished. */
export async function emSerie<T>(sessaoId: string, fn: () => Promise<T>): Promise<T> {
  const anterior = filas.get(sessaoId) ?? Promise.resolve();
  const atual = anterior.catch(() => {}).then(fn);
  filas.set(sessaoId, atual);
  try {
    return await atual;
  } finally {
    if (filas.get(sessaoId) === atual) filas.delete(sessaoId);
  }
}
