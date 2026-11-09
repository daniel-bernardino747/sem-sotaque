// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The data layer: one function per use case, so no route writes SQL. Steps 03–08
 * add their own here; the schema is in `./schema`, the connection in `./client`.
 */
import { randomBytes } from 'node:crypto';

import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';

import { lerArquivoDeCorpus } from '../arquivo-do-corpus';
import { textoIncluiLeitura } from '../conteudo/consentimento';

import { db } from './client';
import {
  accomplishments,
  affiliations,
  cabecalhos,
  chamadasLlm,
  contas,
  decisoesAvaliador,
  erros,
  eventos,
  fechamento,
  geracoes,
  importacoes,
  indicacoes,
  linhasOriginais,
  mensagens,
  metrics,
  plano,
  selections,
  sessoes,
  testers,
  type TipoEvento,
} from './schema';
import { sha256 } from './contas';
import { esvaziarVagasDaSessao, EVENTOS_DE_VAGA } from './vagas';

export * from './interrogatorio';
export * from './geracao';
export * from './fechamento';
export * from './painel';
export * from './avaliador';
export * from './vagas';
export * from './contas';
export * from './assinaturas';
export * from './erros';
export * from './configuracao';

export type Tester = typeof testers.$inferSelect;
export type Sessao = typeof sessoes.$inferSelect;
export type Affiliation = typeof affiliations.$inferSelect;
export type Accomplishment = typeof accomplishments.$inferSelect;
export type Metric = typeof metrics.$inferSelect;
export type Mensagem = typeof mensagens.$inferSelect;

/** An Accomplishment as the Corpus reads it: its Metrics and its Affiliation resolved. */
export type AccomplishmentDoCorpus = Accomplishment & {
  affiliation: Affiliation | null;
  metrics: Metric[];
  /** No Metric yet: a draft, not ready to be selected. */
  rascunho: boolean;
};

export interface Corpus {
  /** In the order the person gave them (`ordem`). */
  affiliations: Affiliation[];
  /** In the order they were recorded (an import's in the resume's order). */
  accomplishments: AccomplishmentDoCorpus[];
}

/** 192 random bits, url-safe: the Tester's only credential. */
function novoToken(): string {
  return randomBytes(24).toString('base64url');
}

/** A new Tester and their session (state `novo`). The token goes in their link. */
export async function criarTester(dados: {
  apelido: string;
  origem: string;
  indicadoPor?: string;
}): Promise<{ token: string; tester: Tester; sessao: Sessao }> {
  return db().transaction(async (tx) => {
    const [tester] = await tx
      .insert(testers)
      .values({ ...dados, token: novoToken() })
      .returning();
    const [sessao] = await tx.insert(sessoes).values({ testerId: tester.id }).returning();
    return { token: tester.token, tester, sessao };
  });
}

/** The session a link opens, or null if the token is unknown or was erased. */
export async function sessaoPorToken(
  token: string,
): Promise<{ tester: Tester; sessao: Sessao } | null> {
  try {
    const [linha] = await db()
      .select({ tester: testers, sessao: sessoes })
      .from(testers)
      .innerJoin(sessoes, eq(sessoes.testerId, testers.id))
      .where(and(eq(testers.token, token), isNull(sessoes.apagadaEm)));
    return linha ?? null;
  } catch (erro) {
    // Drizzle's error message carries the query params, and a server log is
    // no place for a credential. Keep only Postgres's own reason.
    const causa = (erro as { cause?: { code?: string; message?: string } }).cause;
    throw new Error(`token lookup failed: ${causa?.code ?? '?'} ${causa?.message ?? 'unknown'}`);
  }
}

// ---- consentimento ----------------------------------------------------------

/**
 * The `link_aberto` event, recorded the first time the link is opened and never
 * again, and never for an erased session. The partial unique index
 * `eventos_link_aberto_uma_vez` keeps it to one row when two tabs race; `for
 * share` waits for an erasure in flight, so no event outlives `apagarSessao`.
 */
export async function registrarAbertura(sessaoId: string): Promise<void> {
  const tipo: TipoEvento = 'link_aberto';
  await db().execute(sql`
    insert into ${eventos} (sessao_id, tipo)
    select ${sessoes.id}, ${tipo} from ${sessoes}
    where ${sessoes.id} = ${sessaoId} and ${sessoes.apagadaEm} is null
    for share
    on conflict (sessao_id) where tipo = 'link_aberto' do nothing`);
}

