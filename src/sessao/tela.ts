// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Sessao } from '@/db';

/**
 * What a link asks before the home: the consent, or the new consent text. The
 * session's `estado` records how far the person got (the funnel reads it); it
 * no longer decides the screen (step 14). Each route decides by its own state.
 */
export type AntesDaCasa = 'consentimento' | 'reconsentimento';

type Portao = Pick<Sessao, 'estado' | 'textoConsentimentoVersao' | 'recusouAvaliadorEm'>;

/**
 * A session mid-interrogation that accepted consent v1 and has not answered
 * v2 yet: it sees the new text before the next question (step 10).
 */
export function precisaReaceitar(sessao: Portao): boolean {
  return sessao.estado === 'interrogando' && sessao.textoConsentimentoVersao === 'v1' && !sessao.recusouAvaliadorEm;
}

/** What the person owes before the home, or null when the home opens. */
export function antesDaCasa(sessao: Portao): AntesDaCasa | null {
  if (sessao.estado === 'novo') return 'consentimento';
  return precisaReaceitar(sessao) ? 'reconsentimento' : null;
}
