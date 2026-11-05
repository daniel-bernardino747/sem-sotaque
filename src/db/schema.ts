// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The v0 schema: the Corpus each Tester builds and the log of how they built it.
 * Names follow `CONTEXT.md`. Every table carries `created_at`.
 *
 * Every table that holds something a person said or uploaded hangs off
 * `sessoes` with `on delete cascade`, and `apagarSessao` empties them all. The
 * exceptions are deliberate: `chamadas_llm` keeps its cost rows with the
 * session unlinked (`set null`), and `sessoes` and `vagas` stay as rows
 * without content so the funnel (and the cost per job) still counts the person
 * who left.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

/** `bytea`, read and written as a Node Buffer (postgres.js does the conversion). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
/**
 * When a Corpus row last changed in what a résumé can say (step 14): "Seu
 * Corpus mudou" compares it with the start of the last generation. The
 * functions that write the row set it; the evaluator's bookkeeping does not.
 */
const atualizadoEm = () => timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow();
const sessaoId = () =>
  uuid('sessao_id')
    .notNull()
    .references(() => sessoes.id, { onDelete: 'cascade' });

/** `YYYY-MM`, the precision the Corpus records dates at. */
const MES = `'^[0-9]{4}-(0[1-9]|1[0-2])$'`;

// ---- enums ------------------------------------------------------------------

export const ESTADOS_SESSAO = [
  'novo',
  'consentiu',
  'importou',
  'interrogando',
  'gerando',
  'pronto',
  'encerrado',
] as const;
export const estadoSessao = pgEnum('estado_sessao', ESTADOS_SESSAO);
export type EstadoSessao = (typeof ESTADOS_SESSAO)[number];

/** Same values as `KINDS` in `../career/src/corpus/schema.ts`. */
export const TIPOS_ACCOMPLISHMENT = [
  'engineering',
  'project',
  'education',
  'talk',
  'open-source',
  'writing',
] as const;
export const tipoAccomplishment = pgEnum('tipo_accomplishment', TIPOS_ACCOMPLISHMENT);

export const importancia = pgEnum('importancia', ['alta', 'normal', 'baixa']);
export const origemMetric = pgEnum('origem_metric', ['afirmado', 'estimado', 'qualitativo']);
export const formatoImportacao = pgEnum('formato_importacao', ['pdf', 'texto', 'linkedin']);
export const papelMensagem = pgEnum('papel_mensagem', ['assistente', 'pessoa', 'sistema']);
export const etapaLlm = pgEnum('etapa_llm', [
  'import',
  'interrogatorio',
  'selecao',
  'critico',
  'reescrita',
  'avaliador',
  'leitura_vaga',
  'mapa_vaga',
]);
/**
 * What an Affiliation is. `emprego` covers clients and freelance too. The
 * import sets it; the fixed rules of step 10 read it (high school and
 * bootcamps are born skipped, a degree closes with its year).
 */
export const TIPOS_AFFILIATION = ['emprego', 'graduacao', 'tecnico', 'ensino_medio', 'curso_livre'] as const;
export const tipoAffiliation = pgEnum('tipo_affiliation', TIPOS_AFFILIATION);
export type TipoAffiliation = (typeof TIPOS_AFFILIATION)[number];
/** How strong an Accomplishment is for a résumé, as the evaluator (step 10) judged it. */
export const FORCAS = ['forte', 'medio', 'fraco'] as const;
export const forca = pgEnum('forca', FORCAS);
export type Forca = (typeof FORCAS)[number];
export const pagaria = pgEnum('pagaria', ['sim', 'nao', 'talvez']);

/** The language a Vaga is written in. The résumé is always in English; `pt` gets a warning (P16). */
export const LINGUAS_VAGA = ['en', 'pt', 'outra'] as const;
export const linguaVaga = pgEnum('lingua_vaga', LINGUAS_VAGA);
/**
 * Where a Vaga is: the reading running or failed, read (waiting for the person
 * to confirm the company, the role and the checklist), confirmed. Steps 16–17
 * add the stages after it.
 */
