// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useState } from 'react';

import { BotaoEnviar } from './botao-enviar';

/** "Apagar esta vaga", in two steps on the page, like "Apagar meus dados". */
export function ApagarVaga({ apagar }: { apagar: () => Promise<void> }) {
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <button type="button" className="discreto" onClick={() => setConfirmando(true)}>
        Apagar esta vaga
      </button>
    );
  }

  return (
    <form action={apagar} className="confirmar-apagar" role="alertdialog" aria-labelledby="apagar-vaga-titulo">
      <p id="apagar-vaga-titulo">
        <strong>Apagar esta vaga?</strong> O texto da vaga, os requisitos e o que você marcou somem para sempre.
        Ela continua contando no limite de vagas.
      </p>
      <div className="botoes">
        <BotaoEnviar pendente="Apagando…" className="perigo">
          Sim, apagar a vaga
        </BotaoEnviar>
        <button type="button" onClick={() => setConfirmando(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
