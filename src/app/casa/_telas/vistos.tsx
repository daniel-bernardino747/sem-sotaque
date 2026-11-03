// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

const VISTOS = 10;

/** The coverage as a row of visa slots: one stamp per tenth covered. */
export function Vistos({ cobertura }: { cobertura: number }) {
  const carimbados = Math.floor(cobertura / (100 / VISTOS));
  return (
    <span className="vistos" aria-hidden="true">
      {Array.from({ length: VISTOS }, (_, i) => (
        <span key={i} className={i < carimbados ? 'visto carimbado' : 'visto'} />
      ))}
    </span>
  );
}
