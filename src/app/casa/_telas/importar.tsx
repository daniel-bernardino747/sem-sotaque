// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { corpusDaSessao, type Corpus, type Sessao } from '@/db';
import { fraseDoImport } from '@/import/resumo';

import { comecarPerguntas, enviarCurriculo } from '../acoes';
import { BotaoEnviar } from './botao-enviar';
import { EnvioCurriculo } from './envio-curriculo';

/**
 * The import screen: the form at `consentiu`, the draft Corpus it found at
 * `importou`. Nothing is edited here; the interrogation corrects it.
 */
export async function Importar({ sessao }: { sessao: Sessao }) {
  if (sessao.estado === 'consentiu') {
    return (
      <>
        <h1>Seu currículo</h1>
        <p>
          Comece pelo que você já tem. Eu leio, separo onde você trabalhou e o que fez, e depois faço
          perguntas sobre cada coisa.
        </p>
        <EnvioCurriculo enviar={enviarCurriculo} />
      </>
    );
  }

  const corpus = await corpusDaSessao(sessao.id);
  return (
    <>
      <h1>{fraseDoImport(corpus.affiliations.length, corpus.accomplishments.length)}</h1>
      <p>
        Ainda é um rascunho: quase nada aqui tem número. É isso que as perguntas vão buscar. Se algo
        estiver errado ou faltando, me diga durante as perguntas.
      </p>
      <Encontrado corpus={corpus} />
      <form action={comecarPerguntas} className="seguir">
        <BotaoEnviar pendente="Abrindo…">Começar as perguntas</BotaoEnviar>
      </form>
    </>
  );
}

function Encontrado({ corpus }: { corpus: Corpus }) {
  const semLugar = corpus.accomplishments.filter((a) => !a.affiliationId);
  const grupos = [
    ...corpus.affiliations.map((af) => ({
      id: af.id,
      titulo: af.organizacao,
      subtitulo: [af.cargo, af.periodoOriginal].filter(Boolean).join(' · '),
      itens: corpus.accomplishments.filter((a) => a.affiliationId === af.id),
    })),
    ...(semLugar.length ? [{ id: 'sem-lugar', titulo: 'Por fora', subtitulo: '', itens: semLugar }] : []),
  ];

  return (
    <ul className="encontrado">
      {grupos.map((g) => (
        <li key={g.id}>
          <h2>{g.titulo}</h2>
          {g.subtitulo && <p className="subtitulo">{g.subtitulo}</p>}
          {g.itens.length > 0 && (
            <ul>
              {g.itens.map((a) => (
                <li key={a.id}>{a.enunciado}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
