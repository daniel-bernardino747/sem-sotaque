// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useActionState } from 'react';

import type { EstadoCabecalho } from '../acoes';
import { BotaoEnviar } from './botao-enviar';

const CAMPOS = [
  { nome: 'nome', rotulo: 'Seu nome, como vai no currículo', tipo: 'text', auto: 'name', obrigatorio: true },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email', auto: 'email', obrigatorio: true },
  { nome: 'linkedin', rotulo: 'Link do seu LinkedIn', tipo: 'url', auto: 'url', obrigatorio: true, dica: 'linkedin.com/in/…' },
  { nome: 'github', rotulo: 'Link do seu GitHub (opcional)', tipo: 'text', auto: 'off', obrigatorio: false, dica: 'github.com/…' },
  { nome: 'local', rotulo: 'Cidade e país', tipo: 'text', auto: 'off', obrigatorio: true, dica: 'Recife, Brazil' },
] as const;

/**
 * The header form. `enviar` is `enviarCabecalho`; `inicial`
 * is the header already given, for "gerar de novo".
 */
export function FormularioCabecalho({
  enviar,
  inicial = {},
  rotulo = 'Gerar meu currículo',
}: {
  enviar: (anterior: EstadoCabecalho, form: FormData) => Promise<EstadoCabecalho>;
  inicial?: Record<string, string>;
  rotulo?: string;
}) {
  const [estado, acao] = useActionState(enviar, { erro: null, valores: inicial });
  return (
    <form action={acao} className="envio">
      {CAMPOS.map((c) => (
        <label key={c.nome} className="campo">
          <span>{c.rotulo}</span>
          <input
            name={c.nome}
            // `url` would refuse "linkedin.com/in/ana" without https://; the server reads it either way.
            type={c.tipo === 'url' ? 'text' : c.tipo}
            inputMode={c.tipo === 'url' ? 'url' : undefined}
            autoComplete={c.auto}
            required={c.obrigatorio}
            placeholder={'dica' in c ? c.dica : undefined}
            defaultValue={estado.valores[c.nome] ?? ''}
          />
        </label>
      ))}
      {estado.erro && (
        <p role="alert" className="erro">
          {estado.erro}
        </p>
      )}
      <BotaoEnviar pendente="Começando…" className="primario">
        {rotulo}
      </BotaoEnviar>
    </form>
  );
}
