// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  cabecalhoDaSessao,
  corpusMudou,
  curriculoEntregue,
  emAndamento,
  linhasDaSessao,
  ultimaGeracao,
  versoesEntregues,
  type LinhaOriginal,
  type Sessao,
} from '@/db';
import { ehStack } from '@/geracao/checagens';
import type { Violacoes } from '@/geracao/pipeline';
import { garantirGeracao } from '@/geracao/segundo-plano';
import type { Selection } from '@/render';

import { enviarCabecalho, gerarDeNovo, tentarDeNovo } from '../acoes';
import { BotaoEnviar } from './botao-enviar';
import { FormularioCabecalho } from './cabecalho';
import { Espera } from './espera';
import { FimDaSessao, ID_FIM } from './fim-da-sessao';
import { VoltarParaACasa } from './moldura';

/** "27 de outubro", in Brazil's time. */
export const dataCurta = (d: Date) =>
  d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' });

/**
 * The general résumé (`/curriculo`): the header form before the first
 * generation, the waiting screen while one runs in the background, then the
 * newest Version with each bullet next to what the person's resume said
 * before, "gerar de novo", the older Versions and the end of the v0.
 */
export async function Curriculo({ sessao }: { sessao: Sessao }) {
  const [geracao, cabecalho] = await Promise.all([ultimaGeracao(sessao.id), cabecalhoDaSessao(sessao.id)]);
  const enviar = enviarCabecalho;

  if (!geracao) {
    return (
      <>
        <VoltarParaACasa />
        <h1>Falta só o topo do currículo</h1>
        <p>
          O que vai no cabeçalho: seu nome e como falar com você. Não pergunto se você quer trabalho remoto
          ou como PJ: isso se negocia na entrevista, não no currículo.
        </p>
        <FormularioCabecalho enviar={enviar} inicial={valoresDo(cabecalho)} />
      </>
    );
  }
  if (geracao.erro) {
    return (
      <>
        <VoltarParaACasa />
        <h1>Não consegui terminar seu currículo</h1>
        <p>Algo deu errado do meu lado, não do seu. Tudo o que você me contou está guardado.</p>
        <form action={tentarDeNovo} className="seguir">
          <BotaoEnviar pendente="Recomeçando…" className="primario">
            Tentar de novo
          </BotaoEnviar>
        </form>
      </>
    );
  }
  if (emAndamento(geracao)) {
    // Resumes a run the server lost (a restart); does nothing while one is running.
    await garantirGeracao(sessao.id);
    return <Espera etapa={geracao.etapa} />;
  }

  const [curriculo, linhas, versoes, mudou] = await Promise.all([
    curriculoEntregue(sessao.id),
    linhasDaSessao(sessao.id),
    versoesEntregues(sessao.id),
    corpusMudou(sessao.id),
  ]);
  if (!curriculo) {
    return (
      <>
        <VoltarParaACasa />
        <h1>Seu currículo em inglês</h1>
        <p>Não encontrei o PDF desta sessão. Me chame no WhatsApp que eu resolvo.</p>
      </>
    );
  }
  const selection = curriculo.selection.json as Selection;
  const violacoes = curriculo.selection.violacoes as Partial<Violacoes>;
  const pdf = `/casa/pdf?v=${curriculo.versao}`;
  const anteriores = versoes.filter((v) => v.versao !== curriculo.versao);

  return (
    <>
      <VoltarParaACasa />
      <h1>Seu currículo em inglês</h1>
      <p className="aviso-teste">Versão de teste: se algo estiver errado, me conta.</p>
      {violacoes.preenchimento_insuficiente && (
        <p>
          A página ficou mais curta que o ideal. Preferi deixar assim a inventar: tudo o que está nela veio do
          que você me contou.
        </p>
      )}

      <div className="pdf">
        <object data={pdf} type="application/pdf" aria-label="O seu currículo em PDF">
          <p>
            Este navegador não mostra o PDF aqui. <a href={pdf}>Abrir o PDF</a>
          </p>
        </object>
      </div>
      <div className="botoes-pdf">
        {/* Phones rarely show a PDF inside a page: there the embed is hidden and this opens the phone's viewer. */}
        <a href={pdf} target="_blank" rel="noopener" className="botao abrir-pdf">
          Abrir o PDF
        </a>
        <a href={`${pdf}&baixar=1`} download="resume.pdf" className="botao primario">
          Baixar o PDF
        </a>
      </div>

      {mudou && (
        <div className="gerar-de-novo mudou">
          <p>Você me contou coisas novas depois deste currículo.</p>
          <form action={gerarDeNovo}>
            <BotaoEnviar pendente="Começando…" className="vazado">
              Gerar de novo
            </BotaoEnviar>
          </form>
        </div>
      )}

      <details className="de-novo">
        <summary>Mudar o topo do currículo (nome, contato, cidade)</summary>
        <FormularioCabecalho enviar={enviar} inicial={valoresDo(cabecalho)} rotulo="Gerar de novo" />
      </details>

      {anteriores.length > 0 && (
        <section className="versoes" aria-labelledby="versoes-titulo">
          <h2 id="versoes-titulo">Versões anteriores</h2>
          <ul>
            {anteriores.map((v) => (
              <li key={v.versao}>
                Versão {v.versao}, de {dataCurta(v.terminadaEm)} —{' '}
                <a href={`/casa/pdf?v=${v.versao}`} target="_blank" rel="noopener">
                  Abrir o PDF
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="ir-ao-fim">
        <a href={`#${ID_FIM}`}>Antes de ir: umas perguntas rápidas, todas opcionais</a>
      </p>

      <h2 className="antes-depois-titulo">Antes e depois</h2>
      <p>Cada linha nova ao lado do que o seu currículo dizia antes.</p>
      <AntesDepois selection={selection} linhas={linhas} />

      <FimDaSessao sessao={sessao} />
    </>
  );
}

const valoresDo = (c: Awaited<ReturnType<typeof cabecalhoDaSessao>>): Record<string, string> =>
  c ? { nome: c.nome, email: c.email, linkedin: c.linkedin, github: c.github ?? '', local: c.local } : {};

export function AntesDepois({ selection, linhas }: { selection: Selection; linhas: LinhaOriginal[] }) {
  const antes = (source: string) => [...new Set(linhas.filter((l) => l.accomplishmentId === source).map((l) => l.texto))];
  const grupos = selection.sections.flatMap((s) =>
    s.groups
      .map((g) => ({ g, bullets: g.entries.filter((e) => !ehStack(e)) }))
      .filter(({ bullets }) => bullets.length > 0)
      .map(({ g, bullets }) => ({ titulo: [g.heading?.role, g.heading?.organisation].filter(Boolean).join(' · ') || s.title, bullets })),
  );

  return (
    <ul className="antes-depois">
      {grupos.map((grupo, i) => (
        <li key={i}>
          <h3>{grupo.titulo}</h3>
          <ol>
            {grupo.bullets.map((b, j) => {
              const originais = antes(b.source);
              return (
                <li key={j} className="par">
                  <div className="antes">
                    <span className="rotulo">Antes</span>
                    {originais.length ? (
                      // A list marker the old résumé carried ("- ", "• ") is layout, not the line.
                      originais.map((t, k) => <p key={k}>{t.replace(/^\s*[-–•*]\s+/, '')}</p>)
                    ) : (
                      <p className="novo">Novo: veio das suas respostas.</p>
                    )}
                  </div>
                  <div className="depois">
                    <span className="rotulo">Depois</span>
                    <p lang="en">
                      <Numeros texto={b.text} />
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ul>
  );
}

/**
 * Each number in a new line set in stamp ink: "~" marks an estimate (the
 * writing rules put it there), so it gets the estimate's ink; the rest were stated.
 */
export function Numeros({ texto }: { texto: string }) {
  // Not a digit inside a name ("K8s", "S3"); a sentence's final period stays outside; a range ("~2–3") is one number.
  const partes = texto.split(
    /((?<![\p{L}\d])~?\$?\d(?:[\d.,]*\d)?(?:[–-]\d(?:[\d.,]*\d)?)?(?:\s?(?:%|x\b|k\b|K\b|M\b|B\b)|\+)?(?![\p{L}\d]))/u,
  );
  return partes.map((parte, i) =>
    i % 2 === 1 ? (
      <span key={i} className={parte.startsWith('~') ? 'numero estimado' : 'numero'}>
        {parte}
      </span>
    ) : (
      parte
    ),
  );
}
