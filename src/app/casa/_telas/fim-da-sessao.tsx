// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { fechamentoDaSessao, type Sessao } from '@/db';

import { enviarIndicacoes, enviarOpiniao } from '../acoes';
import { FormularioIndicacao, FormularioOpiniao, SaidaDaSecao } from './fim';

export const ID_FIM = 'fim';

/**
 * Below the résumé: the referral and the testimonial (step 22: the founder's
 * price and "pagaria?" left with the free test; their columns stay). Both
 * optional, each sent on its own, neither in the way of the PDF.
 */
export async function FimDaSessao({ sessao }: { sessao: Sessao }) {
  const { fechamento, indicacoes } = await fechamentoDaSessao(sessao.id);
  const opiniaoEnviada = Boolean(fechamento && (fechamento.depoimento || fechamento.comentario));

  return (
    <section id={ID_FIM} className="fim" aria-labelledby="fim-titulo">
      <h2 id="fim-titulo">Antes de ir</h2>
      <p>Tudo aqui é opcional. O seu PDF continua aí em cima, preencha você ou não.</p>

      <div className="bloco">
        <h3>Conhece outro dev que está tentando vaga lá fora?</h3>
        <p>Me passe o contato e eu conto do sem-sotaque para essa pessoa, dizendo que foi você que indicou.</p>
        <FormularioIndicacao enviar={enviarIndicacoes} jaIndicou={indicacoes} />
      </div>

      <div className="bloco">
        <h3>Sua opinião</h3>
        <FormularioOpiniao enviar={enviarOpiniao} jaEnviou={opiniaoEnviada} />
      </div>

      {sessao.estado === 'pronto' && <SaidaDaSecao alvo={ID_FIM} url={`/casa/fim`} />}
    </section>
  );
}
