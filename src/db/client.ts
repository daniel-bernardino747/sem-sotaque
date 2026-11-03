// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

export type Db = ReturnType<typeof criarDb>;

function criarDb(url: string) {
  return drizzle(postgres(url, { max: 10, onnotice: () => {} }), { schema });
}

let instancia: Db | undefined;

/** The app's database, from `DATABASE_URL`, created on first use. */
export function db(): Db {
  if (!instancia) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    instancia = criarDb(url);
  }
  return instancia;
}

/** Closes the pool. For scripts and tests; the app keeps it open. */
export async function fecharDb(): Promise<void> {
  await instancia?.$client.end();
  instancia = undefined;
}
