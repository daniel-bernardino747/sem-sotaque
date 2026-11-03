// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The deterministic checks of the generation: one function per rule that
 * `docs/regras-de-redacao.md` marks **código**, run over the Selection and the
 * Corpus it came from. A broken rule comes back as a `Violacao` saying where,
 * so the rewrite can be told which lines to fix; nothing here calls a model.
 *
 * The page rules (one page, 97–100% full, lines per bullet, orphans) are the
 * measure's (`measure-resume.py`), not these.
 */
import type { LinhaDoMapaGravada } from '@/db/schema';
import type { Selection } from '@/render';

export type Regra =
  | 'numero_sem_origem'
  | 'qualitativo_fora_do_lugar'
  | 'atribuicao_de_estimativa'
  | 'hedge'
  | 'adjetivo_vazio'
  | 'fonte_repetida'
  | 'label_fora_da_stack'
  | 'contagem_de_partes'
  | 'manager'
  | 'senioridade'
  | 'disponibilidade'
  | 'periodo'
  | 'secoes'
  | 'poucos_bullets'
  | 'confidencial_pelo_nome'
  | 'fonte'
  | 'cargo_sem_lastro';

/** Where in the Selection a rule broke, by index. */
export type Onde =
  | { tipo: 'entrada'; secao: number; grupo: number; entrada: number }
  | { tipo: 'heading'; secao: number; grupo: number }
  | { tipo: 'grupo'; secao: number; grupo: number }
  | { tipo: 'cabecalho' }
  | { tipo: 'resumo' }
  | { tipo: 'secoes' };

export interface Violacao {
  regra: Regra;
  onde: Onde;
  /** For the rewrite, in English like the résumé. */
  mensagem: string;
}

/** What the checks need of the Corpus. Ids are the database ids the Selection's `source` holds. */
export interface ContextoChecagem {
  accomplishments: Map<
    string,
    {
      tipo: string;
      affiliationId: string | null;
      metrics: { valores: number[]; origem: 'afirmado' | 'estimado' | 'qualitativo' }[];
    }
  >;
  affiliations: Map<string, { organizacao: string; cargo: string; confidencial: boolean }>;
  /** The Vaga a résumé is aimed at (step 17); absent for the general résumé. */
  vaga?: { cargo: string | null };
}

export const STACK_LABEL = 'Tech stack';
export const SECOES = ['Experience', 'Projects', 'Education'] as const;

// ---- helpers ----------------------------------------------------------------

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

interface Entrada {
  secao: number;
  grupo: number;
  entrada: number;
  tituloSecao: string;
  source: string;
  label?: string;
  text: string;
}

function entradas(s: Selection): Entrada[] {
  return s.sections.flatMap((secao, i) =>
    secao.groups.flatMap((grupo, j) =>
      grupo.entries.map((e, k) => ({ secao: i, grupo: j, entrada: k, tituloSecao: secao.title, ...e })),
    ),
  );
}

/** The group's stack line, as opposed to a bullet. */
export const ehStack = (e: { label?: string }) => e.label === STACK_LABEL;
const bullets = (s: Selection) => entradas(s).filter((e) => !ehStack(e));
const ondeEntrada = (e: Entrada): Onde => ({ tipo: 'entrada', secao: e.secao, grupo: e.grupo, entrada: e.entrada });
const ehProjects = (titulo: string) => titulo === 'Projects';

/** Every free-text field a reader sees, with where it is. */
function textos(s: Selection): { onde: Onde; texto: string }[] {
  const lista: { onde: Onde; texto: string }[] = [
    { onde: { tipo: 'cabecalho' }, texto: [s.header.name, s.header.role, s.header.location, s.targetRole, ...s.header.links.map((l) => l.label)].filter(Boolean).join(' · ') },
  ];
  if (s.summary) lista.push({ onde: { tipo: 'resumo' }, texto: s.summary });
  s.sections.forEach((secao, i) =>
    secao.groups.forEach((grupo, j) => {
      if (grupo.heading) {
        const h = grupo.heading;
        lista.push({ onde: { tipo: 'heading', secao: i, grupo: j }, texto: [h.organisation, h.role, h.location, h.period].filter(Boolean).join(' · ') });
      }
    }),
  );
  for (const e of entradas(s)) lista.push({ onde: ondeEntrada(e), texto: [e.label, e.text].filter(Boolean).join(': ') });
  return lista;
}

