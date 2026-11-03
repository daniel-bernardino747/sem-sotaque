// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useActionState } from 'react';

import type { EstadoVaga } from '../acoes';
import { BotaoEnviar } from './botao-enviar';

/** The paste form of "Achei uma vaga". `colar` is `colarVaga`. */
export function ColarVaga({ colar }: { colar: (anterior: EstadoVaga, form: FormData) => Promise<EstadoVaga> }) {
  const [estado, acao] = useActionState(colar, { erro: null, valores: {} });
  const valor = (k: string) => estado.valores[k] ?? '';

  return (
    <form action={acao} className="envio">
      <label className="campo">
        <span>O texto da vaga</span>
        <textarea name="texto" rows={10} required defaultValue={valor('texto')} />
      </label>
      <label className="campo">
        <span>Empresa (opcional)</span>
        <input name="empresa" autoComplete="off" defaultValue={valor('empresa')} />
      </label>
      <label className="campo">
        <span>Cargo (opcional)</span>
        <input name="cargo" autoComplete="off" defaultValue={valor('cargo')} />
      </label>
      <label className="campo">
        <span>Link da vaga (opcional)</span>
        <input name="link" type="url" inputMode="url" autoComplete="off" defaultValue={valor('link')} />
        <small>Fica guardado para você achar a vaga depois. Eu não abro o link.</small>
      </label>
      {estado.erro && (
        <p role="alert" className="erro">
          {estado.erro}
        </p>
      )}
      <BotaoEnviar pendente="Guardando a vaga…">Ler a vaga</BotaoEnviar>
    </form>
  );
}
