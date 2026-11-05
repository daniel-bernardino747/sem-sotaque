// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Errors and frictions (step 26). What gets written is decided here, against
 * the session: never for an erased one, and only when `gravaErrosEAtritos`
 * says the session's consent (or the date) allows it. `MODO=local` is the
 * caller's to check (`src/erros`).
 */
import { and, count, eq, gte, lt } from 'drizzle-orm';

import { gravaErrosEAtritos } from '../conteudo/consentimento';
import type { FormaDoErro } from '../erros/forma';

import { db, type Db } from './client';
import { erros, sessoes } from './schema';

/** How long an error is kept, with or without a session (decision 4). */
export const ERROS_DURAM_DIAS = 90;
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * May this session's errors and frictions be written now? Not for an erased or
 * unknown session; otherwise, as its consent version and the date say.
 */
export async function sessaoGravaErros(tx: Tx, sessaoId: string, agora: Date): Promise<boolean> {
  // `for share` waits for an erasure in flight, so nothing is written after `apagarSessao`.
  const [sessao] = await tx
    .select({ versao: sessoes.textoConsentimentoVersao, apagadaEm: sessoes.apagadaEm })
    .from(sessoes)
    .where(eq(sessoes.id, sessaoId))
    .for('share');
  return !!sessao && !sessao.apagadaEm && gravaErrosEAtritos(sessao.versao, agora);
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Writes the error's shape. Returns whether it was written. */
export async function gravarErro(forma: FormaDoErro, sessaoId: string | null, agora = new Date()): Promise<boolean> {
  return db().transaction(async (tx) => {
    if (sessaoId !== null && !(await sessaoGravaErros(tx, sessaoId, agora))) return false;
    await tx.insert(erros).values({ ...forma, sessaoId });
    return true;
  });
}

/** How many errors the session has written since `desde`: the browser's limit per hour. */
export async function errosDaSessaoDesde(sessaoId: string, desde: Date): Promise<number> {
  const [{ n }] = await db()
    .select({ n: count() })
    .from(erros)
    .where(and(eq(erros.sessaoId, sessaoId), gte(erros.createdAt, desde)));
  return n;
}

/** Deletes every error older than `ERROS_DURAM_DIAS`. */
export async function limparErrosVencidos(agora = new Date()): Promise<void> {
  await db()
    .delete(erros)
    .where(lt(erros.createdAt, new Date(agora.getTime() - ERROS_DURAM_DIAS * DIA_MS)));
}
