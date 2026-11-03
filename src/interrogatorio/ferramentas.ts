// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The tools the questioner calls. They act on the current subject only (there
 * are no refs: the questioner never sees another record). Every input is
 * validated by zod and written to the database at once; what breaks a rule goes
 * back to the model as an error and nothing is written. What should call the
 * evaluator (a result recorded, a skip, a second "não sei", "concluir") is
 * left in `gatilhos` for the turn.
 *
 * The rule above all: a Metric `afirmado` or `estimado` only holds numbers the
 * person said in this session, an `estimado` carries its anchor and was
 * repeated back to the person in the last question, and nothing the model
 * writes in a statement carries a number the person (or her resume) did not.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { anotarParaDepois, type Assunto, type Gatilho } from '@/avaliador';
import {
  atualizarAccomplishment,
  atualizarAffiliation,
  criarAccomplishment,
  criarAffiliationNoFim,
  ErroRegistroNaoEncontrado,
  marcarMensagem,
  registrarEvento,
  registrarMetric,
  type Affiliation,
  type Corpus,
} from '@/db';
import { TIPOS_ACCOMPLISHMENT } from '@/db/schema';
import { mesesEscritos } from '@/import/extracao';

import { ehNaoSei } from './falas';
import { numeroFoiDito, numerosDaFala } from './numeros';

const MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

const esquemas = {
  atualizar_affiliation: z.object({
    organizacao: z.string().nullable().describe('Novo nome, ou null para não mudar.'),
    cargo: z.string().nullable().describe('Novo cargo (ou curso, numa formação), ou null para não mudar.'),
    periodo_inicio: z
      .string()
      .regex(MES)
      .nullable()
      .describe('YYYY-MM que a pessoa disse, ou null para não mudar.'),
    periodo_fim: z
      .string()
      .regex(MES)
      .nullable()
      .describe('YYYY-MM que a pessoa disse, ou null (não mudar, ou atual: veja "atual").'),
    atual: z
      .boolean()
      .nullable()
      .describe('true se a pessoa disse que ainda está lá; null se não se aplica.'),
    confidencial: z
      .boolean()
      .nullable()
      .describe('true se a pessoa disse que o nome não pode aparecer no currículo; false se disse que pode.'),
    descricao_publica: z
      .string()
      .nullable()
      .describe(
        'O que a organização é para um recrutador estrangeiro, com o peso de mercado, nas palavras da pessoa. Null para não mudar.',
      ),
    stack: z.array(z.string()).nullable().describe('A stack inteira, ou null para não mudar.'),
    ano_conclusao: z
      .number()
      .int()
      .nullable()
      .describe('Numa formação: o ano em que a pessoa se formou (ou a previsão, se ainda cursa). Null para não mudar.'),
    cursando: z.boolean().nullable().describe('Numa formação: true se ainda está cursando. Null para não mudar.'),
  }),
  criar_affiliation: z.object({
    organizacao: z.string().min(1),
    cargo: z.string().min(1),
    periodo_inicio: z.string().regex(MES).nullable(),
    periodo_fim: z.string().regex(MES).nullable(),
    atual: z.boolean().nullable(),
    stack: z.array(z.string()),
  }),
  criar_accomplishment: z.object({
    empresa: z
      .string()
      .nullable()
      .describe('O nome da empresa onde aconteceu, como está em <empresas_da_pessoa>; null se foi fora de qualquer empresa.'),
    tipo: z.enum(TIPOS_ACCOMPLISHMENT),
    enunciado: z.string().min(1).describe('O cenário que a pessoa contou, nas palavras dela.'),
  }),
  atualizar_enunciado: z.object({
    enunciado: z
      .string()
      .min(1)
      .describe(
        'O cenário completo, em português: a situação, o que a pessoa fez de particular, quem mais estava, o resultado e como ela sabe. Só o que ela disse.',
      ),
  }),
  registrar_importancia: z.object({
    importancia: z.enum(['alta', 'normal', 'baixa']),
  }),
  registrar_metric: z.object({
    texto: z.string().min(1).describe('O resultado como se lê, ex.: "~2 min → 20 s por ficha".'),
    valores: z
      .array(z.number())
      .describe('Cada número do texto, como a pessoa disse. Vazio para qualitativo.'),
    origem: z.enum(['afirmado', 'estimado', 'qualitativo']),
    ancora: z
      .string()
      .nullable()
      .describe('Para estimado: a pergunta-âncora que levou ao número. Senão, null.'),
  }),
  acrescentar_stack: z.object({
    empresa: z.string().min(1).describe('O nome da empresa onde a pessoa usou, como está em <empresas_da_pessoa>.'),
    tecnologias: z.array(z.string().min(1)).min(1).describe('As tecnologias que ela disse que usou lá, como ela disse.'),
  }),
  marcar_pulado: z.object({}),
  marcar_nao_sei: z.object({}),
  concluir_assunto: z.object({}),
  anotar_para_depois: z.object({
    texto: z.string().min(1).describe('O que a pessoa disse sobre outro assunto, nas palavras dela.'),
  }),
  encerrar_interrogatorio: z.object({}),
};

