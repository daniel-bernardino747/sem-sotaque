// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { notFound, redirect } from 'next/navigation';

import { Apagado } from '@/app/casa/_telas/apagado';
import { BotoesDeEntrar } from '@/app/entrar/botoes';
import { Faixa } from '@/app/marca';
import { Cantoneiras } from '@/app/ornamentos';
import { contaAtual } from '@/conta/servidor';
import { situacaoDoLink } from '@/db';
import { modo } from '@/modo';

export const metadata = { robots: { index: false, follow: false } };

/**
 * A v0 link (step 20). It is no longer the key: the first time, it asks for a
 * sign-in and the callback links its Tester to the account; after that it
 * only leads to the sign-in (or home, signed in as its account). Another
 * account's link and an unknown one are the same 404; an erased one still
 * says so.
 */
export default async function LinkAntigo({ params }: { params: Promise<{ token: string }> }) {
  // MODO=local has no links to link: whatever the token, the one home.
  if (modo() === 'local') redirect('/casa');
  const { token } = await params;
  const conta = await contaAtual();
  const situacao = await situacaoDoLink(token, conta?.id ?? null);
  if (situacao === 'nao_existe') notFound();
  if (situacao === 'casa') redirect('/casa');
  if (situacao === 'entrar') redirect('/entrar');
  if (situacao === 'apagado')
    return (
      <>
        <Faixa />
        <Apagado />
      </>
    );

  return (
    <>
      <Faixa />
      <main className="entrar placa">
        <Cantoneiras />
        <h1>Agora o seu link pede uma conta</h1>
        <p>
          Para guardar o que você já me contou, entre com o GitHub ou com o Google. Da próxima vez, é só entrar:
          este link não abre mais nada sozinho.
        </p>
        <BotoesDeEntrar caminho={(p) => `/s/${token}/entrar/${p}`} />
      </main>
    </>
  );
}
