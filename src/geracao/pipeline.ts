// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The generation (step 06): from the interrogated Corpus to the English résumé.
 *
 *   selection → checks → render + measure → Critic → (rewrite → checks →
 *   render + measure → Critic on the changed lines)… until nothing blocks or
 *   the attempts run out.
 *
 * A Vaga's résumé (step 17) runs the same loop aimed at the job: the selection
 * gets the requirements and what the person never used, the Critic of each
 * attempt gets the job only to judge the headline and the summary, and a
 * problem it raises about a requirement no line covers is set aside, never
 * rewritten. After the best attempt is chosen, one more call in the Critic's
 * role reads it whole and maps each requirement to the line that answers it
 * (or "não coberto"), with the interview questions; the code checks every id.
 *
 * Every attempt is a `selections` row with its violations and its `renders`
 * row. What blocks: any deterministic check, any page rule of the measure
 * (except a short page the Corpus cannot fill: that is recorded as
 * `preenchimento_insuficiente`, never padded), and every `alta` problem of the
 * Critic that the rewrite has neither fixed nor answered with "the Corpus
 * cannot". When the attempts run out, the best one is delivered and the
 * session is flagged for Daniel to review.
 *
 * The Critic has a clean context: it never sees the Corpus nor the selection's
 * reasoning, only the résumé as text.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import {
  atualizarGeracao,
  cabecalhoDaSessao,
  corpusDaSessao,
  entregarSelection,
  geracaoDaSessao,
  gravarTentativa,
  linhasDaSessao,
  proximaTentativa,
  sessaoPorId,
  vagaDaSessao,
  type Corpus,
  type VagaComRequisitos,
} from '@/db';
import type { Cabecalho } from '@/db/geracao';
import type { PerguntaDeEntrevista } from '@/db/schema';
import { registrarErro } from '@/erros';
import { Refs } from '@/interrogatorio/estado';
import { llm, type ClienteLlm, type Etapa } from '@/llm/cliente';
import { renderResume, type Medida, type RenderedResume, type Selection } from '@/render';

import { checarTudo, conferirMapa, ehStack, type ContextoChecagem, type LinhaDoMapa } from './checagens';
import { contextoDasChecagens, descreverCorpusParaGeracao, registrosSemUso } from './corpus';
import {
  aplicarMudancas,
  chaveDe,
  entradaDaReescrita,
  entradaDaSelecao,
  montarSelection,
  idsDoRascunho,
  rascunhoDaEntrada,
  textoComIds,
  type MapaDeLinhas,
  type Rascunho,
} from './rascunho';

/** Attempts before the best one is delivered for Daniel to review. */
export const LIMITE_TENTATIVAS = 4;
/** Calls within one stage before it gives up on getting a valid tool call. */
const RODADAS = 3;
const PREENCHIMENTO_MINIMO = 97;

export type EtapaDaGeracao = 'selecao' | 'conferindo' | 'render' | 'critico' | 'reescrita' | 'mapa';

/** One thing wrong with an attempt, on one line of the draft. */
export interface Problema {
  /** The draft line (`b3`, `g1.role`, `summary`), `pagina`, or `secoes`. */
  id: string;
  origem: 'checagem' | 'medida' | 'critico';
  regra: string;
  mensagem: string;
  gravidade?: 'alta' | 'baixa';
  sugestao?: string | null;
}

/** What `selections.violacoes` holds for one attempt. */
export interface Violacoes {
  checagens: Problema[];
  medida: Problema[];
  /** Every problem the Critic still holds against the page, `baixa` included. */
  critico: Problema[];
  /** What is short because the Corpus is (fewer than three bullets, nothing left to add). */
  notas: string[];
  /** The page is short and no record is left to fill it: accepted, never padded. */
  preenchimento_insuficiente?: { fill: number; motivo: string };
  /** The rewrite's "the Corpus cannot fix this" answers, by line. */
  mantidas?: Record<string, string>;
}

export interface DepsGeracao {
  cliente?: ClienteLlm;
  renderizar?: (s: Selection) => Promise<RenderedResume>;
  aoEtapa?: (etapa: EtapaDaGeracao) => void;
}

