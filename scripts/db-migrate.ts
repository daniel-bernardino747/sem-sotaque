// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Apply the pending migrations in drizzle/ to `DATABASE_URL`.
 *
 *     npm run db:migrate
 *
 * Uses drizzle-orm's migrator rather than drizzle-kit, so it runs in the
 * production image, where dev dependencies are still installed but not needed.
 */
import { migrar } from '../src/db/migrate.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

await migrar(url);
console.log('migrations applied');
