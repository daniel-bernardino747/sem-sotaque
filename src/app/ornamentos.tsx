// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The banknote's ornaments, shared by every screen that carries them: the
 * guilloché lens, the ochre corner flourishes, the wave strip that parts
 * bands, and the call's speech bubble. All decorative, hidden from assistive tech.
 */

/**
 * A banknote's security print, cut like a camera lens: the rosette of ellipses,
 * the concentric rings, and a scale of distance ticks just inside the ring around the plate, each its own layer so the
 * page can turn and breathe them separately. Fixed behind the whole page.
 */
export function Lente() {
  return (
    <div className="lente" aria-hidden="true">
      <svg className="lente-rosa" viewBox="-200 -200 400 400">
        {Array.from({ length: 28 }, (_, i) => (
          <ellipse key={i} cx="0" cy="0" rx="190" ry="72" transform={`rotate(${(i * 180) / 28})`} />
        ))}
      </svg>
      <svg className="lente-aneis" viewBox="-200 -200 400 400">
        {Array.from({ length: 6 }, (_, i) => (
          <circle key={i} cx="0" cy="0" r={60 + i * 26} />
        ))}
      </svg>
      <svg className="lente-escala" viewBox="-200 -200 400 400">
        <circle cx="0" cy="0" r="56" />
        {Array.from({ length: 120 }, (_, i) => (
          <line key={i} x1="0" y1={-56} x2="0" y2={i % 10 === 0 ? -51 : i % 5 === 0 ? -53 : -54.5} transform={`rotate(${i * 3})`} />
        ))}
      </svg>
    </div>
  );
}

/** A corner flourish in the wordmark's ochre: a double bracket ending in two curls. Sits in a positioned parent. */
export function Cantoneira({ canto }: { canto: 'se' | 'sd' | 'ie' | 'id' }) {
  return (
    <svg className={`cantoneira ${canto}`} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M4 60 V4 H60" />
      <path d="M11 60 V11 H60" />
      <path d="M60 4 c0 9 -7 13 -13 10 c-4 -2 -3 -8 1 -8" />
      <path d="M4 60 c9 0 13 -7 10 -13 c-2 -4 -8 -3 -8 1" />
      <path d="M11 11 L22 22 M18 11 L22 15 M11 18 L15 22" />
    </svg>
  );
}

/** The four flourishes at once, for a framed panel. */
export function Cantoneiras() {
  return (
    <>
      <Cantoneira canto="se" />
      <Cantoneira canto="sd" />
      <Cantoneira canto="ie" />
      <Cantoneira canto="id" />
    </>
  );
}

/** The strip of guilloché that parts the bands: two sine waves out of phase. */
export function Onda() {
  return (
    <svg className="onda" viewBox="0 0 240 16" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 8 Q15 0 30 8 T60 8 T90 8 T120 8 T150 8 T180 8 T210 8 T240 8" />
      <path d="M0 8 Q15 16 30 8 T60 8 T90 8 T120 8 T150 8 T180 8 T210 8 T240 8" />
    </svg>
  );
}
