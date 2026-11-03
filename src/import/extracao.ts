// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The import stage: the model reads the resume text and registers a draft
 * Corpus through one tool, `registrar_corpus`. What it registers is validated
 * twice: by the zod schema, and by `conferirExtracao`, which holds it to the
 * text — no number, year or original line that is not in what the person sent.
 * A failed check goes back to the model as an error `tool_result`; three
 * failures and the import fails rather than keep something invented.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { TIPOS_ACCOMPLISHMENT, TIPOS_AFFILIATION } from '../db/schema';
import type { ClienteLlm } from '../llm/cliente';

const MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

export const extracaoSchema = z.object({
  affiliations: z.array(
    z.object({
      ref: z.string().describe('Identificador curto e único nesta extração: a1, a2, ...'),
      organizacao: z.string().min(1),
      cargo: z.string().min(1).describe('O cargo, ou o curso numa formação.'),
      tipo: z
        .enum(TIPOS_AFFILIATION)
        .describe(
          'emprego: empregador, cliente ou freela. graduacao: bacharelado, licenciatura, tecnólogo, pós. tecnico: curso técnico de nível médio (ETEC, IF). ensino_medio: ensino médio regular. curso_livre: bootcamp, curso online, certificação.',
        ),
      periodo_original: z
        .string()
        .nullable()
        .describe('O período exatamente como está no texto, ou null se o texto não traz período.'),
      periodo_inicio: z
        .string()
        .regex(MES)
        .nullable()
        .describe('YYYY-MM, só se o texto traz o mês e o ano de início. Senão, null.'),
      periodo_fim: z
        .string()
        .regex(MES)
        .nullable()
        .describe('YYYY-MM, só se o texto traz o mês e o ano de fim. Atual, ou sem mês: null.'),
      stack: z.array(z.string()).describe('Só as tecnologias citadas no texto para este lugar.'),
    }),
  ),
  accomplishments: z.array(
    z.object({
      ref: z.string().describe('Identificador curto e único nesta extração: c1, c2, ...'),
      affiliation_ref: z.string().nullable().describe('O ref da affiliation onde aconteceu, ou null.'),
      tipo: z.enum(TIPOS_ACCOMPLISHMENT),
      enunciado: z
        .string()
        .min(1)
        .describe('O que a pessoa fez, como o texto diz, na língua do texto. Sem acrescentar nada.'),
    }),
  ),
  linhas_originais: z.array(
    z.object({
      texto: z.string().min(1).describe('A linha ou o trecho copiado do texto, sem mudar uma palavra.'),
      affiliation_ref: z.string().nullable(),
      accomplishment_refs: z.array(z.string()),
    }),
  ),
});

export type Extracao = z.infer<typeof extracaoSchema>;

const NOME_DA_TOOL = 'registrar_corpus';
const MAXIMO_TENTATIVAS = 3;

const SISTEMA = `Você lê o currículo (ou o perfil do LinkedIn) de um dev brasileiro e registra o que está nele como um Corpus rascunho, chamando a ferramenta ${NOME_DA_TOOL} uma vez.

O Corpus tem:
- Affiliations: onde algo aconteceu. Um empregador, um cliente, um curso (a formação também é uma affiliation: a organização é a instituição, o cargo é o curso). O tipo diz qual: emprego, graduacao, tecnico (técnico de TI numa ETEC ou num IF conta aqui), ensino_medio ou curso_livre (bootcamp, curso online).
- Accomplishments: cada coisa que a pessoa diz que fez. Um bullet costuma ser um accomplishment; um bullet que junta duas coisas diferentes vira dois. Responsabilidades genéricas ("participei das reuniões diárias") também entram: o interrogatório decide depois o que fica.
- Linhas originais: cada bullet ou trecho do texto que virou um accomplishment, copiado como veio, ligado à affiliation e aos accomplishments que ele virou. Uma linha que virou dois accomplishments fica ligada aos dois.

A regra que vale mais do que todas: não invente. Este é só o rascunho; um interrogatório vem depois e pergunta o que faltou.
- Nenhum número, ano, mês, nome ou tecnologia que não esteja no texto.
- Período sem mês ou sem ano: o que faltar fica null. "2019 – 2021" dá periodo_inicio null e periodo_fim null, com periodo_original "2019 – 2021". Emprego atual: periodo_fim null.
- O enunciado diz o que o texto diz, na língua do texto (português ou inglês), sem melhorar, resumir ou traduzir. Pode tirar o marcador do bullet.
- O tipo é engineering para trabalho de engenharia num emprego, project para projeto pessoal ou de curso, education para formação, talk para palestra, open-source para contribuição em código aberto, writing para artigo ou texto publicado.
- Ignore nome, contato e o resumo genérico do topo, a menos que o resumo diga algo concreto que a pessoa fez.

Chame ${NOME_DA_TOOL} com tudo de uma vez. Se ela devolver erro, corrija só o que o erro aponta e chame de novo.`;

