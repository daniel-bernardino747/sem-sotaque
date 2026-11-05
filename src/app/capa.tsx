// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Cantoneiras, Lente } from './ornamentos';

/**
 * The cross-shaped frame of the cover: a vertical arm with arched ends over a
 * horizontal one, the inner corners cut as quarter circles. In a 300 × 380 box.
 */
const MOLDURA =
  'M80,70 A70,50 0 0 1 220,70 L220,85 A25,25 0 0 0 245,110 L298,110 L298,270 L245,270 A25,25 0 0 0 220,295 ' +
  'L220,310 A70,50 0 0 1 80,310 L80,295 A25,25 0 0 0 55,270 L2,270 L2,110 L55,110 A25,25 0 0 0 80,85 Z';

/**
 * The home's first screen: the engraved plate of a document. The heading is
 * the approved sentence, read whole by assistive tech; on screen its words
 * sit inside the frame the way a plate's legend does.
 */
export function Capa() {
  return (
    <section className="capa">
      <Lente />
      <Cantoneiras />

      <div className="capa-placa">
        <svg className="capa-moldura" viewBox="0 0 300 380" aria-hidden="true">
          <path d={MOLDURA} />
        </svg>

        <p className="capa-marca">sem-sotaque</p>

        {/* Public domain: wood engraving, 1878, A. H. Petiscus, "Der Olymp" (Wikimedia Commons). */}
        <img className="capa-gravura" src="/gravuras/belerofonte.png" alt="" width={853} height={900} />

        <h1 className="capa-legenda">
          <span className="visualmente-oculto">
            Quando o recrutador perguntar, você sabe de onde vem cada número: um currículo em inglês que você defende.
          </span>
          <span aria-hidden="true" className="capa-lado esquerdo">
            Quando ele
            <br />
            perguntar,
          </span>
          <span aria-hidden="true" className="capa-lado direito">
            você sabe
            <br />
            de onde vem
          </span>
          <span aria-hidden="true" className="capa-pe">
            Currículo que
            <br />
            você defende
          </span>
        </h1>
      </div>

      <p className="capa-autor">por Daniel Bernardino</p>
    </section>
  );
}
