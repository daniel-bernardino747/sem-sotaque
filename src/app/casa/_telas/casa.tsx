// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Cantoneiras } from '@/app/ornamentos';
import { emRetomada, estadoDoPlano, filaAberta } from '@/avaliador';
import {
  corpusDaSessao,
  corpusMudou,
  emAndamento,
  ultimaGeracao,
  vagasDaSessao,
  vagasLiberadas,
  versoesEntregues,
  type Corpus,
  type Sessao,
  type Vaga,
} from '@/db';

import { modo } from '@/modo';

import { contarAlgo, continuarConversa, gerarDeNovo, mudarLeitura } from '../acoes';
import { BotaoEnviar } from './botao-enviar';
import { dataCurta } from './resultado';
import { Vistos } from './vistos';

/** How many things the conversation can go back to: the open queue once it ended, the drafts before. */
function emAberto(corpus: Corpus, retomada: boolean): number {
  if (retomada) return filaAberta(corpus).length;
  return corpus.accomplishments.filter((a) => !a.pulado && a.metrics.length === 0).length;
}

/** Where a Vaga is, in the home's list. */
const ESTAGIO: Record<Vaga['estagio'], string> = {
  lendo: 'Lendo a vaga',
  leitura_falhou: 'Não consegui ler',
  lida: 'Falta conferir',
  confirmada: 'Conferida',
};

const contagem = (n: number) => (n === 0 ? 'Nada em aberto' : n === 1 ? '1 coisa em aberto' : `${n} coisas em aberto`);

/**
 * The home (`/casa`, step 14): what the account opens after the consent.
 * Ceremony at the top (the greeting and the coverage, on the plate), work
 * below it: "Achei uma vaga" and the conversation, the applications, the
 * general résumé. Each route decides what it shows by its own state; the
 * session's `estado` only says how far the person got.
 */