export const ESTAGIOS_VAGA = ['lendo', 'leitura_falhou', 'lida', 'confirmada'] as const;
export const estagioVaga = pgEnum('estagio_vaga', ESTAGIOS_VAGA);
export type EstagioVaga = (typeof ESTAGIOS_VAGA)[number];
/** The application's status (P13). Reserved: step 18 moves it. */
export const STATUS_CANDIDATURA = ['preparando', 'enviei', 'em_entrevista', 'proposta', 'encerrada'] as const;
export const statusCandidatura = pgEnum('status_candidatura', STATUS_CANDIDATURA);
export const tipoRequisito = pgEnum('tipo_requisito', ['obrigatorio', 'desejavel']);
/** A gap the person marked: "já usei" becomes a subject of the Vaga's conversation (step 16). */
export const RESPOSTAS_LACUNA = ['ja_usei', 'nao_usei'] as const;
export const respostaLacuna = pgEnum('resposta_lacuna', RESPOSTAS_LACUNA);
export type RespostaLacuna = (typeof RESPOSTAS_LACUNA)[number];

export const MARCADORES = ['nao_sei', 'pulou', 'estimou', 'confirmou'] as const;
export type Marcador = (typeof MARCADORES)[number];

export const TIPOS_EVENTO = [
  'link_aberto',
  'consentiu',
  'importou',
  'primeira_resposta',
  'nao_sei',
  'pulou',
  'terminou',
  'pdf_gerado',
  'pdf_baixado',
  'fundador',
  'indicou',
  'apagou',
  // A Vaga's events carry `{ vaga_id }` and survive `apagarSessao`: the funnel counts each job.
  'vaga_criada',
  'vaga_apagada',
  'vaga_gerada',
] as const;
export const tipoEvento = pgEnum('tipo_evento', TIPOS_EVENTO);
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

// ---- quem e a sessão --------------------------------------------------------

/** The OAuth providers a person signs in with (step 20). */
export const PROVEDORES = ['github', 'google'] as const;
/** Plus `local`: the one account of `MODO=local`, signed in by nobody (step 23). */
export const provedor = pgEnum('provedor', [...PROVEDORES, 'local']);
export type Provedor = (typeof PROVEDORES)[number];

/**
 * Who signs in (step 20): one GitHub or Google identity. The account owns a
 * Tester, and through it everything the token used to hold. Erased with the
 * session by `apagarSessao`, never on its own.
 */
export const contas = pgTable(
  'contas',
  {
    id: id(),
    provedor: provedor('provedor').notNull(),
    /** The provider's own id for the person (GitHub's numeric id, Google's `sub`), never the e-mail. */
    idNoProvedor: text('id_no_provedor').notNull(),
    /** As the provider gave it at the last sign-in. GitHub may hide it. */
    email: text('email'),
    nome: text('nome'),
    createdAt: createdAt(),
  },
  (t) => [unique('contas_provedor_id_no_provedor').on(t.provedor, t.idNoProvedor)],
);

/**
 * A signed-in browser: the cookie holds a random value, this row only its
 * SHA-256. "Sair" deletes the row; erasing the account takes all of them.
 */