/** The phrases of a list found in a text, matched on whole words, case and accents ignored. */
function achar(texto: string, lista: readonly string[]): string[] {
  const t = normalizar(texto);
  return lista.filter((p) => new RegExp(`(?<![\\p{L}\\d])${normalizar(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, 'u').test(t));
}

// ---- numbers ----------------------------------------------------------------

const PALAVRAS: Record<string, number> = {
  // "one" is left out: "one of the largest" is in every other résumé.
  zero: 0, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
};
const DEZENAS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const MULTIPLICADOR: Record<string, number> = {
  k: 1e3, thousand: 1e3, mil: 1e3, m: 1e6, million: 1e6, mi: 1e6, b: 1e9, bn: 1e9, billion: 1e9,
};

/** "1,200" is twelve hundred in English and 1.2 in Portuguese; "1.2" the other way round. */
function leituras(escrito: string): number[] {
  const opcoes = new Set<number>();
  const semMilhar = (sep: string) => escrito.split(sep).join('');
  if (/^\d{1,3}([.,]\d{3})+$/.test(escrito)) opcoes.add(Number(semMilhar(escrito.includes(',') ? ',' : '.')));
  for (const n of [Number(escrito.replace(/,/g, '')), Number(escrito.replace(/\./g, '').replace(',', '.')), Number(escrito.replace(',', '.'))]) {
    if (Number.isFinite(n)) opcoes.add(n);
  }
  return [...opcoes];
}

/**
 * The numbers a résumé line states, each with its possible readings: digits
 * with their `~`, currency, units and multipliers ("~4 hours", "25min", "1.2M",
 * "R$50k", "90%"), and numbers in English words ("two", "twenty-five"). A
 * digit glued to a letter is part of a name ("S3", "p95", "EC2", "OAuth2") and
 * is not a number.
 */
export function numerosEscritos(texto: string): { escrito: string; leituras: number[] }[] {
  const achados: { escrito: string; leituras: number[] }[] = [];
  const unidade = '(k|thousand|mil|m|million|mi|b|bn|billion|h|hrs?|min|mins|ms|s|x|pp)?';
  const padrao = new RegExp(`(?<![\\p{L}\\d.,])(\\d+(?:[.,]\\d+)*)\\s?${unidade}(?![\\p{L}\\d])`, 'giu');
  for (const m of texto.matchAll(padrao)) {
    const [inteiro, escrito, sufixo] = m;
    const multiplicador = sufixo ? MULTIPLICADOR[sufixo.toLowerCase()] : undefined;
    const lidos = leituras(escrito);
    achados.push({ escrito: inteiro.trim(), leituras: multiplicador ? [...lidos, ...lidos.map((v) => v * multiplicador)] : lidos });
  }
  for (const m of normalizar(texto).matchAll(/\b([a-z]+)(?:-([a-z]+))?\b/g)) {
    const [inteiro, primeira, segunda] = m;
    if (primeira in DEZENAS) {
      achados.push({ escrito: inteiro, leituras: [DEZENAS[primeira] + (segunda && PALAVRAS[segunda] ? PALAVRAS[segunda] : 0)] });
    } else if (primeira in PALAVRAS && !segunda) {
      achados.push({ escrito: inteiro, leituras: [PALAVRAS[primeira]] });
    }
  }
  return achados;
}

export function numerosDoTexto(texto: string): number[] {
  return [...new Set(numerosEscritos(texto).flatMap((n) => n.leituras))];
}

const contem = (lista: number[], n: number) => lista.some((v) => Math.abs(v - n) < 1e-9);

/** The numbers written in a text none of whose readings is in `valores`. */
const semOrigem = (texto: string, valores: number[]) =>
  numerosEscritos(texto)
    .filter((n) => !n.leituras.some((v) => contem(valores, v)))
    .map((n) => n.escrito);

/** Every number of a bullet is in a Metric of its source; the summary's are in some Metric of the Corpus. */
export function checarNumeros(s: Selection, ctx: ContextoChecagem): Violacao[] {
  const violacoes: Violacao[] = [];
  for (const e of bullets(s)) {
    const valores = ctx.accomplishments.get(e.source)?.metrics.flatMap((m) => m.valores) ?? [];
    const soltos = semOrigem(e.text, valores);
    if (soltos.length) {
      violacoes.push({
        regra: 'numero_sem_origem',
        onde: ondeEntrada(e),
        mensagem: `"${soltos.join('", "')}" is not in a Metric of this bullet's source (${valores.length ? `its numbers: ${valores.join(', ')}` : 'it has no number'}). Use only the source's numbers, as they are; never compute, round or borrow one.`,
      });
    }
  }
  if (s.summary) {
    const todos = [...ctx.accomplishments.values()].flatMap((a) => a.metrics.flatMap((m) => m.valores));
    const soltos = semOrigem(s.summary, todos);
    if (soltos.length) {
      violacoes.push({
        regra: 'numero_sem_origem',
        onde: { tipo: 'resumo' },
        mensagem: `the summary states "${soltos.join('", "')}", which no Metric of the Corpus holds. Years of experience, team sizes and totals are not in the Corpus; drop the number.`,
      });
    }
  }
  return violacoes;
}

const soQualitativo = (ctx: ContextoChecagem, source: string) => {
  const metrics = ctx.accomplishments.get(source)?.metrics ?? [];
  return metrics.length > 0 && metrics.every((m) => m.origem === 'qualitativo');
};

/**
 * A qualitative result only fills: in Projects, or after every bullet with a
 * number in its group. (Several qualitative bullets may close a group; none
 * may sit above a numbered one.)
 */
export function checarQualitativo(s: Selection, ctx: ContextoChecagem): Violacao[] {
  const violacoes: Violacao[] = [];
  s.sections.forEach((secao, i) => {
    if (ehProjects(secao.title)) return;
    secao.groups.forEach((grupo, j) => {
      const lista = grupo.entries.map((e, k) => ({ e, k })).filter(({ e }) => !ehStack(e));
      const ultimoComNumero = lista.findLastIndex(({ e }) => !soQualitativo(ctx, e.source));
      lista.slice(0, Math.max(0, ultimoComNumero)).forEach(({ e, k }) => {
        if (soQualitativo(ctx, e.source)) {
          violacoes.push({
            regra: 'qualitativo_fora_do_lugar',
            onde: { tipo: 'entrada', secao: i, grupo: j, entrada: k },
            mensagem: 'a bullet whose source has only a qualitative result sits above a bullet with a number. Move it below every numbered bullet of the group (or to Projects).',
          });
        }
      });
    });
  });
  return violacoes;
}

const ATRIBUICOES = [
  /\bestimat(e|ed|ion)\s+(by|from|of)\b/i,
  /\b(my|our|the|client'?s?|team'?s?|company'?s?|customer'?s?|manager'?s?|internal|own|rough)\s+estimate\b/i,
  /\bby\s+(my|our|their)\s+(own\s+)?(estimate|count|calculation)/i,
  /\baccording\s+to\b/i,
  /\(\s*estimate[ds]?\s*\)/i,
  /\bestimativa\b/i,
  /\bestimated\s+by\b/i,
  /\bself-reported\b/i,
];

/** The `~` says a figure is approximate; who estimated it never reaches the page. */
export function checarAtribuicaoDeEstimativa(s: Selection): Violacao[] {
  return textos(s)
    .filter(({ texto }) => ATRIBUICOES.some((r) => r.test(texto)))
    .map(({ onde }) => ({
      regra: 'atribuicao_de_estimativa' as const,
      onde,
      mensagem: 'the line says who estimated a figure. Keep the "~" and drop the attribution; who measured it is an interview answer.',
    }));
}

export const HEDGES = [
  'helped', 'helped to', 'helping', 'assisted', 'assisting', 'while coding', 'single-handedly', 'alone',
  'contributed to', 'as part of a team', 'participated in', 'was responsible for', 'responsible for',
  'worked on', 'was involved in', 'involved in', 'tried to', 'supported the',
];
export const ADJETIVOS_VAZIOS = [
  'mission-critical', 'mission critical', 'robust', 'high-performance', 'cutting-edge', 'state-of-the-art',
  'world-class', 'best-in-class', 'seamless', 'seamlessly', 'innovative', 'complex', 'passionate',
  'results-driven', 'dynamic', 'synergy', 'highly motivated', 'rockstar', 'ninja', 'go-getter',
];

/** No hedge in the verb's place, no adjective without what is behind it. */
export function checarHedgesEAdjetivos(s: Selection): Violacao[] {
  const violacoes: Violacao[] = [];
  for (const { onde, texto } of textos(s)) {
    if (onde.tipo === 'cabecalho') continue;
    const hedges = achar(texto, HEDGES);
    if (hedges.length) {
      violacoes.push({
        regra: 'hedge',
        onde,
        mensagem: `"${hedges.join('", "')}" is a hedge in the verb's place. Own the verb of the system ("Rewrote", "Migrated"); narrow the scope through the object, only when someone else owned a part.`,
      });
    }
    const adjetivos = achar(texto, ADJETIVOS_VAZIOS);
    if (adjetivos.length) {
      violacoes.push({
        regra: 'adjetivo_vazio',
        onde,
        mensagem: `"${adjetivos.join('", "')}" says nothing a reader can check. Say what the source says is behind it, or drop the word.`,
      });
    }
  }
  return violacoes;
}