export async function Casa({ sessao }: { sessao: Sessao }) {
  const [corpus, plano, geracao, versoes, mudou, liberadas, vagas] = await Promise.all([
    corpusDaSessao(sessao.id),
    estadoDoPlano(sessao.id),
    ultimaGeracao(sessao.id),
    versoesEntregues(sessao.id),
    corpusMudou(sessao.id),
    vagasLiberadas(sessao.id),
    vagasDaSessao(sessao.id),
  ]);
  const importou = sessao.estado !== 'consentiu';
  const terminou = emRetomada(sessao.estado);
  // Between the end of the interrogation and the first résumé, the résumé is owed first.
  const conversando = sessao.estado !== 'gerando' && sessao.estado !== 'importou';
  const abertos = emAberto(corpus, terminou);
  const ultima = versoes[0];
  const gerando = geracao !== null && emAndamento(geracao);

  return (
    <div className="casa">
      <section className="casa-abertura placa" aria-labelledby="casa-titulo">
        <Cantoneiras />
        <h1 id="casa-titulo">Sua carreira, em inglês</h1>
        <p>Daqui você continua a conversa e vê o seu currículo.</p>
        <div className="cobertura">
          <span className="rotulo">
            Currículo <strong>{plano?.cobertura ?? 0}%</strong> coberto
          </span>
          <Vistos cobertura={plano?.cobertura ?? 0} />
        </div>
      </section>

      <section className="casa-acoes" aria-label="O que fazer agora">
        <div className="acao">
          {/*
            Open once the coverage passed 70% or a general résumé exists (P5),
            and it stays open. Closed, it gives the silver to the next action
            the person can take; open, it is the principal one.
          */}
          {liberadas ? (
            <a href={`/casa/vagas/nova`} className="botao primario">
              Achei uma vaga
            </a>
          ) : (
            <>
              <button type="button" className="vazado" disabled aria-describedby="vaga-motivo">
                Achei uma vaga
              </button>
              <p id="vaga-motivo" className="motivo">
                Libera quando o seu currículo passar de 70% coberto ou o currículo geral ficar pronto: o currículo da vaga
                escolhe do que você já me contou.
              </p>
            </>
          )}
        </div>

        {!importou ? (
          <div className="acao">
            <a href={`/casa/conversa`} className="botao primario">
              Começar pela sua carreira
            </a>
          </div>
        ) : (
          <div className="acao">
            {sessao.estado === 'importou' ? (
              <a href={`/casa/conversa`} className={liberadas ? 'botao' : 'botao primario'}>
                Continuar a conversa
              </a>
            ) : (
              <form action={continuarConversa}>
                {conversando && (!terminou || abertos > 0) ? (
                  <BotaoEnviar pendente="Abrindo…" className={liberadas ? 'vazado' : 'primario'}>
                    Continuar a conversa
                  </BotaoEnviar>
                ) : (
                  <button type="button" className="vazado" disabled>
                    Continuar a conversa
                  </button>
                )}
              </form>
            )}
            <p className="em-aberto">{contagem(abertos)}</p>
            {conversando && (
              <form action={contarAlgo}>
                <BotaoEnviar pendente="Abrindo…" className="discreto">
                  Contar algo novo
                </BotaoEnviar>
              </form>
            )}
          </div>
        )}
      </section>

      <section className="casa-secao" aria-labelledby="candidaturas-titulo">
        <h2 id="candidaturas-titulo">Candidaturas</h2>
        {vagas.length === 0 ? (
          <p className="vazio">Nenhuma ainda. Quando você colar uma vaga, ela aparece aqui.</p>
        ) : (
          <ul className="vagas-lista">
            {vagas.map((v) => (
              <li key={v.id}>
                <a href={`/casa/vagas/${v.id}`}>
                  <strong>{v.cargo ?? 'Vaga sem cargo'}</strong>
                  <span>{[v.empresa, ESTAGIO[v.estagio]].filter(Boolean).join(' · ')}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="casa-secao" aria-labelledby="curriculo-titulo">
        <h2 id="curriculo-titulo">Seu currículo geral</h2>
        {!terminou ? (
          <p className="vazio">Ele sai quando a conversa terminar.</p>
        ) : (
          <>
            {ultima && (
              <p>
                Versão {ultima.versao}, de {dataCurta(ultima.terminadaEm)}
              </p>
            )}
            <a href={`/casa/curriculo`} className="botao">
              Ver o currículo
            </a>
            {ultima && !gerando && (
              <div className={mudou ? 'gerar-de-novo mudou' : 'gerar-de-novo'}>
                {mudou && <p>Você me contou coisas novas depois deste currículo.</p>}
                <form action={gerarDeNovo}>
                  <BotaoEnviar pendente="Começando…" className="vazado">
                    Gerar de novo
                  </BotaoEnviar>
                </form>
              </div>
            )}
          </>
        )}
      </section>

      {/* Nobody reads anything in MODO=local: there is no Daniel and no panel. */}
      {modo() !== 'local' && <Leitura ligada={sessao.podeLerEm !== null} />}
    </div>
  );
}

/** "Pode ler para melhorar o produto" (step 22): the reading opt-in, on or off, from the home. */
function Leitura({ ligada }: { ligada: boolean }) {
  return (
    <section className="casa-secao" aria-labelledby="leitura-titulo">
      <h2 id="leitura-titulo">Para melhorar o produto</h2>
      {ligada ? (
        <p>O Daniel pode ler a sua conversa, os seus currículos e as suas vagas, para achar onde a ferramenta erra.</p>
      ) : (
        <p>
          Ninguém lê o que você conta aqui. Se quiser ajudar, o Daniel lê a conversa, os currículos e as vagas para achar
          onde a ferramenta erra.
        </p>
      )}
      <form action={mudarLeitura}>
        <input type="hidden" name="leitura" value={ligada ? 'desligar' : 'ligar'} />
        <BotaoEnviar pendente="Guardando…" className="vazado">
          {ligada ? 'Não quero mais' : 'Pode ler'}
        </BotaoEnviar>
      </form>
    </section>
  );
}
