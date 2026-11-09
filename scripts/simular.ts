// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * `npm run simular -- <persona> [--turnos N] [--sem-jev]`: a second model plays an invented
 * tester (scripts/personas.ts) against the real interrogation — import, turns,
 * tools, database — and the transcript goes to `storage/simulacoes/` (outside
 * git) with the checks of step 05 and the cost:
 *
 * - every Metric `afirmado`/`estimado` holds only numbers the persona said;
 * - every `estimado` has its anchor;
 * - no assistant message has more than one question;
 * - no record was asked about more than the hard limit;
 * - the first question is about an accomplishment (step 10);
 * - for `cv-forte`: no question on high school, at most one on the degree,
 *   every company that reaches the résumé with a period, and the offer to
 *   stop made before the records ran out (step 10).
 * - for `vaga` (step 16): no general interrogation; the posting is read, the
 *   gaps the persona used are marked "já usei", and the Vaga's conversation is
 *   played. Each of them ends as a record or on a company's stack, and the
 *   general conversation gets no message. It runs without `TYPESAFE_API_KEY`
 *   too (the evaluator falls back to its fixed rules), so
 *   `MODO=local` with a subscription chosen on the configuration screen spends nothing.
 *
 * The evaluator's decisions go into the transcript, between the messages.
 * `--sem-jev` runs a general persona without the Jev on purpose (step 23: what
 * `MODO=local` gets without `TYPESAFE_API_KEY`), ignoring the key in `.env`.
 *
 * Exits 1 if a check fails. Spends real money: one import, every turn, and the
 * persona's replies (those are not recorded in `chamadas_llm`).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import Anthropic from '@anthropic-ai/sdk';

import { CONSENTIMENTO_VERSAO } from '../src/conteudo/consentimento';
import { linhaDoTempo, resumoDoAvaliador } from '../src/admin/linha-do-tempo';
import { abrirConversaDaVaga, estadoDoPlano } from '../src/avaliador';
import {
  confirmarVaga,
  corpusDaSessao,
  criarTester,
  configuracaoDaInstancia,
  criarVaga,
  custoDaSessao,
  decisoesDaSessao,
  iniciarInterrogatorio,
  mensagensDaSessao,
  registrarConsentimento,
  responderConsentimentoVagas,
  textoImportado,
  vagaDaSessao,
  type Corpus,
  type DecisaoAvaliador,
  type Mensagem,
} from '../src/db';
import { fecharDb } from '../src/db/client';
import { importarCurriculo } from '../src/import';
import { periodoDaAffiliation } from '../src/geracao/rascunho';
import { contagemPorRegistro, ehFormacao, LIMITE_DURO, progresso } from '../src/interrogatorio/estado';
import { numeroFoiDito, numerosDaFala } from '../src/interrogatorio/numeros';
import { maisDeUmaPergunta } from '../src/interrogatorio/pergunta';
import { encerrarInterrogatorio, turno, type Entrada } from '../src/interrogatorio/turno';
import type { CaminhoModelo } from '../src/db/schema';
import { NOME_DO_CAMINHO } from '../src/llm/caminho';
import { criarClienteLlm, type LinhaChamada, sdkDaConfiguracao } from '../src/llm/cliente';
import { lerEGravar } from '../src/vaga';

import { PERSONAS, type Persona } from './personas';

const args = process.argv.slice(2);
const nome = args.find((a) => !a.startsWith('--'));
const turnosMax = Number(args[args.indexOf('--turnos') + 1]) || 90;

if (!nome || !(nome in PERSONAS)) {
  console.error(`uso: npm run simular -- <${Object.keys(PERSONAS).join('|')}> [--turnos N] [--sem-jev]`);
  process.exit(2);
}
const persona = PERSONAS[nome];
if (args.includes('--sem-jev')) delete process.env.TYPESAFE_API_KEY;
else if (!process.env.TYPESAFE_API_KEY && !persona.vaga) {
  // Without it every checkpoint falls back to the fixed rules: a run that spends and tests nothing of the evaluator.
  console.error('TYPESAFE_API_KEY is missing (the evaluator, src/avaliador/jev.ts): set it in .env');
  process.exit(2);
}
if (!process.env.TYPESAFE_API_KEY) console.warn('sem TYPESAFE_API_KEY: o avaliador roda pelas regras de reserva');