export type NomeFerramenta = keyof typeof esquemas;

const DESCRICOES: Record<NomeFerramenta, string> = {
  atualizar_affiliation:
    'Grava o que a pessoa disse sobre a empresa (ou a formação) deste assunto: período (mês e ano), se é atual, descrição para estrangeiro, se é confidencial, stack, ano de conclusão.',
  criar_affiliation:
    'Só num assunto de anotação, de algo novo ou de uma lacuna da vaga: cria uma empresa que a pessoa citou e que não estava no currículo.',
  criar_accomplishment:
    'Só num assunto de anotação, de algo novo ou de uma lacuna da vaga: cria o registro do que a pessoa contou e que não estava no currículo.',
  acrescentar_stack:
    'Só numa lacuna da vaga: acrescenta à stack de uma empresa da pessoa a tecnologia que ela disse que usou lá, no dia a dia, sem um trabalho com cenário e resultado para virar registro.',
  atualizar_enunciado:
    'Reescreve o enunciado deste accomplishment com o cenário completo que a pessoa contou. Chame sempre que ela trouxer um fato novo.',
  registrar_importancia: 'Grava o quanto este accomplishment importa para a pessoa, como ela disse.',
  registrar_metric:
    'Grava o resultado deste accomplishment. afirmado: a pessoa sabia o número. estimado: a pessoa chegou a um número por uma âncora e confirmou depois de você repetir. qualitativo: resultado concreto sem número.',
  marcar_pulado: 'Marca este assunto como pulado: a pessoa pediu para pular, ou disse que não importa.',
  marcar_nao_sei: 'Marca que a última resposta da pessoa foi um "não sei" (ou equivalente).',
  concluir_assunto:
    'Sugere que este assunto já rendeu o que dava. Quem decide é o avaliador; continue se ele mandar.',
  anotar_para_depois:
    'Guarda o que a pessoa disse e que pertence a outro assunto, para quando ele chegar. Não pergunte sobre isso agora.',
  encerrar_interrogatorio: 'Encerra o interrogatório: só quando a pessoa disse que quer parar.',
};

/** The JSON Schema strict mode accepts: zod checks `pattern`, `minLength` and the integer bounds afterwards. */
function esquemaDaTool(esquema: z.ZodType): Anthropic.Beta.BetaTool.InputSchema {
  const limpar = (no: unknown): unknown => {
    if (Array.isArray(no)) return no.map(limpar);
    if (no && typeof no === 'object') {
      return Object.fromEntries(
        Object.entries(no)
          .filter(([chave]) => !['$schema', 'pattern', 'minLength', 'minimum', 'maximum'].includes(chave))
          .map(([chave, valor]) => [chave, limpar(valor)]),
      );
    }
    return no;
  };
  return limpar(z.toJSONSchema(esquema)) as Anthropic.Beta.BetaTool.InputSchema;
}