/**
 * The person accepted the consent text of `versao`: the session moves from
 * `novo` to `consentiu` and the `consentiu` event is recorded. A session past
 * `novo` is returned unchanged, so a resubmitted form changes nothing.
 * `podeLer` is the separate "pode ler para melhorar o produto" box (step 22);
 * the v0 texts had no box and said Daniel reads.
 */
export async function registrarConsentimento(
  sessaoId: string,
  versao: string,
  podeLer = textoIncluiLeitura(versao),
): Promise<Sessao> {
  return db().transaction(async (tx) => {
    const agora = new Date();
    const [atualizada] = await tx
      .update(sessoes)
      .set({ estado: 'consentiu', consentiuEm: agora, textoConsentimentoVersao: versao, podeLerEm: podeLer ? agora : null })
      .where(and(eq(sessoes.id, sessaoId), eq(sessoes.estado, 'novo'), isNull(sessoes.apagadaEm)))
      .returning();
    if (atualizada) {
      await tx.insert(eventos).values({ sessaoId, tipo: 'consentiu', dados: { versao } });
      return atualizada;
    }
    const [atual] = await tx.select().from(sessoes).where(eq(sessoes.id, sessaoId));
    if (!atual) throw new Error(`no session ${sessaoId}`);
    return atual;
  });
}

/**
 * "Pode ler para melhorar o produto", turned on or off at the home (step 22).
 * Turning it on again keeps the first date; an erased session is left alone.
 */
export async function definirLeitura(sessaoId: string, liberar: boolean): Promise<void> {
  await db()
    .update(sessoes)
    .set({ podeLerEm: liberar ? sql`coalesce(${sessoes.podeLerEm}, now())` : null })
    .where(and(eq(sessoes.id, sessaoId), isNull(sessoes.apagadaEm)));
}

/**
 * A session that began on consent v1 and is mid-interrogation was shown the new
 * text (step 10): yes moves it to that version, with a `consentiu` event marked
 * `reaceite`; no records the refusal, and the interrogation goes on without
 * the evaluator. Asked once: a session that already answered, or that is not
 * interrogating on v1, is returned unchanged.
 */
export async function reaceitarConsentimento(sessaoId: string, versao: string, aceitou: boolean): Promise<Sessao> {
  return db().transaction(async (tx) => {
    const pendente = and(
      eq(sessoes.id, sessaoId),
      eq(sessoes.estado, 'interrogando'),
      eq(sessoes.textoConsentimentoVersao, 'v1'),
      isNull(sessoes.recusouAvaliadorEm),
      isNull(sessoes.apagadaEm),
    );
    const [atualizada] = await tx
      .update(sessoes)
      .set(aceitou ? { textoConsentimentoVersao: versao } : { recusouAvaliadorEm: new Date() })
      .where(pendente)
      .returning();
    if (atualizada) {
      if (aceitou) await tx.insert(eventos).values({ sessaoId, tipo: 'consentiu', dados: { versao, reaceite: true } });
      return atualizada;
    }
    const [atual] = await tx.select().from(sessoes).where(eq(sessoes.id, sessaoId));
    if (!atual) throw new Error(`no session ${sessaoId}`);
    return atual;
  });
}

// ---- o Corpus ---------------------------------------------------------------

type NovaAffiliation = Omit<typeof affiliations.$inferInsert, 'id' | 'sessaoId' | 'createdAt'>;
type NovoAccomplishment = Omit<
  typeof accomplishments.$inferInsert,
  'id' | 'sessaoId' | 'createdAt'
>;
type NovaMetric = Omit<typeof metrics.$inferInsert, 'id' | 'accomplishmentId' | 'createdAt'>;

export async function criarAffiliation(
  sessaoId: string,
  dados: NovaAffiliation,
): Promise<Affiliation> {
  const [linha] = await db()
    .insert(affiliations)
    .values({ ...dados, sessaoId })
    .returning();
  return linha;
}

export async function criarAccomplishment(
  sessaoId: string,
  dados: NovoAccomplishment,
): Promise<Accomplishment> {
  const [linha] = await db()
    .insert(accomplishments)
    .values({ ...dados, sessaoId })
    .returning();
  return linha;
}

/**
 * Records a Metric. The database refuses an `estimado` without its `ancora`
 * (constraint `metrics_estimado_tem_ancora`).
 */
export async function registrarMetric(accomplishmentId: string, dados: NovaMetric): Promise<Metric> {
  const [linha] = await db()
    .insert(metrics)
    .values({ ...dados, accomplishmentId })
    .returning();
  return linha;
}

