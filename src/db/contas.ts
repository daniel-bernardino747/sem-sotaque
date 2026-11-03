// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Accounts (step 20): who signs in, the browsers signed in, and the v0 link
 * (`/s/<token>`) that the first sign-in through it links to the account.
 *
 * An account has one Tester, and the Tester's session is everything the person
 * has. A sign-in without a link creates that Tester; a sign-in through an old
 * link adopts the link's Tester instead, once, and that token then belongs to
 * the account for good.
 */
import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';

import { db } from './client';
import { acessos, contas, sessoes, testers, type Provedor } from './schema';

export type Conta = typeof contas.$inferSelect;
type Sessao = typeof sessoes.$inferSelect;

/** What the provider says about the person, after the OAuth. */
export interface Perfil {
  provedor: Provedor;
  idNoProvedor: string;
  email: string | null;
  nome: string | null;
}

/** 30 days, like the panel's cookie. */
export const VALIDADE_ACESSO_S = 30 * 24 * 60 * 60;

/** The hash kept instead of a credential (a sign-in cookie, an erased v0 link). */
export const sha256 = (valor: string) => createHash('sha256').update(valor).digest('hex');

export type Entrada =
  /** `acesso` is the cookie value: shown once, stored only as its hash. */
  | { tipo: 'entrou'; conta: Conta; acesso: string }
  /** The link to adopt is unknown or erased: nothing was written. */
  | { tipo: 'link_invalido' }
  /** The link is already another account's: nothing was written, not even this account. */
  | { tipo: 'link_de_outra_conta' };

/**
 * A finished OAuth: the account (found by provider and provider id, created
 * the first time, with the e-mail and name as they are now), its Tester, and
 * a new sign-in.
 *
 * With `vincular`, the token of a v0 link: its Tester becomes the account's,
 * unless the token is unknown or erased (`link_invalido`) or another
 * account's (`link_de_outra_conta`), and then nothing is written. An account
 * that signed in on its own first and has not consented yet gives up that
 * empty session for the link's; one that has started keeps its own, and the
 * link stays free (one account, one Tester).
 *
 * Errors never carry the token (see `sessaoPorToken`).
 */
export async function entrar(perfil: Perfil, { vincular }: { vincular?: string } = {}): Promise<Entrada> {
  return semTokenNoErro(() => entrarNaTransacao(perfil, vincular));
}

/**
 * Drizzle's error message carries the query params, and a server log is no
 * place for a v0 token. Keep only Postgres's own reason.
 */
async function semTokenNoErro<T>(fazer: () => Promise<T>): Promise<T> {
  try {
    return await fazer();
  } catch (erro) {
    const causa = (erro as { cause?: { code?: string; message?: string } }).cause;
    if (!causa) throw erro;
    throw new Error(`account query failed: ${causa.code ?? '?'} ${causa.message ?? 'unknown'}`);
  }
}

async function entrarNaTransacao(perfil: Perfil, vincular: string | undefined): Promise<Entrada> {
  return db().transaction(async (tx) => {
    let linkDoTester: { id: string; contaId: string | null } | undefined;
    if (vincular !== undefined) {
      [linkDoTester] = await tx
        .select({ id: testers.id, contaId: testers.contaId })
        .from(testers)
        .innerJoin(sessoes, eq(sessoes.testerId, testers.id))
        .where(and(eq(testers.token, vincular), isNull(sessoes.apagadaEm)))
        // Two accounts racing for the same link: the second waits and sees the first's.
        .for('update', { of: testers });
      if (!linkDoTester) return { tipo: 'link_invalido' } as const;
      if (linkDoTester.contaId !== null) {
        // Someone else's link: nothing is written, not even this account.
        const [dona] = await tx.select({ provedor: contas.provedor, idNoProvedor: contas.idNoProvedor }).from(contas).where(eq(contas.id, linkDoTester.contaId));
        if (dona?.provedor !== perfil.provedor || dona.idNoProvedor !== perfil.idNoProvedor) return { tipo: 'link_de_outra_conta' } as const;
      }
    }

    // The upsert locks the account's row: two sign-ins of the same person at
    // once create one Tester, not two.
    const [conta] = await tx
      .insert(contas)
      .values(perfil)
      .onConflictDoUpdate({
        target: [contas.provedor, contas.idNoProvedor],
        set: { email: perfil.email, nome: perfil.nome },
      })
      .returning();

    const linhas = await tx
      .select({ testerId: testers.id, sessaoId: sessoes.id, estado: sessoes.estado })
      .from(testers)
      .innerJoin(sessoes, eq(sessoes.testerId, testers.id))
      .where(eq(testers.contaId, conta.id));
    let proprio = linhas.at(0);
    if (proprio && linkDoTester && proprio.testerId !== linkDoTester.id && proprio.estado === 'novo') {
      // Signed in on their own, then remembered the link: the empty session
      // (nothing consented, nothing said) gives way to the one with their story.
      await tx.delete(sessoes).where(eq(sessoes.id, proprio.sessaoId));
      await tx.delete(testers).where(eq(testers.id, proprio.testerId));
      proprio = undefined;
    }
    if (!proprio) {
      if (linkDoTester) {
        await tx.update(testers).set({ contaId: conta.id }).where(eq(testers.id, linkDoTester.id));
      } else {
        const [tester] = await tx
          .insert(testers)
          .values({
            token: randomBytes(24).toString('base64url'),
            apelido: perfil.nome ?? perfil.email ?? perfil.provedor,
            origem: 'conta',
            contaId: conta.id,
          })
          .returning();
        await tx.insert(sessoes).values({ testerId: tester.id });
      }
    }

    const acesso = randomBytes(32).toString('base64url');
    await tx.insert(acessos).values({
      tokenSha256: sha256(acesso),
      contaId: conta.id,
      expiraEm: new Date(Date.now() + VALIDADE_ACESSO_S * 1000),
    });
    return { tipo: 'entrou', conta, acesso } as const;
  });
}

