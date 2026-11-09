// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { corpusDaSessao, formatoDaImportacao, type Corpus, type Sessao } from '@/db';
import { fraseDoImport } from '@/import/resumo';

import { comecarPerguntas, enviarArquivoDoCorpus, enviarCurriculo } from '../acoes';
import { BotaoEnviar } from './botao-enviar';
import { EnvioArquivoDoCorpus } from './envio-arquivo-do-corpus';
import { EnvioCurriculo } from './envio-curriculo';

/**
 * The import screen: the form at `consentiu`, the draft Corpus it found at
 * `importou`. Nothing is edited here; the interrogation corrects it. A Corpus
 * file (step 27) is a third door, only here: a session past `consentiu` has a
 * Corpus, and a file never goes over one.
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
        <p className="ou">ou</p>
        <EnvioArquivoDoCorpus enviar={enviarArquivoDoCorpus} />
      </>
    );
  }

  const [corpus, formato] = await Promise.all([corpusDaSessao(sessao.id), formatoDaImportacao(sessao.id)]);
  const doArquivo = formato === 'corpus';
  return (
    <>
      {doArquivo ? (
        <>
          <h1>Seu Corpus chegou</h1>
          <p>
            Está como você deixou: as experiências, o que você fez e os números. A conversa continua do que ficou em
            aberto.
          </p>
        </>
      ) : (
        <>
          <h1>{fraseDoImport(corpus.affiliations.length, corpus.accomplishments.length)}</h1>
          <p>
            Ainda é um rascunho: quase nada aqui tem número. É isso que as perguntas vão buscar. Se algo
            estiver errado ou faltando, me diga durante as perguntas.
          </p>
        </>
      )}
      <Encontrado corpus={corpus} />
      <form action={comecarPerguntas} className="seguir">
        <BotaoEnviar pendente="Abrindo…">{doArquivo ? 'Continuar a conversa' : 'Começar as perguntas'}</BotaoEnviar>
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