// The persona's calls: the way the configuration says (step 28), counted here and not in `chamadas_llm`.
const chamadasPersona: LinhaChamada[] = [];
const clientePersona = criarClienteLlm({
  sdk: sdkDaConfiguracao(),
  registrar: async (linha) => chamadasPersona.push(linha),
});

/** The persona's next message: it reads the questions as "user", its own answers as "assistant". */
async function falaDaPersona(mensagens: Mensagem[]): Promise<string> {
  const conversa: Anthropic.Beta.BetaMessageParam[] = mensagens.flatMap((m): Anthropic.Beta.BetaMessageParam[] => {
    if (m.papel === 'assistente') return [{ role: 'user', content: m.conteudo }];
    if (m.papel === 'pessoa') return [{ role: 'assistant', content: m.conteudo }];
    return m.marcadores.includes('pulou') && m.conteudo.includes('pular esta')
      ? [{ role: 'assistant', content: '[PULAR]' }]
      : [];
  });
  while (conversa[0]?.role === 'assistant') conversa.shift();
  const resposta = await clientePersona.chamar({
    etapa: 'interrogatorio',
    sessaoId: null,
    params: { max_tokens: 4000, output_config: { effort: 'low' }, system: persona.papel, messages: conversa },
  });
  return resposta.content
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('')
    .trim();
}

interface Checagem {
  nome: string;
  ok: boolean;
  detalhes: string[];
}

/** What the Vaga's run adds to the checks: the gaps it asked and the general conversation it must not touch. */
interface DaVaga {
  /** What the persona used, from `Persona.vaga`. */
  usou: string[];
  lacunas: string[];
  mensagensGerais: number;
}

/** A gap ended as a record that names it, or on a company's stack. */
const virouRegistro = (corpus: Corpus, lacuna: string) => {
  const termo = lacuna.toLowerCase();
  return (
    corpus.accomplishments.some((a) => a.enunciado.toLowerCase().includes(termo)) ||
    corpus.affiliations.some((af) => af.stack.some((t) => t.toLowerCase() === termo))
  );
};