export const FERRAMENTAS: Anthropic.Beta.BetaTool[] = (Object.keys(esquemas) as NomeFerramenta[]).map(
  (nome) => ({
    name: nome,
    description: DESCRICOES[nome],
    strict: true,
    input_schema: esquemaDaTool(esquemas[nome]),
  }),
);

// ---- execution ---------------------------------------------------------------

/** What a turn hands the tools: who is talking, what was said, and the one subject it is on. */
export interface ContextoFerramentas {
  sessaoId: string;
  /** A Vaga's conversation (step 16): its notes go to its own plan. */
  vagaId: string | null;
  corpus: Corpus;
  /** The subject of this turn: every tool acts on it, and on nothing else. */
  assunto: Assunto;
  /** Everything the person wrote in this session. */
  falasDaPessoa: string[];
  /** What the resume said (the import text and the original lines). */
  textoOriginal: string;
  /**
   * The last question and the person's answer to it, when the turn began with
   * an answer. An estimate is confirmed only here.
   */
  respostaAtual: { pergunta: string; fala: string; mensagemId: string } | null;
  /** The person's previous answer in this subject was a "não sei" too. */
  naoSeiAnterior: boolean;
  /** What happened that calls the evaluator at the end of the round. */
  gatilhos: Set<Gatilho>;
  /** An accomplishment created in this round, for the evaluator to open next. */
  criado: string | null;
  encerrado: boolean;
}

export interface ResultadoFerramenta {
  ok: boolean;
  texto: string;
}

const ok = (texto: string): ResultadoFerramenta => ({ ok: true, texto });
const erro = (texto: string): ResultadoFerramenta => ({ ok: false, texto });

class Recusa extends Error {}

/** The accomplishment of this subject. */
function accomplishmentDoAssunto(ctx: ContextoFerramentas): string {
  if (ctx.assunto.tipo !== 'accomplishment') throw new Recusa('este assunto não é um accomplishment: não há resultado a gravar aqui.');
  return ctx.assunto.id;
}

/** The Affiliation of this subject: its own, or the one of its accomplishment. */
function affiliationDoAssunto(ctx: ContextoFerramentas): Affiliation {
  const id =
    ctx.assunto.tipo === 'affiliation'
      ? ctx.assunto.id
      : ctx.assunto.tipo === 'accomplishment'
        ? ctx.corpus.accomplishments.find((a) => a.id === ctx.assunto.id)?.affiliationId
        : null;
  const af = id ? ctx.corpus.affiliations.find((a) => a.id === id) : undefined;
  if (!af) throw new Recusa('este assunto não tem empresa ou formação ligada.');
  return af;
}

/** Digits in a text the model wrote that neither the person nor her resume said. */
function numerosInventados(texto: string, fontes: string[]): number[] {
  return numerosDaFala(texto, { porExtenso: false }).filter((n) => !numeroFoiDito(n, fontes));
}

/** A month and year the model writes must have been said, in the chat or in the resume. */
function conferirMes(mes: string, fontes: string[], campo: string) {
  const ano = Number(mes.slice(0, 4));
  const numeroDoMes = Number(mes.slice(5));
  if (!fontes.some((f) => numerosDaFala(f, { porExtenso: false }).includes(ano))) {
    throw new Recusa(`${campo}: a pessoa não disse o ano ${ano}. Pergunte; nunca chute.`);
  }
  if (!fontes.some((f) => mesesEscritos(f).has(numeroDoMes) || new RegExp(`\\b0?${numeroDoMes}\\s*/\\s*\\d{2,4}`).test(f))) {
    throw new Recusa(`${campo}: a pessoa não disse o mês ${numeroDoMes}. Pergunte o mês; nunca chute.`);
  }
}

async function marcarUltimaFala(ctx: ContextoFerramentas, marcadores: Parameters<typeof marcarMensagem>[2]) {
  if (ctx.respostaAtual) await marcarMensagem(ctx.sessaoId, ctx.respostaAtual.mensagemId, marcadores);
}

/** A note about something new, "contar algo novo" (step 14) or a Vaga's gap (step 16): the subjects that create records. */
const criaRegistro = (ctx: ContextoFerramentas) => ['anotacao', 'novo', 'lacuna'].includes(ctx.assunto.tipo);

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

