// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` writes a new SQL migration into drizzle/ from the diff
// between src/db/schema.ts and the migrations already there. Review it and
// commit it; `npm run db:migrate` applies it.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
