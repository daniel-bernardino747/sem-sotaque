// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { linkDeContato } from '@/app/contato';
import {
  cabecalhoDaSessao,
  curriculoEntregue,
  geracoesRestantes,
  GERACOES_POR_VAGA,
  ultimaGeracao,
  versoesEntregues,
  type LinhaDoMapaGravada,
  type Requisito,
  type VagaComRequisitos,
} from '@/db';
import { linhaNaPagina } from '@/geracao/checagens';
import type { Selection } from '@/render';

import { enviarCabecalhoDaVaga, gerarParaAVaga, tentarDeNovoNaVaga } from '../acoes';
import { BotaoEnviar } from './botao-enviar';
import { FormularioCabecalho } from './cabecalho';
import { dataCurta } from './resultado';

/** Each requirement with the résumé line that answers it, as the page prints it, or null ("não coberto"). */
export function linhasDoMapa(mapa: LinhaDoMapaGravada[], requisitos: Requisito[], selection: Selection): { requisito: Requisito; linha: string | null }[] {
  const porRequisito = new Map(mapa.map((m) => [m.requisitoId, m]));
  return requisitos.map((requisito) => {
    const m = porRequisito.get(requisito.id);
    return { requisito, linha: m ? linhaNaPagina(m, selection) : null };
  });
}

/**
 * A confirmed Vaga's résumé (step 17), under its checklist: the header form
 * for someone with no résumé yet, "Gerar agora", the failure, or the newest
 * Version with its PDF, its map and the older Versions, and "Gerar de novo"
 * while generations are left. The waiting screen is the page's (`/vagas/<id>`).
 * The interview questions are never shown here: they are Premium (P12).
 */
export async function CurriculoDaVaga({ sessaoId, vaga, principal }: { sessaoId: string; vaga: VagaComRequisitos; principal: boolean }) {
  const maisGeracoes = linkDeContato('Oi, Daniel! Cheguei no limite de currículos para uma vaga no sem-sotaque e queria gerar mais um.');
  const [geracao, cabecalho, restantes] = await Promise.all([
    ultimaGeracao(sessaoId, vaga.id),
    cabecalhoDaSessao(sessaoId),
    geracoesRestantes(sessaoId, vaga.id),
  ]);
  const gerar = gerarParaAVaga.bind(null, vaga.id);

  if (!cabecalho) {
    return (
      <section className="curriculo-da-vaga" aria-labelledby="curriculo-da-vaga">
        <h2 id="curriculo-da-vaga">O currículo para esta vaga</h2>
        <p>Antes do primeiro currículo, falta o topo dele: seu nome e como falar com você.</p>
        <FormularioCabecalho enviar={enviarCabecalhoDaVaga.bind(null, vaga.id)} rotulo="Gerar agora" />
      </section>
    );
  }

  if (geracao?.erro) {
    return (
      <section className="curriculo-da-vaga" aria-labelledby="curriculo-da-vaga">
        <h2 id="curriculo-da-vaga">Não consegui terminar o currículo desta vaga</h2>
        <p>Algo deu errado do meu lado, não do seu. Tudo o que você me contou está guardado.</p>
        <form action={tentarDeNovoNaVaga.bind(null, vaga.id)} className="seguir">
          <BotaoEnviar pendente="Recomeçando…" className="primario">
            Tentar de novo
          </BotaoEnviar>
        </form>
      </section>
    );
  }

  const [curriculo, versoes] = await Promise.all([curriculoEntregue(sessaoId, undefined, vaga.id), versoesEntregues(sessaoId, vaga.id)]);
  if (!curriculo) {
    return (
      <section className="curriculo-da-vaga" aria-labelledby="curriculo-da-vaga">
        <h2 id="curriculo-da-vaga">O currículo para esta vaga</h2>
        <form action={gerar} className="gerar-de-novo">
          <BotaoEnviar pendente="Começando…" className={principal ? 'primario' : 'vazado'}>
            Gerar agora
          </BotaoEnviar>
        </form>
        <p className="dica">
          Faço com o que você já me contou, em inglês. O que a vaga pede e você não usou fica de fora: não invento.
        </p>
      </section>
    );
  }

  const selection = curriculo.selection.json as Selection;
  const pdf = `/casa/vagas/${vaga.id}/pdf?v=${curriculo.versao}`;
  const anteriores = versoes.filter((v) => v.versao !== curriculo.versao);
  const mapa = curriculo.mapa ? linhasDoMapa(curriculo.mapa, vaga.requisitos, selection) : null;

  return (
    <section className="curriculo-da-vaga" aria-labelledby="curriculo-da-vaga">
      <h2 id="curriculo-da-vaga">O currículo para esta vaga</h2>
      <div className="pdf">
        <object data={pdf} type="application/pdf" aria-label="O currículo para esta vaga, em PDF">
          <p>
            Este navegador não mostra o PDF aqui. <a href={pdf}>Abrir o PDF</a>
          </p>
        </object>
      </div>
      <div className="botoes-pdf">
        <a href={pdf} target="_blank" rel="noopener" className="botao abrir-pdf">
          Abrir o PDF
        </a>
        <a href={`${pdf}&baixar=1`} download="resume.pdf" className="botao primario">
          Baixar o PDF
        </a>
      </div>

      {mapa && mapa.length > 0 && (
        <section className="mapa-da-vaga" aria-labelledby="mapa-da-vaga">
          <h3 id="mapa-da-vaga">O que a vaga pede e onde está no currículo</h3>
          <ul>
            {mapa.map(({ requisito, linha }) => (
              <li key={requisito.id}>
                <p className="requisito">{requisito.texto}</p>
                {linha ? (
                  <p className="linha" lang="en">
                    {linha}
                  </p>
                ) : (
                  <p className="nao-coberto">Não coberto</p>
                )}
              </li>
            ))}
          </ul>
          {mapa.some((m) => !m.linha) && (
            <p className="dica">
              Não coberto quer dizer que nada do que você me contou mostra isso, e eu não invento. Se você já fez, me conte
              na conversa e gere de novo.
            </p>
          )}
        </section>
      )}

      {restantes > 0 ? (
        <div className="gerar-de-novo">
          <form action={gerar}>
            <BotaoEnviar pendente="Começando…" className="vazado">
              Gerar de novo
            </BotaoEnviar>
          </form>
          <p className="dica">
            {restantes === 1 ? 'Dá para gerar mais uma vez para esta vaga.' : `Dá para gerar mais ${restantes} vezes para esta vaga.`}
          </p>
        </div>
      ) : (
        <div className="gerar-de-novo">
          <p>
            Você já gerou {GERACOES_POR_VAGA} currículos para esta vaga, o limite deste teste. Se precisar de outro, me
            chame no WhatsApp.
          </p>
          <a href={maisGeracoes} className="botao">
            Chamar o Daniel no WhatsApp
          </a>
        </div>
      )}

      {anteriores.length > 0 && (
        <section className="versoes" aria-labelledby="versoes-da-vaga">
          <h3 id="versoes-da-vaga">Versões anteriores</h3>
          <ul>
            {anteriores.map((v) => (
              <li key={v.versao}>
                Versão {v.versao}, de {dataCurta(v.terminadaEm)} —{' '}
                <a href={`/casa/vagas/${vaga.id}/pdf?v=${v.versao}`} target="_blank" rel="noopener">
                  Abrir o PDF
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
