// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Vitest global setup for the database tests: makes sure the test database
 * exists and is migrated, and tells the tests whether Postgres is there at all.
 * Without it (no `docker compose up db`) the integration tests skip, like the
 * render tests do without Tectonic.
 */
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

import { migrar } from './migrate.ts';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://sem_sotaque:sem_sotaque@localhost:5432/sem_sotaque_test';

declare module 'vitest' {
  export interface ProvidedContext {
    bancoDisponivel: boolean;
  }
}

export default async function setup(project: TestProject) {
  const url = new URL(TEST_DATABASE_URL);
  const nome = url.pathname.slice(1);
  url.pathname = '/postgres';

  const admin = postgres(url.toString(), { max: 1, onnotice: () => {}, connect_timeout: 3 });
  try {
    const existe = await admin`select 1 from pg_database where datname = ${nome}`;
    if (existe.length === 0) await admin.unsafe(`create database "${nome}"`);
  } catch (erro) {
    // Only "nobody is listening" means no database. A wrong password or a
    // missing role is a broken setup and must fail, not skip the suite.
    if ((erro as { code?: string }).code !== 'ECONNREFUSED') throw erro;
    console.warn(`database tests skipped: nothing listening at ${url.host}`);
    project.provide('bancoDisponivel', false);
    return;
  } finally {
    await admin.end();
  }

  await migrar(TEST_DATABASE_URL);
  project.provide('bancoDisponivel', true);
}
