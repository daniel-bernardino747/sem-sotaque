// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { TEST_DATABASE_URL } from './src/db/test-setup.ts';

export default defineConfig({
  // The `@/*` path of tsconfig.json, which Next resolves on its own.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/db/test-setup.ts'],
    // The database tests talk to their own database, never the dev one.
    env: { DATABASE_URL: TEST_DATABASE_URL },
  },
});