export class ErroGeracao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroGeracao';
  }
}

// ---- prompts ----------------------------------------------------------------

const cache = new Map<string, string>();
/** A stage's system prompt; for a Vaga, with what is only the Vaga's (`prompt-<nome>-vaga.md`) after it. */
function prompt(nome: 'selecao' | 'critico' | 'reescrita' | 'mapa', vaga = false): string {
  const chave = `${nome}:${vaga}`;
  let texto = cache.get(chave);
  if (!texto) {
    const ler = (arquivo: string) => readFileSync(path.join(process.cwd(), 'src/geracao', arquivo), 'utf8');
    texto = ler(`prompt-${nome}.md`).replace('{{REGRAS}}', ler('regras.md')).replace('{{EXEMPLOS}}', ler('exemplos.md'));
    if (vaga && nome !== 'mapa') texto = `${texto}\n\n${ler(`prompt-${nome}-vaga.md`)}`;
    cache.set(chave, texto);
  }
  return texto;
}

/** The JSON Schema strict mode accepts (as the interrogation's tools do). */
function esquemaDaTool(esquema: z.ZodType): Anthropic.Beta.BetaTool.InputSchema {
  const limpar = (no: unknown): unknown => {
    if (Array.isArray(no)) return no.map(limpar);
    if (no && typeof no === 'object') {
      return Object.fromEntries(
        Object.entries(no).filter(([k]) => !['$schema', 'pattern', 'minLength'].includes(k)).map(([k, v]) => [k, limpar(v)]),
      );
    }
    return no;
  };
  return limpar(z.toJSONSchema(esquema)) as Anthropic.Beta.BetaTool.InputSchema;
}

const critica = z.object({
  problemas: z.array(
    z.object({
      id: z.string().describe('The line id in brackets ([b3] → "b3", [g1.role] → "g1.role").'),
      // `mira` and `requisito_ausente` exist only for a Vaga's résumé.
      passe: z.enum(['recrutador', 'regras', 'prosa', 'mira', 'requisito_ausente']),
      gravidade: z.enum(['alta', 'baixa']),
      problema: z.string().describe('What is wrong, in one sentence.'),
      sugestao: z.string().nullable().describe('The line you would write, rewording only what it already says; or null.'),
    }),
  ),
});

const mapaDaVaga = z.object({
  mapa: z.array(
    z.object({
      requisito: z.string().describe('The requirement (r1…).'),
      linha: z.string().nullable().describe('The one line that answers it: a bullet ("b3") or a stack line ("g1.stack"); null when no line does.'),
    }),
  ),
  perguntas: z.array(
    z.object({
      linha: z.string().describe('The line the question is about ("b3", "summary").'),
      pergunta: z.string().describe('The question, in English.'),
    }),
  ),
});

const TOOLS = {
  entregar_curriculo: { esquema: entradaDaSelecao, descricao: 'Delivers the whole résumé: the sections, their groups and bullets.' },
  registrar_leitura: { esquema: critica, descricao: 'Records every problem found in the three passes (an empty list if none).' },
  aplicar_mudancas: { esquema: entradaDaReescrita, descricao: 'Applies the changes to the résumé, one per line, and answers every problem.' },
  registrar_mapa: { esquema: mapaDaVaga, descricao: "Records, for each of the job's requirements, the line that answers it (or null), and the interview questions per line." },
} as const;
type NomeTool = keyof typeof TOOLS;

/**
 * One stage: the model reads `conteudo` and calls `tool`. A call that does not
 * validate, or that `conferir` refuses, goes back as an error; a reply in text
 * is asked again. Gives up after `RODADAS` calls.
 */
