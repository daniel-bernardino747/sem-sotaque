// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { modo } from '@/modo';

import { CODIGO_FONTE, LinksLegais } from './_documento';
import { BarraAssinar } from './barra-assinar';
import { Numeros } from './casa/_telas/resultado';
import { Capa } from './capa';
import { Onda } from './ornamentos';

const DESCRICAO =
  'Para dev brasileiro que se candidata a vaga no exterior: um currículo em inglês com o número de cada conquista, e você sabe de onde vem cada um. Sem inventar nenhum. Por Daniel Bernardino.';

export const metadata: Metadata = {
  title: 'sem-sotaque',
  description: DESCRICAO,
  openGraph: { title: 'sem-sotaque', description: DESCRICAO, locale: 'pt_BR', type: 'website' },
};

/** The pain, as situations the visitor recognises: no statistic, nothing the product cannot stand behind. */
const DORES = [
  'Você escreve “implementei”, “melhorei”, “participei”. O que você fez está ali, mas sem quanto mudou.',
  'Traduzir para o inglês não põe o número que falta.',
  'E se a entrevista vem e o recrutador pergunta “by how much?”, você trava: ninguém tinha te feito essa pergunta antes.',
];

/**
 * Rodrigo, the invented persona of `scripts/personas.ts`: "antes" is his
 * résumé (`src/llm/__fixtures__/pleno.txt`), "depois" is what the real
 * interrogation and generation wrote for him (`npm run gerar --
 * sabe-os-numeros`, 2026-10-14), unedited. Never a real person's lines.
 */
const PARES = [
  {
    antes: 'Implementei a idempotência na API de cobranças, eliminando cobranças duplicadas.',
    depois:
      'Ended ~30 support tickets a month about duplicate charges, with none in the following 3 months, by making the charges API idempotent.',
  },
  {
    antes: 'Automatizei a geração de relatórios de frete que o financeiro fazia em planilha.',
    depois:
      'Cut freight reporting from ~2 days a month of manual spreadsheet work to one click by automating report generation for the finance team.',
  },
];

const PASSOS = [
  { rotulo: 'Você manda', texto: 'O currículo que você já tem, em PDF ou colado do LinkedIn.' },
  {
    rotulo: 'Eu pergunto',
    texto:
      'Uma pergunta por vez: o que é essa empresa, melhorou quanto, comparado com quê. Quando você não sabe o número, a gente chega nele por uma âncora, e ele sai com ~.',
  },
  {
    rotulo: 'Sai',
    texto:
      'Um currículo de uma página em inglês, com cada linha nova ao lado do que você tinha escrito antes. Para cada vaga, você cola o anúncio e sai uma versão feita para ela.',
  },
];

const ROMANOS = ['I', 'II', 'III'];

/**
 * The sales page (step 25, Q16), built on the pain before the mechanism: the
 * engraved cover (the promise), the pain in the visitor's own situations, an
 * invented person's before × after (what they want), one invented question
 * (why each number holds up in the interview), how it works, and only then the
 * offer: the one place the price is said, beside the guarantees and the seal
 * that sends to sign in and subscribe (the paywall is in the home, after the
 * login). A bar pinned to the bottom calls to the seal until it is in view.
 * Running it on your own machine is a line in the footer, for whoever looks
 * for it, never beside the offer.
 */
