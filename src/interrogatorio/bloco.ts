// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The block at the end of a company, and a degree's year, with no model (step
 * 11): the questions come from a template, in the order of what the
 * Affiliation is missing, and the answers are read by rule. What the rule
 * cannot read, or an answer that says more than the answer (another project,
 * a story), is the questioner's: `lerResposta` returns null and the turn hands
 * the subject over.
 */
import type { Affiliation } from '@/db';

import { ehFormacao } from './estado';
import { ehNaoSei } from './falas';

export type PassoBloco = 'confirmar' | 'inicio' | 'fim' | 'descricao' | 'nome' | 'ano';

export type CamposBloco = Partial<
  Pick<Affiliation, 'periodoInicio' | 'periodoFim' | 'periodoConfirmado' | 'descricaoPublica' | 'confidencial' | 'anoConclusao' | 'cursando'>
>;

const NOMES_DOS_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const normalizar = (fala: string) =>
  fala.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}/]+/gu, ' ').trim();
const palavras = (fala: string) => normalizar(fala).split(' ').filter(Boolean).length;

const anosDe = (texto: string | null) => (texto?.match(/\b(?:19|20)\d{2}\b/g) ?? []).map(Number);
/** "Até hoje" in the resume's period. */
const ATUAL_NO_CURRICULO = /atual|present|hoje|momento/i;
/** "Ainda estou lá" in an answer. */
const AINDA_LA = /\b(?:ainda|ate hoje|atual|atualmente|continuo|sigo|to la|estou la|trabalho la)\b/;
const CURSANDO = /\b(?:cursando|previsao|ainda|termino|vou terminar|devo terminar|formo em)\b/;
const SIM = /^(?:sim|s|isso|certo|correto|exato|exatamente|pode|claro|ok|beleza|ta certo|esta certo|e isso|confere|com certeza|yes)\b/;
const NAO = /^(?:nao|n|negativo|errado|ta errado|melhor nao|prefiro nao|prefiro que nao)\b/;

const mesEscrito = (yyyymm: string) => `${NOMES_DOS_MESES[Number(yyyymm.slice(5)) - 1]} de ${yyyymm.slice(0, 4)}`;

const NOMES_SEM_ACENTO = NOMES_DOS_MESES.map(normalizar);
/** A month by name, with "de 2018" after it if given, or "08/2018". */
const MES_NA_FALA = new RegExp(`\\b(?:(${NOMES_SEM_ACENTO.join('|')})(?: de ((?:19|20)\\d{2}))?|(\\d{1,2})/((?:19|20)\\d{2}))\\b`, 'g');

/** The months an answer names, in the order said, each with its year when the person said it. */
function mesesNaOrdem(fala: string): { mes: number; ano: number | null }[] {
  const meses: { mes: number; ano: number | null }[] = [];
  for (const m of normalizar(fala).matchAll(MES_NA_FALA)) {
    const mes = m[1] ? NOMES_SEM_ACENTO.indexOf(m[1]) + 1 : Number(m[3]);
    if (mes < 1 || mes > 12) continue;
    const ano = m[2] ?? m[4];
    meses.push({ mes, ano: ano ? Number(ano) : null });
  }
  return meses;
}

/** The one month an answer names; null for none or more than one. */
function mesDa(fala: string): number | null {
  const meses = new Set(mesesNaOrdem(fala).map((m) => m.mes));
  return meses.size === 1 ? [...meses][0] : null;
}

/** The one year an answer names, or the fallback; null for more than one. */
function anoDa(fala: string, fallback: number | undefined): number | null {
  const anos = [...new Set(anosDe(fala))];
  if (anos.length > 1) return null;
  return anos[0] ?? fallback ?? null;
}

