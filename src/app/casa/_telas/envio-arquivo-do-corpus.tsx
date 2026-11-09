// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useActionState, useState } from 'react';

import { LIMITE_ARQUIVO } from '@/arquivo-do-corpus/limites';

import type { EstadoArquivo } from '../acoes';
import { BotaoEnviar } from './botao-enviar';

/**
 * The import screen's third door (step 27): the file "Baixar meu Corpus"
 * gave, from here or from another instance. `enviar` is `enviarArquivoDoCorpus`.
 */
export function EnvioArquivoDoCorpus({
  enviar,
}: {
  enviar: (anterior: EstadoArquivo, form: FormData) => Promise<EstadoArquivo>;
}) {
  const [estado, acao] = useActionState(enviar, { erro: null });
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const erro = erroArquivo ?? estado.erro;

  return (
    <form action={acao} className="envio" aria-labelledby="arquivo-titulo">
      <h2 id="arquivo-titulo">Tenho um arquivo do sem-sotaque</h2>
      <p>
        Se você já contou a sua carreira aqui ou numa instância sua, traga o arquivo de “Baixar meu Corpus”. Ela volta
        como estava, com os números, e a conversa continua do que ficou em aberto.
      </p>
      <label className="campo arquivo">
        <span>O arquivo do seu Corpus (.json)</span>
        <input
          type="file"
          name="corpus"
          accept=".json,application/json"
          onChange={(e) => {
            const arquivo = e.currentTarget.files?.[0];
            const grande = arquivo !== undefined && arquivo.size > LIMITE_ARQUIVO;
            setErroArquivo(grande ? 'Este arquivo passa de 5 MB: não é um Corpus do sem-sotaque.' : null);
            if (grande) e.currentTarget.value = '';
          }}
        />
      </label>
      {erro && (
        <p role="alert" className="erro">
          {erro}
        </p>
      )}
      <BotaoEnviar pendente="Importando…" className="vazado">
        Importar o arquivo
      </BotaoEnviar>
    </form>
  );
}