/** Everything a session's Corpus holds, assembled. */
export async function corpusDaSessao(sessaoId: string): Promise<Corpus> {
  const [listaAffiliations, listaAccomplishments] = await Promise.all([
    db()
      .select()
      .from(affiliations)
      .where(eq(affiliations.sessaoId, sessaoId))
      .orderBy(asc(affiliations.ordem), asc(affiliations.createdAt)),
    db()
      .select()
      .from(accomplishments)
      .where(eq(accomplishments.sessaoId, sessaoId))
      .orderBy(asc(accomplishments.createdAt), asc(accomplishments.ordem), asc(accomplishments.id)),
  ]);

  const ids = listaAccomplishments.map((a) => a.id);
  const listaMetrics = ids.length
    ? await db()
        .select()
        .from(metrics)
        .where(inArray(metrics.accomplishmentId, ids))
        .orderBy(asc(metrics.createdAt), asc(metrics.id))
    : [];

  const affiliationPorId = new Map(listaAffiliations.map((a) => [a.id, a]));
  return {
    affiliations: listaAffiliations,
    accomplishments: listaAccomplishments.map((a) => {
      const metricsDoAccomplishment = listaMetrics.filter((m) => m.accomplishmentId === a.id);
      return {
        ...a,
        affiliation: a.affiliationId ? (affiliationPorId.get(a.affiliationId) ?? null) : null,
        metrics: metricsDoAccomplishment,
        rascunho: metricsDoAccomplishment.length === 0,
      };
    }),
  };
}

// ---- o import ---------------------------------------------------------------

/** The session is not in the state the action needs (e.g. importing before consenting). */
export class ErroEstadoSessao extends Error {
  constructor(
    readonly esperado: Sessao['estado'],
    readonly atual: Sessao['estado'] | null,
  ) {
    super(`session is ${atual ?? 'missing or erased'}, expected ${esperado}`);
    this.name = 'ErroEstadoSessao';
  }
}

/**
 * A draft Corpus as the import extracted it. `ref`s are the extraction's own
 * ids, resolved to database ids when it is written.
 */
export interface CorpusImportado {
  affiliations: (Omit<NovaAffiliation, 'ordem'> & { ref: string })[];
  accomplishments: (Omit<NovoAccomplishment, 'affiliationId' | 'ordem'> & {
    ref: string;
    affiliationRef: string | null;
  })[];
  linhas: { texto: string; affiliationRef: string | null; accomplishmentRefs: string[] }[];
}

/**
 * Writes an import in one transaction: the extracted text, the draft Corpus
 * (affiliations in the order given), the original lines, the state `importou`
 * and the `importou` event with the counts. Only from `consentiu`: anything
 * else (not consented, already imported, erased) throws `ErroEstadoSessao` and
 * writes nothing.
 *
 * `linhas_originais` holds one accomplishment per row, so a line that became
 * two accomplishments is written once per accomplishment.
 */
export async function gravarImportacao(
  sessaoId: string,
  dados: {
    formato: (typeof importacoes.$inferInsert)['formato'];
    textoExtraido: string;
    corpus: CorpusImportado;
  },
): Promise<{ affiliations: number; accomplishments: number; linhas: number }> {
  const { corpus } = dados;
  return db().transaction(async (tx) => {
    const [sessao] = await tx.select().from(sessoes).where(eq(sessoes.id, sessaoId)).for('update');
    if (sessao?.estado !== 'consentiu' || sessao.apagadaEm) {
      throw new ErroEstadoSessao('consentiu', sessao?.estado ?? null);
    }

    await tx.insert(importacoes).values({ sessaoId, formato: dados.formato, textoExtraido: dados.textoExtraido });

    const idAffiliation = new Map<string, string>();
    if (corpus.affiliations.length) {
      const inseridas = await tx
        .insert(affiliations)
        .values(corpus.affiliations.map(({ ref: _, ...a }, ordem) => ({ ...a, ordem, sessaoId })))
        .returning({ id: affiliations.id });
      corpus.affiliations.forEach((a, i) => idAffiliation.set(a.ref, inseridas[i].id));
    }
    const affiliationDe = (ref: string | null) => (ref === null ? null : (idAffiliation.get(ref) ?? null));

    const idAccomplishment = new Map<string, string>();
    if (corpus.accomplishments.length) {
      const inseridos = await tx
        .insert(accomplishments)
        .values(
          corpus.accomplishments.map(({ ref: _, affiliationRef, ...a }, ordem) => ({
            ...a,
            ordem,
            affiliationId: affiliationDe(affiliationRef),
            sessaoId,
          })),
        )
        .returning({ id: accomplishments.id });
      corpus.accomplishments.forEach((a, i) => idAccomplishment.set(a.ref, inseridos[i].id));
    }

    const linhasOriginaisNovas = corpus.linhas.flatMap((l) => {
      const base = { sessaoId, texto: l.texto, affiliationId: affiliationDe(l.affiliationRef) };
      const ids = l.accomplishmentRefs.flatMap((ref) => idAccomplishment.get(ref) ?? []);
      return ids.length ? ids.map((accomplishmentId) => ({ ...base, accomplishmentId })) : [base];
    });
    if (linhasOriginaisNovas.length) await tx.insert(linhasOriginais).values(linhasOriginaisNovas);

    const contagem = {
      affiliations: corpus.affiliations.length,
      accomplishments: corpus.accomplishments.length,
      linhas: corpus.linhas.length,
    };
    await tx.update(sessoes).set({ estado: 'importou' }).where(eq(sessoes.id, sessaoId));
    await tx.insert(eventos).values({
      sessaoId,
      tipo: 'importou',
      dados: { formato: dados.formato, ...contagem },
    });
    return contagem;
  });
}