function conferir(
  p: Persona,
  mensagens: Mensagem[],
  corpus: Corpus,
  textoOriginal: string,
  decisoes: DecisaoAvaliador[],
  daVaga?: DaVaga,
): Checagem[] {
  const falas = mensagens.filter((m) => m.papel === 'pessoa').map((m) => m.conteudo);
  const metrics = corpus.accomplishments.flatMap((a) => a.metrics.map((m) => ({ a, m })));

  const inventados = metrics.flatMap(({ m }) =>
    m.origem === 'qualitativo' ? [] : m.valores.filter((v) => !numeroFoiDito(v, falas)).map((v) => `${v} em "${m.texto}"`),
  );
  const semAncora = metrics.filter(({ m }) => m.origem === 'estimado' && !m.ancora?.trim()).map(({ m }) => m.texto);
  const duasPerguntas = mensagens
    .filter((m) => m.papel === 'assistente' && maisDeUmaPergunta(m.conteudo))
    .map((m) => m.conteudo);
  const contagens = contagemPorRegistro(mensagens);
  const demais = [...contagens].filter(([, c]) => c.perguntas > LIMITE_DURO).map(([id, c]) => `${id}: ${c.perguntas}`);
  const enunciadosInventados = corpus.accomplishments.flatMap((a) =>
    numerosDaFala(a.enunciado, { porExtenso: false })
      .filter((n) => !numeroFoiDito(n, [...falas, textoOriginal]))
      .map((n) => `${n} em ${a.id}`),
  );

  const checagens: Checagem[] = [
    { nome: 'toda Metric afirmado/estimado tem o número numa fala da persona', ok: inventados.length === 0, detalhes: inventados },
    { nome: 'toda estimado tem âncora', ok: semAncora.length === 0, detalhes: semAncora },
    { nome: 'nenhuma mensagem do assistente com mais de uma pergunta (nem pergunta que pede duas coisas)', ok: duasPerguntas.length === 0, detalhes: duasPerguntas },
    { nome: `nenhum registro com mais de ${LIMITE_DURO} perguntas`, ok: demais.length === 0, detalhes: demais },
    { nome: 'nenhum enunciado com número que a persona ou o currículo não disse', ok: enunciadosInventados.length === 0, detalhes: enunciadosInventados },
  ];
  const primeiraPergunta = mensagens.find((m) => m.papel === 'assistente');
  if (daVaga) {
    const soltas = daVaga.usou.filter((u) => !virouRegistro(corpus, u));
    checagens.push(
      { nome: 'a vaga tem as lacunas que a persona usou', ok: daVaga.lacunas.length >= daVaga.usou.length, detalhes: daVaga.lacunas },
      { nome: 'cada lacuna que a persona usou virou registro ou stack', ok: soltas.length === 0, detalhes: soltas },
      { nome: 'a conversa geral não ganhou mensagem', ok: daVaga.mensagensGerais === 0, detalhes: [] },
    );
  } else {
    checagens.push({
      nome: 'a primeira pergunta é sobre um accomplishment',
      ok: Boolean(primeiraPergunta?.accomplishmentId),
      detalhes: primeiraPergunta?.accomplishmentId ? [] : [primeiraPergunta?.conteudo ?? '(nenhuma pergunta)'],
    });
  }
  if (p.cvForte) {
    const lugarDe = (m: Mensagem) =>
      corpus.affiliations.find(
        (af) => af.id === m.affiliationId || corpus.accomplishments.some((a) => a.id === m.accomplishmentId && a.affiliationId === af.id),
      );
    const perguntas = mensagens.filter((m) => m.papel === 'assistente');
    const sobreEnsinoMedio = perguntas.filter((m) => lugarDe(m)?.tipo === 'ensino_medio').map((m) => m.conteudo);
    const sobreFormacao = perguntas
      .filter((m) => {
        const af = lugarDe(m);
        return af ? ehFormacao(af) : false;
      })
      .map((m) => m.conteudo);
    const semPeriodo = corpus.affiliations
      .filter((af) => af.tipo === 'emprego' && corpus.accomplishments.some((a) => a.affiliationId === af.id && a.metrics.length))
      .filter((af) => !af.periodoConfirmado && !/\b(?:19|20)\d{2}\b/.test(af.periodoOriginal ?? ''))
      .map((af) => af.organizacao);
    const oferta = decisoes.find((d) => d.decisao === 'ofereceu_fim');
    checagens.push(
      { nome: 'nenhuma pergunta sobre o ensino médio', ok: sobreEnsinoMedio.length === 0, detalhes: sobreEnsinoMedio },
      { nome: 'no máximo uma pergunta sobre a formação', ok: sobreFormacao.length <= 1, detalhes: sobreFormacao },
      { nome: 'toda empresa que vai para o currículo tem o mês confirmado ou o ano do import', ok: semPeriodo.length === 0, detalhes: semPeriodo },
      { nome: 'o fim foi oferecido antes de esgotar os registros', ok: Boolean(oferta), detalhes: oferta ? [oferta.motivo] : [] },
    );
  }
  if (p.nuncaDizNumero) {
    const comNumero = metrics.filter(({ m }) => m.origem !== 'qualitativo').map(({ m }) => `${m.origem}: ${m.texto}`);
    const abertos = corpus.accomplishments.filter((a) => !a.pulado && a.metrics.length === 0).map((a) => a.enunciado);
    checagens.push(
      { nome: 'a persona sem números só tem Metrics qualitativas', ok: comNumero.length === 0, detalhes: comNumero },
      { nome: 'a persona sem números termina com tudo qualitativo ou pulado', ok: abertos.length === 0, detalhes: abertos },
    );
  }
  return checagens;
}

