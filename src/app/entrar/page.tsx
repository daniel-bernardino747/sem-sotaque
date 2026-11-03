// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from 'next/navigation';

import { LinksLegais } from '@/app/_documento';
import { Faixa } from '@/app/marca';
import { Cantoneiras } from '@/app/ornamentos';
import { contaAtual } from '@/conta/servidor';

import { BotoesDeEntrar } from './botoes';

export const metadata = { title: 'Entrar · sem-sotaque', robots: { index: false, follow: false } };

const ERROS: Record<string, string> = {
  '1': 'Não deu para entrar. Tente de novo.',
  link: 'Este link já é de outra conta. Entre com a conta que você usou da primeira vez.',
};

/** The sign-in (step 20): GitHub or Google, nothing else. Signed in already goes home. */
export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (await contaAtual()) redirect('/casa');
  const erro = ERROS[(await searchParams).erro ?? ''];

  return (
    <>
      <Faixa />
      <main className="entrar placa">
        <Cantoneiras />
        <h1>Entrar</h1>
        <p>Entre com o GitHub ou com o Google. Não peço senha e não mando e-mail.</p>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <BotoesDeEntrar caminho={(p) => `/api/auth/${p}`} />
      </main>
      <footer>
        <LinksLegais />
      </footer>
    </>
  );
}
