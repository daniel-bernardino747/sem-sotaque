// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { duracao } from '@/admin/funil';
import { linhaDoTempo } from '@/admin/linha-do-tempo';
import { exigirAdmin } from '@/admin/servidor';
import { sessaoParaPainel, type ConteudoDaSessao, type MetricasDaSessao } from '@/admin/sessao';
import {
  custoDaSessao,
  eventosDaSessao,
  fechamentoParaPainel,
  ultimaGeracao,
  testerDaSessao,
  type Corpus,
  type DecisaoAvaliador,
  type Mensagem,
} from '@/db';
import type { Problema, Violacoes } from '@/geracao/pipeline';
import type { Selection } from '@/render';
import { AntesDepois } from '@/app/casa/_telas/resultado';

import { salvarNotas } from '../../acoes';
import { FormularioNotas } from '../../_formularios';
import { dataHora, ehUuid, hora, NOME_DO_ESTADO, usd } from '../../_formato';

export const dynamic = 'force-dynamic';

export default async function SessaoNoPainel({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdmin();
  const { id } = await params;
  if (!ehUuid(id)) notFound();
  const painel = await sessaoParaPainel(id);
  if (!painel) notFound();
  const { sessao, metricas, conteudo } = painel;

  if (sessao.apagadaEm) {
    // Nothing of the person is left, and nothing is shown: only when and where they were.
    const eventos = await eventosDaSessao(id);
    const apagou = eventos.find((e) => e.tipo === 'apagou');
    const estado = ((apagou?.dados as { estado?: string } | null)?.estado ?? sessao.estado) as keyof typeof NOME_DO_ESTADO;
    return (
      <main>
        <p>
          <Link href="/admin">← Painel</Link>
        </p>
        <h1>Sessão apagada</h1>
        <p>
          Apagada em {dataHora(sessao.apagadaEm)}, estava em <strong>{NOME_DO_ESTADO[estado] ?? estado}</strong>.
        </p>
      </main>
    );
  }

  const [tester, geracao, fim, custos, eventos] = await Promise.all([
    testerDaSessao(id),
    ultimaGeracao(id),
    fechamentoParaPainel(id),
    custoDaSessao(id),
    eventosDaSessao(id),
  ]);
  const avaliador = metricas.avaliador;
  const custoTotal = custos.reduce((s, c) => s + c.custoUsd, 0);

  return (
    <main>
      <p>
        <Link href="/admin">← Painel</Link>
      </p>
      <h1>{tester?.apelido ?? 'Sessão'}</h1>
      <p className="suave">
        {tester?.origem} · estado <strong>{NOME_DO_ESTADO[sessao.estado]}</strong> · criada {dataHora(sessao.createdAt)}
        {sessao.terminouInterrogatorioEm && ` · terminou o interrogatório ${dataHora(sessao.terminouInterrogatorioEm)}`}
        {sessao.podeLerEm ? ` · leitura liberada ${dataHora(sessao.podeLerEm)}` : ' · leitura fechada'}
        {geracao?.revisar && (
          <>
            {' · '}
            <strong className="alerta">precisa revisar</strong> (as tentativas acabaram)
          </>
        )}
      </p>
      <nav className="indice">
        {conteudo && (
          <>
            <a href="#transcricao">Transcrição</a> <a href="#corpus">Corpus</a> <a href="#tentativas">Tentativas</a>{' '}
            <a href="#pdf">PDF</a>{' '}
          </>
        )}
        <a href="#fechamento">Fechamento</a> <a href="#notas">Notas</a>
      </nav>

      <section aria-labelledby="notas">
        <h2 id="notas">Notas do Daniel</h2>
        <FormularioNotas salvar={salvarNotas.bind(null, id)} notas={sessao.notasDaniel ?? ''} />
      </section>

      <section aria-labelledby="custo">
        <h2 id="custo">Custo e eventos</h2>
        <div className="tabela">
          <table>
            <thead>
              <tr>
                <th>Etapa</th>
                <th>Chamadas</th>
                <th>Custo</th>
                <th>Tokens (entrada / saída / cache lido)</th>
              </tr>
            </thead>
            <tbody>
              {custos.map((c) => (
                <tr key={c.etapa}>
                  <td>{c.etapa}</td>
                  <td>{c.chamadas}</td>
                  <td>{c.naoMedidas > 0 ? 'custo não medido' : usd(c.custoUsd, 3)}</td>
                  <td>
                    {c.tokensEntrada} / {c.tokensSaida} / {c.tokensCacheLeitura}
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td />
                <td>
                  <strong>{custos.some((c) => c.naoMedidas > 0) ? 'custo não medido' : usd(custoTotal, 3)}</strong>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="pequeno suave">
          {porTipo(eventos).join(' · ') || 'Nenhum evento.'}
        </p>
        <p className="pequeno suave">
          Avaliador (consentimento {sessao.textoConsentimentoVersao ?? '—'}
          {sessao.recusouAvaliadorEm && ', recusou o v2'}): {avaliador.checkpoints} checkpoints, {avaliador.falhasDoJev} falhas do Jev
          {avaliador.semJev > 0 && `, ${avaliador.semJev} sem o Jev`}
          {avaliador.ofereceuFim && ', ofereceu o fim'}.
        </p>
      </section>

      <Numeros metricas={metricas} />

      {conteudo ? (
        <Conteudo sessaoId={id} conteudo={conteudo} entregueId={geracao?.selectionId ?? null} erroDaGeracao={geracao?.erro ?? null} />
      ) : (
        <section aria-labelledby="leitura">
          <h2 id="leitura">Conteúdo</h2>
          <p>
            <strong>A pessoa não liberou a leitura.</strong>{' '}
            <span className="suave">Transcrição, Corpus, tentativas, PDFs e vagas ficam fechados até ela marcar &quot;pode ler para melhorar o produto&quot; na casa.</span>
          </p>
        </section>
      )}

      <section aria-labelledby="fechamento">
        <h2 id="fechamento">Fechamento</h2>
        {fim.fechamento ? (
          <dl className="campos">
            <dt>Fundador</dt>
            <dd>{fim.fechamento.fundador ? 'sim' : 'não'}</dd>
            <dt>E-mail</dt>
            <dd>{fim.fechamento.email ?? '—'}</dd>
            <dt>WhatsApp</dt>
            <dd>{fim.fechamento.whatsapp ?? '—'}</dd>
            <dt>Pagaria (v0)</dt>
            <dd>
              {fim.fechamento.pagaria ?? '—'}
              {fim.fechamento.pagariaQuanto && ` · quanto: ${fim.fechamento.pagariaQuanto}`}
            </dd>
            <dt>Depoimento</dt>
            <dd>
              {fim.fechamento.depoimento ?? '—'}
              {fim.fechamento.depoimento && (
                <strong className={fim.fechamento.depoimentoPodeUsar ? '' : 'alerta'}>
                  {fim.fechamento.depoimentoPodeUsar ? ' (pode usar com o nome)' : ' (só para o Daniel: não pode usar)'}
                </strong>
              )}
            </dd>
            <dt>Algo deu errado</dt>
            <dd>{fim.fechamento.comentario ?? '—'}</dd>
          </dl>
        ) : (
          <p className="suave">Sem fechamento.</p>
        )}
        {fim.indicacoes.length > 0 && (
          <>
            <h3>Indicações</h3>
            <ul>
              {fim.indicacoes.map((i) => (
                <li key={i.id}>
                  {i.nome} · {i.contato}
                  {i.virouTesterId && ' · já virou tester'}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}

/** What the panel shows of every session, read or not: counts and times, no words (step 22). */
function Numeros({ metricas: m }: { metricas: MetricasDaSessao }) {
  return (
    <section aria-labelledby="numeros">
      <h2 id="numeros">Números</h2>
      <dl className="campos">
        <dt>Perguntas / respostas</dt>
        <dd>
          {m.perguntas} / {m.respostas}
        </dd>
        <dt>&quot;Não sei&quot;</dt>
        <dd>{m.naoSei}</dd>
        <dt>Da primeira à última mensagem</dt>
        <dd>{m.primeira && m.ultima ? `${duracao(m.ultima.getTime() - m.primeira.getTime())} (${dataHora(m.primeira)} → ${dataHora(m.ultima)})` : '—'}</dd>
        <dt>Tentativas de Selection</dt>
        <dd>
          {m.tentativas} ({m.aprovadas} aprovadas)
        </dd>
      </dl>
    </section>
  );
}

/** Transcript, Corpus, attempts and the PDF: only for a session that let Daniel read. */
function Conteudo({
  sessaoId: id,
  conteudo: { mensagens, corpus, linhas, tentativas, decisoes },
  entregueId,
  erroDaGeracao,
}: {
  sessaoId: string;
  conteudo: ConteudoDaSessao;
  entregueId: string | null;
  erroDaGeracao: string | null;
}) {
  const entregue = tentativas.find((t) => t.id === entregueId) ?? null;
  const sobre = rotulosDosRegistros(corpus);
  return (
    <>
      <section aria-labelledby="transcricao">
        <h2 id="transcricao">Transcrição e avaliador</h2>
        <Transcricao mensagens={mensagens} decisoes={decisoes} sobre={sobre} />
      </section>

      <section aria-labelledby="corpus">
        <h2 id="corpus">Corpus</h2>
        <CorpusDaSessao corpus={corpus} />
      </section>

      <section aria-labelledby="tentativas">
        <h2 id="tentativas">Tentativas de Selection</h2>
        {tentativas.length === 0 ? (
          <p className="suave">Nenhuma tentativa ainda.{erroDaGeracao && ` Erro da geração: ${erroDaGeracao}`}</p>
        ) : (
          <>
            {entregue && <PerguntasDoCritico violacoes={entregue.violacoes as Partial<Violacoes>} />}
            <ol className="tentativas">
              {tentativas.map((t) => (
                <Tentativa key={t.id} sessaoId={id} t={t} entregue={t.id === entregue?.id} sobre={sobre} />
              ))}
            </ol>
          </>
        )}
      </section>

      <section aria-labelledby="pdf">
        <h2 id="pdf">PDF e antes × depois</h2>
        {entregue ? (
          <>
            <p>
              <a href={`/admin/sessoes/${id}/pdf`} target="_blank" rel="noopener">
                Abrir o PDF entregue
              </a>{' '}
              {entregue.baixadoEm ? `· a pessoa baixou em ${dataHora(entregue.baixadoEm)}` : '· a pessoa não baixou'}
            </p>
            <div className="pdf">
              <object data={`/admin/sessoes/${id}/pdf`} type="application/pdf" aria-label="PDF entregue">
                <p>
                  <a href={`/admin/sessoes/${id}/pdf`}>Abrir o PDF</a>
                </p>
              </object>
            </div>
            <AntesDepois selection={entregue.json as Selection} linhas={linhas} />
          </>
        ) : (
          <p className="suave">Nada entregue ainda.</p>
        )}
      </section>

    </>
  );
}

/** The funnel events once per type, in order: "nao_sei ×7 (desde 14/10 14:13)". */
function porTipo(eventos: { tipo: string; createdAt: Date }[]): string[] {
  const grupos = new Map<string, { n: number; primeiro: Date }>();
  for (const e of eventos) {
    const g = grupos.get(e.tipo);
    if (g) g.n += 1;
    else grupos.set(e.tipo, { n: 1, primeiro: e.createdAt });
  }
  return [...grupos].map(([tipo, g]) => `${tipo}${g.n > 1 ? ` ×${g.n} (desde` : ''} ${dataHora(g.primeiro)}${g.n > 1 ? ')' : ''}`);
}

/** What each record reads as in the transcript: the organisation of an affiliation, the start of an accomplishment. */
function rotulosDosRegistros(corpus: Corpus): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const a of corpus.affiliations) mapa.set(a.id, a.organizacao);
  for (const a of corpus.accomplishments) mapa.set(a.id, a.enunciado.length > 60 ? `${a.enunciado.slice(0, 60)}…` : a.enunciado);
  return mapa;
}

function Transcricao({
  mensagens,
  decisoes,
  sobre,
}: {
  mensagens: Mensagem[];
  decisoes: DecisaoAvaliador[];
  sobre: Map<string, string>;
}) {
  if (mensagens.length === 0 && decisoes.length === 0) return <p className="suave">Nenhuma mensagem.</p>;
  const rotulo = (a: unknown) => {
    const assunto = a as { tipo: string; id: string } | null;
    if (!assunto) return null;
    return assunto.tipo === 'oferta' ? 'oferta de fim' : `${assunto.tipo}: ${sobre.get(assunto.id) ?? assunto.id}`;
  };
  return (
    <ol className="transcricao">
      {linhaDoTempo(mensagens, decisoes).map((i) => {
        if (i.tipo === 'decisao') {
          const d = i.item;
          return (
            <li key={d.id} className="decisao">
              <div className="meta">
                <strong>avaliador</strong> {hora(d.createdAt)} · {d.gatilho} → <strong>{d.decisao}</strong>
                {d.cobertura !== null && ` · cobertura ${d.cobertura}%`}
                <span className={`marcador ${d.backend === 'reserva' ? 'alerta' : ''}`}>{d.backend}</span>
                {rotulo(d.assunto) && <span className="suave"> · sobre: {rotulo(d.assunto)}</span>}
              </div>
              <p className="pequeno">
                {d.motivo}
                {rotulo(d.proximo) && <span className="suave"> · próximo: {rotulo(d.proximo)}</span>}
              </p>
              {d.erro && <p className="pequeno alerta">Jev: {d.erro}</p>}
            </li>
          );
        }
        const m = i.item;
        const registro = m.accomplishmentId ?? m.affiliationId;
        return (
          <li key={m.id} className={m.papel}>
            <div className="meta">
              <strong>{m.papel}</strong> {hora(m.createdAt)}
              {m.latenciaMs !== null && ` · respondeu em ${duracao(m.latenciaMs)}`}
              {m.marcadores.map((mk) => (
                <span key={mk} className="marcador">
                  {mk}
                </span>
              ))}
              {registro && <span className="suave"> · sobre: {sobre.get(registro) ?? registro}</span>}
            </div>
            <p>{m.conteudo}</p>
          </li>
        );
      })}
    </ol>
  );
}

function CorpusDaSessao({ corpus }: { corpus: Corpus }) {
  const grupos = [
    ...corpus.affiliations.map((af) => ({ af, itens: corpus.accomplishments.filter((a) => a.affiliationId === af.id) })),
    { af: null, itens: corpus.accomplishments.filter((a) => !a.affiliationId) },
  ].filter((g) => g.af || g.itens.length);
  if (grupos.length === 0) return <p className="suave">Corpus vazio.</p>;

  return (
    <ul className="corpus">
      {grupos.map(({ af, itens }) => (
        <li key={af?.id ?? 'sem'}>
          {af ? (
            <>
              <h3>
                {af.organizacao} · {af.cargo}
              </h3>
              <p className="suave pequeno">
                {af.periodoInicio ?? '?'} – {af.periodoFim ?? (af.periodoConfirmado ? 'atual' : '?')}
                {af.periodoOriginal && ` (no currículo: ${af.periodoOriginal})`}
                {af.periodoConfirmado ? ' · período confirmado' : ' · período não confirmado'}
                {af.confidencial && ' · CONFIDENCIAL'}
                {af.pulado && ' · pulada'}
                {af.tipo !== 'emprego' && ` · ${af.tipo}${af.anoConclusao ? ` ${af.cursando ? 'previsão ' : ''}${af.anoConclusao}` : ''}`}
                {af.stack.length > 0 && ` · ${af.stack.join(', ')}`}
              </p>
              {af.descricaoPublica && <p className="pequeno">Descrição pública: {af.descricaoPublica}</p>}
            </>
          ) : (
            <h3>Sem affiliation</h3>
          )}
          <ul>
            {itens.map((a) => (
              <li key={a.id} className="accomplishment">
                <p>
                  <span className="marcador">{a.tipo}</span>
                  {a.pulado && <span className="marcador">pulado</span>}
                  {a.rascunho && !a.pulado && <span className="marcador">rascunho</span>}
                  {a.importanciaParaPessoa && <span className="marcador">importância {a.importanciaParaPessoa}</span>}
                  {a.forca && <span className="marcador">força {a.forca}</span>}
                  {a.adiado && <span className="marcador">{a.adiadoVoltou ? 'adiado, voltou' : 'adiado'}</span>}
                  {a.data && <span className="suave pequeno"> {a.data} </span>}
                  <span className="suave pequeno"> {a.id}</span>
                </p>
                <p>{a.enunciado}</p>
                {a.metrics.length > 0 && (
                  <ul className="metrics">
                    {a.metrics.map((m) => (
                      <li key={m.id}>
                        <strong>{m.texto}</strong> <span className={`marcador origem-${m.origem}`}>{m.origem}</span>
                        {m.ancora && <span className="suave"> · âncora: {m.ancora}</span>}
                        {m.valores.length > 0 && <span className="suave pequeno"> · valores {m.valores.join(', ')}</span>}
                        {m.confirmadoEm && <span className="suave pequeno"> · confirmado {dataHora(m.confirmadoEm)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** The Critic's questions the rewrite answered "the Corpus cannot": candidates for the interrogation. */
function PerguntasDoCritico({ violacoes }: { violacoes: Partial<Violacoes> }) {
  const mantidas = Object.entries(violacoes.mantidas ?? {});
  if (mantidas.length === 0) return null;
  return (
    <div className="destaque">
      <h3>O que o crítico perguntou e o Corpus não respondeu (tentativa entregue)</h3>
      <ul>
        {mantidas.map(([linha, motivo]) => (
          <li key={linha}>
            <code>{linha}</code> {motivo}
            {(violacoes.critico ?? [])
              .filter((p) => p.id === linha)
              .map((p, i) => (
                <div key={i} className="suave pequeno" lang="en">
                  crítico: {p.mensagem}
                </div>
              ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

type TentativaDoPainel = ConteudoDaSessao['tentativas'][number];

function Tentativa({
  sessaoId,
  t,
  entregue,
  sobre,
}: {
  sessaoId: string;
  t: TentativaDoPainel;
  entregue: boolean;
  sobre: Map<string, string>;
}) {
  // Rows from before step 06 settled the shape hold the column default, `[]`.
  const v: Partial<Violacoes> = Array.isArray(t.violacoes) ? {} : ((t.violacoes ?? {}) as Partial<Violacoes>);
  const medida = (t.medida ?? {}) as { pages?: number; fill?: number };
  const selection = t.json as Selection;
  const grupos: [string, Problema[] | undefined][] = [
    ['Checagens', v.checagens],
    ['Medida', v.medida],
    ['Crítico', v.critico],
  ];

  return (
    <li className="tentativa">
      <h3>
        Tentativa {t.tentativa} · {t.aprovada ? 'aprovada' : 'não aprovada'}
        {entregue && ' · entregue'}
      </h3>
      <p className="suave pequeno">
        {dataHora(t.createdAt)} · {medida.pages ?? '?'} página(s), preenchimento {medida.fill ?? '?'}%
        {t.renderId && (
          <>
            {' · '}
            <a href={`/admin/sessoes/${sessaoId}/pdf?selection=${t.id}`} target="_blank" rel="noopener">
              PDF desta tentativa
            </a>
          </>
        )}
      </p>
      {v.preenchimento_insuficiente && (
        <p className="pequeno">
          Preenchimento insuficiente ({v.preenchimento_insuficiente.fill}%): {v.preenchimento_insuficiente.motivo}
        </p>
      )}
      {grupos.map(([nome, lista]) =>
        lista && lista.length > 0 ? (
          <div key={nome}>
            <h4>
              {nome} ({lista.length})
            </h4>
            <ul className="violacoes" lang="en">
              {lista.map((p, i) => (
                <li key={i}>
                  <code>{p.id}</code> <strong>{p.regra}</strong>
                  {p.gravidade && <span className={`marcador ${p.gravidade}`}>{p.gravidade}</span>} {p.mensagem}
                  {p.sugestao && <div className="suave pequeno">sugestão: {p.sugestao}</div>}
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      {v.notas && v.notas.length > 0 && (
        <ul className="pequeno suave">
          {v.notas.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {v.mantidas && Object.keys(v.mantidas).length > 0 && (
        <div>
          <h4>Mantidas (&quot;o Corpus não tem como&quot;)</h4>
          <ul className="pequeno">
            {Object.entries(v.mantidas).map(([linha, motivo]) => (
              <li key={linha}>
                <code>{linha}</code> {motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
      <details>
        <summary>Texto da Selection</summary>
        <div lang="en">
          {selection.sections?.map((s, i) => (
            <div key={i}>
              <h4>{s.title}</h4>
              {s.groups.map((g, j) => (
                <div key={j}>
                  {g.heading && (
                    <p className="pequeno">
                      <strong>{[g.heading.role, g.heading.organisation].filter(Boolean).join(' · ')}</strong>{' '}
                      {g.heading.period}
                    </p>
                  )}
                  <ul>
                    {g.entries.map((e, k) => (
                      <li key={k}>
                        {e.label && <strong>{e.label}: </strong>}
                        {e.text}{' '}
                        <span className="suave pequeno" title={sobre.get(e.source) ?? e.source} lang="pt-BR">
                          [{sobre.has(e.source) ? 'fonte' : e.source}]
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </details>
    </li>
  );
}