/** One bullet, one story: a source gives at most one bullet (its stack line aside). */
export function checarUmBulletPorFonte(s: Selection): Violacao[] {
  const vistos = new Set<string>();
  const violacoes: Violacao[] = [];
  for (const e of bullets(s)) {
    if (vistos.has(e.source)) {
      violacoes.push({
        regra: 'fonte_repetida',
        onde: ondeEntrada(e),
        mensagem: 'another bullet already tells this source\'s story. Two bullets never share one product: drop this one or take another record.',
      });
    }
    vistos.add(e.source);
  }
  return violacoes;
}

/** No bold product label: the only label is the group's stack line. */
export function checarLabels(s: Selection): Violacao[] {
  return entradas(s)
    .filter((e) => e.label !== undefined && e.label !== STACK_LABEL)
    .map((e) => ({
      regra: 'label_fora_da_stack' as const,
      onde: ondeEntrada(e),
      mensagem: `"${e.label}:" opens the bullet as a label. Tell the product in the sentence instead.`,
    }));
}

const PARTES = /(?<![\p{L}\d])~?\d+\s+(of\s+~?\d+\s+)?(modules?|screens?|pages?|files?|endpoints?|components?|features?|tasks?|stories|user stories|pull requests|prs|commits|telas?|m[oó]dulos?|p[aá]ginas?)\b/iu;

