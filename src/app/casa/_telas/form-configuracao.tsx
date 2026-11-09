// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useActionState } from 'react';

import type { CaminhoModelo } from '@/db/schema';
import type { Estado } from '@/llm/disponibilidade';

import type { EstadoConfiguracao } from '../acoes';
import { BotaoEnviar } from './botao-enviar';

export interface OpcaoDeCaminho {
  caminho: CaminhoModelo;
  titulo: string;
  descricao: string;
  estado: Estado;
  experimental?: boolean;
}

/**
 * The way to the model (step 28): one box per way, the unavailable ones
 * disabled with their reason, and the Codex model under the ChatGPT one.
 * `salvar` is `salvarConfiguracao`, which checks the way again.
 */
export function FormConfiguracao({
  salvar,
  opcoes,
  atual,
  modeloCodex,
}: {
  salvar: (anterior: EstadoConfiguracao, form: FormData) => Promise<EstadoConfiguracao>;
  opcoes: OpcaoDeCaminho[];
  atual: CaminhoModelo;
  modeloCodex: string | null;
}) {
  const [estado, acao] = useActionState(salvar, { erro: null, salvo: false });

  return (
    <form action={acao} className="consentimento" aria-labelledby="caminho-titulo">
      <h2 id="caminho-titulo">Por onde o modelo responde</h2>
      {opcoes.map((o) => (
        <label key={o.caminho} className="caixa">
          <input type="radio" name="caminho" value={o.caminho} defaultChecked={o.caminho === atual} disabled={!o.estado.disponivel} />
          <span>
            <strong>{o.titulo}</strong>
            {o.experimental && <> (experimental)</>}
            <br />
            {o.descricao}
            <br />
            <small>{o.estado.disponivel ? o.estado.detalhe : o.estado.motivo}</small>
          </span>
        </label>
      ))}
      <label className="campo">
        <span>Modelo do ChatGPT (deixe vazio para o padrão do seu Codex)</span>
        <input type="text" name="modeloCodex" defaultValue={modeloCodex ?? ''} autoComplete="off" spellCheck={false} />
      </label>
      {estado.erro && (
        <p role="alert" className="erro">
          {estado.erro}
        </p>
      )}
      {estado.salvo && (
        <p role="status" className="aviso">
          Guardado. Vale a partir da próxima pergunta.
        </p>
      )}
      <BotaoEnviar pendente="Conferindo…">Guardar</BotaoEnviar>
    </form>
  );
}
