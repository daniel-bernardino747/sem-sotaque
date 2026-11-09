// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from 'next/navigation';

import { telaSemAcesso } from '@/assinatura/acesso';
import { entradaAtual } from '@/conta/servidor';
import { assinaturaDaConta, situacao, temCorpus } from '@/db';
import { antesDaCasa } from '@/sessao/tela';

import { Casa } from './_telas/casa';
import { Consentimento } from './_telas/consentimento';
import { Moldura } from './_telas/moldura';
import { Reconsentimento } from './_telas/reconsentimento';
import { SemAcesso } from './_telas/sem-acesso';

export const metadata = { robots: { index: false, follow: false } };

/**
 * The signed-in person's home (`/casa`). Signed out goes to `/entrar`.
 * Without a subscription it shows only the paywall (step 21); then the
 * consent (or the new consent text); then the home. The conversation and the
 * résumé have their own routes. Back from the Checkout, Stripe adds
 * `?assinatura=ok`.
 */
export default async function PaginaDaCasa({ searchParams }: { searchParams: Promise<{ assinatura?: string }> }) {
  const entrada = await entradaAtual();
  const sessao = entrada?.sessao;
  if (!entrada || !sessao) redirect('/entrar');

  if (!entrada.acesso) {
    const tela = telaSemAcesso(situacao(await assinaturaDaConta(entrada.conta.id)), (await searchParams).assinatura === 'ok');
    return (
      <Moldura>
        <SemAcesso tela={tela} temCorpus={await temCorpus(sessao.id)} />
      </Moldura>
    );
  }

  const antes = antesDaCasa(sessao);
  return (
    <Moldura>
      {antes === 'consentimento' ? <Consentimento /> : antes === 'reconsentimento' ? <Reconsentimento /> : <Casa sessao={sessao} />}
    </Moldura>
  );
}