/** How much was typed is not what it changed. */
export function checarContagemDePartes(s: Selection): Violacao[] {
  return bullets(s)
    .filter((e) => PARTES.test(e.text))
    .map((e) => ({
      regra: 'contagem_de_partes' as const,
      onde: ondeEntrada(e),
      mensagem: 'a count of parts (modules, screens, endpoints…) is used as the result. Name what was hard in the parts, or the result they changed.',
    }));
}

const SENIORIDADE = ['junior', 'jr', 'jr.', 'mid-level', 'mid level', 'midlevel', 'senior', 'sr', 'sr.', 'pleno', 'staff', 'principal', 'trainee', 'intern', 'estagiario', 'estagiaria'];
const GESTAO = ['manager', 'management', 'managing', 'gerente', 'gestor', 'gestora', 'gestao', 'head of', 'director', 'diretor'];

/** Never "Manager" and never a seniority word in a role, the header or the summary. */
export function checarManagerESenioridade(s: Selection): Violacao[] {
  const alvos: { onde: Onde; texto: string }[] = [
    { onde: { tipo: 'cabecalho' }, texto: [s.header.role, s.targetRole].filter(Boolean).join(' · ') },
    ...(s.summary ? [{ onde: { tipo: 'resumo' } as Onde, texto: s.summary }] : []),
    ...s.sections.flatMap((secao, i) =>
      secao.groups.flatMap((g, j) => (g.heading?.role ? [{ onde: { tipo: 'heading', secao: i, grupo: j } as Onde, texto: g.heading.role }] : [])),
    ),
  ];
  const violacoes: Violacao[] = [];
  for (const { onde, texto } of alvos) {
    // In Education the role is a degree or a course, where "intern" or "trainee" is not a title.
    const educacao = onde.tipo === 'heading' && s.sections[onde.secao].title === 'Education';
    const gestao = achar(texto, GESTAO);
    if (gestao.length) {
      violacoes.push({ regra: 'manager', onde, mensagem: `"${gestao.join('", "')}" on an engineering résumé. Keep the engineering half of the title; never upgrade or invent one.` });
    }
    const senioridade = educacao ? [] : achar(texto, SENIORIDADE);
    if (senioridade.length) {
      violacoes.push({ regra: 'senioridade', onde, mensagem: `"${senioridade.join('", "')}" is a seniority word. Cut it: the reader judges the level from the work.` });
    }
  }
  return violacoes;
}