/** The account a cookie signs in, or null for no cookie, an unknown one or an expired one. */
export async function contaDoAcesso(acesso: string | undefined | null): Promise<Conta | null> {
  if (!acesso) return null;
  const [linha] = await db()
    .select({ conta: contas })
    .from(acessos)
    .innerJoin(contas, eq(contas.id, acessos.contaId))
    .where(and(eq(acessos.tokenSha256, sha256(acesso)), gt(acessos.expiraEm, new Date())));
  return linha?.conta ?? null;
}

/** "Sair": this browser only. */
export async function sair(acesso: string): Promise<void> {
  await db().delete(acessos).where(eq(acessos.tokenSha256, sha256(acesso)));
}

/** The account's live session, or null (no Tester yet, or erased). */
export async function sessaoDaConta(contaId: string): Promise<Sessao | null> {
  const [linha] = await db()
    .select({ sessao: sessoes })
    .from(testers)
    .innerJoin(sessoes, eq(sessoes.testerId, testers.id))
    .where(and(eq(testers.contaId, contaId), isNull(sessoes.apagadaEm)));
  return linha?.sessao ?? null;
}

/**
 * Where a v0 link leads, for whoever opens it (`contaId`, or null signed out):
 * - `vincular`: no account has it yet; signing in through it links it;
 * - `casa`: it is the signed-in account's;
 * - `entrar`: it is some account's, and nobody is signed in;
 * - `apagado`: its data was erased;
 * - `nao_existe`: unknown, or another account's (the same 404).
 */
export async function situacaoDoLink(
  token: string,
  contaId: string | null,
): Promise<'vincular' | 'casa' | 'entrar' | 'apagado' | 'nao_existe'> {
  const [linha] = await semTokenNoErro(() =>
    db()
      .select({ contaId: testers.contaId })
      .from(testers)
      .innerJoin(sessoes, eq(sessoes.testerId, testers.id))
      .where(and(eq(testers.token, token), isNull(sessoes.apagadaEm))),
  );
  if (!linha) {
    // Only the hash is kept of an erased link (`apagarSessao`).
    const [apagada] = await db().select({ id: sessoes.id }).from(sessoes).where(eq(sessoes.tokenApagadoSha256, sha256(token)));
    return apagada ? 'apagado' : 'nao_existe';
  }
  if (linha.contaId === null) return 'vincular';
  if (contaId === null) return 'entrar';
  return linha.contaId === contaId ? 'casa' : 'nao_existe';
}

/** What a session of `MODO=local` gets for `limite_vagas`: the largest integer the column holds. */
export const SEM_LIMITE_DE_VAGAS = 2_147_483_647;

/**
 * The one account of `MODO=local` (step 23): nobody signs in, so every request
 * is this account, created on the first one. Its session is born past the
 * consent screens (version `local`: whoever runs the app on their own machine
 * chose where the data goes when they filled `.env`), with the Vagas open and
 * no limit on them. After "apagar meus dados" erases it, the next request
 * starts a new one.
 */
export async function contaLocal(): Promise<Conta> {
  // Every request asks: a read, and a write only the first time.
  const [pronta] = await db()
    .select({ conta: contas })
    .from(contas)
    .innerJoin(testers, eq(testers.contaId, contas.id))
    .where(and(eq(contas.provedor, 'local'), eq(contas.idNoProvedor, 'local')));
  if (pronta) return pronta.conta;

  return db().transaction(async (tx) => {
    // Locks the row: two first requests at once wait for each other and make
    // one Tester. The no-op update is there so `returning` gives the row back.
    const [conta] = await tx
      .insert(contas)
      .values({ provedor: 'local', idNoProvedor: 'local', email: null, nome: null })
      .onConflictDoUpdate({ target: [contas.provedor, contas.idNoProvedor], set: { nome: null } })
      .returning();
    const [tester] = await tx.select({ id: testers.id }).from(testers).where(eq(testers.contaId, conta.id));
    if (!tester) {
      const [novo] = await tx
        .insert(testers)
        .values({ token: randomBytes(24).toString('base64url'), apelido: 'local', origem: 'local', contaId: conta.id })
        .returning();
      const agora = new Date();
      await tx.insert(sessoes).values({
        testerId: novo.id,
        estado: 'consentiu',
        consentiuEm: agora,
        textoConsentimentoVersao: 'local',
        vagasConsentiuEm: agora,
        limiteVagas: SEM_LIMITE_DE_VAGAS,
      });
    }
    return conta;
  });
}
