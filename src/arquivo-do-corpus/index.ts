// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The Corpus file (step 27, decisions C1–C8): the person's own Corpus in one
 * JSON, to take to another instance or to show someone. What goes in it is
 * the Corpus and the state of each record; the transcript, the notes, the
 * Vagas and the résumés stay out, and so do the database ids: every record
 * has a `ref` of the file and gets a new id when it comes in.
 *
 * The records' fields carry the database's column names (the ones
 * `CONTEXT.md` uses), so the file also reads outside the app. The schema
 * repeats the database's rules, and a file that breaks any of them is refused
 * whole. Writing it in the database is `importarCorpusDeArquivo`.
 */
import { z } from 'zod';

import { FORCAS, TIPOS_ACCOMPLISHMENT, TIPOS_AFFILIATION } from '@/db/schema';

export const FORMATO = 'sem-sotaque/corpus';
/** Bump it on a change of shape, and migrate the older ones in `lerArquivoDeCorpus`. */
export const VERSAO = 1;
export { LIMITE_ARQUIVO } from './limites';

const MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const mes = z.string().regex(MES, 'precisa ser um mês no formato AAAA-MM').nullable();
const preenchido = (texto: string | null) => (texto ?? '').trim() !== '';

const metric = z
  .object({
    texto: z.string().min(1),
    valores: z.array(z.number()),
    origem: z.enum(['afirmado', 'estimado', 'qualitativo']),
    ancora: z.string().nullable(),
    confirmado_em: z.iso.datetime().nullable(),
  })
  .refine((m) => m.origem !== 'estimado' || preenchido(m.ancora), {
    message: 'a Metric é estimada e não tem a âncora',
    path: ['ancora'],
  });

const affiliation = z
  .object({
    ref: z.string().min(1),
    organizacao: z.string().min(1),
    cargo: z.string(),
    tipo: z.enum(TIPOS_AFFILIATION),
    ano_conclusao: z.int().nullable(),
    cursando: z.boolean(),
    periodo_original: z.string().nullable(),
    periodo_inicio: mes,
    periodo_fim: mes,
    stack: z.array(z.string()),
    confidencial: z.boolean(),
    descricao_publica: z.string().nullable(),
    periodo_confirmado: z.boolean(),
    pulado: z.boolean(),
  })
  .refine((a) => !a.confidencial || preenchido(a.descricao_publica), {
    message: 'a empresa é confidencial e não tem a descrição pública',
    path: ['descricao_publica'],
  });

const accomplishment = z.object({
  ref: z.string().min(1),
  affiliation_ref: z.string().nullable(),
  tipo: z.enum(TIPOS_ACCOMPLISHMENT),
  enunciado: z.string().min(1),
  importancia_para_pessoa: z.enum(['alta', 'normal', 'baixa']).nullable(),
  data: mes,
  pulado: z.boolean(),
  forca: z.enum(FORCAS).nullable(),
  adiado: z.boolean(),
  adiado_voltou: z.boolean(),
  metrics: z.array(metric),
});

const linhaOriginal = z.object({
  texto: z.string().min(1),
  affiliation_ref: z.string().nullable(),
  accomplishment_ref: z.string().nullable(),
});

const cabecalho = z.object({
  nome: z.string().min(1),
  email: z.string().min(1),
  linkedin: z.string().min(1),
  github: z.string().nullable(),
  local: z.string().min(1),
});

const arquivoV1 = z
  .object({
    formato: z.literal(FORMATO),
    versao: z.literal(VERSAO),
    exportadoEm: z.iso.datetime(),
    cabecalho: cabecalho.nullable(),
    affiliations: z.array(affiliation),
    accomplishments: z.array(accomplishment),
    linhas_originais: z.array(linhaOriginal),
  })
  .superRefine((arquivo, ctx) => {
    const refs = new Set<string>();
    const repetida = (ref: string, path: (string | number)[]) => {
      if (refs.has(ref)) ctx.addIssue({ code: 'custom', message: `a ref “${ref}” está repetida`, path });
      refs.add(ref);
    };
    arquivo.affiliations.forEach((a, i) => repetida(a.ref, ['affiliations', i, 'ref']));
    arquivo.accomplishments.forEach((a, i) => repetida(a.ref, ['accomplishments', i, 'ref']));

    const affiliations = new Set(arquivo.affiliations.map((a) => a.ref));
    const accomplishments = new Set(arquivo.accomplishments.map((a) => a.ref));
    const solta = (ref: string | null, existe: Set<string>, path: (string | number)[]) => {
      if (ref !== null && !existe.has(ref)) {
        ctx.addIssue({ code: 'custom', message: `a ref “${ref}” não aponta para nada no arquivo`, path });
      }
    };
    arquivo.accomplishments.forEach((a, i) => solta(a.affiliation_ref, affiliations, ['accomplishments', i, 'affiliation_ref']));
    arquivo.linhas_originais.forEach((l, i) => {
      solta(l.affiliation_ref, affiliations, ['linhas_originais', i, 'affiliation_ref']);
      solta(l.accomplishment_ref, accomplishments, ['linhas_originais', i, 'accomplishment_ref']);
    });
  });

/** The file as this version of the app reads and writes it. */
export type ArquivoDoCorpus = z.infer<typeof arquivoV1>;

export type ArquivoLido = { ok: true; arquivo: ArquivoDoCorpus } | { ok: false; razao: string };

/** zod's own messages (a wrong type, an unknown option) in Portuguese; ours are already. */
const EM_PORTUGUES = z.locales.pt().localeError;

const NAO_E_CORPUS = 'Este arquivo não é um Corpus do sem-sotaque. Ele é o .json que sai de “Baixar meu Corpus”.';

/** `accomplishments[0].metrics[1].ancora`, from zod's path. */
const caminho = (path: PropertyKey[]) =>
  path.map((p, i) => (typeof p === 'number' ? `[${p}]` : `${i ? '.' : ''}${String(p)}`)).join('');

/**
 * Reads a Corpus file: the file validated, or why it was refused, in
 * Portuguese, for the person. A version this app does not know is refused;
 * when a v2 exists, a v1 is migrated here.
 */
export function lerArquivoDeCorpus(texto: string): ArquivoLido {
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    return { ok: false, razao: NAO_E_CORPUS };
  }
  const envelope = valor as { formato?: unknown; versao?: unknown } | null;
  if (typeof envelope !== 'object' || envelope === null || envelope.formato !== FORMATO) {
    return { ok: false, razao: NAO_E_CORPUS };
  }
  if (envelope.versao !== VERSAO) {
    const qual = typeof envelope.versao === 'number' ? `a versão ${envelope.versao}` : 'uma versão que não conheço';
    const mais = typeof envelope.versao === 'number' && envelope.versao > VERSAO;
    return {
      ok: false,
      razao: mais
        ? `Este arquivo é de ${qual} do formato, mais nova que esta instância do sem-sotaque. Atualize a instância e tente de novo.`
        : `Este arquivo é de ${qual} do formato, que eu não sei ler.`,
    };
  }

  const lido = arquivoV1.safeParse(valor, { error: EM_PORTUGUES });
  if (lido.success) return { ok: true, arquivo: lido.data };
  const problema = lido.error.issues[0];
  return {
    ok: false,
    razao: `O arquivo não passou na conferência, então nada foi importado: ${problema.message} (em ${caminho(problema.path)}).`,
  };
}