/** The session has some record: "Baixar meu Corpus" has something to give. */
export async function temCorpus(sessaoId: string): Promise<boolean> {
  const [linha] = await db().execute<{ tem: boolean }>(sql`
    select exists (select 1 from ${affiliations} where ${affiliations.sessaoId} = ${sessaoId})
        or exists (select 1 from ${accomplishments} where ${accomplishments.sessaoId} = ${sessaoId}) as tem`);
  return Boolean(linha?.tem);
}

/** How the session's Corpus came in (the first import), or null before any. */
export async function formatoDaImportacao(sessaoId: string): Promise<(typeof importacoes.$inferSelect)['formato'] | null> {
  const [linha] = await db()
    .select({ formato: importacoes.formato })
    .from(importacoes)
    .where(eq(importacoes.sessaoId, sessaoId))
    .orderBy(asc(importacoes.createdAt))
    .limit(1);
  return linha?.formato ?? null;
}

/** A Corpus file that did not pass the check: `message` is the reason, in Portuguese, for the person. */
export class ErroArquivoDoCorpus extends Error {
  constructor(razao: string) {
    super(razao);
    this.name = 'ErroArquivoDoCorpus';
  }
}

/** A Corpus file goes only into an empty Corpus (step 27, C3): never over it, never merged. */
export class ErroCorpusNaoVazio extends Error {
  constructor() {
    super('the session already has a Corpus');
    this.name = 'ErroCorpusNaoVazio';
  }
}

/**
 * "Tenho um arquivo do sem-sotaque" (step 27): reads the Corpus file and
 * writes it in one transaction, like `gravarImportacao`. Each record gets a new
 * id and the refs are tied to them; the state of each record comes as it was
 * (C2), so the coverage and the open queue are the origin's. The header is
 * written only if the session has none; the file, whole, is the import's
 * provenance (C5). A file that does not pass `lerArquivoDeCorpus` throws
 * `ErroArquivoDoCorpus`; a session not at `consentiu` throws
 * `ErroEstadoSessao`, and one with a record already, `ErroCorpusNaoVazio`.
 * Either way nothing is written.
 */
