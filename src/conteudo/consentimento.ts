// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The consent text a Tester accepts before anything else. Each version is its
 * own file (`consentimento-<versao>.md`) and never changes once someone has
 * accepted it: the session records which version they read. A new text is a
 * new file and a new `CONSENTIMENTO_VERSAO`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const CONSENTIMENTO_VERSAO = 'v4';

/**
 * The text a v1 session mid-interrogation is shown again (step 10). It stays
 * v2 after v3: what it asks is the TypeSafe, and `MUDOU_NO_V2` says so.
 */
export const REACEITE_VERSAO = 'v2';

/**
 * What changed from v1 to v2, for a session that began on v1 and is shown v2
 * mid-interrogation (step 10).
 */
export const MUDOU_NO_V2 =
  'Mudou uma coisa desde que você começou: agora uma segunda empresa, a TypeSafe, lê trechos das suas respostas, sem o seu nome nem o nome das empresas, para decidir quando passar para o próximo assunto. Se você não aceitar, a conversa segue do mesmo jeito, só sem essa avaliação.';

/**
 * The separate consent for the Vagas (step 15, P19), asked at the first
 * "Achei uma vaga". Not a new `CONSENTIMENTO_VERSAO`: the entry version
 * decides the evaluator. v2 (step 22): Daniel reads a Vaga only with the
 * reading opt-in, like the rest.
 */
export const CONSENTIMENTO_VAGAS_VERSAO = 'vagas-v2';

/**
 * When the policy that keeps errors and frictions (step 26) applies to every
 * session: the deploy plus the 7 days the banner at the home announces.
 * Midnight in Brasília. Before it, only a session that accepted v4 records them.
 */
export const ERROS_VALEM_A_PARTIR = new Date('2026-11-13T03:00:00Z');

/** Text versions before v4, whose consent said nothing about errors. */
const SEM_ERROS = new Set(['v1', 'v2', 'v3']);

/**
 * Whether a session's errors and frictions are recorded (step 26, decision 9):
 * from the consent for a v4 session, from `ERROS_VALEM_A_PARTIR` for any other
 * (an older text, or none accepted yet).
 */
export function gravaErrosEAtritos(versao: string | null, agora = new Date()): boolean {
  if (versao !== null && !SEM_ERROS.has(versao)) return true;
  return agora.getTime() >= ERROS_VALEM_A_PARTIR.getTime();
}

/**
 * The banner at the home (step 26, decision 9): a session that accepted a text
 * before v4 is told what changes in the policy, and when, until that date. A
 * v4 session read it in its consent; one that has not accepted yet will.
 */
/** What the banner says. The date is `ERROS_VALEM_A_PARTIR`'s, in Brasília. */
export const AVISO_DA_POLITICA = `A política de privacidade muda em ${ERROS_VALEM_A_PARTIR.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' })}: a partir desse dia, quando algo der errado, eu guardo o tipo do erro e a tela ou a etapa em que ele aconteceu, ligados à sua conta, por 90 dias. Nunca o texto da sua conversa ou do seu currículo. Apagar os seus dados apaga isso também.`;

export function mostraAvisoDaPolitica(versao: string | null, agora = new Date()): boolean {
  return versao !== null && !gravaErrosEAtritos(versao, agora);
}

/** v2 and later name the TypeSafe: the evaluator may run only for them. */
export function aceitouAvaliador(versao: string | null): boolean {
  return versao !== null && versao !== 'v1';
}

/**
 * v1 and v2 said "o Daniel lê tudo", with no box of its own: accepting them is
 * the opt-in to the reading (step 22). From v3 the reading is a separate box.
 */
export function textoIncluiLeitura(versao: string): boolean {
  return versao === 'v1' || versao === 'v2';
}

export interface Trecho {
  texto: string;
  negrito: boolean;
}

/** The little Markdown the consent text uses: paragraphs and `**bold**`. */
export function paragrafos(md: string): Trecho[][] {
  return md
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) =>
      p
        .split(/\*\*(.+?)\*\*/)
        .map((texto, i) => ({ texto, negrito: i % 2 === 1 }))
        .filter((t) => t.texto),
    );
}

export function textoDoConsentimento(versao = CONSENTIMENTO_VERSAO): Trecho[][] {
  const arquivo = path.join(process.cwd(), 'src', 'conteudo', `consentimento-${versao}.md`);
  return paragrafos(readFileSync(arquivo, 'utf8'));
}
