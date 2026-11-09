// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useActionState, useState } from 'react';

import type { EstadoApagar } from '../acoes';
import { BotaoEnviar } from './botao-enviar';

/**
 * What the confirmation says. `comConta`: hosted, where the account goes with
 * the data; MODO=local has no account to speak of (step 23).
 */
export function avisoDeApagar({ comConta, cancelaAssinatura }: { comConta: boolean; cancelaAssinatura: boolean }): string {
  return [
    `O seu currículo, as respostas e o currículo gerado somem para sempre${comConta ? ', e a sua conta sai junto' : ''}.`,
    cancelaAssinatura &&
      'A assinatura é cancelada na hora, e o resto do trimestre não volta: o reembolso só vale nos 7 dias depois de assinar.',
    'Não dá para desfazer.',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * "Apagar meus dados", in two steps on the page itself (no browser dialog): the
 * first tap only says what will happen, the second erases. With a live
 * subscription, it says first that the subscription is canceled now (decision 5).
 * With a Corpus, it offers the file before erasing (step 27, C6).
 */
export function ApagarDados({
  apagar,
  cancelaAssinatura,
  comConta,
  baixarAntes = false,
}: {
  apagar: (anterior: EstadoApagar, form: FormData) => Promise<EstadoApagar>;
  cancelaAssinatura: boolean;
  comConta: boolean;
  /** The session has a Corpus to take. */
  baixarAntes?: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, acao] = useActionState(apagar, { erro: false });

  if (!confirmando) {
    return (
      <button type="button" className="discreto" onClick={() => setConfirmando(true)}>
        Apagar meus dados
      </button>
    );
  }

  return (
    <form action={acao} className="confirmar-apagar" role="alertdialog" aria-labelledby="apagar-titulo">
      <p id="apagar-titulo">
        <strong>Apagar tudo?</strong> {avisoDeApagar({ comConta, cancelaAssinatura })}
      </p>
      {baixarAntes && (
        <p>
          Antes, se quiser, <a href="/casa/exportar/arquivo" download>baixe o seu Corpus</a>: com o arquivo, você traz
          tudo de volta aqui ou numa instância sua.
        </p>
      )}
      {estado.erro && (
        <p className="erro" role="alert">
          Não deu para cancelar a assinatura, então nada foi apagado. Tente de novo.
        </p>
      )}
      <div className="botoes">
        <BotaoEnviar pendente="Apagando…" className="perigo">
          Sim, apagar tudo
        </BotaoEnviar>
        <button type="button" onClick={() => setConfirmando(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