const executores: { [N in NomeFerramenta]: (input: z.infer<(typeof esquemas)[N]>, ctx: ContextoFerramentas) => Promise<ResultadoFerramenta> } = {
  async atualizar_affiliation(input, ctx) {
    const atual = affiliationDoAssunto(ctx);
    const fontes = [...ctx.falasDaPessoa, atual.periodoOriginal ?? ''];
    const campos: Parameters<typeof atualizarAffiliation>[2] = {};

    if (input.organizacao !== null) campos.organizacao = input.organizacao;
    if (input.cargo !== null) campos.cargo = input.cargo;
    if (input.stack !== null) campos.stack = input.stack;
    if (input.periodo_inicio !== null) {
      conferirMes(input.periodo_inicio, fontes, 'periodo_inicio');
      campos.periodoInicio = input.periodo_inicio;
    }
    if (input.periodo_fim !== null) {
      if (input.atual) throw new Recusa('periodo_fim e atual ao mesmo tempo: é um ou outro.');
      conferirMes(input.periodo_fim, fontes, 'periodo_fim');
      campos.periodoFim = input.periodo_fim;
    }
    if (input.atual) campos.periodoFim = null;
    const inicio = campos.periodoInicio ?? atual.periodoInicio;
    const fim = input.atual ? null : (campos.periodoFim ?? atual.periodoFim);
    if (inicio && (fim || input.atual)) {
      if (fim && fim < inicio) throw new Recusa(`o período termina (${fim}) antes de começar (${inicio}).`);
      campos.periodoConfirmado = true;
    }
    if (input.descricao_publica !== null) {
      const inventados = numerosInventados(input.descricao_publica, [...ctx.falasDaPessoa, ctx.textoOriginal]);
      if (inventados.length) throw new Recusa(`a descrição tem número que a pessoa não disse: ${inventados.join(', ')}.`);
      campos.descricaoPublica = input.descricao_publica;
    }
    if (input.confidencial !== null) {
      const descricao = campos.descricaoPublica ?? atual.descricaoPublica;
      if (input.confidencial && !descricao?.trim()) {
        throw new Recusa('confidencial precisa da descricao_publica: pergunte como descrever a empresa sem o nome.');
      }
      campos.confidencial = input.confidencial;
    }
    if (input.ano_conclusao !== null) {
      const ano = input.ano_conclusao;
      if (!fontes.some((f) => numerosDaFala(f, { porExtenso: false }).includes(ano))) {
        throw new Recusa(`ano_conclusao: a pessoa não disse ${ano}. Pergunte; nunca chute.`);
      }
      campos.anoConclusao = ano;
    }
    if (input.cursando !== null) campos.cursando = input.cursando;
    if (Object.keys(campos).length === 0) throw new Recusa('nada para gravar: todos os campos vieram null.');

    await atualizarAffiliation(ctx.sessaoId, atual.id, campos);
    Object.assign(atual, campos);
    return ok(`${atual.organizacao} atualizada${campos.periodoConfirmado ? ' (período confirmado)' : ''}.`);
  },

  async criar_affiliation(input, ctx) {
    if (!criaRegistro(ctx)) throw new Recusa('só num assunto de anotação: aqui, anote para depois.');
    const fontes = ctx.falasDaPessoa;
    if (input.periodo_inicio) conferirMes(input.periodo_inicio, fontes, 'periodo_inicio');
    if (input.periodo_fim) conferirMes(input.periodo_fim, fontes, 'periodo_fim');
    const nova = await criarAffiliationNoFim(ctx.sessaoId, {
      organizacao: input.organizacao,
      cargo: input.cargo,
      periodoInicio: input.periodo_inicio,
      periodoFim: input.atual ? null : input.periodo_fim,
      periodoConfirmado: Boolean(input.periodo_inicio && (input.periodo_fim || input.atual)),
      stack: input.stack,
    });
    ctx.corpus.affiliations.push(nova);
    return ok(`criada a empresa ${nova.organizacao}.`);
  },

  async criar_accomplishment(input, ctx) {
    if (!criaRegistro(ctx)) throw new Recusa('só num assunto de anotação: aqui, anote para depois.');
    let affiliationId: string | null = null;
    if (input.empresa) {
      const nome = semAcento(input.empresa);
      const af = ctx.corpus.affiliations.find((a) => semAcento(a.organizacao) === nome);
      if (!af) throw new Recusa(`"${input.empresa}" não está em <empresas_da_pessoa>: crie a empresa antes, ou use null.`);
      affiliationId = af.id;
    }
    const inventados = numerosInventados(input.enunciado, [...ctx.falasDaPessoa, ctx.textoOriginal]);
    if (inventados.length) throw new Recusa(`o enunciado tem número que a pessoa não disse: ${inventados.join(', ')}.`);
    const novo = await criarAccomplishment(ctx.sessaoId, { affiliationId, tipo: input.tipo, enunciado: input.enunciado });
    ctx.criado = novo.id;
    ctx.gatilhos.add('criou');
    return ok('criado. O avaliador abre este registro como o próximo assunto.');
  },

  async atualizar_enunciado(input, ctx) {
    const id = accomplishmentDoAssunto(ctx);
    const anterior = ctx.corpus.accomplishments.find((a) => a.id === id)?.enunciado ?? '';
    const inventados = numerosInventados(input.enunciado, [...ctx.falasDaPessoa, ctx.textoOriginal, anterior]);
    if (inventados.length) throw new Recusa(`o enunciado tem número que a pessoa não disse: ${inventados.join(', ')}.`);
    await atualizarAccomplishment(ctx.sessaoId, id, { enunciado: input.enunciado });
    return ok('enunciado gravado.');
  },

  async registrar_importancia(input, ctx) {
    const id = accomplishmentDoAssunto(ctx);
    await atualizarAccomplishment(ctx.sessaoId, id, { importanciaParaPessoa: input.importancia });
    return ok(`importância: ${input.importancia}.`);
  },

  async registrar_metric(input, ctx) {
    const id = accomplishmentDoAssunto(ctx);
    const { origem, valores } = input;

    if (origem === 'qualitativo' && valores.length) {
      throw new Recusa('qualitativo não tem valores: se há número, a origem é afirmado ou estimado.');
    }
    if (origem !== 'qualitativo' && valores.length === 0) {
      throw new Recusa(`${origem} precisa dos números em valores.`);
    }
    const naoDitos = valores.filter((v) => !numeroFoiDito(v, ctx.falasDaPessoa));
    if (naoDitos.length) {
      throw new Recusa(
        `a pessoa não disse ${naoDitos.join(', ')} nesta conversa. Só grave número que ela disse; nunca calcule, arredonde ou sugira um.`,
      );
    }
    const soltos = numerosInventados(input.texto, ctx.falasDaPessoa).filter((n) => !valores.includes(n));
    if (soltos.length) throw new Recusa(`o texto tem número que a pessoa não disse: ${soltos.join(', ')}.`);

    if (origem === 'estimado') {
      if (!input.ancora?.trim()) throw new Recusa('estimado precisa da âncora que levou ao número.');
      const pergunta = ctx.respostaAtual?.pergunta ?? '';
      const repetidos = numerosDaFala(pergunta);
      const faltam = valores.filter((v) => !repetidos.some((n) => Math.abs(n - v) < 1e-9));
      if (!ctx.respostaAtual || faltam.length) {
        throw new Recusa(
          'antes de gravar uma estimativa, repita o número para a pessoa e pergunte se ela confirma. Grave só depois do "sim".',
        );
      }
      if (/^\W*n(ã|a)o\b/i.test(ctx.respostaAtual.fala)) {
        throw new Recusa('a pessoa respondeu "não" à confirmação: o número não está confirmado.');
      }
    }

    await registrarMetric(id, {
      texto: input.texto,
      valores,
      origem,
      ancora: origem === 'estimado' ? input.ancora : null,
      confirmadoEm: origem === 'estimado' ? new Date() : null,
    });
    if (origem === 'estimado') await marcarUltimaFala(ctx, ['estimou', 'confirmou']);
    ctx.gatilhos.add('metric');
    return ok(`metric ${origem} gravada.`);
  },

  async acrescentar_stack(input, ctx) {
    if (ctx.assunto.tipo !== 'lacuna') throw new Recusa('só numa lacuna da vaga: aqui, grave a stack com atualizar_affiliation.');
    const nome = semAcento(input.empresa);
    const af = ctx.corpus.affiliations.find((a) => a.tipo === 'emprego' && semAcento(a.organizacao) === nome);
    if (!af) throw new Recusa(`"${input.empresa}" não está em <empresas_da_pessoa>: pergunte onde foi, ou crie a empresa antes.`);
    const tem = new Set(af.stack.map(semAcento));
    const novas = input.tecnologias.map((t) => t.trim()).filter((t) => t && !tem.has(semAcento(t)) && tem.add(semAcento(t)));
    if (novas.length) {
      const stack = [...af.stack, ...novas];
      await atualizarAffiliation(ctx.sessaoId, af.id, { stack });
      af.stack = stack;
    }
    ctx.gatilhos.add('stack');
    return ok(novas.length ? `stack de ${af.organizacao}: ${af.stack.join(', ')}.` : `${af.organizacao} já tinha isso na stack.`);
  },

  async marcar_pulado(_input, ctx) {
    const { assunto } = ctx;
    if (assunto.tipo === 'oferta') throw new Recusa('não há o que pular aqui.');
    if (assunto.tipo === 'accomplishment') await atualizarAccomplishment(ctx.sessaoId, assunto.id, { pulado: true });
    else if (assunto.tipo === 'affiliation') await atualizarAffiliation(ctx.sessaoId, assunto.id, { pulado: true });
    await marcarUltimaFala(ctx, ['pulou']);
    await registrarEvento(ctx.sessaoId, 'pulou', { por: 'modelo' });
    ctx.gatilhos.add('pulou');
    return ok('pulado.');
  },

  async marcar_nao_sei(_input, ctx) {
    if (!ctx.respostaAtual) throw new Recusa('não há resposta da pessoa neste turno para marcar.');
    // The server already marked it (and ran the checkpoint, if it was the second).
    if (ehNaoSei(ctx.respostaAtual.fala)) return ok('já estava marcado. Siga com a próxima âncora, uma por vez.');
    await marcarUltimaFala(ctx, ['nao_sei']);
    await registrarEvento(ctx.sessaoId, 'nao_sei');
    if (ctx.naoSeiAnterior) ctx.gatilhos.add('nao_sei');
    return ok('marcado. Siga com a próxima âncora, uma por vez.');
  },

  async concluir_assunto(_input, ctx) {
    ctx.gatilhos.add('concluir');
    return ok('anotado: o avaliador decide.');
  },

  async anotar_para_depois(input, ctx) {
    await anotarParaDepois(ctx.sessaoId, input.texto, ctx.vagaId);
    return ok('anotado para depois. Siga com este assunto.');
  },

  async encerrar_interrogatorio(_input, ctx) {
    ctx.encerrado = true;
    return ok('encerrado. Escreva uma despedida curta, sem pergunta.');
  },
};

/** Runs one tool call. A broken rule comes back as `ok: false` with the reason, in Portuguese, for the model. */
export async function executarFerramenta(
  nome: string,
  input: unknown,
  ctx: ContextoFerramentas,
): Promise<ResultadoFerramenta> {
  if (!(nome in esquemas)) return erro(`ferramenta desconhecida: ${nome}.`);
  const n = nome as NomeFerramenta;
  const lido = esquemas[n].safeParse(input);
  if (!lido.success) {
    return erro(`entrada inválida: ${lido.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  try {
    return await (executores[n] as (i: unknown, c: ContextoFerramentas) => Promise<ResultadoFerramenta>)(lido.data, ctx);
  } catch (e) {
    if (e instanceof Recusa || e instanceof ErroRegistroNaoEncontrado) return erro(`não gravei: ${e.message}`);
    throw e;
  }
}