function transcricao(dados: {
  mensagens: Mensagem[];
  decisoes: DecisaoAvaliador[];
  cobertura: number;
  corpus: Corpus;
  checagens: Checagem[];
  custo: Awaited<ReturnType<typeof custoDaSessao>>;
  custoPersona: number;
  tempos: number[];
  sessaoId: string;
  motivoDoFim: string;
  /** The way the calls went (step 28). */
  caminho: CaminhoModelo;
}): string {
  const { fechadas, total } = progresso(dados.corpus);
  const custoTotal = dados.custo.reduce((s, c) => s + c.custoUsd, 0);
  const custoInterrogatorio = dados.custo.find((c) => c.etapa === 'interrogatorio');
  const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const ordenados = [...dados.tempos].sort((a, b) => a - b);
  const linhas: string[] = [
    `# Simulação: ${nome}`,
    '',
    `- Data: ${new Date().toISOString()}`,
    `- Sessão: ${dados.sessaoId}`,
    `- Fim: ${dados.motivoDoFim}`,
    `- Fechadas: ${fechadas} de ${total}; cobertura ${dados.cobertura}%`,
    (() => {
      const r = resumoDoAvaliador(dados.decisoes);
      return `- Avaliador: ${r.checkpoints} checkpoints, ${r.falhasDoJev} falhas do Jev, ${r.semJev} sem o Jev${r.ofereceuFim ? ', ofereceu o fim' : ''}`;
    })(),
    `- Turnos: ${dados.tempos.length}; tempo por turno: média ${(media(dados.tempos) / 1000).toFixed(1)} s, mediana ${((ordenados[Math.floor(ordenados.length / 2)] ?? 0) / 1000).toFixed(1)} s, máximo ${((ordenados.at(-1) ?? 0) / 1000).toFixed(1)} s`,
    dados.custo.some((c) => c.naoMedidas > 0)
      ? `- Custo da sessão (chamadas_llm): não medido (pela ${NOME_DO_CAMINHO[dados.caminho]})`
      : `- Custo da sessão (chamadas_llm): US$ ${custoTotal.toFixed(4)}`,
    ...dados.custo.map(
      (c) =>
        `  - ${c.etapa}: ${c.chamadas} chamadas, US$ ${c.custoUsd.toFixed(4)}, ${c.tokensEntrada} entrada, ${c.tokensSaida} saída, ${c.tokensCacheLeitura} cache lido, ${c.tokensCacheEscrita} cache escrito`,
    ),
    custoInterrogatorio ? `- Custo médio por turno do interrogatório: US$ ${(custoInterrogatorio.custoUsd / Math.max(1, dados.tempos.length)).toFixed(4)}` : '',
    `- Chamadas ao questionador por turno: ${((custoInterrogatorio?.chamadas ?? 0) / Math.max(1, dados.tempos.length)).toFixed(2)}`,
    `- Custo da persona (fora do produto): US$ ${dados.custoPersona.toFixed(4)}`,
    '',
    '## Checagens',
    '',
    ...dados.checagens.flatMap((c) => [`- ${c.ok ? 'OK' : 'FALHOU'}: ${c.nome}`, ...c.detalhes.map((d) => `  - ${d}`)]),
    '',
    '## Transcrição',
    '',
  ];
  for (const i of linhaDoTempo(dados.mensagens, dados.decisoes)) {
    if (i.tipo === 'decisao') {
      const d = i.item;
      linhas.push(`> _avaliador_ (${d.backend}${d.erro ? `, erro: ${d.erro}` : ''}): ${d.gatilho} → **${d.decisao}**${d.cobertura !== null ? `, cobertura ${d.cobertura}%` : ''}. ${d.motivo}`, '');
      continue;
    }
    const m = i.item;
    const quem = m.papel === 'assistente' ? '**Interrogador**' : m.papel === 'pessoa' ? '**Persona**' : '_sistema_';
    const extra = [m.latenciaMs !== null ? `${(m.latenciaMs / 1000).toFixed(1)} s` : '', ...m.marcadores].filter(Boolean);
    linhas.push(`${quem}${extra.length ? ` (${extra.join(', ')})` : ''}: ${m.conteudo}`, '');
  }
  linhas.push('## Corpus no fim', '');
  for (const af of dados.corpus.affiliations) {
    linhas.push(
      `### ${af.organizacao} — ${af.cargo}`,
      '',
      `- Tipo: ${af.tipo}${af.anoConclusao ? `, conclusão ${af.anoConclusao}${af.cursando ? ' (previsão)' : ''}` : ''}`,
      `- Período: ${af.periodoInicio ?? '?'} → ${af.periodoFim ?? (af.periodoConfirmado ? 'atual' : '?')} (${af.periodoConfirmado ? 'confirmado' : 'não confirmado'}); no currículo sai: ${periodoDaAffiliation(af) ?? '(sem período)'}`,
      `- Descrição: ${af.descricaoPublica ?? '(falta)'}${af.confidencial ? ' (confidencial)' : ''}`,
      `- Pulada: ${af.pulado ? 'sim' : 'não'}`,
      '',
    );
  }
  for (const a of dados.corpus.accomplishments) {
    const estado = a.pulado ? 'PULADO' : a.metrics.length ? 'FECHADO' : 'ABERTO';
    const adiado = a.adiado ? (a.adiadoVoltou ? ' (adiado, voltou)' : ' (adiado)') : '';
    linhas.push(`- **${estado}**${adiado} (força ${a.forca ?? '?'}; ${a.importanciaParaPessoa ?? 'importância não perguntada'}) ${a.enunciado}`);
    for (const m of a.metrics) linhas.push(`  - Metric ${m.origem}: ${m.texto} [${m.valores.join(', ')}]${m.ancora ? ` — âncora: ${m.ancora}` : ''}`);
  }
  return linhas.join('\n') + '\n';
}

