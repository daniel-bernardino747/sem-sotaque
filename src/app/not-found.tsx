// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Faixa } from './marca';
import { Cantoneiras } from './ornamentos';

/** The same page for every link that leads nowhere, so none says whether it ever existed. */
export default function NaoEncontrada() {
  return (
    <>
      <Faixa />
      <main className="nao-encontrada placa">
        <Cantoneiras />
        <h1>Página não encontrada</h1>
        <p>Confira se o link foi copiado inteiro.</p>
      </main>
    </>
  );
}
