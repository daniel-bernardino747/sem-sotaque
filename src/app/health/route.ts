// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { sql } from 'drizzle-orm';

import { db } from '@/db/client';

/**
 * The deploy's healthcheck (docs/deploy.md): a deploy only takes traffic once
 * the app answers and reaches the database. Nothing external (Anthropic,
 * Typesafe) is called here.
 */
export async function GET() {
  try {
    await db().execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