const DISPONIBILIDADE = [
  'remote', 'remotely', 'remoto', 'hybrid', 'on-site', 'onsite', 'relocate', 'relocation', 'open to', 'available',
  'availability', 'contract', 'contractor', 'freelance', 'freelancer', 'pj', 'clt', 'full-time', 'full time',
  'part-time', 'part time', 'timezone', 'time zone', 'utc', 'gmt', 'brt', 'est', 'pst', 'visa', 'hourly',
];

/** How and when the person wants to work stays off the page. */
export function checarDisponibilidade(s: Selection): Violacao[] {
  const alvos: { onde: Onde; texto: string }[] = [
    { onde: { tipo: 'cabecalho' }, texto: [s.header.role, s.header.location, s.targetRole].filter(Boolean).join(' · ') },
    ...(s.summary ? [{ onde: { tipo: 'resumo' } as Onde, texto: s.summary }] : []),
  ];
  return alvos.flatMap(({ onde, texto }) => {
    const achados = achar(texto, DISPONIBILIDADE);
    const horario = /\d{1,2}\s?(am|pm|h)\s?[-–]\s?\d{1,2}/i.test(texto);
    return achados.length || horario
      ? [{ regra: 'disponibilidade' as const, onde, mensagem: `availability on the page (${achados.join(', ') || 'hours'}). Terms are negotiated in the interview; drop it.` }]
      : [];
  });
}

const MES_EN = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d{4}';
const ANO = '\\d{4}';
const PERIODO = new RegExp(
  `^(${MES_EN} - (${MES_EN}|Present)|${ANO}( - (${ANO}|Present))?|Expected ${ANO})$`,
);

/**
 * Month and year. Years alone only as the code writes them when the Corpus has
 * no confirmed month (the safety net of step 10) or for a degree.
 */
export function checarPeriodos(s: Selection): Violacao[] {
  return s.sections.flatMap((secao, i) =>
    secao.groups.flatMap((g, j) =>
      g.heading?.period !== undefined && !PERIODO.test(g.heading.period)
        ? [{ regra: 'periodo' as const, onde: { tipo: 'heading', secao: i, grupo: j } as Onde, mensagem: `the period "${g.heading.period}" is not "Mon YYYY - Mon YYYY" (or "- Present", or the years alone).` }]
        : [],
    ),
  );
}

/** Experience first, Projects only to fill, Education last; nothing else (no skills section). */
export function checarSecoes(s: Selection): Violacao[] {
  const titulos = s.sections.map((x) => x.title);
  const ordem = titulos.map((t) => SECOES.indexOf(t as (typeof SECOES)[number]));
  const ok = ordem.every((n, i) => n >= 0 && (i === 0 || n > ordem[i - 1]));
  return ok
    ? []
    : [{ regra: 'secoes', onde: { tipo: 'secoes' }, mensagem: `the sections are ${titulos.join(', ')}. Only Experience, Projects and Education, in this order, each once; no skills section, no volunteering.` }];
}

/** An Accomplishment that may become a bullet: it has a Metric. */
const elegivel = (a: { metrics: unknown[] }) => a.metrics.length > 0;

/**
 * At least three bullets per Experience group. When the group's Affiliation has
 * no other record with a Metric left, three would mean inventing: that is a
 * note (little history), not a violation.
 */
export function checarPoucosBullets(s: Selection, ctx: ContextoChecagem): { violacoes: Violacao[]; notas: string[] } {
  const violacoes: Violacao[] = [];
  const notas: string[] = [];
  s.sections.forEach((secao, i) => {
    if (secao.title !== 'Experience') return;
    secao.groups.forEach((g, j) => {
      const usados = g.entries.filter((e) => !ehStack(e));
      if (usados.length >= 3) return;
      const affiliations = new Set(usados.map((e) => ctx.accomplishments.get(e.source)?.affiliationId).filter(Boolean));
      const usadosIds = new Set(usados.map((e) => e.source));
      const sobrando = [...ctx.accomplishments].filter(
        ([id, a]) => a.affiliationId && affiliations.has(a.affiliationId) && elegivel(a) && !usadosIds.has(id),
      );
      const nome = g.heading?.organisation ?? secao.title;
      if (sobrando.length || usados.length === 0) {
        violacoes.push({
          regra: 'poucos_bullets',
          onde: { tipo: 'grupo', secao: i, grupo: j },
          mensagem: `${nome} has ${usados.length} bullet(s); an Experience group holds at least three. Add bullets from this Affiliation's other records${sobrando.length ? '' : ''}.`,
        });
      } else {
        notas.push(`${nome}: ${usados.length} bullet(s), and the Corpus has no other record with a result for it.`);
      }
    });
  });
  return { violacoes, notas };
}