export async function importarCorpusDeArquivo(
  sessaoId: string,
  texto: string,
): Promise<{ affiliations: number; accomplishments: number; linhas: number }> {
  const lido = lerArquivoDeCorpus(texto);
  if (!lido.ok) throw new ErroArquivoDoCorpus(lido.razao);
  const arquivo = lido.arquivo;

  return db().transaction(async (tx) => {
    const [sessao] = await tx.select().from(sessoes).where(eq(sessoes.id, sessaoId)).for('update');
    if (sessao?.estado !== 'consentiu' || sessao.apagadaEm) {
      throw new ErroEstadoSessao('consentiu', sessao?.estado ?? null);
    }
    const [temAffiliation] = await tx.select({ id: affiliations.id }).from(affiliations).where(eq(affiliations.sessaoId, sessaoId)).limit(1);
    const [temAccomplishment] = await tx
      .select({ id: accomplishments.id })
      .from(accomplishments)
      .where(eq(accomplishments.sessaoId, sessaoId))
      .limit(1);
    if (temAffiliation || temAccomplishment) throw new ErroCorpusNaoVazio();

    await tx.insert(importacoes).values({ sessaoId, formato: 'corpus', textoExtraido: texto });

    const idAffiliation = new Map<string, string>();
    if (arquivo.affiliations.length) {
      const inseridas = await tx
        .insert(affiliations)
        .values(
          arquivo.affiliations.map((a, ordem) => ({
            sessaoId,
            ordem,
            organizacao: a.organizacao,
            cargo: a.cargo,
            tipo: a.tipo,
            anoConclusao: a.ano_conclusao,
            cursando: a.cursando,
            periodoOriginal: a.periodo_original,
            periodoInicio: a.periodo_inicio,
            periodoFim: a.periodo_fim,
            stack: a.stack,
            confidencial: a.confidencial,
            descricaoPublica: a.descricao_publica,
            periodoConfirmado: a.periodo_confirmado,
            pulado: a.pulado,
          })),
        )
        .returning({ id: affiliations.id });
      arquivo.affiliations.forEach((a, i) => idAffiliation.set(a.ref, inseridas[i].id));
    }
    const affiliationDe = (ref: string | null) => (ref === null ? null : idAffiliation.get(ref)!);

    const idAccomplishment = new Map<string, string>();
    if (arquivo.accomplishments.length) {
      const inseridos = await tx
        .insert(accomplishments)
        .values(
          arquivo.accomplishments.map((a, ordem) => ({
            sessaoId,
            ordem,
            affiliationId: affiliationDe(a.affiliation_ref),
            tipo: a.tipo,
            enunciado: a.enunciado,
            importanciaParaPessoa: a.importancia_para_pessoa,
            data: a.data,
            pulado: a.pulado,
            forca: a.forca,
            adiado: a.adiado,
            adiadoVoltou: a.adiado_voltou,
          })),
        )
        .returning({ id: accomplishments.id });
      arquivo.accomplishments.forEach((a, i) => idAccomplishment.set(a.ref, inseridos[i].id));
    }

    // The Corpus reads a record's Metrics by `created_at`: one apart each keeps the file's order.
    const base = Date.now();
    const novasMetrics = arquivo.accomplishments.flatMap((a) =>
      a.metrics.map((m) => ({
        accomplishmentId: idAccomplishment.get(a.ref)!,
        texto: m.texto,
        valores: m.valores,
        origem: m.origem,
        ancora: m.ancora,
        confirmadoEm: m.confirmado_em ? new Date(m.confirmado_em) : null,
      })),
    );
    if (novasMetrics.length) {
      await tx.insert(metrics).values(novasMetrics.map((m, i) => ({ ...m, createdAt: new Date(base + i) })));
    }

    if (arquivo.linhas_originais.length) {
      await tx.insert(linhasOriginais).values(
        arquivo.linhas_originais.map((l) => ({
          sessaoId,
          texto: l.texto,
          affiliationId: affiliationDe(l.affiliation_ref),
          accomplishmentId: l.accomplishment_ref === null ? null : idAccomplishment.get(l.accomplishment_ref)!,
        })),
      );
    }

    if (arquivo.cabecalho) {
      await tx.insert(cabecalhos).values({ sessaoId, ...arquivo.cabecalho }).onConflictDoNothing({ target: cabecalhos.sessaoId });
    }

    const contagem = {
      affiliations: arquivo.affiliations.length,
      accomplishments: arquivo.accomplishments.length,
      linhas: arquivo.linhas_originais.length,
    };
    await tx.update(sessoes).set({ estado: 'importou' }).where(eq(sessoes.id, sessaoId));
    await tx.insert(eventos).values({ sessaoId, tipo: 'importou', dados: { formato: 'corpus', ...contagem } });
    return contagem;
  });
}

/**
 * "Começar as perguntas" on the import result: `importou` → `interrogando`.
 * Only from `importou`, so a second tap or another state changes nothing; it
 * returns the session as it is either way.
 */
export async function iniciarInterrogatorio(sessaoId: string): Promise<Sessao> {
  const [atualizada] = await db()
    .update(sessoes)
    .set({ estado: 'interrogando' })
    .where(and(eq(sessoes.id, sessaoId), eq(sessoes.estado, 'importou'), isNull(sessoes.apagadaEm)))
    .returning();
  if (atualizada) return atualizada;
  const [atual] = await db().select().from(sessoes).where(eq(sessoes.id, sessaoId));
  if (!atual) throw new Error(`no session ${sessaoId}`);
  return atual;
}

