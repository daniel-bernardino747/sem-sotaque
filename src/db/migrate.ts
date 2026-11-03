// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

/** Where `drizzle-kit generate` writes the SQL migrations, from the repo root. */
export const PASTA_MIGRACOES = 'drizzle';

/** Applies every pending migration in `pasta` (`drizzle/` by default) to the database at `url`. */
export async function migrar(url: string, pasta = PASTA_MIGRACOES): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: pasta });
  } finally {
    await client.end();
  }
}
