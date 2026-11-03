// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Cantoneiras } from '@/app/ornamentos';

import { aceitarConsentimento } from '../acoes';
import { BotaoEnviar } from './botao-enviar';
import { TextoDoConsentimento } from './texto-consentimento';

export function Consentimento() {
  return (
    <>
      <section className="abertura placa" aria-label="O que é isto">
        <Cantoneiras />
        <p>
          Eu sou o Daniel, dev como você. Vou te perguntar sobre o que você fez, em português, até cada linha do
          seu currículo ter um resultado que você defende numa entrevista. No fim, você recebe o currículo em
          inglês, em PDF.
        </p>
        <ul className="garantias">
          <li>De 20 a 40 min</li>
          <li>Pode parar e voltar quando quiser</li>
          <li>Nenhum número inventado</li>
        </ul>
      </section>
      <h1>Antes de começar</h1>
      <TextoDoConsentimento />
      <p className="dados-intro">
        O resto está nos <a href="/termos">termos de uso</a> e na <a href="/privacidade">política de privacidade</a>.
      </p>
      <form action={aceitarConsentimento} className="consentimento">
        <label className="caixa">
          <input type="checkbox" name="aceito" value="sim" required />
          <span>Li e concordo com o que está escrito acima.</span>
        </label>
        {/* Its own consent (step 22): unticked, never required, and it can be turned off at home. */}
        <label className="caixa">
          <input type="checkbox" name="pode_ler" value="sim" />
          <span>
            Pode ler para melhorar o produto.{' '}
            <small>
              O Daniel lê a conversa, os currículos e as vagas para achar onde a ferramenta erra. Opcional, e dá para
              desligar na sua página quando quiser.
            </small>
          </span>
        </label>
        <BotaoEnviar pendente="Começando…">Começar</BotaoEnviar>
      </form>
    </>
  );
}
