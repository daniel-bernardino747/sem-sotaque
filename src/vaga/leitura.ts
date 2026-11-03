// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The reading of a Vaga (P24): one call that reads the pasted posting against a
 * compact Corpus and returns the company, the role, the seniority, the
 * language, the Requisitos with the records that already cover them, and up to
 * 5 relevant drafts. The model cites refs (`ac3`); `conferirLeitura` turns
 * them into database ids and drops whatever is not in the Corpus: a coverage
 * that cites nobody real becomes a gap, never a claim.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import type { AccomplishmentDoCorpus, Corpus, LeituraGravada } from '@/db';
import { LINGUAS_VAGA } from '@/db/schema';
import { periodoDaAffiliation } from '@/geracao/rascunho';
import { Refs } from '@/interrogatorio/estado';
import type { ClienteLlm } from '@/llm/cliente';

export const leituraSchema = z.object({
  empresa: z.string().nullable(),
  cargo: z.string().nullable(),
  senioridade: z.string().nullable(),
  lingua: z.enum(LINGUAS_VAGA),
  requisitos: z.array(
    z.object({
      texto: z.string().min(1).describe("In the posting's own words, short."),
      tipo: z.enum(['obrigatorio', 'desejavel']),
      cobertos_por: z.array(z.string()).describe('Refs of the records (never drafts) that cover it; empty for a gap.'),
    }),
  ),
  rascunhos: z.array(
    z.object({
      ref: z.string().describe('The ref of a draft.'),
      motivo: z.string().min(1).describe('One short sentence in Portuguese, to the person: what in the posting it answers.'),
    }),
  ),
});

export type Leitura = z.infer<typeof leituraSchema>;

/** At most this many drafts come back (P24). */
export const MAXIMO_RASCUNHOS = 5;
/** A posting with more than this is cut: the checklist would not be read. */
export const MAXIMO_REQUISITOS = 40;
const RODADAS = 3;
const NOME_DA_TOOL = 'registrar_leitura';
const ENUNCIADO_MAXIMO = 400;

/** A record may cover a Requisito; a draft only comes back as relevant. */
const ehRegistro = (a: AccomplishmentDoCorpus) => a.metrics.length > 0;
const ehRascunho = (a: AccomplishmentDoCorpus) => a.metrics.length === 0 && !a.pulado;

const curto = (texto: string) => (texto.length > ENUNCIADO_MAXIMO ? `${texto.slice(0, ENUNCIADO_MAXIMO)}…` : texto);

/**
 * What the reading sees of the Corpus: each Affiliation with its period and
 * stack, its records (statement and metrics) and, apart, the drafts. A
 * confidential name is never shown, as in the generation.
 */
export function descreverCorpusParaLeitura(corpus: Corpus, refs: Refs): string {
  const linha = (a: AccomplishmentDoCorpus) => {
    const metricas = a.metrics.map((m) => m.texto).join('; ');
    return `  ${refs.ref(a.id)} [${a.tipo}] ${curto(a.enunciado)}${metricas ? ` — resultado: ${metricas}` : ''}`;
  };
  const doLugar = (id: string | null, filtro: (a: AccomplishmentDoCorpus) => boolean) =>
    corpus.accomplishments.filter((a) => a.affiliationId === id && filtro(a));

  const blocos = corpus.affiliations.map((af) =>
    [
      `${refs.ref(af.id)} ${af.confidencial ? `[confidencial] ${af.descricaoPublica ?? ''}` : af.organizacao} — ${af.cargo} (${periodoDaAffiliation(af) ?? 'sem período'})`,
      `  stack: ${af.stack.length ? af.stack.join(', ') : '(nenhuma)'}`,
      ...doLugar(af.id, ehRegistro).map(linha),
    ].join('\n'),
  );
  const soltos = doLugar(null, ehRegistro);
  if (soltos.length) blocos.push(['Fora de qualquer affiliation:', ...soltos.map(linha)].join('\n'));

  const rascunhos = corpus.accomplishments.filter(ehRascunho);
  return [
    '## Records',
    blocos.join('\n\n') || '(nenhum)',
    '## Drafts (rascunhos)',
    rascunhos.length
      ? rascunhos
          .map((a) => {
            const onde = a.affiliationId ? ` (em ${refs.ref(a.affiliationId)})` : '';
            return `${refs.ref(a.id)}${onde} [${a.tipo}] ${curto(a.enunciado)}`;
          })
          .join('\n')
      : '(nenhum)',
  ].join('\n\n');
}

/**
 * The reading with every ref checked against the Corpus: a coverage ref that is
 * not one of the session's records is dropped (a Requisito left with none is a
 * gap), a draft ref that is not one of its drafts is dropped, and the drafts
 * are cut to `MAXIMO_RASCUNHOS`. Blank names become null.
 */
