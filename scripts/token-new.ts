// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Create a Tester and print their link.
 *
 *     npm run token:new -- "<apelido>" --origem "<grupo>" [--indicado-por <token>]
 *
 * The link is the only credential: send it to that person and nobody else.
 * `--indicado-por` takes the token of the Tester who referred them.
 */
import { parseArgs } from 'node:util';

import { fecharDb } from '../src/db/client.ts';
import { criarTester, sessaoPorToken } from '../src/db/index.ts';

const USO = 'uso: npm run token:new -- "<apelido>" --origem "<grupo>" [--indicado-por <token>]';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    origem: { type: 'string' },
    'indicado-por': { type: 'string' },
  },
});

const apelido = positionals[0]?.trim();
const origem = values.origem?.trim();
if (!apelido || !origem || positionals.length > 1) {
  console.error(USO);
  process.exit(1);
}

async function main(): Promise<number> {
  let indicadoPor: string | undefined;
  if (values['indicado-por']) {
    const quemIndicou = await sessaoPorToken(values['indicado-por']);
    if (!quemIndicou) {
      console.error('--indicado-por: nenhum Tester ativo com esse token');
      return 1;
    }
    indicadoPor = quemIndicou.tester.id;
  }

  const { token } = await criarTester({ apelido: apelido!, origem: origem!, indicadoPor });
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  console.log(`${base}/s/${token}`);
  return 0;
}

try {
  process.exitCode = await main();
} finally {
  await fecharDb();
}