export const acessos = pgTable('acessos', {
  tokenSha256: text('token_sha256').primaryKey(),
  contaId: uuid('conta_id')
    .notNull()
    .references(() => contas.id, { onDelete: 'cascade' }),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/**
 * The account's Stripe subscription (step 21), one row per account, written
 * only by the webhook: it is the one source of the status. A new subscription
 * of the same account (after one ended) replaces the row. Goes with the
 * account (`on delete cascade`); Stripe keeps the billing history.
 */
export const assinaturas = pgTable('assinaturas', {
  contaId: uuid('conta_id')
    .primaryKey()
    .references(() => contas.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  /** Stripe's own status (`active`, `trialing`, `past_due`, `canceled`...). */
  status: text('status').notNull(),
  /** The paid period now; the Vagas quota counts from `periodo_inicio`. */
  periodoInicio: timestamp('periodo_inicio', { withTimezone: true }).notNull(),
  periodoFim: timestamp('periodo_fim', { withTimezone: true }).notNull(),
  /** A full refund of a charge (`charge.refunded`): the access ends, whatever the status says. */
  reembolsadaEm: timestamp('reembolsada_em', { withTimezone: true }),
  atualizadaEm: timestamp('atualizada_em', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
});

/** The Stripe events already handled, by id: a second delivery changes nothing. */
export const eventosStripe = pgTable('eventos_stripe', {
  id: text('id').primaryKey(),
  tipo: text('tipo').notNull(),
  createdAt: createdAt(),
});

export const testers = pgTable('testers', {
  id: id(),
  /**
   * The v0 link (`/s/<token>`). Since step 20 it is no longer a credential: the
   * first sign-in through it links the Tester to the account, and after that
   * it only leads to the sign-in.
   */
  token: text('token').notNull().unique(),
  /**
   * The account that owns this Tester; one each. Null for a v0 link nobody has
   * signed in through yet. No `on delete`: an account goes only with its
   * Tester, in `apagarSessao`.
   */
  contaId: uuid('conta_id')
    .unique()
    .references((): AnyPgColumn => contas.id),
  apelido: text('apelido').notNull(),
  /** Where they came from: a WhatsApp group, LinkedIn, someone's referral. */
  origem: text('origem').notNull(),
  indicadoPor: uuid('indicado_por').references((): AnyPgColumn => testers.id, {
    onDelete: 'set null',
  }),
  createdAt: createdAt(),
});

export const sessoes = pgTable(
  'sessoes',
  {
    id: id(),
    /** 1:1 in v0. Null once the session is erased: the Tester row goes with it. */
    testerId: uuid('tester_id')
      .unique()
      .references(() => testers.id, { onDelete: 'set null' }),
    estado: estadoSessao('estado').notNull().default('novo'),
    consentiuEm: timestamp('consentiu_em', { withTimezone: true }),
    textoConsentimentoVersao: text('texto_consentimento_versao'),
    terminouInterrogatorioEm: timestamp('terminou_interrogatorio_em', { withTimezone: true }),
    /**
     * A session that began on consent v1 was shown v2 mid-interrogation and
     * said no: it goes on without the evaluator (step 10).
     */
    recusouAvaliadorEm: timestamp('recusou_avaliador_em', { withTimezone: true }),
    /**
     * "Pode ler para melhorar o produto" (step 22, Q19): when the person let
     * Daniel read the content (transcript, Corpus, PDFs, Vagas). Null: the
     * panel shows only the numbers. Consent v1 and v2 said Daniel reads, so
     * accepting them sets it; from v3 it is its own box, and the home turns
     * it on and off.
     */
    podeLerEm: timestamp('pode_ler_em', { withTimezone: true }),
    apagadaEm: timestamp('apagada_em', { withTimezone: true }),
    /**
     * Set on erasure, when the token itself goes with the Tester row: its
     * SHA-256, so the link can still say "your data was erased" without the
     * database keeping the credential.
     */
    tokenApagadoSha256: text('token_apagado_sha256').unique(),
    /** Daniel's notes in the panel: where the product went wrong. Cleared on erasure. */
    notasDaniel: text('notas_daniel'),
    /**
     * How many Vagas the session may create per paid period (step 21: 15 a
     * quarter, counted from `assinaturas.periodo_inicio`; without a
     * subscription, ever). The panel raises it (step 19); `MODO=local` gets
     * `SEM_LIMITE_DE_VAGAS`.
     */
    limiteVagas: integer('limite_vagas').notNull().default(15),
    /**
     * The separate consent for the Vagas (P19), asked at the first "Achei uma
     * vaga": a yes is kept; a no is recorded and asked again at the next tap.
     */
    vagasConsentiuEm: timestamp('vagas_consentiu_em', { withTimezone: true }),
    recusouVagasEm: timestamp('recusou_vagas_em', { withTimezone: true }),
    /**
     * When "Achei uma vaga" first opened (coverage above 70% or a general
     * résumé). It never closes after that, even if the coverage drops.
     */
    vagasLiberadasEm: timestamp('vagas_liberadas_em', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check('sessoes_tester_ate_apagar', sql`${t.testerId} is not null or ${t.apagadaEm} is not null`),
  ],
);

// ---- o Corpus ---------------------------------------------------------------

export const affiliations = pgTable(
  'affiliations',
  {
    id: id(),
    sessaoId: sessaoId(),
    organizacao: text('organizacao').notNull(),
    cargo: text('cargo').notNull(),
    tipo: tipoAffiliation('tipo').notNull().default('emprego'),
    /**
     * A degree or a technical course: the year it ended, or the expected year
     * while `cursando`. It closes with this, never with a month.
     */
    anoConclusao: integer('ano_conclusao'),
    cursando: boolean('cursando').notNull().default(false),
    /**
     * The period as the imported resume wrote it ("2019 – 2021", "Jun 2021 –
     * Present"). The import fills `periodo_inicio`/`periodo_fim` only when the
     * text gives the month, so until the interrogation confirms them this is
     * what tells "current" from "not said".
     */
    periodoOriginal: text('periodo_original'),
    periodoInicio: text('periodo_inicio'),
    /** Null means current (once the interrogation has confirmed the period). */
    periodoFim: text('periodo_fim'),
    stack: text('stack').array().notNull().default(sql`'{}'::text[]`),
    confidencial: boolean('confidencial').notNull().default(false),
    /**
     * What the resume says instead of the name when `confidencial`, and the
     * "what is this company" line for a recruiter abroad.
     */
    descricaoPublica: text('descricao_publica'),
    /**
     * The interrogation asked for the period and the person answered: from here
     * on a null `periodo_fim` means current, not "not said".
     */
    periodoConfirmado: boolean('periodo_confirmado').notNull().default(false),
    /** The person skipped the interrogation of this one. */
    pulado: boolean('pulado').notNull().default(false),
    ordem: integer('ordem').notNull().default(0),
    createdAt: createdAt(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    check('affiliations_periodo_inicio_mes', sql.raw(`periodo_inicio ~ ${MES}`)),
    check('affiliations_periodo_fim_mes', sql.raw(`periodo_fim ~ ${MES}`)),
    check(
      'affiliations_confidencial_tem_descricao',
      sql`not ${t.confidencial} or coalesce(btrim(${t.descricaoPublica}), '') <> ''`,
    ),
  ],
);

export const accomplishments = pgTable(
  'accomplishments',
  {
    id: id(),
    sessaoId: sessaoId(),
    affiliationId: uuid('affiliation_id').references(() => affiliations.id, {
      onDelete: 'set null',
    }),
    tipo: tipoAccomplishment('tipo').notNull(),
    /** The full scenario, long, in the language the person told it in. */
    enunciado: text('enunciado').notNull(),
    /** Asked, never inferred. Null until asked. */
    importanciaParaPessoa: importancia('importancia_para_pessoa'),
    data: text('data'),
    /** The person skipped the interrogation of this one. */
    pulado: boolean('pulado').notNull().default(false),
    /** The evaluator's judgement: the order of the questions and the coverage come from it. */
    forca: forca('forca'),
    /**
     * The evaluator moved on without a result: it comes back once, at the end
     * of the queue (`adiadoVoltou` once it has), or ends skipped.
     */
    adiado: boolean('adiado').notNull().default(false),
    adiadoVoltou: boolean('adiado_voltou').notNull().default(false),
    /** Order within the batch it was created in (an import keeps the resume's order). */
    ordem: integer('ordem').notNull().default(0),
    createdAt: createdAt(),
    atualizadoEm: atualizadoEm(),
  },
  () => [check('accomplishments_data_mes', sql.raw(`data ~ ${MES}`))],
);

export const metrics = pgTable(
  'metrics',
  {
    id: id(),
    accomplishmentId: uuid('accomplishment_id')
      .notNull()
      .references(() => accomplishments.id, { onDelete: 'cascade' }),
    /** As it reads, e.g. "~2 min → 20 s por ficha". */
    texto: text('texto').notNull(),
    /** The numbers in `texto`, for "every number in a bullet comes from its source". */
    valores: numeric('valores', { mode: 'number' })
      .array()
      .notNull()
      .default(sql`'{}'::numeric[]`),
    origem: origemMetric('origem').notNull(),
    /** The anchor question that led to an estimate. Required when `estimado`. */
    ancora: text('ancora'),
    confirmadoEm: timestamp('confirmado_em', { withTimezone: true }),
    createdAt: createdAt(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    check('metrics_estimado_tem_ancora', sql`${t.origem} <> 'estimado' or ${t.ancora} is not null`),
  ],
);

/** A line of the imported resume as it came: the "before". */
export const linhasOriginais = pgTable('linhas_originais', {
  id: id(),
  sessaoId: sessaoId(),
  texto: text('texto').notNull(),
  affiliationId: uuid('affiliation_id').references(() => affiliations.id, {
    onDelete: 'set null',
  }),
  accomplishmentId: uuid('accomplishment_id').references(() => accomplishments.id, {
    onDelete: 'set null',
  }),
  createdAt: createdAt(),
});

/** The text extracted from an upload. The file itself is discarded after extraction. */
export const importacoes = pgTable('importacoes', {
  id: id(),
  sessaoId: sessaoId(),
  formato: formatoImportacao('formato').notNull(),
  textoExtraido: text('texto_extraido').notNull(),
  createdAt: createdAt(),
});

// ---- o log ------------------------------------------------------------------

export const mensagens = pgTable('mensagens', {
  id: id(),
  sessaoId: sessaoId(),
  papel: papelMensagem('papel').notNull(),
  conteudo: text('conteudo').notNull(),
  /** Which Accomplishment the question was about. */
  accomplishmentId: uuid('accomplishment_id').references(() => accomplishments.id, {
    onDelete: 'set null',
  }),
  /** Which Affiliation the question was about, when it was about one. */
  affiliationId: uuid('affiliation_id').references(() => affiliations.id, {
    onDelete: 'set null',
  }),
  /**
   * The Vaga whose conversation this is (step 16); null is the general one.
   * Emptying the Vaga deletes these: they can name the company.
   */
  vagaId: uuid('vaga_id').references((): AnyPgColumn => vagas.id),
  /** For the person: time since the last question. */
  latenciaMs: integer('latencia_ms'),
  marcadores: text('marcadores').array().$type<Marcador[]>().notNull().default(sql`'{}'::text[]`),
  createdAt: createdAt(),
});

export const chamadasLlm = pgTable('chamadas_llm', {
  id: id(),
  /** Unlinked (null) when the session is erased, so the cost stays counted. */
  sessaoId: uuid('sessao_id').references(() => sessoes.id, { onDelete: 'set null' }),
  /**
   * The Vaga the call was for. Never unlinked: a Vaga is emptied, not deleted,
   * so the cost per job survives an erasure.
   */
  vagaId: uuid('vaga_id').references((): AnyPgColumn => vagas.id),
  etapa: etapaLlm('etapa').notNull(),
  modelo: text('modelo').notNull(),
  tokensEntrada: integer('tokens_entrada').notNull().default(0),
  tokensSaida: integer('tokens_saida').notNull().default(0),
  tokensCacheLeitura: integer('tokens_cache_leitura').notNull().default(0),
  tokensCacheEscrita: integer('tokens_cache_escrita').notNull().default(0),
  /** Computed when the call is made, from the price table of that moment. */
  custoUsd: numeric('custo_usd', { precision: 12, scale: 6, mode: 'number' }).notNull(),
  duracaoMs: integer('duracao_ms').notNull(),
  erro: text('erro'),
  createdAt: createdAt(),
});

// ---- a geração --------------------------------------------------------------

export const selections = pgTable('selections', {
  id: id(),
  sessaoId: sessaoId(),
  /** The generation (the Version) this attempt belongs to. */
  geracaoId: uuid('geracao_id').references((): AnyPgColumn => geracoes.id, { onDelete: 'cascade' }),
  /** Validated against the render's Selection schema before it is written. */
  json: jsonb('json').notNull(),
  tentativa: integer('tentativa').notNull().default(1),
  /** What the checks and the Critic found. */
  violacoes: jsonb('violacoes').notNull().default(sql`'[]'::jsonb`),
  aprovada: boolean('aprovada').notNull().default(false),
  createdAt: createdAt(),
});

export const renders = pgTable('renders', {
  id: id(),
  selectionId: uuid('selection_id')
    .notNull()
    .references(() => selections.id, { onDelete: 'cascade' }),
  /** The PDF itself: no disk and no bucket in v0. */
  pdf: bytea('pdf').notNull(),
  /** The `measure-resume` output. */
  medida: jsonb('medida').notNull(),
  baixadoEm: timestamp('baixado_em', { withTimezone: true }),
  /** How long the render took (step 26). Null for the renders before it was measured. */
  duracaoMs: integer('duracao_ms'),
  createdAt: createdAt(),
});

/**
 * The résumé header the person typed, one per session: asked once, before the
 * first generation, and editable before each one after it. The contact details
 * are the person's, so this goes with `apagarSessao` like the rest.
 */
export const cabecalhos = pgTable('cabecalhos', {
  sessaoId: uuid('sessao_id')
    .primaryKey()
    .references(() => sessoes.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  email: text('email').notNull(),
  linkedin: text('linkedin').notNull(),
  github: text('github'),
  /** City and country, as the header prints it. */
  local: text('local').notNull(),
  createdAt: createdAt(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

/** One line of a Vaga's map (step 17): the requirement and the record of the line that answers it, or null. */
export interface LinhaDoMapaGravada {
  requisitoId: string;
  accomplishmentId: string | null;
  naStack: boolean;
}
/** A question the Critic would ask in an interview about a line (the summary or the headline: no record). */
export interface PerguntaDeEntrevista {
  accomplishmentId: string | null;
  pergunta: string;
}

/**
 * One per generation (a Version) of the general résumé or of a Vaga's: where
 * the run in the background is, and what it delivered. `versao` counts from 1
 * per session for the general résumé and per Vaga for each Vaga's; the old ones
 * stay as the history. A Vaga's go when the Vaga is emptied.
 */
export const geracoes = pgTable(
  'geracoes',
  {
    id: id(),
    sessaoId: sessaoId(),
    /** Null for the general résumé. */
    vagaId: uuid('vaga_id').references((): AnyPgColumn => vagas.id),
    versao: integer('versao').notNull(),
    /** What the waiting screen says is happening: `selecao`, `conferindo`, `render`, `critico`, `reescrita`. */
    etapa: text('etapa'),
    iniciadaEm: timestamp('iniciada_em', { withTimezone: true }),
    terminadaEm: timestamp('terminada_em', { withTimezone: true }),
    /** The last run failed (the model or the render); "tentar de novo" clears it. */
    erro: text('erro'),
    /** The attempts ran out and the best one was delivered: Daniel reviews it in the panel. */
    revisar: boolean('revisar').notNull().default(false),
    /** The Selection delivered to the person. */
    selectionId: uuid('selection_id').references((): AnyPgColumn => selections.id, { onDelete: 'set null' }),
    /** A Vaga's Version: each requirement → the line that answers it, of the delivered Selection. */
    mapa: jsonb('mapa').$type<LinhaDoMapaGravada[]>(),
    /** Kept, never shown to the person: interview prep is Premium (P12). */
    perguntasEntrevista: jsonb('perguntas_entrevista').$type<PerguntaDeEntrevista[]>(),
    createdAt: createdAt(),
  },
  (t) => [unique('geracoes_sessao_vaga_versao').on(t.sessaoId, t.vagaId, t.versao).nullsNotDistinct()],
);

// ---- as vagas (passo 15) ----------------------------------------------------

/**
 * A job the person pasted ("Achei uma vaga"). The row is never deleted, only
 * emptied (`apagada_em`, every content column null), like `sessoes`: the
 * funnel and the cost per job survive, and an emptied Vaga still counts
 * towards `limite_vagas`.
 */
export const vagas = pgTable('vagas', {
  id: id(),
  sessaoId: sessaoId(),
  /** The posting as pasted. */
  texto: text('texto'),
  /** As the person typed or confirmed it; the reading fills what she left blank. */
  empresa: text('empresa'),
  cargo: text('cargo'),
  /** Kept, never fetched. */
  link: text('link'),
  senioridade: text('senioridade'),
  lingua: linguaVaga('lingua'),
  estagio: estagioVaga('estagio').notNull().default('lendo'),
  candidatura: statusCandidatura('candidatura').notNull().default('preparando'),
  /** Up to 5 drafts the reading found relevant: `[{ accomplishmentId, motivo }]`. */
  rascunhos: jsonb('rascunhos').$type<{ accomplishmentId: string; motivo: string }[]>(),
  apagadaEm: timestamp('apagada_em', { withTimezone: true }),
  createdAt: createdAt(),
});

/** What a Vaga asks for, one per line, with the records that already cover it. */
export const requisitos = pgTable('requisitos', {
  id: id(),
  vagaId: uuid('vaga_id')
    .notNull()
    .references(() => vagas.id, { onDelete: 'cascade' }),
  sessaoId: sessaoId(),
  /** In the posting's own words. */
  texto: text('texto').notNull(),
  tipo: tipoRequisito('tipo').notNull(),
  /** Checked against the Corpus: only the session's Accomplishments with a Metric. */
  accomplishmentIds: uuid('accomplishment_ids').array().notNull().default(sql`'{}'::uuid[]`),
  /** No record covers it. */
  lacuna: boolean('lacuna').notNull(),
  /** A gap's answer; none counts as "não usei". */
  resposta: respostaLacuna('resposta'),
  ordem: integer('ordem').notNull().default(0),
  createdAt: createdAt(),
});

// ---- o fim ------------------------------------------------------------------

export const fechamento = pgTable('fechamento', {
  sessaoId: uuid('sessao_id')
    .primaryKey()
    .references(() => sessoes.id, { onDelete: 'cascade' }),
  fundador: boolean('fundador').notNull().default(false),
  email: text('email'),
  whatsapp: text('whatsapp'),
  pagaria: pagaria('pagaria'),
  pagariaQuanto: text('pagaria_quanto'),
  depoimento: text('depoimento'),
  /** Separate consent: a testimonial may be given and still not be usable. */
  depoimentoPodeUsar: boolean('depoimento_pode_usar').notNull().default(false),
  comentario: text('comentario'),
  createdAt: createdAt(),
});

export const indicacoes = pgTable('indicacoes', {
  id: id(),
  sessaoId: sessaoId(),
  nome: text('nome').notNull(),
  contato: text('contato').notNull(),
  virouTesterId: uuid('virou_tester_id').references(() => testers.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

// ---- o avaliador (passo 10) -------------------------------------------------

/**
 * One per conversation, overwritten at every checkpoint: what the
 * interrogation is about now and what comes next. The general conversation is
 * the row with no Vaga; each Vaga's conversation has its own (step 16).
 * `anotacoes` holds what the person said about another subject, in her words,
 * so it goes with `apagarSessao`, and a Vaga's goes when the Vaga is emptied.
 */
export const plano = pgTable(
  'plano',
  {
    id: id(),
    sessaoId: sessaoId(),
    vagaId: uuid('vaga_id').references((): AnyPgColumn => vagas.id),
    /** The current subject (`src/avaliador/plano.ts`), or null once nothing is left. */
    assunto: jsonb('assunto'),
    /** The subjects after it, in order: a snapshot for the panel. */
    fila: jsonb('fila').notNull().default(sql`'[]'::jsonb`),
    anotacoes: jsonb('anotacoes').notNull().default(sql`'[]'::jsonb`),
    /** Subjects that are not a record's state (an Affiliation's block, a note) and are done. */
    visitados: jsonb('visitados').notNull().default(sql`'[]'::jsonb`),
    /** 0–100, what the person sees. */
    cobertura: integer('cobertura').notNull().default(0),
    ofertaFeita: boolean('oferta_feita').notNull().default(false),
    /** How many messages the session had at the last checkpoint. */
    ultimoCheckpoint: integer('ultimo_checkpoint').notNull().default(0),
    /** The records the current retomada opened (step 14), so they do not come back in it. */
    retomados: jsonb('retomados').notNull().default(sql`'[]'::jsonb`),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [unique('plano_sessao_vaga').on(t.sessaoId, t.vagaId).nullsNotDistinct()],
);

/** One per checkpoint: the panel's timeline. `motivo` is a template, never what the person wrote. */
export const decisoesAvaliador = pgTable('decisoes_avaliador', {
  id: id(),
  sessaoId: sessaoId(),
  /** The Vaga whose conversation it judged (step 16); null is the general one. */
  vagaId: uuid('vaga_id').references((): AnyPgColumn => vagas.id),
  gatilho: text('gatilho').notNull(),
  /** The subject it judged, as `{ tipo, id }`, or null at the start. */
  assunto: jsonb('assunto'),
  decisao: text('decisao').notNull(),
  motivo: text('motivo').notNull(),
  cobertura: integer('cobertura'),
  proximo: jsonb('proximo'),
  /** `jev`, `reserva` (the Jev failed or the person said no to it). */
  backend: text('backend').notNull(),
  erro: text('erro'),
  createdAt: createdAt(),
});

/** The funnel. */
export const eventos = pgTable(
  'eventos',
  {
    id: id(),
    sessaoId: sessaoId(),
    tipo: tipoEvento('tipo').notNull(),
    dados: jsonb('dados').notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    // The funnel counts a link as opened once, however many tabs open it at once.
    uniqueIndex('eventos_link_aberto_uma_vez')
      .on(t.sessaoId)
      .where(sql`${t.tipo} = 'link_aberto'`),
  ],
);

// ---- os erros (passo 26) ----------------------------------------------------

export const origemErro = pgEnum('origem_erro', ['servidor', 'navegador']);

/**
 * What broke, by its shape only (`src/erros/forma.ts`): never the message nor
 * the stack, which carry the person's text. Linked to the session and erased
 * with it by an explicit delete in `apagarSessao` (the session row is never
 * deleted, so a cascade would not do); null for an error with no session
 * (OAuth before the sign-in, the Stripe webhook). Every row goes after 90 days.
 */
export const erros = pgTable(
  'erros',
  {
    id: id(),
    sessaoId: uuid('sessao_id').references(() => sessoes.id, { onDelete: 'cascade' }),
    origem: origemErro('origem').notNull(),
    /** The stage on the server (`import`, `turno`…), the screen in the browser. */
    onde: text('onde').notNull(),
    classe: text('classe').notNull(),
    codigo: text('codigo'),
    digest: text('digest'),
    createdAt: createdAt(),
  },
  (t) => [index('erros_created_at').on(t.createdAt)],
);