async function main() {
  const inicio = Date.now();
  const { sessao } = await criarTester({ apelido: `simulação ${nome}`, origem: 'simulacao' });
  const sessaoId = sessao.id;
  console.log(`sessão ${sessaoId}: importando ${persona.curriculo}…`);
  await registrarConsentimento(sessaoId, CONSENTIMENTO_VERSAO);
  const texto = readFileSync(path.join('src/llm/__fixtures__', persona.curriculo), 'utf8');
  await importarCurriculo(sessaoId, { formato: 'texto', texto });
  await iniciarInterrogatorio(sessaoId);

  // A Vaga's run: the posting pasted, read and its checklist marked; the turns are the Vaga's.
  let vagaId: string | null = null;
  let lacunas: string[] = [];
  if (persona.vaga) {
    await responderConsentimentoVagas(sessaoId, true);
    const criada = await criarVaga(sessaoId, { texto: persona.vaga.texto, empresa: null, cargo: null, link: null });
    if (criada.tipo !== 'criada') throw new Error(`no Vaga: ${criada.tipo}`);
    vagaId = criada.vaga.id;
    console.log(`vaga ${vagaId}: lendo…`);
    await lerEGravar(sessaoId, vagaId);
    const lida = await vagaDaSessao(sessaoId, vagaId);
    if (lida?.estagio !== 'lida') throw new Error(`the reading did not finish: ${lida?.estagio}`);
    const usou = (r: { texto: string }) => persona.vaga!.usou.some((u) => r.texto.toLowerCase().includes(u.toLowerCase()));
    const respostas = new Map(lida.requisitos.filter((r) => r.lacuna).map((r) => [r.id, usou(r) ? ('ja_usei' as const) : ('nao_usei' as const)]));
    lacunas = lida.requisitos.filter((r) => respostas.get(r.id) === 'ja_usei').map((r) => r.texto);
    console.log(`lacunas "já usei": ${lacunas.join(' | ') || '(nenhuma)'}; rascunhos trazidos: ${lida.rascunhos?.length ?? 0}`);
    await confirmarVaga(sessaoId, vagaId, { empresa: lida.empresa, cargo: lida.cargo, respostas });
    await abrirConversaDaVaga(sessaoId, vagaId);
  }

  const tempos: number[] = [];
  let entrada: Entrada = { tipo: 'continuar' };
  let motivoDoFim = `limite de ${turnosMax} turnos do script`;
  for (let i = 0; i < turnosMax; i++) {
    const t0 = Date.now();
    const r = await turno(sessaoId, entrada, { vagaId });
    tempos.push(Date.now() - t0);
    console.log(`\n[${i + 1}] ${r.progresso.cobertura}% · ${r.progresso.fechadas}/${r.progresso.total} · ${((Date.now() - t0) / 1000).toFixed(1)} s\n> ${r.texto}`);
    if (r.encerrado) {
      motivoDoFim = 'o interrogador encerrou';
      break;
    }
    const fala = await falaDaPersona(await mensagensDaSessao(sessaoId, vagaId));
    console.log(`< ${fala}`);
    if (fala.includes('[TERMINEI]') && vagaId) {
      motivoDoFim = 'a persona apertou "voltar para a vaga"';
      break;
    }
    if (fala.includes('[TERMINEI]')) {
      await encerrarInterrogatorio(sessaoId, 'pessoa');
      motivoDoFim = 'a persona apertou "terminei"';
      break;
    }
    entrada = fala.includes('[PULAR]') ? { tipo: 'pular' } : { tipo: 'resposta', texto: fala || '…' };
  }
  if (motivoDoFim.startsWith('limite') && !vagaId) await encerrarInterrogatorio(sessaoId, 'pessoa');

  const [mensagens, corpus, custo, original, decisoes, plano, gerais] = await Promise.all([
    mensagensDaSessao(sessaoId, vagaId),
    corpusDaSessao(sessaoId),
    custoDaSessao(sessaoId),
    textoImportado(sessaoId),
    decisoesDaSessao(sessaoId, vagaId),
    estadoDoPlano(sessaoId, vagaId),
    mensagensDaSessao(sessaoId),
  ]);
  const checagens = conferir(
    persona,
    mensagens,
    corpus,
    original,
    decisoes,
    persona.vaga ? { usou: persona.vaga.usou, lacunas, mensagensGerais: gerais.length } : undefined,
  );
  const custoPersona = chamadasPersona.reduce((s, c) => s + c.custoUsd, 0);

  const pasta = path.join('storage', 'simulacoes');
  mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, `${nome}-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
  writeFileSync(arquivo, transcricao({ mensagens, decisoes, cobertura: plano?.cobertura ?? 0, corpus, checagens, custo, custoPersona, tempos, sessaoId, motivoDoFim, caminho: (await configuracaoDaInstancia()).caminho }));

  console.log(`\n${motivoDoFim}; ${((Date.now() - inicio) / 60_000).toFixed(1)} min`);
  for (const c of checagens) console.log(`${c.ok ? 'OK    ' : 'FALHOU'} ${c.nome}${c.detalhes.length ? `: ${c.detalhes.join(' | ')}` : ''}`);
  console.log(`custo da sessão: US$ ${custo.reduce((s, c) => s + c.custoUsd, 0).toFixed(4)} (persona: US$ ${custoPersona.toFixed(4)})`);
  console.log(`transcrição: ${arquivo}`);
  if (checagens.some((c) => !c.ok)) process.exitCode = 1;
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(fecharDb);