export function conferirLeitura(leitura: Leitura, corpus: Corpus, refs: Refs): LeituraGravada {
  const porId = new Map(corpus.accomplishments.map((a) => [a.id, a]));
  const resolver = (ref: string, aceita: (a: AccomplishmentDoCorpus) => boolean) => {
    const registro = refs.registro(ref);
    const a = registro?.tipo === 'accomplishment' ? porId.get(registro.id) : undefined;
    return a && aceita(a) ? a.id : null;
  };
  const nome = (s: string | null) => s?.trim() || null;

  const vistos = new Set<string>();
  const rascunhos: LeituraGravada['rascunhos'] = [];
  for (const r of leitura.rascunhos) {
    const id = resolver(r.ref, ehRascunho);
    if (!id || vistos.has(id) || rascunhos.length >= MAXIMO_RASCUNHOS) continue;
    vistos.add(id);
    rascunhos.push({ accomplishmentId: id, motivo: r.motivo.trim() });
  }

  return {
    empresa: nome(leitura.empresa),
    cargo: nome(leitura.cargo),
    senioridade: nome(leitura.senioridade),
    lingua: leitura.lingua,
    requisitos: leitura.requisitos
      .filter((r) => r.texto.trim())
      .slice(0, MAXIMO_REQUISITOS)
      .map((r) => ({
        texto: r.texto.trim(),
        tipo: r.tipo,
        accomplishmentIds: [...new Set(r.cobertos_por.flatMap((ref) => resolver(ref, ehRegistro) ?? []))],
      })),
    rascunhos,
  };
}

let sistema: string | undefined;
function prompt(): string {
  sistema ??= readFileSync(path.join(process.cwd(), 'src/vaga/prompt-leitura.md'), 'utf8');
  return sistema;
}

/** The JSON Schema strict mode accepts (as the other stages do). */
function esquemaDaTool(): Anthropic.Beta.BetaTool.InputSchema {
  const limpar = (no: unknown): unknown => {
    if (Array.isArray(no)) return no.map(limpar);
    if (no && typeof no === 'object') {
      return Object.fromEntries(
        Object.entries(no).filter(([k]) => !['$schema', 'pattern', 'minLength'].includes(k)).map(([k, v]) => [k, limpar(v)]),
      );
    }
    return no;
  };
  return limpar(z.toJSONSchema(leituraSchema)) as Anthropic.Beta.BetaTool.InputSchema;
}

const TOOL: Anthropic.Beta.BetaTool = {
  name: NOME_DA_TOOL,
  description: 'Records the reading of the posting: company, role, seniority, language, requirements with what covers them, relevant drafts.',
  strict: true,
  input_schema: esquemaDaTool(),
};

/**
 * One reading, on `MODELO_PADRAO` (changing it means loading the `claude-api`
 * skill first). A reply that does not validate goes back as an error; a reply
 * in text is asked again; gives up after `RODADAS` calls. The cost goes to
 * `chamadas_llm` with the Vaga.
 */
export async function lerVaga(
  texto: string,
  corpus: Corpus,
  { sessaoId, vagaId, cliente }: { sessaoId: string; vagaId: string; cliente: ClienteLlm },
): Promise<LeituraGravada> {
  const refs = new Refs(corpus, []);
  const conversa: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content: `<corpus>\n${descreverCorpusParaLeitura(corpus, refs)}\n</corpus>\n\n<vaga>\n${texto}\n</vaga>`,
    },
  ];
  let ultimoErro = '';

  for (let rodada = 1; rodada <= RODADAS; rodada++) {
    const resposta = await cliente.chamar({
      etapa: 'leitura_vaga',
      sessaoId,
      vagaId,
      params: {
        max_tokens: 16_000,
        output_config: { effort: 'medium' },
        system: prompt(),
        tools: [TOOL],
        messages: conversa,
      },
    });
    // A tool input cut off mid-way can still parse; never trust it.
    if (resposta.stop_reason === 'max_tokens') throw new Error('the reading hit max_tokens before finishing');
    conversa.push({ role: 'assistant', content: resposta.content });

    const chamada = resposta.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === NOME_DA_TOOL,
    );
    if (!chamada) {
      ultimoErro = 'the model answered without calling the tool';
      conversa.push({ role: 'user', content: `[sistema] Call the tool ${NOME_DA_TOOL}; do not answer in text.` });
      continue;
    }
    const lida = leituraSchema.safeParse(chamada.input);
    if (lida.success) return conferirLeitura(lida.data, corpus, refs);
    ultimoErro = lida.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    conversa.push({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: chamada.id, is_error: true, content: `invalid input: ${ultimoErro}. Call ${NOME_DA_TOOL} again.` },
      ],
    });
  }
  throw new Error(`the reading failed ${RODADAS} times: ${ultimoErro}`);
}
