// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from 'next/navigation';

import { entradaAtual } from '@/conta/servidor';
import { corpusDaSessao } from '@/db';

import { Moldura, VoltarParaACasa } from '../_telas/moldura';

export const metadata = { robots: { index: false, follow: false } };

/** Shown only when some Affiliation is confidential (C8): the file carries the real name. */
const AVISO_DAS_CONFIDENCIAIS =
  'O arquivo traz o nome das empresas marcadas como confidenciais. Só mande para quem pode saber.';

/**
 * "Baixar meu Corpus" (step 27): what the file holds and the button that
 * downloads it. Open to any signed-in account, with or without a
 * subscription (C6), so it never goes through `sessaoDaRota`. Reading the
 * account (`entradaAtual`) makes it per request, `MODO=local` included.
 */
export default async function PaginaDeExportar() {
  const entrada = await entradaAtual();
  if (!entrada?.sessao) redirect('/entrar');
  const corpus = await corpusDaSessao(entrada.sessao.id);
  const vazio = corpus.affiliations.length === 0 && corpus.accomplishments.length === 0;
  const confidenciais = corpus.affiliations.some((a) => a.confidencial);

  return (
    <Moldura>
      <VoltarParaACasa />
      <h1>Baixar o seu Corpus</h1>
      {vazio ? (
        <p>Você ainda não me contou nada, então não há o que baixar.</p>
      ) : (
        <>
          <p>
            O seu Corpus é tudo o que você me contou da sua carreira: onde trabalhou e estudou, o que fez e os números,
            com o cabeçalho do currículo. Ele sai num arquivo .json, que é seu.
          </p>
          <ul>
            <li>
              Para levar a outra instância do sem-sotaque, ou trazer de volta: na tela do currículo, escolha “Tenho um
              arquivo do sem-sotaque”. A conversa continua de onde parou.
            </li>
            <li>Para mostrar a alguém, mande o arquivo. Ele também se lê fora do app.</li>
          </ul>
          <p>A conversa, as vagas e os currículos gerados não vão no arquivo.</p>
          {confidenciais && (
            <p className="mudou" role="note">
              {AVISO_DAS_CONFIDENCIAIS}
            </p>
          )}
          <p className="seguir">
            <a href="/casa/exportar/arquivo" download className="botao primario">
              Baixar meu Corpus
            </a>
          </p>
        </>
      )}
    </Moldura>
  );
}
