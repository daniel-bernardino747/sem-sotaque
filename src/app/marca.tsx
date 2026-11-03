// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Onda } from './ornamentos';

/**
 * The band every Tester screen opens under: the wordmark in the plate's face
 * and who is behind it, over the ochre wave strip; nothing links anywhere.
 */
export function Faixa() {
  return (
    <header className="faixa">
      <div className="faixa-dentro">
        <span className="marca">sem-sotaque</span>
        <span className="autor">por Daniel Bernardino</span>
      </div>
      <Onda />
    </header>
  );
}