export default async function Home() {
  // MODO=local: one person, on their own machine, has nothing to be sold. Read
  // per request: prerendered at build, the page would read the build's MODO,
  // and the same image runs both modes.
  await connection();
  if (modo() === 'local') redirect('/casa');
  return (
    <div className="cedula">
      <Capa />
      <main className="inicio">
        <section aria-labelledby="a-dor" className="inicio-abre">
          <h2 id="a-dor">Você se candidata para fora, manda o currículo, e ninguém responde.</h2>
          <ul className="dores">
            {DORES.map((dor) => (
              <li key={dor}>{dor}</li>
            ))}
          </ul>
          <p className="dores-virada">
            Eu faço essa pergunta antes dele. Em português, uma por vez, até cada conquista ter o seu número. Depois
            escrevo o currículo em inglês com eles.
          </p>
        </section>

        <Onda />
        <section aria-labelledby="no-curriculo" className="inicio-faixa">
          <div className="inicio-dentro">
            <h2 id="no-curriculo">O mesmo trabalho, com o número que faltava</h2>
            <p className="dados-intro">
              O Rodrigo não existe: é a persona que a gente usa nos testes. As frases do &ldquo;antes&rdquo; são do
              currículo dele; as do &ldquo;depois&rdquo; saíram da conversa e da geração reais, sem edição.
            </p>
            <ol className="inicio-pares">
              {PARES.map((par) => (
                <li key={par.antes}>
                  <p className="inicio-antes">
                    <span className="rotulo">Antes</span>
                    {par.antes}
                  </p>
                  <span className="seta" aria-hidden="true">
                    →
                  </span>
                  <p lang="en">
                    <span className="rotulo">Depois</span>
                    <Numeros texto={par.depois} />
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <Onda />
        <section aria-labelledby="uma-pergunta" className="inicio-faixa escura">
          <div className="inicio-dentro inicio-dividida">
            <div>
              <h2 id="uma-pergunta">Quando perguntarem &ldquo;quanto?&rdquo;, você já respondeu uma vez</h2>
              <p className="inicio-promessa">
                Nenhum número do currículo é inventado. Cada um é algo que você me disse, ou que estimamos juntos a
                partir de uma referência, e aí sai com ~. Na entrevista, você sabe de onde veio cada um.
              </p>
              <span className="rotulo">Exemplo inventado</span>
              <ol className="mensagens">
                <li className="assistente">
                  Você escreveu que o painel de pedidos reduziu os chamados do suporte. Reduziu de quanto para quanto?
                </li>
                <li className="pessoa">não sei o número</li>
                <li className="assistente atual">
                  Pensa numa semana normal antes do painel: eram mais perto de 5 chamados ou de 50?
                </li>
                <li className="pessoa">uns 30 por semana. Depois, um ou dois</li>
              </ol>
            </div>
            <div className="inicio-resultado">
              <span className="rotulo carimbo-depois">Depois</span>
              <p lang="en">
                <Numeros texto="Cut support tickets about stuck orders from ~30 a week to 1–2 by building the order-status panel the support team checks first." />
              </p>
            </div>
          </div>
        </section>

        <Onda />
        <section aria-labelledby="como-funciona" className="inicio-faixa">
          <div className="inicio-dentro">
            <h2 id="como-funciona">Como funciona</h2>
            <ol className="passos">
              {PASSOS.map((passo, i) => (
                <li key={passo.rotulo}>
                  <span className="romano" aria-hidden="true">
                    {ROMANOS[i]}
                  </span>
                  <span className="rotulo">{passo.rotulo}</span>
                  <p>{passo.texto}</p>
                </li>
              ))}
            </ol>
            <p className="inicio-nota">
              Se a vaga pede algo que nada do que você me contou mostra, o currículo da vaga diz &ldquo;não
              coberto&rdquo;. Eu não invento a linha.
            </p>
          </div>
        </section>
        <Onda />
      </main>
      <section id="selo" aria-labelledby="assinar" className="selo">
        <h2 id="assinar">Entrar e assinar</h2>
        <p className="selo-preco">
          <strong>R$ 99 por trimestre</strong>, o tempo de uma busca de vaga. É o preço do beta, e ele fica travado
          enquanto a sua assinatura estiver ativa.
        </p>
        <ul className="garantias">
          <li>15 vagas por trimestre, cada uma com até 3 versões</li>
          <li>Cancela quando quiser</li>
          <li>7 dias para desistir, com o dinheiro de volta</li>
        </ul>
        <a className="selo-botao" href="/entrar">
          <svg className="selo-aro" viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <path id="selo-aro" d="M100,100 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0" />
            </defs>
            <circle cx="100" cy="100" r="96" />
            <circle cx="100" cy="100" r="66" />
            <text>
              <textPath href="#selo-aro" textLength="496" lengthAdjust="spacing">
                NENHUM NÚMERO INVENTADO · 7 DIAS PARA DESISTIR ·
              </textPath>
            </text>
          </svg>
          <span className="selo-miolo">Assinar</span>
        </a>
        <p className="selo-sub">Com o GitHub ou o Google. Sem senha.</p>
        <p className="selo-letra">
          Cancelando, o acesso vai até o fim do trimestre pago. Nos 7 dias depois de assinar, é só me mandar um e-mail
          e eu devolvo tudo.
        </p>
      </section>
      <footer>
        <p className="contato">
          Já tem conta? <a href="/entrar">Entrar</a>
        </p>
        <p className="codigo-aberto">
          <a href={CODIGO_FONTE}>Código aberto · rodar na sua máquina</a>
        </p>
        <LinksLegais />
      </footer>
      <BarraAssinar href="#selo" selo="selo" />
    </div>
  );
}
