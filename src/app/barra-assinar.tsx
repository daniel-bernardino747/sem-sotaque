// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useEffect, useState } from 'react';

/**
 * The call to subscribe pinned to the bottom of the screen while the home scrolls,
 * until the seal at its foot comes into view and takes over the call. Once the
 * seal is on screen, or scrolled past, the bar slides away. It says the result,
 * never the price: the price is said once, beside the seal.
 */
export function BarraAssinar({ href, selo }: { href: string; selo: string }) {
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
    <div className="barra-assinar" data-escondida={escondida} inert={escondida}>
      <span className="barra-assinar-texto">Um currículo em inglês que você defende</span>
      <a className="barra-assinar-botao" href={href}>
        Assinar
      </a>
    </div>
  );
}
