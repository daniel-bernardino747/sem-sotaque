// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Cantoneiras } from '@/app/ornamentos';
import type { TelaSemAcesso } from '@/assinatura/acesso';

import { assinar, gerirAssinatura } from '../acoes';
import { FormAssinar } from './assinar';
import { BotaoEnviar } from './botao-enviar';
import { Recarregar } from './recarregar';

/**
 * The home of an account without access (step 21, decision 2): only this.
 * `assinar` is the paywall; `esperando`, back from a paid Checkout, reloads
 * until the webhook opens the home; `pendente` sends to the portal to fix
 * the card, never to a second subscription. With a Corpus, the person can
 * still take it (step 27, C6): exporting needs no subscription.
 */
export function SemAcesso({ tela, temCorpus }: { tela: TelaSemAcesso; temCorpus: boolean }) {
  const baixar = temCorpus && (
    <p className="motivo">
      O que você me contou continua seu, com ou sem assinatura: <a href="/casa/exportar">Baixar meu Corpus</a>.
    </p>
  );

  if (tela === 'esperando') {
    return (
      <>
        <Recarregar />
        <h1>Recebi o seu pagamento</h1>
        <p>A sua página abre em alguns segundos.</p>
      </>
    );
  }

  if (tela === 'pendente') {
    return (
      <>
        <h1>O pagamento não passou</h1>
        <p>O Stripe não conseguiu cobrar o trimestre no seu cartão. Atualize o cartão e a sua página abre de novo.</p>
        <form action={gerirAssinatura}>
          <BotaoEnviar pendente="Abrindo…">Gerenciar assinatura</BotaoEnviar>
        </form>
        {baixar}
      </>
    );
  }

  return (
    <>
      <section className="abertura placa" aria-labelledby="assinar-titulo">
        <Cantoneiras />
        <h1 id="assinar-titulo">Assinar o sem-sotaque</h1>
        <p>
          R$ 99 por trimestre, no cartão. É o preço do beta, e ele fica travado enquanto a sua assinatura estiver
          ativa.
        </p>
        <ul className="garantias">
          <li>15 vagas por trimestre, cada uma com até 3 versões</li>
          <li>Cancela quando quiser: o acesso vai até o fim do trimestre pago</li>
          <li>Nos 7 dias depois de assinar, devolvo tudo: é só me mandar um e-mail</li>
        </ul>
      </section>
      <FormAssinar assinar={assinar} />
      <p className="motivo">O pagamento é pelo Stripe. Eu não vejo o número do seu cartão.</p>
      <p className="motivo">
        Ao assinar, você concorda com os <a href="/termos">termos de uso</a>. O que acontece com os seus dados está na{' '}
        <a href="/privacidade">política de privacidade</a>.
      </p>
      {baixar}
    </>
  );
}