/** The JSON Schema for strict tool use: what strict mode accepts, the rest is zod's job. */
function esquemaDaTool(): Anthropic.Beta.BetaTool.InputSchema {
  const esquema = z.toJSONSchema(extracaoSchema) as Record<string, unknown>;
  const limpar = (no: unknown): unknown => {
    if (Array.isArray(no)) return no.map(limpar);
    if (no && typeof no === 'object') {
      return Object.fromEntries(
        Object.entries(no)
          .filter(([chave]) => !['$schema', 'pattern', 'minLength'].includes(chave))
          .map(([chave, valor]) => [chave, limpar(valor)]),
      );
    }
    return no;
  };
  return limpar(esquema) as Anthropic.Beta.BetaTool.InputSchema;
}

const TOOL: Anthropic.Beta.BetaTool = {
  name: NOME_DA_TOOL,
  description: 'Registra o Corpus rascunho extraído do currículo: affiliations, accomplishments e linhas originais.',
  strict: true,
  input_schema: esquemaDaTool(),
};

// ---- the checks against the text ----------------------------------------------

/** Every number as written: `4`, `2,5`, `1.200`. */
export function numerosDe(texto: string): string[] {
  return texto.match(/\d+(?:[.,]\d+)*/g) ?? [];
}

/** The spellings that count as the same number: 1.200 = 1200 = 1,200; 2,5 = 2.5. */
function formas(numero: string): string[] {
  return [numero, numero.replace(/,/g, '.'), numero.replace(/[.,]/g, '')];
}

const MARCADOR = /^[\s\-–—•*·]+/;
const juntar = (s: string) => s.replace(/\s+/g, ' ').trim();

/** How a month is written in a resume, by number: "mar", "março", "Mar." or "03/2022". */
const MESES = [
  ['jan'], ['fev', 'feb'], ['mar'], ['abr', 'apr'], ['mai', 'may'], ['jun'],
  ['jul'], ['ago', 'aug'], ['set', 'sep'], ['out', 'oct'], ['nov'], ['dez', 'dec'],
];

/** The months (1–12) a period string names. */
export function mesesEscritos(periodo: string): Set<number> {
  const meses = new Set<number>();
  for (const palavra of periodo.toLowerCase().match(/\p{L}{3,}/gu) ?? []) {
    const i = MESES.findIndex((formas) => formas.some((f) => palavra.startsWith(f)));
    if (i >= 0) meses.add(i + 1);
  }
  for (const [, mes] of periodo.matchAll(/\b(\d{1,2})\/\d{2,4}\b/g)) meses.add(Number(mes));
  return meses;
}

/** A technology cited as a word of its own: "Go" is not in "algo", "SQL" not in "PostgreSQL". */
function cita(texto: string, termo: string): boolean {
  const letraOuDigito = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);
  const onde = texto.toLowerCase();
  const alvo = termo.toLowerCase();
  for (let i = onde.indexOf(alvo); i >= 0; i = onde.indexOf(alvo, i + 1)) {
    if (!letraOuDigito(onde[i - 1]) && !letraOuDigito(onde[i + alvo.length])) return true;
  }
  return false;
}

/**
 * What in an extraction is not backed by the text. An empty list means every
 * number, year, month, technology and original line can be found in it.
 */
