// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { modo } from '@/modo';

import { LinksLegais } from './_documento';
import { Numeros } from './casa/_telas/resultado';
import { BarraConvite } from './barra-convite';
import { Capa } from './capa';
import { Balao, Onda } from './ornamentos';
import { linkDeContato } from './contato';

const DESCRICAO = 'Currículo em inglês para dev brasileiro, sem inventar nenhum número. Por Daniel Bernardino.';

// Kept out of search during the v0: the link reaches people by invitation.
export const metadata: Metadata = {
  title: 'sem-sotaque',
  description: DESCRICAO,
  openGraph: { title: 'sem-sotaque', description: DESCRICAO, locale: 'pt_BR', type: 'website' },
  robots: { index: false, follow: false },
};

/** Daniel's own lines, from his résumé: the same facts, before and after the questions. */
const PARES = [
  {
    antes: 'Implementei testes automatizados com Jest e Playwright e um pipeline de CI no GitHub Actions.',
    depois:
      "Eliminated regressions in delivered screens (from ~2–3 a month to 0) by introducing the team's first Jest and Playwright tests and a GitHub Actions gate that blocked merges to main below 80% coverage.",
  },
  {
    antes: 'Refiz o módulo de vida útil de ferramentas, com um serviço em Python lendo os sensores da fábrica.',
    depois:
      "Brought tool-breakage stoppages (~20 min of halted production each) to 0 over ~7 months by redesigning the tool-life module to warn before a tool wears out, fed by a Python service syncing the plant's radio-frequency sensors.",
  },
];

const PASSOS = [
  { rotulo: 'Você manda', texto: 'O currículo que você já tem, em PDF ou colado do LinkedIn.' },
  {
    rotulo: 'Eu pergunto',
    texto:
      'Uma pergunta por vez: o que é essa empresa, melhorou quanto, comparado com quê. Quando você não sabe o número, a gente chega nele por uma âncora, e ele sai com ~.',
  },
  { rotulo: 'Sai', texto: 'Um currículo de uma página em inglês, com cada linha nova ao lado do que você tinha escrito antes.' },
];

const ROMANOS = ['I', 'II', 'III'];

/**
 * The door for whoever reaches the domain without a Tester link: the engraved
 * cover (what this is, who makes it), then full-bleed bands parted by a strip
 * of guilloché: how it works, one invented question to show the mechanism, and
 * Daniel's own before × after, and the seal that asks for an invitation
 * on WhatsApp, which a bar pinned to the bottom offers until the seal is in view.
 * No sign-up: links are handed out by invitation.
 */
export default async function Home() {
  // MODO=local: one person, on their own machine, has nothing to be sold. Read
  // per request: prerendered at build, the page would read the build's MODO,
  // and the same image runs both modes.
  await connection();
  if (modo() === 'local') redirect('/casa');
  const convite = linkDeContato('Oi, Daniel! Vim pelo sem-sotaque e quero um convite para o teste.');
  const perdiOLink = linkDeContato('Oi, Daniel! Vim pelo sem-sotaque. Perdi o meu link.');
  return (
    <div className="cedula">
      <Capa />
      <main className="inicio">
        <section className="inicio-abre">
          <p>
            Nenhum número do currículo é inventado. Cada um é algo que você me disse ou que estimamos juntos, por uma
            referência, e sai com ~. Eu pergunto em português e escrevo em inglês.
          </p>
          <ul className="garantias">
            <li>Teste fechado e grátis · por convite</li>
          </ul>
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
          </div>
        </section>

        <Onda />
        <section aria-labelledby="uma-pergunta" className="inicio-faixa escura">
          <div className="inicio-dentro inicio-dividida">
            <div>
              <h2 id="uma-pergunta">Como é uma pergunta</h2>
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
        <section aria-labelledby="no-curriculo" className="inicio-faixa">
          <div className="inicio-dentro">
            <h2 id="no-curriculo">No currículo do Daniel</h2>
            <p className="dados-intro">
              Antes: como a gente costuma escrever. Depois: o que saiu das perguntas, com os mesmos fatos.
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
      </main>
      <section id="selo" aria-labelledby="quer-testar" className="selo">
        <h2 id="quer-testar">Quer fazer o teste?</h2>
        <a className="selo-botao" href={convite}>
          <svg className="selo-aro" viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <path id="selo-aro" d="M100,100 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0" />
            </defs>
            <circle cx="100" cy="100" r="96" />
            <circle cx="100" cy="100" r="66" />
            <text>
              <textPath href="#selo-aro" textLength="496" lengthAdjust="spacing">
                TESTE FECHADO · GRÁTIS · POR CONVITE · TESTE FECHADO · GRÁTIS · POR CONVITE ·
              </textPath>
            </text>
          </svg>
          <span className="selo-miolo">
            <Balao />
            Pedir convite
          </span>
        </a>
        <p className="selo-sub">Pelo WhatsApp, direto com o Daniel.</p>
      </section>
      <footer>
        <p className="contato">
          Já tinha um link e perdeu? <a href={perdiOLink}>Me avisa no WhatsApp</a>
        </p>
        <LinksLegais />
      </footer>
      <BarraConvite href={convite} selo="selo" />
    </div>
  );
}
