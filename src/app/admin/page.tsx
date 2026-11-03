// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import Link from 'next/link';

import { duracao, ETAPAS_FUNIL, NOME_DA_ETAPA } from '@/admin/funil';
import { montarPainel } from '@/admin/painel';
import { exigirAdmin } from '@/admin/servidor';
import { ancorasMaisUsadas, custoSemSessao, sessoesDoPainel, testersAtivos, ultimasPerguntasDasParadas } from '@/db';

import { gerarToken, sair } from './acoes';
import { FormularioToken } from './_formularios';
import { dataHora, NOME_DO_ESTADO, pct, usd } from './_formato';

export const dynamic = 'force-dynamic';

export default async function Painel() {
  await exigirAdmin();
  const [linhas, semSessao, ancoras, paradas, ativos] = await Promise.all([
    sessoesDoPainel(),
    custoSemSessao(),
    ancorasMaisUsadas(),
    ultimasPerguntasDasParadas(),
    testersAtivos(),
  ]);
  const p = montarPainel(linhas);
  const { criterio: c, funil } = p;
  const apelidoDe = (s: (typeof p.sessoes)[number]) => s.apelido ?? '(apagada)';

  return (
    <main>
      <div className="painel-topo">
        <h1>Painel</h1>
        <form action={sair}>
          <button type="submit" className="discreto">
            Sair
          </button>
        </form>
      </div>

      <section aria-labelledby="criterio">
        <h2 id="criterio">Critério</h2>
        <p className="suave">
          De {c.testers} testers (cada sessão criada, apagadas incluídas). Meta do v0: ≥ 6 de 10 completam, ≥ 4 de
          10 fundador ou indicação.
        </p>
        <div className="cartoes">
          <Cartao rotulo="Abriram o link" valor={c.linkAberto} de={c.testers} />
          <Cartao rotulo="Consentiram" valor={c.consentiram} de={c.testers} />
          <Cartao rotulo="Completaram o interrogatório" valor={c.completaram} de={c.testers} meta={c.metaCompletam} />
          <Cartao
            rotulo="Fundador ou indicou"
            valor={c.fundadorOuIndicou}
            de={c.testers}
            meta={c.metaFundadorOuIndicou}
          />
        </div>
      </section>

      <section aria-labelledby="funil">
        <h2 id="funil">Funil</h2>
        <p className="suave">
          Uma etapa conta quem passou por ela ou por uma posterior. &quot;PDF baixado&quot; e &quot;fundador ou
          indicou&quot; contam cada um por si.
        </p>
        <div className="tabela">
          <table>
            <thead>
              <tr>
                <th>Etapa</th>
                <th>Chegaram</th>
                <th>%</th>
                <th>Pararam aqui</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Não abriu o link</td>
                <td>—</td>
                <td>—</td>
                <td>
                  <Quem sessoes={p.sessoes.filter((s) => s.alcance.parouEm === null)} nome={apelidoDe} />
                </td>
              </tr>
              {ETAPAS_FUNIL.map((e) => (
                <tr key={e}>
                  <td>{NOME_DA_ETAPA[e]}</td>
                  <td>{funil.porEtapa[e]}</td>
                  <td>{pct(funil.porEtapa[e], funil.testers)}</td>
                  <td>
                    <Quem sessoes={p.sessoes.filter((s) => s.alcance.parouEm === e)} nome={apelidoDe} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="sessoes">
        <h2 id="sessoes">Sessões</h2>
        <div className="tabela">
          <table>
            <thead>
              <tr>
                <th>Apelido</th>
                <th>Origem</th>
                <th>Estado</th>
                <th>Parou em</th>
                <th>Tempo total</th>
                <th>&quot;Não sei&quot;</th>
                <th>Custo</th>
                <th>Sinal</th>
                <th>Revisar</th>
              </tr>
            </thead>
            <tbody>
              {[...p.sessoes].reverse().map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/admin/sessoes/${s.id}`}>{apelidoDe(s)}</Link>
                    <div className="suave pequeno">{dataHora(s.createdAt)}</div>
                  </td>
                  <td>{s.origem ?? '—'}</td>
                  <td>{s.apagadaEm ? `apagada em ${dataHora(s.apagadaEm)}` : NOME_DO_ESTADO[s.estado]}</td>
                  <td>{s.alcance.parouEm ? NOME_DA_ETAPA[s.alcance.parouEm] : 'não abriu'}</td>
                  <td>{duracao(s.tempoTotalMs)}</td>
                  <td>{s.apagadaEm ? '—' : s.naoSei}</td>
                  <td>{s.custoNaoMedido ? 'custo não medido' : s.custoTotal > 0 ? usd(s.custoTotal) : '—'}</td>
                  <td>
                    {[
                      s.alcance.fundador && 'fundador',
                      s.alcance.indicou && `indicou${s.indicacoes > 1 ? ` (${s.indicacoes})` : ''}`,
                      s.pagaria && `pagaria: ${s.pagaria}`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </td>
                  <td>{s.revisar ? <strong className="alerta">precisa revisar</strong> : s.erroGeracao ? 'erro na geração' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="preco">
        <h2 id="preco">Para o preço</h2>
        <h3>Custo por sessão</h3>
        <p className="suave">
          Só as sessões com chamada naquela etapa, e sem as de custo não medido (pela assinatura). Custo de sessões apagadas (sem sessão ligada): {usd(semSessao)}.
        </p>
        <div className="tabela">
          <table>
            <thead>
              <tr>
                <th>Etapa</th>
                <th>Sessões</th>
                <th>Média</th>
                <th>Mediana</th>
                <th>Máximo</th>
              </tr>
            </thead>
            <tbody>
              {p.custoPorEtapa.map(({ chave, nome, resumo }) => (
                <tr key={chave}>
                  <td>{nome}</td>
                  <td>{resumo?.n ?? 0}</td>
                  <td>{usd(resumo?.media, 3)}</td>
                  <td>{usd(resumo?.mediana, 3)}</td>
                  <td>{usd(resumo?.maximo, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Tempo de interrogatório</h3>
        <p>
          Mediana: <strong>{duracao(p.tempoMedianoInterrogatorioMs)}</strong>{' '}
          <span className="suave">
            (da primeira pergunta ao fim, em {p.sessoesComInterrogatorioCompleto} sessões; o convite aos testers
            diz 30–40 min)
          </span>
        </p>

        <h3>Âncoras que mais levaram a número</h3>
        <p className="suave">Só das sessões que liberaram a leitura.</p>
        {ancoras.length === 0 ? (
          <p className="suave">Nenhuma Metric estimada ainda.</p>
        ) : (
          <div className="tabela">
            <table>
              <thead>
                <tr>
                  <th>Âncora</th>
                  <th>Metrics estimadas</th>
                </tr>
              </thead>
              <tbody>
                {ancoras.map((a) => (
                  <tr key={a.ancora}>
                    <td>{a.ancora}</td>
                    <td>{a.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3>Onde abandonaram</h3>
        <p className="suave">A última pergunta das sessões em interrogatório sem mensagem há mais de 24 h.</p>
        {paradas.length === 0 ? (
          <p className="suave">Nenhuma sessão parada.</p>
        ) : (
          <div className="tabela">
            <table>
              <thead>
                <tr>
                  <th>Sessão</th>
                  <th>Última pergunta</th>
                  <th>Sobre</th>
                  <th>Quando</th>
                </tr>
              </thead>
              <tbody>
                {paradas.map((q) => (
                  <tr key={q.sessaoId}>
                    <td>
                      <Link href={`/admin/sessoes/${q.sessaoId}`}>{q.apelido ?? '—'}</Link>
                    </td>
                    <td className="texto-longo">{q.pergunta ?? <span className="suave">a pessoa não liberou a leitura</span>}</td>
                    <td className="texto-longo suave">{q.sobre ? resumir(q.sobre) : '—'}</td>
                    <td>{dataHora(q.em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="token">
        <h2 id="token">Gerar link de tester</h2>
        <p className="suave">O mesmo que <code>npm run token:new</code>. O link aparece uma vez só.</p>
        <FormularioToken gerar={gerarToken} testers={ativos} />
      </section>
    </main>
  );
}

function Cartao({ rotulo, valor, de, meta }: { rotulo: string; valor: number; de: number; meta?: number }) {
  const bateu = meta !== undefined && de > 0 && valor >= meta;
  return (
    <div className={`cartao${meta === undefined ? '' : bateu ? ' bateu' : ' falta'}`}>
      <span className="rotulo">{rotulo}</span>
      <strong>
        {valor} <span className="suave">de {de}</span>
      </strong>
      {meta !== undefined && <span className="pequeno">meta ≥ {meta} {bateu ? '· bateu' : `· faltam ${Math.max(meta - valor, 0)}`}</span>}
    </div>
  );
}

function Quem<S extends { id: string }>({ sessoes, nome }: { sessoes: S[]; nome: (s: S) => string }) {
  if (sessoes.length === 0) return <span className="suave">—</span>;
  return (
    <span>
      {sessoes.length}:{' '}
      {sessoes.map((s, i) => (
        <span key={s.id}>
          {i > 0 && ', '}
          <Link href={`/admin/sessoes/${s.id}`}>{nome(s)}</Link>
        </span>
      ))}
    </span>
  );
}

const resumir = (t: string) => (t.length > 90 ? `${t.slice(0, 90)}…` : t);