const GENERICAS = new Set([
  'banco', 'bank', 'grupo', 'group', 'ltda', 'ltd', 'inc', 'sa', 'the', 'and', 'dos', 'das', 'del', 'sul', 'norte',
  'tecnologia', 'tecnologias', 'technology', 'technologies', 'sistemas', 'systems', 'solucoes', 'solutions',
  'servicos', 'services', 'brasil', 'brazil', 'brasileira', 'brasileiro', 'digital', 'consultoria', 'consulting',
  'software', 'labs', 'lab', 'federal', 'nacional', 'national', 'company', 'companhia', 'comercio', 'industria',
  'pagamentos', 'payments', 'universidade', 'university', 'faculdade', 'college', 'instituto', 'institute',
  'escola', 'school', 'empresa', 'agencia', 'agency', 'com', 'para', 'por',
]);

/** A confidential Affiliation is never named: not its name, nor a distinctive word of it. */
export function checarConfidencial(s: Selection, ctx: ContextoChecagem): Violacao[] {
  const proibidos = [...ctx.affiliations.values()]
    .filter((a) => a.confidencial)
    .flatMap((a) => [
      a.organizacao,
      ...normalizar(a.organizacao).split(/[^\p{L}\d]+/u).filter((p) => p.length >= 3 && !GENERICAS.has(p)),
    ]);
  if (!proibidos.length) return [];
  return textos(s).flatMap(({ onde, texto }) => {
    const achados = achar(texto, proibidos);
    return achados.length
      ? [{ regra: 'confidencial_pelo_nome' as const, onde, mensagem: `"${achados[0]}" names an organisation the person asked to keep confidential. Use its public description instead.` }]
      : [];
  });
}

/** Every source is a record of this Corpus with a Metric (a project without one only in Projects). */
export function checarFontes(s: Selection, ctx: ContextoChecagem): Violacao[] {
  return entradas(s).flatMap((e) => {
    const a = ctx.accomplishments.get(e.source);
    if (!a) return [{ regra: 'fonte' as const, onde: ondeEntrada(e), mensagem: `the source "${e.source}" is not a record of this Corpus.` }];
    if (ehStack(e) || elegivel(a) || (a.tipo === 'project' && ehProjects(e.tituloSecao))) return [];
    return [{ regra: 'fonte' as const, onde: ondeEntrada(e), mensagem: 'the source has no result (a draft): it cannot become a bullet. Take a record with a Metric.' }];
  });
}

// ---- the Vaga (step 17) ----------------------------------------------------

/** Words that name the trade, not the area: "Desenvolvedor Back-end" and "Backend Engineer" are one role. */
const OFICIO = new Set(['developer', 'engineer', 'programmer', 'dev', 'desenvolvedor', 'desenvolvedora', 'engenheiro', 'engenheira', 'programador', 'programadora']);
const AREA_EM_INGLES: Record<string, string> = {
  dados: 'data', plataforma: 'platform', infraestrutura: 'infrastructure', infra: 'infrastructure',
  seguranca: 'security', qualidade: 'qa', testes: 'qa', teste: 'qa', sistemas: 'software', aplicativos: 'mobile',
};
/** Linking words, and "software", which every engineering role is. */
const SEM_AREA = new Set(['de', 'do', 'da', 'dos', 'das', 'em', 'e', 'of', 'the', 'and', 'in', 'i', 'ii', 'iii', 'iv', 'level', 'nivel', 'software']);
const SENIORIDADE_NORMALIZADA = new Set(SENIORIDADE.map((p) => normalizar(p).replace(/\.$/, '')));

/**
 * What a role is about, with the trade, the seniority and the language taken
 * out: "Senior Back-End Developer" and "Desenvolvedor Backend Pleno" are both
 * `{backend}`; "Software Engineer" is `{}`.
 */
