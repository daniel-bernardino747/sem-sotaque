// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useEffect, useState } from 'react';

import { Balao } from './ornamentos';

/**
 * The invitation pinned to the bottom of the screen while the home scrolls,
 * until the seal at its foot comes into view and takes over the call. Once the
 * seal is on screen, or scrolled past, the bar slides away.
 */
export function BarraConvite({ href, selo }: { href: string; selo: string }) {
  const [escondida, setEscondida] = useState(false);

  useEffect(() => {
    const alvo = document.getElementById(selo);
    if (!alvo) return;
    const observador = new IntersectionObserver(([entrada]) => {
      setEscondida(entrada.isIntersecting || entrada.boundingClientRect.top < 0);
    });
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [selo]);

  return (
    <div className="barra-convite" data-escondida={escondida} inert={escondida}>
      <span className="barra-convite-texto">Teste fechado e grátis</span>
      <a className="barra-convite-botao" href={href}>
        <Balao />
        Pedir convite
      </a>
    </div>
  );
}
