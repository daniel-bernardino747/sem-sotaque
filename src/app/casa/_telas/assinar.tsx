// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useActionState } from 'react';

import type { EstadoAssinar } from '../acoes';
import { BotaoEnviar } from './botao-enviar';

/** The "Assinar" button: off to the Checkout, or the error if Stripe did not answer. */
export function FormAssinar({ assinar }: { assinar: (anterior: EstadoAssinar, form: FormData) => Promise<EstadoAssinar> }) {
  const [estado, acao] = useActionState(assinar, { erro: false });
  return (
    <form action={acao} className="assinar">
      {estado.erro && (
        <p className="erro" role="alert">
          Não deu para abrir o pagamento. Tente de novo.
        </p>
      )}
      <BotaoEnviar pendente="Abrindo o pagamento…">Assinar por R$ 99/trimestre</BotaoEnviar>
    </form>
  );
}
