// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { connection } from 'next/server';

import { Apagado } from '@/app/casa/_telas/apagado';
import { Faixa } from '@/app/marca';
import { modo } from '@/modo';

export const metadata = { robots: { index: false, follow: false } };

/** Where "Apagar meus dados" lands: the account is gone with the data, so there is nobody to show it to but this page. */
export default async function PaginaDoApagado() {
  // Per request: the same image runs both modes.
  await connection();
  return (
    <>
      <Faixa />
      <Apagado deConta local={modo() === 'local'} />
    </>
  );
}
