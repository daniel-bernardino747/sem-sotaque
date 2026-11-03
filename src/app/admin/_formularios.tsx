// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

'use client';

import { useActionState } from 'react';

import type { EstadoEntrada, EstadoNotas, EstadoToken } from './acoes';

type Acao<E> = (anterior: E, form: FormData) => Promise<E>;

export function FormularioEntrada({ entrar }: { entrar: Acao<EstadoEntrada> }) {
  const [estado, acao, pendente] = useActionState(entrar, { erro: null });
  return (
    <form action={acao} className="envio">
      <label className="campo">
        Token do painel
        <input name="token" type="password" autoComplete="current-password" required autoFocus />
      </label>
      {estado.erro && <p className="erro">{estado.erro}</p>}
      <button type="submit" disabled={pendente}>
        {pendente ? 'Conferindo…' : 'Entrar'}
      </button>
    </form>
  );
}

export function FormularioToken({
  gerar,
  testers,
}: {
  gerar: Acao<EstadoToken>;
  testers: { id: string; apelido: string; origem: string }[];
}) {
  const [estado, acao, pendente] = useActionState(gerar, { erro: null, link: null, apelido: null });
  return (
    <form action={acao} className="envio painel-form">
      <label className="campo">
        Apelido
        <input name="apelido" required />
      </label>
      <label className="campo">
        Origem (grupo, LinkedIn, indicação)
        <input name="origem" required />
      </label>
      <label className="campo">
        Indicado por (opcional)
        <select name="indicadoPor" defaultValue="">
          <option value="">ninguém</option>
          {testers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.apelido} ({t.origem})
            </option>
          ))}
        </select>
      </label>
      {estado.erro && <p className="erro">{estado.erro}</p>}
      {estado.link && (
        <p className="link-gerado">
          Link de <strong>{estado.apelido}</strong> (mande só para essa pessoa):
          <br />
          <code>{estado.link}</code>
        </p>
      )}
      <button type="submit" disabled={pendente}>
        {pendente ? 'Gerando…' : 'Gerar link'}
      </button>
    </form>
  );
}

export function FormularioNotas({ salvar, notas }: { salvar: Acao<EstadoNotas>; notas: string }) {
  const [estado, acao, pendente] = useActionState(salvar, { salvoEm: null, erro: null });
  return (
    <form action={acao} className="envio">
      <label className="campo">
        Onde o produto errou
        <textarea name="notas" rows={6} defaultValue={notas} />
      </label>
      {estado.erro && <p className="erro">{estado.erro}</p>}
      {estado.salvoEm && <p className="aviso">Salvo às {new Date(estado.salvoEm).toLocaleTimeString('pt-BR')}.</p>}
      <button type="submit" disabled={pendente}>
        {pendente ? 'Salvando…' : 'Salvar notas'}
      </button>
    </form>
  );
}