export function conferirExtracao(extracao: Extracao, texto: string): string[] {
  const problemas: string[] = [];
  const doTexto = new Set(numerosDe(texto).flatMap(formas));
  const textoCorrido = juntar(texto);

  const conferirNumeros = (valor: string, onde: string) => {
    for (const numero of numerosDe(valor)) {
      if (!formas(numero).some((f) => doTexto.has(f))) {
        problemas.push(`number "${numero}" in ${onde} is not in the resume`);
      }
    }
  };

  const refsAffiliation = new Set(extracao.affiliations.map((a) => a.ref));
  const refsAccomplishment = new Set(extracao.accomplishments.map((a) => a.ref));
  const conferirRef = (ref: string | null, refs: Set<string>, onde: string) => {
    if (ref !== null && !refs.has(ref)) problemas.push(`${onde} points to "${ref}", which was not registered`);
  };

  for (const a of extracao.affiliations) {
    const onde = `affiliation ${a.ref}`;
    conferirNumeros(`${a.organizacao} ${a.cargo} ${a.periodo_original ?? ''}`, onde);
    for (const tecnologia of a.stack) {
      if (!cita(textoCorrido, tecnologia)) {
        problemas.push(`stack "${tecnologia}" in ${onde} is not in the resume`);
      }
    }
    for (const mes of [a.periodo_inicio, a.periodo_fim]) {
      if (mes === null) continue;
      if (!doTexto.has(mes.slice(0, 4))) {
        problemas.push(`year ${mes.slice(0, 4)} of ${onde} is not in the resume`);
      } else if (!a.periodo_original || !mesesEscritos(a.periodo_original).has(Number(mes.slice(5)))) {
        problemas.push(`${onde} has ${mes}, but its period in the resume does not name that month`);
      }
    }
  }

  for (const c of extracao.accomplishments) {
    conferirNumeros(c.enunciado, `accomplishment ${c.ref}`);
    conferirRef(c.affiliation_ref, refsAffiliation, `accomplishment ${c.ref}`);
  }

  for (const l of extracao.linhas_originais) {
    const linha = juntar(l.texto.replace(MARCADOR, ''));
    const onde = `original line "${l.texto.slice(0, 60)}"`;
    if (!textoCorrido.includes(linha)) problemas.push(`${onde} is not in the resume as it came`);
    conferirRef(l.affiliation_ref, refsAffiliation, onde);
    for (const ref of l.accomplishment_refs) conferirRef(ref, refsAccomplishment, onde);
    if (l.affiliation_ref === null && l.accomplishment_refs.length === 0) {
      problemas.push(`${onde} is linked to nothing`);
    }
  }

  return problemas;
}

// ---- the call -------------------------------------------------------------------

export async function extrairCorpus(
  texto: string,
  { sessaoId, cliente }: { sessaoId: string | null; cliente: ClienteLlm },
): Promise<Extracao> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: `<curriculo>\n${texto}\n</curriculo>` },
  ];
  let ultimosProblemas: string[] = [];

  for (let tentativa = 1; tentativa <= MAXIMO_TENTATIVAS; tentativa++) {
    const resposta = await cliente.chamar({
      etapa: 'import',
      sessaoId,
      params: {
        max_tokens: 32_000,
        output_config: { effort: 'medium' },
        system: SISTEMA,
        tools: [TOOL],
        messages,
      },
    });
    // A tool input cut off mid-way can still parse; never trust it.
    if (resposta.stop_reason === 'max_tokens') {
      throw new Error('the extraction hit max_tokens before finishing');
    }

    messages.push({ role: 'assistant', content: resposta.content });
    const chamada = resposta.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === NOME_DA_TOOL,
    );
    if (!chamada) {
      ultimosProblemas = ['the model answered without calling the tool'];
      messages.push({ role: 'user', content: `Registre o Corpus chamando a ferramenta ${NOME_DA_TOOL}.` });
      continue;
    }

    const lida = extracaoSchema.safeParse(chamada.input);
    ultimosProblemas = lida.success
      ? conferirExtracao(lida.data, texto)
      : lida.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    if (lida.success && ultimosProblemas.length === 0) return lida.data;

    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: chamada.id,
          is_error: true,
          content: `Não registrei. Corrija e chame de novo:\n- ${ultimosProblemas.join('\n- ')}`,
        },
      ],
    });
  }

  throw new Error(`the extraction failed its checks ${MAXIMO_TENTATIVAS} times: ${ultimosProblemas.join('; ')}`);
}