async function chamarFerramenta<N extends NomeTool>(
  cliente: ClienteLlm,
  pedido: {
    etapa: Etapa;
    sessaoId: string;
    /** The Vaga the résumé is for: its cost is counted per job. */
    vagaId: string | null;
    system: string;
    tool: N;
    conteudo: string;
    /** Null when the input is accepted, or the error to send back. Runs on every call. */
    conferir?: (input: z.infer<(typeof TOOLS)[N]['esquema']>) => string | null;
  },
): Promise<z.infer<(typeof TOOLS)[N]['esquema']>> {
  const { esquema, descricao } = TOOLS[pedido.tool];
  const tools: Anthropic.Beta.BetaTool[] = [{ name: pedido.tool, description: descricao, strict: true, input_schema: esquemaDaTool(esquema) }];
  const conversa: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: pedido.conteudo }];

  for (let rodada = 1; rodada <= RODADAS; rodada++) {
    const resposta = await cliente.chamar({
      etapa: pedido.etapa,
      sessaoId: pedido.sessaoId,
      vagaId: pedido.vagaId,
      params: {
        max_tokens: 32_000,
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: pedido.system, cache_control: { type: 'ephemeral' } }],
        tools,
        messages: conversa,
      },
    });
    if (resposta.stop_reason === 'max_tokens') throw new ErroGeracao(`${pedido.etapa} hit max_tokens`);
    conversa.push({ role: 'assistant', content: resposta.content });

    const chamada = resposta.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === pedido.tool,
    );
    if (!chamada) {
      conversa.push({ role: 'user', content: `[sistema] Call the tool ${pedido.tool}; do not answer in text.` });
      continue;
    }
    const lido = esquema.safeParse(chamada.input);
    const erro = lido.success
      ? (pedido.conferir?.(lido.data as z.infer<(typeof TOOLS)[N]['esquema']>) ?? null)
      : `invalid input: ${lido.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
    if (lido.success && erro === null) return lido.data as z.infer<(typeof TOOLS)[N]['esquema']>;
    conversa.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: chamada.id, is_error: true, content: `${erro} Call ${pedido.tool} again.` }],
    });
  }
  throw new ErroGeracao(`${pedido.etapa}: no valid ${pedido.tool} call in ${RODADAS} rounds`);
}

// ---- the measure, as problems on lines -------------------------------------

/**
 * The page rules of the measure, each on the line it is about. A short page is
 * a problem only while some record with a result is still off the page and the
 * rewrite has not said the Corpus cannot fill it.
 */
export function problemasDaMedida(
  medida: Medida,
  selection: Selection,
  linhas: MapaDeLinhas,
  dados: { semUso: string[]; aceitarCurto: boolean },
): { problemas: Problema[]; preenchimentoInsuficiente?: Violacoes['preenchimento_insuficiente'] } {
  const problemas: Problema[] = [];
  let preenchimentoInsuficiente: Violacoes['preenchimento_insuficiente'];

  if (medida.pages > 1) {
    problemas.push({ id: 'pagina', origem: 'medida', regra: 'pagina_longa', mensagem: `the résumé takes ${medida.pages} pages; it is one. Cut Projects first, then the least important bullets, and kill orphans.` });
  } else if (medida.fill < PREENCHIMENTO_MINIMO) {
    if (dados.semUso.length && !dados.aceitarCurto) {
      problemas.push({
        id: 'pagina',
        origem: 'medida',
        regra: 'pagina_curta',
        mensagem: `the page is filled to ${medida.fill}%; aim for 97–100%. Add short bullets from these records not yet used: ${dados.semUso.join(', ')}. Never lengthen a bullet to fill.`,
      });
    } else {
      preenchimentoInsuficiente = {
        fill: medida.fill,
        motivo: dados.semUso.length ? 'the rewrite said the remaining records cannot fill it' : 'every record with a result is already on the page',
      };
    }
  }

  // The measure lists, per group with bullets, the lines of each bullet (stack line excluded), in order.
  let n = 0;
  selection.sections.forEach((secao, i) =>
    secao.groups.forEach((grupo, j) => {
      const indices = grupo.entries.map((e, k) => ({ e, k })).filter(({ e }) => !ehStack(e));
      if (!indices.length) return;
      const contagem = medida.groups[n++]?.lines ?? [];
      let tres = 0;
      indices.forEach(({ k }, x) => {
        const total = contagem[x] ?? 0;
        if (total === 3) tres++;
        if (total > 3) {
          problemas.push({ id: linhas.get(`e:${i}:${j}:${k}`) ?? '?', origem: 'medida', regra: 'linhas_demais', mensagem: `this bullet takes ${total} lines; two, at most three. It is two facts: rewrite it around one.` });
        }
      });
      if (tres > 2) {
        problemas.push({ id: linhas.get(`g:${i}:${j}`) ?? '?', origem: 'medida', regra: 'tres_linhas', mensagem: `${tres} bullets of this group take three lines; at most two may. Rewrite the longest shorter.` });
      }
    }),
  );

  for (const orfa of medida.orphans) {
    let id: string | undefined;
    selection.sections.forEach((secao, i) =>
      secao.groups.forEach((grupo, j) => {
        if ((grupo.heading?.organisation ?? secao.title) !== orfa.group) return;
        const palavra = orfa.line.trim().split(/\s+/).at(-1) ?? '';
        const k = grupo.entries.findIndex((e) => e.source === orfa.source && e.text.trim().endsWith(palavra));
        const achada = k >= 0 ? k : grupo.entries.findIndex((e) => e.source === orfa.source);
        if (achada >= 0 && !id) id = linhas.get(`e:${i}:${j}:${achada}`);
      }),
    );
    problemas.push({ id: id ?? '?', origem: 'medida', regra: 'orfa', mensagem: `the last line holds only "${orfa.line}". Rewrite the line a little shorter (or drop a minor technology) so it ends on a full line.` });
  }
  return { problemas, preenchimentoInsuficiente };
}

// ---- the stages -------------------------------------------------------------

/** The Vaga a résumé is aimed at, as the stages read it. Requirements are `r1`, `r2`… in the Vaga's order. */
interface VagaDaGeracao {
  id: string;
  cargo: string | null;
  requisitos: { ref: string; id: string; texto: string; obrigatorio: boolean; cobertos: string[] }[];
  /** Gaps the person marked "não usei", or left unanswered (P11). */
  naoUsados: string[];
}

interface Contexto {
  sessaoId: string;
  cliente: ClienteLlm;
  corpus: Corpus;
  refs: Refs;
  cabecalho: Cabecalho;
  checagem: ContextoChecagem;
  descricao: string;
  vaga: VagaDaGeracao | null;
}

function vagaDaGeracao(vaga: VagaComRequisitos, refs: Refs): VagaDaGeracao {
  return {
    id: vaga.id,
    cargo: vaga.cargo,
    requisitos: vaga.requisitos.map((r, i) => ({
      ref: `r${i + 1}`,
      id: r.id,
      texto: r.texto,
      obrigatorio: r.tipo === 'obrigatorio',
      cobertos: r.accomplishmentIds.map((id) => refs.ref(id)).filter((x): x is string => Boolean(x)),
    })),
    naoUsados: vaga.requisitos.filter((r) => r.lacuna && r.resposta !== 'ja_usei').map((r) => r.texto),
  };
}

/**
 * The job as a stage reads it: its role and requirements, the required first.
 * `cobertura` adds the records that already cover each (for the selection);
 * `naoUsados` adds what the person never used (for whoever writes lines).
 */
function blocoDaVaga(vaga: VagaDaGeracao, opcoes: { cobertura?: boolean; naoUsados?: boolean; semRequisitos?: boolean } = {}): string {
  const linha = (r: VagaDaGeracao['requisitos'][number]) =>
    `- ${r.ref} ${r.texto}${opcoes.cobertura && r.cobertos.length ? ` (covered by: ${r.cobertos.join(', ')})` : ''}`;
  const requisitos = opcoes.semRequisitos ? [] : vaga.requisitos;
  const obrigatorios = requisitos.filter((r) => r.obrigatorio);
  const desejaveis = requisitos.filter((r) => !r.obrigatorio);
  return [
    '<job>',
    `role: ${vaga.cargo ?? '(not given)'}`,
    ...(obrigatorios.length ? ['required:', ...obrigatorios.map(linha)] : []),
    ...(desejaveis.length ? ['nice to have:', ...desejaveis.map(linha)] : []),
    ...(opcoes.naoUsados ? [`not_used: ${vaga.naoUsados.length ? vaga.naoUsados.join('; ') : '(none)'}`] : []),
    '</job>',
  ].join('\n');
}

async function selecionar(ctx: Contexto): Promise<Rascunho> {
  const entrada = await chamarFerramenta(ctx.cliente, {
    etapa: 'selecao',
    sessaoId: ctx.sessaoId,
    vagaId: ctx.vaga?.id ?? null,
    system: prompt('selecao', Boolean(ctx.vaga)),
    tool: 'entregar_curriculo',
    conteudo: [
      '<corpus>',
      ctx.descricao,
      '</corpus>',
      ...(ctx.vaga ? [blocoDaVaga(ctx.vaga, { cobertura: true, naoUsados: true })] : []),
      ctx.vaga
        ? 'The header (name, contact, links, city) is filled in from what the person typed; you write only the headline, the summary and the sections, aimed at this job.'
        : 'The header (name, contact, links, city) is filled in from what the person typed; you write only the headline, the summary and the sections. A general résumé, no job posting.',
    ].join('\n'),
    conferir: (e) => {
      if (!e.sections.length || e.sections.some((s) => !s.groups.length)) return 'every section needs at least one group, and there is at least one section.';
      const vazios = e.sections.flatMap((s) => s.groups).filter((g) => !g.organisation.trim() || g.bullets.some((b) => !b.text.trim()));
      if (vazios.length) return 'every group needs its organisation, and every bullet its text.';
      const desconhecidos = e.sections.flatMap((s) => s.groups.flatMap((g) => g.bullets.map((b) => b.source))).filter((r) => ctx.refs.registro(r)?.tipo !== 'accomplishment');
      return desconhecidos.length ? `these sources are not Accomplishments of the Corpus: ${desconhecidos.join(', ')}.` : null;
    },
  });
  return rascunhoDaEntrada(entrada);
}

/** The lines the job's aim is judged on. */
const LINHAS_DA_MIRA = new Set(['header_role', 'summary']);

async function criticar(ctx: Contexto, texto: string, ler: Set<string> | null): Promise<Problema[]> {
  const leitura = await chamarFerramenta(ctx.cliente, {
    etapa: 'critico',
    sessaoId: ctx.sessaoId,
    vagaId: ctx.vaga?.id ?? null,
    system: prompt('critico', Boolean(ctx.vaga)),
    tool: 'registrar_leitura',
    conteudo: [
      ...(ctx.vaga ? [blocoDaVaga(ctx.vaga)] : []),
      '<resume>',
      texto,
      '</resume>',
      ler
        ? `Read only these lines, which were just rewritten: ${[...ler].join(', ')}. The rest is context; report nothing on it.`
        : 'Read every line.',
    ].join('\n'),
  });
  return leitura.problemas
    .map((p) => ({ ...p, id: p.id.replace(/[[\]]/g, '').trim() }))
    .filter((p) => !ler || ler.has(p.id))
    // A requirement no line covers never goes to the rewrite (decision 5): pushing it to cover one invites invention.
    // The aim is judged on the headline and the summary only, and stays a note: "the summary misses the job's main
    // ask" is a missing requirement by another name. The headline's rules are the checks' (`checarTituloDaVaga`).
    .filter((p) => p.passe !== 'requisito_ausente' && (p.passe !== 'mira' || (ctx.vaga && LINHAS_DA_MIRA.has(p.id))))
    .map((p) => ({
      id: p.id,
      origem: 'critico' as const,
      regra: p.passe,
      gravidade: p.passe === 'mira' ? ('baixa' as const) : p.gravidade,
      mensagem: p.problema,
      sugestao: p.sugestao,
    }));
}

/**
 * The map of a Vaga's delivered Version (decision 3): one more call in the
 * Critic's role, on the page as delivered. Each requirement → the record of the
 * line that answers it, checked against the Selection (`conferirMapa`): a line
 * that is not on the page is "não coberto". The interview questions are kept
 * with the record of their line.
 */
async function mapear(
  ctx: Contexto & { vaga: VagaDaGeracao },
  rascunho: Rascunho,
  selection: Selection,
): Promise<{ mapa: LinhaDoMapa[]; perguntas: PerguntaDeEntrevista[] }> {
  const resposta = await chamarFerramenta(ctx.cliente, {
    etapa: 'mapa_vaga',
    sessaoId: ctx.sessaoId,
    vagaId: ctx.vaga.id,
    system: prompt('mapa'),
    tool: 'registrar_mapa',
    conteudo: [blocoDaVaga(ctx.vaga), '<resume>', textoComIds(rascunho, selection), '</resume>'].join('\n'),
  });
  const grupos = rascunho.sections.flatMap((s) => s.groups);
  const idDoRegistro = (ref: string | undefined) => (ref ? (ctx.refs.registro(ref)?.id ?? null) : null);
  const daLinha = (linha: string | null): { accomplishmentId: string | null; naStack: boolean } => {
    const id = linha?.replace(/[[\]]/g, '').trim() ?? '';
    const pilha = /^(g\d+)\.stack$/.exec(id);
    if (pilha) return { accomplishmentId: idDoRegistro(grupos.find((g) => g.id === pilha[1])?.bullets[0]?.source), naStack: true };
    return { accomplishmentId: idDoRegistro(grupos.flatMap((g) => g.bullets).find((b) => b.id === id)?.source), naStack: false };
  };
  const porRef = new Map(ctx.vaga.requisitos.map((r) => [r.ref, r.id]));
  const citado = resposta.mapa.flatMap((m) => {
    const requisitoId = porRef.get(m.requisito.trim());
    return requisitoId ? [{ requisitoId, ...daLinha(m.linha) }] : [];
  });
  return {
    mapa: conferirMapa(citado, ctx.vaga.requisitos.map((r) => r.id), selection),
    perguntas: resposta.perguntas.map((p) => ({ accomplishmentId: daLinha(p.linha).accomplishmentId, pergunta: p.pergunta })),
  };
}

async function reescrever(
  ctx: Contexto,
  rascunho: Rascunho,
  selection: Selection,
  problemas: Problema[],
  semUso: string[],
): Promise<ReturnType<typeof aplicarMudancas>> {
  let resultado: ReturnType<typeof aplicarMudancas> | undefined;
  const lista = problemas.map((p) => `- [${p.id}] (${p.origem}: ${p.regra}) ${p.mensagem}${p.sugestao ? ` Critic's suggestion: "${p.sugestao}"` : ''}`);
  await chamarFerramenta(ctx.cliente, {
    etapa: 'reescrita',
    sessaoId: ctx.sessaoId,
    vagaId: ctx.vaga?.id ?? null,
    system: prompt('reescrita', Boolean(ctx.vaga)),
    tool: 'aplicar_mudancas',
    conteudo: [
      '<corpus>',
      ctx.descricao,
      '</corpus>',
      // The role and what was never used, not the requirements: the rewrite is never pushed to cover one (decision 5).
      ...(ctx.vaga ? [blocoDaVaga(ctx.vaga, { naoUsados: true, semRequisitos: true })] : []),
      '<resume>',
      textoComIds(rascunho, selection, { fontes: true }),
      '</resume>',
      '<problems>',
      ...lista,
      '</problems>',
      `<records_not_used>${semUso.length ? semUso.join(', ') : '(none: every record with a result is on the page)'}</records_not_used>`,
    ].join('\n'),
    conferir: (entrada) => {
      // Applied to the draft as it came in: a call sent back is a whole new answer.
      const r = aplicarMudancas(rascunho, entrada.mudancas);
      if (r.erros.length) return `some changes could not be applied: ${r.erros.join(' ')} Send the whole list again, corrected.`;
      resultado = r;
      return null;
    },
  });
  return resultado!;
}

// ---- the loop ---------------------------------------------------------------

/** Lower is better: a check outweighs a page rule, which outweighs the Critic. */
const peso = (v: Violacoes) =>
  1000 * v.checagens.length + 100 * v.medida.length + v.critico.filter((p) => p.gravidade === 'alta').length;

const bloqueia = (v: Violacoes) => peso(v) > 0;

export interface ResultadoGeracao {
  selectionId: string;
  /** How many attempts ran (on the delivered one: which attempt it was). */
  tentativas: number;
  aprovada: boolean;
  violacoes: Violacoes;
}

/**
 * Runs one generation (a Version) of a session's general résumé, or of a
 * Vaga's when the generation is a Vaga's, and delivers it; the session's state
 * is not what allows it (step 14), the generation is. Throws `ErroGeracao` when
 * the generation is not this session's, has ended, its Vaga is emptied, or the
 * session is erased or has no header; a model or render failure propagates and
 * nothing is delivered. A failed map does not hold the résumé back: it is
 * delivered without one.
 */
export async function gerarCurriculo(sessaoId: string, geracaoId: string, deps: DepsGeracao = {}): Promise<ResultadoGeracao> {
  const cliente = deps.cliente ?? llm();
  const renderizar = deps.renderizar ?? renderResume;
  const etapa = async (e: EtapaDaGeracao) => {
    deps.aoEtapa?.(e);
    await atualizarGeracao(geracaoId, { etapa: e });
  };

  const [sessao, geracao, cabecalho] = await Promise.all([sessaoPorId(sessaoId), geracaoDaSessao(sessaoId, geracaoId), cabecalhoDaSessao(sessaoId)]);
  if (!sessao || sessao.apagadaEm) throw new ErroGeracao('the session is missing or erased');
  if (!geracao || geracao.terminadaEm) throw new ErroGeracao(`generation ${geracaoId} is not open in this session`);
  if (!cabecalho) throw new ErroGeracao('no header yet');
  const vagaGravada = geracao.vagaId ? await vagaDaSessao(sessaoId, geracao.vagaId) : null;
  if (geracao.vagaId && !vagaGravada) throw new ErroGeracao(`the Vaga of generation ${geracaoId} is missing or emptied`);
  // Also clears the failure of a previous run ("tentar de novo").
  await atualizarGeracao(geracaoId, { iniciadaEm: new Date(), erro: null });

  const [corpus, linhasOriginais] = await Promise.all([corpusDaSessao(sessaoId), linhasDaSessao(sessaoId)]);
  const refs = new Refs(corpus, linhasOriginais);
  const vaga = vagaGravada ? vagaDaGeracao(vagaGravada, refs) : null;
  const ctx: Contexto = {
    sessaoId,
    cliente,
    corpus,
    refs,
    cabecalho,
    checagem: { ...contextoDasChecagens(corpus), ...(vaga ? { vaga: { cargo: vaga.cargo } } : {}) },
    descricao: descreverCorpusParaGeracao(corpus, refs),
    vaga,
  };

  await etapa('selecao');
  let rascunho = await selecionar(ctx);
  let alteradas: Set<string> | null = null;
  let critico: Problema[] = [];
  const mantidas = new Map<string, string>();
  let aceitarCurto = false;
  let semEncherSeguidas = 0;
  let melhor: (ResultadoGeracao & { rascunho: Rascunho; selection: Selection }) | undefined;
  let feitas = 0;
  const primeira = await proximaTentativa(geracaoId);

  for (let n = 0; n < LIMITE_TENTATIVAS; n++) {
    const tentativa = primeira + n;
    feitas = n + 1;
    const { selection, linhas } = montarSelection(rascunho, ctx);
    const idDe = (onde: Parameters<typeof chaveDe>[0]) => linhas.get(chaveDe(onde)) ?? chaveDe(onde);

    await etapa('conferindo');
    const checado = checarTudo(selection, ctx.checagem);
    const checagens: Problema[] = checado.violacoes.map((v) => ({ id: idDe(v.onde), origem: 'checagem', regra: v.regra, mensagem: v.mensagem }));

    await etapa('render');
    const inicioRender = performance.now();
    const { pdf, medida } = await renderizar(selection);
    const duracaoRenderMs = Math.round(performance.now() - inicioRender);
    const usados = new Set(selection.sections.flatMap((s) => s.groups.flatMap((g) => g.entries.map((e) => e.source))));
    const semUso = registrosSemUso(corpus, refs, usados);
    const daMedida = problemasDaMedida(medida, selection, linhas, { semUso, aceitarCurto });

    await etapa('critico');
    const lidas = await criticar(ctx, textoComIds(rascunho, selection), alteradas);
    // What the Critic said of a line it read again is replaced; what the rewrite
    // answered with "the Corpus cannot" is settled.
    // A problem on a line that is gone goes with it.
    const existentes = idsDoRascunho(rascunho);
    critico = [...critico.filter((p) => alteradas !== null && !alteradas.has(p.id)), ...lidas].filter(
      (p) => !mantidas.has(p.id) && existentes.has(p.id),
    );

    const violacoes: Violacoes = {
      checagens,
      medida: daMedida.problemas,
      critico,
      notas: checado.notas,
      ...(daMedida.preenchimentoInsuficiente ? { preenchimento_insuficiente: daMedida.preenchimentoInsuficiente } : {}),
      ...(mantidas.size ? { mantidas: Object.fromEntries(mantidas) } : {}),
    };
    const aprovada = !bloqueia(violacoes);
    const selectionId = await gravarTentativa(sessaoId, geracaoId, { json: selection, tentativa, violacoes, aprovada, pdf, medida, duracaoMs: duracaoRenderMs });
    const resultado: ResultadoGeracao = { selectionId, tentativas: n + 1, aprovada, violacoes };
    if (!melhor || peso(violacoes) < peso(melhor.violacoes)) melhor = { ...resultado, rascunho, selection };
    if (aprovada || n === LIMITE_TENTATIVAS - 1) break;

    await etapa('reescrita');
    const bloqueantes = [...checagens, ...daMedida.problemas, ...critico.filter((p) => p.gravidade === 'alta')];
    const rascunhoAnterior = rascunho;
    const r = await reescrever(ctx, rascunho, selection, bloqueantes, semUso);
    rascunho = r.rascunho;
    alteradas = r.alteradas;
    // A rewritten line is judged again, whatever was said of it before.
    for (const id of r.alteradas) mantidas.delete(id);
    for (const [id, motivo] of r.mantidas) {
      mantidas.set(id, motivo);
      if (id === 'pagina') aceitarCurto = true;
    }
    // Asked to fill the page and added nothing: the records left cannot fill it
    // (a draft, a management record). The page stays short; it is never padded.
    // A rewrite busy with a check may leave the page for later: then it takes two such rounds.
    const pediuPagina = bloqueantes.some((p) => p.regra === 'pagina_curta');
    const antes = idsDoRascunho(rascunhoAnterior);
    const adicionou = [...r.alteradas].some((id) => /^b\d+$/.test(id) && !antes.has(id));
    semEncherSeguidas = pediuPagina && !adicionou ? semEncherSeguidas + 1 : 0;
    if (semEncherSeguidas > 0 && (checagens.length === 0 || semEncherSeguidas >= 2)) aceitarCurto = true;
  }

  const { rascunho: rascunhoEntregue, selection: selectionEntregue, ...entregue } = melhor!;
  const revisar = !entregue.aprovada;

  // The delivered Version is `melhor`, not always the last attempt, and the
  // Critic of the later attempts read only the changed lines: the map reads it whole.
  let mapeado: Awaited<ReturnType<typeof mapear>> | null = null;
  if (ctx.vaga) {
    await etapa('mapa');
    try {
      mapeado = await mapear({ ...ctx, vaga: ctx.vaga }, rascunhoEntregue, selectionEntregue);
    } catch (erro) {
      await registrarErro({ origem: 'servidor', onde: 'mapa_geracao', erro, sessaoId, log: `the map of generation ${geracaoId} failed:` });
    }
  }

  await entregarSelection(sessaoId, geracaoId, {
    selectionId: entregue.selectionId,
    revisar,
    evento: {
      tentativas: feitas,
      entregue: entregue.tentativas,
      revisar,
      preenchimento_insuficiente: Boolean(entregue.violacoes.preenchimento_insuficiente),
    },
    ...(mapeado ? { mapa: mapeado.mapa, perguntas: mapeado.perguntas } : {}),
  });
  return { ...entregue, tentativas: feitas };
}
