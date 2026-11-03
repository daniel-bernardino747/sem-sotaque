// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { LIMITE_PDF } from '@/import/limites';

import type { EstadoEnvio } from '../acoes';
import { BotaoEnviar } from './botao-enviar';

function AvisoDeEspera() {
  const { pending } = useFormStatus();
  return pending ? <p className="aviso">Isso leva até um minuto. Não feche a página.</p> : null;
}

/** The upload/paste form. `enviar` is `enviarCurriculo`. */
export function EnvioCurriculo({
  enviar,
}: {
  enviar: (anterior: EstadoEnvio, form: FormData) => Promise<EstadoEnvio>;
}) {
  const [estado, acao] = useActionState(enviar, { erro: null, texto: '' });
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const erro = erroArquivo ?? estado.erro;

  return (
    <form action={acao} className="envio">
      <label className="campo arquivo">
        <span>O PDF do seu currículo</span>
        <input
          type="file"
          name="pdf"
          accept="application/pdf"
          onChange={(e) => {
            const arquivo = e.currentTarget.files?.[0];
            const grande = arquivo !== undefined && arquivo.size > LIMITE_PDF;
            setErroArquivo(grande ? 'O PDF passa de 5 MB. Cole o texto do currículo abaixo.' : null);
            if (grande) e.currentTarget.value = '';
          }}
        />
      </label>

      <p className="ou">ou</p>

      <label className="campo">
        <span>Cole o texto do currículo, ou o “Sobre” e as experiências do seu LinkedIn</span>
        <textarea name="texto" rows={6} defaultValue={estado.texto} />
      </label>

      {erro && (
        <p role="alert" className="erro">
          {erro}
        </p>
      )}
      <BotaoEnviar pendente="Lendo seu currículo…">Ler meu currículo</BotaoEnviar>
      <AvisoDeEspera />
    </form>
  );
}