// ---- o log ------------------------------------------------------------------

type NovaMensagem = Omit<typeof mensagens.$inferInsert, 'id' | 'sessaoId' | 'createdAt'>;

export async function registrarMensagem(sessaoId: string, dados: NovaMensagem): Promise<Mensagem> {
  const [linha] = await db()
    .insert(mensagens)
    .values({ ...dados, sessaoId })
    .returning();
  return linha;
}

/**
 * A step of the funnel. `dados` holds no content (counts, formats, never what
 * the person wrote): the panel reads it as is.
 */
export async function registrarEvento(
  sessaoId: string,
  tipo: TipoEvento,
  dados: Record<string, unknown> = {},
): Promise<void> {
  await db().insert(eventos).values({ sessaoId, tipo, dados });
}

export async function registrarChamadaLlm(
  dados: Omit<typeof chamadasLlm.$inferInsert, 'id' | 'createdAt'>,
): Promise<typeof chamadasLlm.$inferSelect> {
  const [linha] = await db().insert(chamadasLlm).values(dados).returning();
  return linha;
}

// ---- apagar -----------------------------------------------------------------

/**
 * Erases everything the person gave: the Corpus, the log, the imports, the
 * resumes, the closing answers, the errors and the Tester row with its token. What stays
 * has no content, so the funnel does not lie: the `sessoes` row (state and
 * dates, `apagada_em` set, the token's SHA-256 so the link can still say
 * "erased"), one `apagou` event with the state they were in and the funnel
 * event types they had reached (`etapas`), the
 * `chamadas_llm` cost rows unlinked from the session and stripped of `erro`,
 * and the Vagas emptied (rows without content, still linked to their cost)
 * with their events, so three jobs do not become one in the funnel.
 *
 * A table added later that holds content must be added here; the test that
 * sweeps every `sessao_id` column fails until it is. Idempotent.
 */
export async function apagarSessao(sessaoId: string): Promise<void> {
  await db().transaction(async (tx) => {
    const [sessao] = await tx
      .select()
      .from(sessoes)
      .where(eq(sessoes.id, sessaoId))
      .for('update');
    if (!sessao || sessao.apagadaEm) return;

    // Which steps of the funnel they had reached (event types, no content), so
    // the panel still counts them at every step they passed.
    const alcancadas = await tx
      .selectDistinct({ tipo: eventos.tipo })
      .from(eventos)
      .where(eq(eventos.sessaoId, sessaoId));
    const etapas = alcancadas.map((e) => e.tipo).sort();

    await esvaziarVagasDaSessao(tx, sessaoId);
    // The Vaga events hold only the `vaga_id`: they stay, one per job.
    await tx
      .delete(eventos)
      .where(and(eq(eventos.sessaoId, sessaoId), notInArray(eventos.tipo, [...EVENTOS_DE_VAGA])));

    // metrics go with accomplishments, renders with selections (cascade).
    for (const tabela of [
      mensagens,
      linhasOriginais,
      importacoes,
      accomplishments,
      affiliations,
      geracoes,
      selections,
      cabecalhos,
      fechamento,
      indicacoes,
      plano,
      decisoesAvaliador,
      // The session row is never deleted, so its errors' cascade never fires: they go here (step 26).
      erros,
    ]) {
      await tx.delete(tabela).where(eq(tabela.sessaoId, sessaoId));
    }
    await tx
      .update(chamadasLlm)
      .set({ sessaoId: null, erro: null })
      .where(eq(chamadasLlm.sessaoId, sessaoId));

    const [tester] = sessao.testerId
      ? await tx.select().from(testers).where(eq(testers.id, sessao.testerId))
      : [];
    await tx
      .update(sessoes)
      .set({
        testerId: null,
        apagadaEm: new Date(),
        notasDaniel: null,
        tokenApagadoSha256: tester ? sha256(tester.token) : null,
      })
      .where(eq(sessoes.id, sessaoId));
    if (tester) await tx.delete(testers).where(eq(testers.id, tester.id));
    // The account goes with its Tester (step 20), and its sign-ins with it (cascade).
    if (tester?.contaId) await tx.delete(contas).where(eq(contas.id, tester.contaId));

    await tx.insert(eventos).values({ sessaoId, tipo: 'apagou', dados: { estado: sessao.estado, etapas } });
  });
}
