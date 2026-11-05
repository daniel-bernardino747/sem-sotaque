// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ReactNode } from 'react';

import { LinksLegais } from '@/app/_documento';
import { Faixa } from '@/app/marca';
import { apagarCancelaAssinatura } from '@/assinatura/cancelar';
import { assinaturaDaConta } from '@/db';
import { contaAtual } from '@/conta/servidor';
import { modo } from '@/modo';

import { abriuOLink, apagarDados, gerirAssinatura, sairDaConta } from '../acoes';
import { Abertura } from './abertura';
import { ApagarDados } from './apagar-dados';

/**
 * What every route under `/casa` draws around its screen: the band, and
 * "Gerenciar assinatura" (with a subscription, step 21), "Sair" and "apagar
 * meus dados" at the foot. `MODO=local` has neither of the first two: nobody
 * signs in or pays.
 */
export async function Moldura({ children }: { children: ReactNode }) {
  const conta = await contaAtual();
  const local = modo() === 'local';
  const [cancelaAssinatura, assinatura] = conta && !local
    ? await Promise.all([apagarCancelaAssinatura(conta.id), assinaturaDaConta(conta.id)])
    : [false, null];
  return (
    <>
      <Abertura registrar={abriuOLink} />
      <Faixa />
      <main>{children}</main>
      <footer>
        {/* Any subscription, ended ones too: the portal keeps the invoices. */}
        {assinatura && (
          <form action={gerirAssinatura}>
            <button type="submit" className="discreto">
              Gerenciar assinatura
            </button>
          </form>
        )}
        {!local && (
          <form action={sairDaConta}>
            <button type="submit" className="discreto">
              Sair
            </button>
          </form>
        )}
        <ApagarDados apagar={apagarDados} cancelaAssinatura={cancelaAssinatura} comConta={!local} />
        {/* The terms and the policy are the hosted service's: MODO=local has neither. */}
        {!local && <LinksLegais />}
      </footer>
    </>
  );
}

/** "Voltar para a minha página", at the top of a route that is not the home. */
export function VoltarParaACasa() {
  return (
    <p className="voltar">
      <a href="/casa">Voltar para a minha página</a>
    </p>
  );
}
