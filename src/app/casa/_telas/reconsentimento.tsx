// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { MUDOU_NO_V2, REACEITE_VERSAO } from '@/conteudo/consentimento';

import { reaceitarConsentimento } from '../acoes';
import { TextoDoConsentimento } from './texto-consentimento';

/**
 * For a session that began on consent v1 and is mid-interrogation: what
 * changed, the new text, and a yes or a no. Either way the conversation goes
 * on; a no only turns the evaluator off.
 */
export function Reconsentimento() {
  return (
    <>
      <h1>Uma mudança antes de continuar</h1>
      <p className="mudou">
        <strong>{MUDOU_NO_V2}</strong>
      </p>
      <p>O texto completo, como fica agora:</p>
      <TextoDoConsentimento versao={REACEITE_VERSAO} />
      <form action={reaceitarConsentimento} className="consentimento">
        <button type="submit" name="resposta" value="sim">
          Aceito, continuar
        </button>
        <button type="submit" name="resposta" value="nao" className="secundario">
          Não aceito, continuar sem isso
        </button>
      </form>
    </>
  );
}