const yyyymm = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`;

/** The next question of the block, or null when the block is done. `feitos`: the steps already asked. */
export function perguntaDoBloco(af: Affiliation, feitos: PassoBloco[]): { passo: PassoBloco; texto: string } | null {
  const proxima = proximoPasso(af, feitos);
  if (!proxima) return null;
  const { passo, texto } = proxima;
  if (feitos.length) return { passo, texto: texto[0].toUpperCase() + texto.slice(1) };
  // "Deixar X para trás" needs no article: "da Pagatudo" or "do Estúdio" would need the company's gender.
  return { passo, texto: `Antes de deixar ${af.organizacao} para trás: ${texto}` };
}

function proximoPasso(af: Affiliation, feitos: PassoBloco[]): { passo: PassoBloco; texto: string } | null {
  const fez = (p: PassoBloco) => feitos.includes(p);
  if (ehFormacao(af)) {
    if (af.anoConclusao || fez('ano')) return null;
    return { passo: 'ano', texto: `em que ano você se formou em ${af.cargo}? Se ainda está cursando, me diga a previsão.` };
  }
  if (af.tipo !== 'emprego') return null;

  const anos = anosDe(af.periodoOriginal);
  const atualNoCurriculo = ATUAL_NO_CURRICULO.test(af.periodoOriginal ?? '');
  if (!af.periodoConfirmado) {
    const confirmavel = af.periodoInicio && (af.periodoFim || atualNoCurriculo);
    if (confirmavel && !fez('confirmar') && !fez('inicio')) {
      const fim = af.periodoFim ? `a ${mesEscrito(af.periodoFim)}` : 'até hoje';
      return { passo: 'confirmar', texto: `no currículo está de ${mesEscrito(af.periodoInicio!)} ${fim}. Está certo?` };
    }
    if (!fez('inicio')) {
      return { passo: 'inicio', texto: `em que mês ${anos.length ? `de ${anos[0]}` : 'e ano'} você entrou lá?` };
    }
    // Without the start month, the end month would not confirm anything.
    if (af.periodoInicio && !fez('fim')) {
      if (atualNoCurriculo) return { passo: 'fim', texto: 'e você ainda está lá? Se saiu, me diga o mês e o ano.' };
      const ano = anos.length > 1 ? `de ${anos.at(-1)}` : anos.length ? '' : 'e ano';
      return { passo: 'fim', texto: `e em que mês${ano ? ` ${ano}` : ''} você saiu? Se ainda está lá, é só dizer.` };
    }
  }
  if (!af.descricaoPublica?.trim() && !fez('descricao')) {
    return { passo: 'descricao', texto: `um recrutador lá fora nunca ouviu falar de ${af.organizacao}. Em uma frase, o que a empresa faz?` };
  }
  if (!fez('nome')) return { passo: 'nome', texto: `o nome ${af.organizacao} pode aparecer no currículo?` };
  return null;
}

/** Words past which an answer may carry something else, and goes to the questioner. */
const LIMITE_DE_PALAVRAS: Record<PassoBloco, number> = { confirmar: 12, inicio: 12, fim: 12, nome: 12, ano: 15, descricao: 40 };

/**
 * The fields an answer gives. `{ campos: {} }` moves past the step (a "não
 * sei", a "não" to the period); null hands the answer to the questioner.
 */
export function lerResposta(af: Affiliation, passo: PassoBloco, fala: string): { campos: CamposBloco } | null {
  if (ehNaoSei(fala)) return { campos: {} };
  if (palavras(fala) > LIMITE_DE_PALAVRAS[passo]) return null;
  const texto = normalizar(fala);
  const anos = anosDe(af.periodoOriginal);

  switch (passo) {
    case 'confirmar':
      if (SIM.test(texto)) return { campos: { periodoConfirmado: true } };
      return NAO.test(texto) ? { campos: {} } : null;
    case 'inicio': {
      const meses = mesesNaOrdem(fala);
      // "Entrei em fevereiro de 2018 e saí em dezembro de 2019": both at once.
      if (meses.length === 2) {
        const [a, b] = meses;
        const anoInicio = a.ano ?? anos[0];
        const anoFim = b.ano ?? anos.at(-1) ?? a.ano;
        if (!anoInicio || !anoFim) return null;
        const [inicio, fim] = [yyyymm(anoInicio, a.mes), yyyymm(anoFim, b.mes)];
        return fim >= inicio ? { campos: { periodoInicio: inicio, periodoFim: fim, periodoConfirmado: true } } : null;
      }
      const mes = mesDa(fala);
      const ano = anoDa(fala, anos[0]);
      if (!mes || !ano) return null;
      const periodoInicio = yyyymm(ano, mes);
      if (AINDA_LA.test(texto)) return { campos: { periodoInicio, periodoFim: null, periodoConfirmado: true } };
      return { campos: { periodoInicio } };
    }
    case 'fim': {
      if (!af.periodoInicio) return null;
      const mes = mesDa(fala);
      if (!mes) return AINDA_LA.test(texto) ? { campos: { periodoFim: null, periodoConfirmado: true } } : null;
      const ano = anoDa(fala, anos.at(-1));
      if (!ano || yyyymm(ano, mes) < af.periodoInicio) return null;
      return { campos: { periodoFim: yyyymm(ano, mes), periodoConfirmado: true } };
    }
    case 'descricao':
      return { campos: { descricaoPublica: fala.trim() } };
    case 'nome':
      if (SIM.test(texto)) return { campos: { confidencial: false } };
      // Hidden, the résumé needs a description: the questioner asks for one.
      return NAO.test(texto) && af.descricaoPublica?.trim() ? { campos: { confidencial: true } } : null;
    case 'ano': {
      const ano = anoDa(fala, undefined);
      return ano ? { campos: { anoConclusao: ano, cursando: CURSANDO.test(texto) } } : null;
    }
  }
}