function areaDoCargo(cargo: string): { area: Set<string>; oficio: boolean } {
  const palavras = normalizar(cargo)
    .replace(/\b(back|front|full)[\s-]+(end|stack)\b/g, '$1$2')
    .split(/[^\p{L}\d+#]+/u)
    .filter(Boolean);
  const area = new Set<string>();
  let oficio = false;
  for (const p of palavras) {
    if (OFICIO.has(p)) oficio = true;
    else if (!SEM_AREA.has(p) && !SENIORIDADE_NORMALIZADA.has(p)) area.add(AREA_EM_INGLES[p] ?? p);
  }
  area.delete('software');
  return { area, oficio };
}

const mesmaArea = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/**
 * The headline of a Vaga's résumé is a role the person held (P18): its area
 * (seniority, trade and language aside) is the area of some Affiliation's
 * role. A role with no area ("Software Engineer") stands on any engineering
 * role. So the job's role reaches the headline only when the Corpus holds it
 * up, and no other role does either. The general résumé is not checked.
 */
export function checarTituloDaVaga(s: Selection, ctx: ContextoChecagem): Violacao[] {
  const titulo = s.header.role?.trim();
  if (!ctx.vaga || !titulo) return [];
  const cargos = [...ctx.affiliations.values()].map((a) => a.cargo).filter(Boolean);
  const { area } = areaDoCargo(titulo);
  const sustentado = area.size === 0
    ? cargos.some((c) => areaDoCargo(c).oficio)
    : cargos.some((c) => mesmaArea(areaDoCargo(c).area, area));
  if (sustentado) return [];
  return [
    {
      regra: 'cargo_sem_lastro',
      onde: { tipo: 'cabecalho' },
      mensagem: `"${titulo}" is not a role the person held (their roles: ${cargos.join('; ') || 'none'}). Use the job's role only when one of these is the same role; otherwise write the role they held, in English, or no headline.`,
    },
  ];
}

/** One line of a Vaga's map: the requirement and the record of the line that answers it, or null ("não coberto"). */
export type LinhaDoMapa = LinhaDoMapaGravada;

/** The résumé line a map line points at, as the page prints it ("Tech stack: Go, Redis."), or null when not covered. */
export function linhaNaPagina(m: Pick<LinhaDoMapa, 'accomplishmentId' | 'naStack'>, s: Selection): string | null {
  const e = m.accomplishmentId ? entradas(s).find((x) => x.source === m.accomplishmentId && ehStack(x) === m.naStack) : undefined;
  return e ? [e.label, e.text].filter(Boolean).join(': ') : null;
}

/**
 * The map as the Critic gave it, checked against the delivered Selection: each
 * of the Vaga's requirements once, in its order; a record that is not a line
 * of this page (as a bullet, or as the stack line it says) becomes "não
 * coberto", and so does a requirement the answer left out.
 */
export function conferirMapa(citado: LinhaDoMapa[], requisitoIds: string[], s: Selection): LinhaDoMapa[] {
  const naPagina = new Set(entradas(s).map((e) => `${ehStack(e)}:${e.source}`));
  const primeiro = new Map<string, LinhaDoMapa>();
  for (const linha of citado) if (!primeiro.has(linha.requisitoId)) primeiro.set(linha.requisitoId, linha);
  return requisitoIds.map((requisitoId) => {
    const linha = primeiro.get(requisitoId);
    return linha?.accomplishmentId && naPagina.has(`${linha.naStack}:${linha.accomplishmentId}`)
      ? { requisitoId, accomplishmentId: linha.accomplishmentId, naStack: linha.naStack }
      : { requisitoId, accomplishmentId: null, naStack: false };
  });
}

/** Every check, in one pass. `notas` say what is short because the Corpus is. */
export function checarTudo(s: Selection, ctx: ContextoChecagem): { violacoes: Violacao[]; notas: string[] } {
  const poucos = checarPoucosBullets(s, ctx);
  return {
    violacoes: [
      ...checarFontes(s, ctx),
      ...checarNumeros(s, ctx),
      ...checarQualitativo(s, ctx),
      ...checarAtribuicaoDeEstimativa(s),
      ...checarHedgesEAdjetivos(s),
      ...checarUmBulletPorFonte(s),
      ...checarLabels(s),
      ...checarContagemDePartes(s),
      ...checarManagerESenioridade(s),
      ...checarDisponibilidade(s),
      ...checarPeriodos(s),
      ...checarSecoes(s),
      ...poucos.violacoes,
      ...checarConfidencial(s, ctx),
      ...checarTituloDaVaga(s, ctx),
    ],
    notas: poucos.notas,
  };
}
