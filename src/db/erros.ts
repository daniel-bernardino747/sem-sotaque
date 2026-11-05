// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Errors and frictions (step 26). What gets written is decided here, against
 * the session: never for an erased one, and only when `gravaErrosEAtritos`
 * says the session's consent (or the date) allows it. `MODO=local` is the
 * caller's to check (`src/erros`).
 */
import { and, count, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';

import { gravaErrosEAtritos } from '../conteudo/consentimento';
import type { FormaDoErro } from '../erros/forma';

import { db, type Db } from './client';
import { chamadasLlm, erros, eventos, renders, sessoes, testers } from './schema';

/** How long an error is kept, with or without a session (decision 4). */
export const ERROS_DURAM_DIAS = 90;
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * May this session's errors and frictions be written now? Not for an erased or
 * unknown session; otherwise, as its consent version and the date say.
 */
export async function sessaoGravaErros(tx: Tx, sessaoId: string, agora: Date): Promise<boolean> {
  // `for share` waits for an erasure in flight, so nothing is written after `apagarSessao`.
  const [sessao] = await tx
    .select({ versao: sessoes.textoConsentimentoVersao, apagadaEm: sessoes.apagadaEm })
    .from(sessoes)
    .where(eq(sessoes.id, sessaoId))
    .for('share');
  return !!sessao && !sessao.apagadaEm && gravaErrosEAtritos(sessao.versao, agora);
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Writes the error's shape. Returns whether it was written. */
export async function gravarErro(forma: FormaDoErro, sessaoId: string | null, agora = new Date()): Promise<boolean> {
  return db().transaction(async (tx) => {
    if (sessaoId !== null && !(await sessaoGravaErros(tx, sessaoId, agora))) return false;
    await tx.insert(erros).values({ ...forma, sessaoId });
    return true;
  });
}

/** How many errors of `origem` the session has written since `desde`: the browser's limit per hour. */
export async function errosDaSessaoDesde(sessaoId: string, origem: 'servidor' | 'navegador', desde: Date): Promise<number> {
  const [{ n }] = await db()
    .select({ n: count() })
    .from(erros)
    .where(and(eq(erros.sessaoId, sessaoId), eq(erros.origem, origem), gte(erros.createdAt, desde)));
  return n;
}

/** Deletes every error older than `ERROS_DURAM_DIAS`. */
export async function limparErrosVencidos(agora = new Date()): Promise<void> {
  await db()
    .delete(erros)
    .where(lt(erros.createdAt, new Date(agora.getTime() - ERROS_DURAM_DIAS * DIA_MS)));
}

export const ATRITOS = ['tentou_de_novo', 'turno_ocupado'] as const;
export type Atrito = (typeof ATRITOS)[number];

/** `turno_ocupado` counts at most once per this window per session (decision 10): the 409 loop fires dozens. */
export const TURNO_OCUPADO_JANELA_MS = 10_000;

/**
 * A friction event (step 26): written as the errors are, under the session's
 * consent and the date, and `turno_ocupado` at most once per
 * `TURNO_OCUPADO_JANELA_MS`.
 */
export async function registrarAtrito(
  sessaoId: string,
  tipo: Atrito,
  dados: Record<string, unknown> = {},
  agora = new Date(),
): Promise<boolean> {
  return db().transaction(async (tx) => {
    if (!(await sessaoGravaErros(tx, sessaoId, agora))) return false;
    if (tipo !== 'turno_ocupado') {
      await tx.insert(eventos).values({ sessaoId, tipo, dados, createdAt: agora });
      return true;
    }
    const desde = new Date(agora.getTime() - TURNO_OCUPADO_JANELA_MS);
    const inseridos = await tx.execute(sql`
      insert into ${eventos} (sessao_id, tipo, dados, created_at)
      select ${sessaoId}, ${tipo}, ${JSON.stringify(dados)}::jsonb, ${agora.toISOString()}::timestamptz
      where not exists (
        select 1 from ${eventos}
        where ${eventos.sessaoId} = ${sessaoId} and ${eventos.tipo} = ${tipo} and ${eventos.createdAt} > ${desde.toISOString()}::timestamptz)
      returning id`);
    return inseridos.length > 0;
  });
}

// ---- o painel ---------------------------------------------------------------

/** The panel's window for the errors and the frictions. */
export const JANELA_DO_PAINEL_DIAS = 7;

export interface GrupoDeErros {
  origem: 'servidor' | 'navegador';
  onde: string;
  classe: string;
  codigo: string | null;
  n: number;
  ultima: Date;
  /** A screen's errors: the server's errors with the same digest, which broke it. */
  doServidor: { onde: string; classe: string; n: number }[];
}

export interface ErrosEAtritos {
  /** The window's errors by origin, place, class and code, most frequent first. */
  grupos: GrupoDeErros[];
  /** The sessions with errors in the window, most first. */
  sessoes: { sessaoId: string; apelido: string | null; n: number }[];
  /** "Tentar de novo" per screen, in the window. */
  tentouDeNovo: Record<string, number>;
  turnoOcupado: number;
  /** Interrogations that ended at the spending cap, in the window. */
  teto: number;
  /** The window's measured renders, in ms; null without one. */
  render: { mediana: number; maximo: number; n: number } | null;
  /** Model calls with an `erro` (a refusal, a price missing) per stage, in the window. */
  falhasDoModelo: Record<string, number>;
}

/** The "Erros e atritos" section of `/admin` (step 26). Read-only. */
export async function errosEAtritos(agora = new Date()): Promise<ErrosEAtritos> {
  const desde = new Date(agora.getTime() - JANELA_DO_PAINEL_DIAS * DIA_MS);
  const naJanela = gte(erros.createdAt, desde);
  const [grupos, ligados, porSessao, atritos, teto, [render], falhas] = await Promise.all([
    db()
      .select({
        origem: erros.origem,
        onde: erros.onde,
        classe: erros.classe,
        codigo: erros.codigo,
        n: count(),
        ultima: sql<Date>`max(${erros.createdAt})`.mapWith(erros.createdAt),
      })
      .from(erros)
      .where(naJanela)
      .groupBy(erros.origem, erros.onde, erros.classe, erros.codigo)
      .orderBy(desc(count()), desc(sql`max(${erros.createdAt})`)),
    // A screen's error and the server's that broke it share Next's digest.
    db().execute<{ onde: string; classe: string; codigo: string | null; s_onde: string; s_classe: string; n: number }>(sql`
      select n.onde, n.classe, n.codigo, s.onde as s_onde, s.classe as s_classe, count(*)::int as n
      from ${erros} n join ${erros} s on s.digest = n.digest and s.origem = 'servidor'
      where n.origem = 'navegador' and n.created_at >= ${desde.toISOString()}::timestamptz
      group by n.onde, n.classe, n.codigo, s.onde, s.classe`),
    db()
      .select({ sessaoId: erros.sessaoId, apelido: testers.apelido, n: count() })
      .from(erros)
      .innerJoin(sessoes, eq(sessoes.id, erros.sessaoId))
      .leftJoin(testers, eq(testers.id, sessoes.testerId))
      .where(naJanela)
      .groupBy(erros.sessaoId, testers.apelido)
      .orderBy(desc(count())),
    db()
      .select({ tipo: eventos.tipo, onde: sql<string | null>`${eventos.dados}->>'onde'`, n: count() })
      .from(eventos)
      .where(and(inArray(eventos.tipo, [...ATRITOS]), gte(eventos.createdAt, desde)))
      .groupBy(eventos.tipo, sql`${eventos.dados}->>'onde'`),
    db()
      .select({ n: count() })
      .from(eventos)
      .where(and(eq(eventos.tipo, 'terminou'), sql`${eventos.dados}->>'por' = 'teto'`, gte(eventos.createdAt, desde))),
    db()
      .select({
        mediana: sql<number | null>`percentile_cont(0.5) within group (order by ${renders.duracaoMs})`,
        maximo: sql<number | null>`max(${renders.duracaoMs})`,
        n: count(renders.duracaoMs),
      })
      .from(renders)
      .where(gte(renders.createdAt, desde)),
    db()
      .select({ etapa: chamadasLlm.etapa, n: count() })
      .from(chamadasLlm)
      .where(and(isNotNull(chamadasLlm.erro), gte(chamadasLlm.createdAt, desde)))
      .groupBy(chamadasLlm.etapa),
  ]);

  const tentouDeNovo: Record<string, number> = {};
  let turnoOcupado = 0;
  for (const a of atritos) {
    if (a.tipo === 'turno_ocupado') turnoOcupado += a.n;
    else tentouDeNovo[a.onde ?? '?'] = (tentouDeNovo[a.onde ?? '?'] ?? 0) + a.n;
  }

  return {
    grupos: grupos.map((g) => ({
      ...g,
      doServidor: ligados
        .filter((l) => l.onde === g.onde && l.classe === g.classe && l.codigo === g.codigo && g.origem === 'navegador')
        .map((l) => ({ onde: l.s_onde, classe: l.s_classe, n: Number(l.n) })),
    })),
    sessoes: porSessao.map((s) => ({ sessaoId: s.sessaoId!, apelido: s.apelido, n: s.n })),
    tentouDeNovo,
    turnoOcupado,
    teto: teto[0].n,
    render: render.n ? { mediana: Number(render.mediana), maximo: Number(render.maximo), n: render.n } : null,
    falhasDoModelo: Object.fromEntries(falhas.map((f) => [f.etapa, f.n])),
  };
}
