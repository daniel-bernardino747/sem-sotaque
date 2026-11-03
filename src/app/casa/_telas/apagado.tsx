// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Cantoneiras } from '@/app/ornamentos';

/**
 * After "Apagar meus dados". `/apagado` (with an account, step 20) says the
 * account went too; a v0 link erased before there were accounts keeps saying
 * the link opens nothing.
 */
export function Apagado({ deConta = false }: { deConta?: boolean }) {
  return (
    <main className="apagado placa">
      <Cantoneiras />
      {/* A cancellation stamp: drawn, not written, so the heading stays the only words. */}
      <svg className="carimbo-cancelado" viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
        <circle cx="48" cy="48" r="44" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="48" cy="48" r="37" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d="M22 70 74 26" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <h1>Seus dados foram apagados</h1>
      <p>
        O currículo, as respostas e tudo o que saiu deles não existem mais.{' '}
        {deConta ? 'A sua conta saiu junto.' : 'Este link não abre mais nada.'}
      </p>
      <p>Obrigado por ter testado.</p>
    </main>
  );
}
