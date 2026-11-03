// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { CONSENTIMENTO_VAGAS_VERSAO } from '@/conteudo/consentimento';
import { cotaDeVagas, SEM_LIMITE_DE_VAGAS, type Sessao } from '@/db';

import { colarVaga, responderVagas } from '../acoes';
import { ColarVaga } from './colar-vaga';
import { VoltarParaACasa } from './moldura';
import { dataCurta } from './resultado';
import { TextoDoConsentimento } from './texto-consentimento';

/**
 * "Achei uma vaga" (`/vagas/nova`): the Vagas consent the first time (and
 * again after a no), the limit once the quarter's quota is used (step 21), or
 * the paste form.
 */
export async function VagaNova({ sessao }: { sessao: Sessao }) {
  if (!sessao.vagasConsentiuEm) {
    return (
      <>
        <VoltarParaACasa />
        <h1>Antes da primeira vaga</h1>
        <TextoDoConsentimento versao={CONSENTIMENTO_VAGAS_VERSAO} />
        <form action={responderVagas} className="consentimento">
          <button type="submit" name="resposta" value="sim">
            Aceito, colar a vaga
          </button>
          <button type="submit" name="resposta" value="nao" className="secundario">
            Agora não
          </button>
        </form>
      </>
    );
  }

  const { usadas, limite, zeraEm } = await cotaDeVagas(sessao.id);
  const zera = zeraEm ? ` A contagem volta a zero em ${dataCurta(zeraEm)}` : '';
  if (usadas >= limite) {
    return (
      <>
        <VoltarParaACasa />
        <h1>Você usou as {limite} vagas deste trimestre</h1>
        <p>
          {zera && `${zera.trim()}, na renovação. `}Apagar uma vaga não devolve o lugar dela.
        </p>
      </>
    );
  }

  const restantes = limite - usadas;
  return (
    <>
      <VoltarParaACasa />
      <h1>Achei uma vaga</h1>
      <p>
        Cole o texto da vaga como está no anúncio, com os requisitos. Eu separo o que ela pede e vejo o que você já me
        contou que cobre cada coisa.
      </p>
      <ColarVaga colar={colarVaga} />
      {/* MODO=local has no limit (contaLocal): nothing to count. */}
      {limite < SEM_LIMITE_DE_VAGAS && (
        <p className="aviso">
          {restantes === 1 ? 'Esta é a sua última vaga neste trimestre.' : `Você ainda pode colar ${restantes} vagas neste trimestre.`}
          {zera && `${zera}.`}
        </p>
      )}
    </>
  );
}
